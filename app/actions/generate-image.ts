"use server"

import { auth } from "@/lib/auth"
import {
  type GoogleFlowJobStatus,
  getGoogleFlowJob,
  resolveGoogleFlowImageModel,
  uploadGoogleFlowAsset,
} from "@/lib/useapi/google-flow"
import {
  enqueueGenerationQueueItem,
  getGoogleFlowQueueStatus,
} from "@/lib/useapi/google-flow-generation-queue"
import { extractNestedErrorMessage, toUserFacingGenerationError } from "@/lib/generation-errors"
import { logGenerationFailure } from "@/lib/generation-logger"
import {
  checkGenerationAccess as checkSufficientCredits,
  checkGenerationAccessByUserId as checkSufficientCreditsByUserId,
  getSubscriptionAccessErrorMessage,
  type GenerationAccessOperation as CreditOperationType,
} from "./subscription-access"
import { getImageCaptchaToken } from "@/lib/chaptcha"

interface TextToImageRequest {
  prompt: string
  aspectRatio: "landscape" | "portrait"
  userId?: string
}

interface ImageToImageRequest {
  prompt: string
  referenceImagesBase64: string[]
  aspectRatio: "landscape" | "portrait"
  userId?: string
}

interface GenerateImageResponse {
  success: boolean
  imageUrl?: string
  imageUrls?: string[]
  mediaGenerationId?: string
  jobId?: string
  status?: GoogleFlowJobStatus
  queuePosition?: number
  error?: string
}

interface JobStatusResponse {
  success: boolean
  status: "queued" | "submitting" | "created" | "started" | "running" | "completed" | "failed"
  imageUrl?: string
  imageUrls?: string[]
  mediaGenerationId?: string
  queuePosition?: number
  error?: string
}

interface UpscaleImageRequest {
  mediaGenerationId: string
  resolution?: "2k" | "4k"
  userId?: string
}

interface UpscaleImageResponse {
  success: boolean
  jobId?: string
  status?: GoogleFlowJobStatus
  queuePosition?: number
  imageUrl?: string
  error?: string
}

type BinaryUpload = {
  data: Uint8Array
  contentType: string
}

function logImageFailure(params: {
  operation: string
  stage: "submit" | "status-check" | "queue-submit" | "validation"
  error?: unknown
  userMessage?: string
  jobId?: string
  providerJobId?: string
  userId?: string | null
  model?: string | null
  aspectRatio?: string
  prompt?: string
  queuePosition?: number
  extra?: Record<string, unknown>
}) {
  logGenerationFailure({
    kind: "image",
    ...params,
  })
}

async function ensureImageGenerationAccess(
  operation: CreditOperationType,
  userId?: string
) {
  const accessResult = userId
    ? await checkSufficientCreditsByUserId(userId, operation)
    : await checkSufficientCredits(operation)

  if (!accessResult.success) {
    return {
      success: false as const,
      error: accessResult.error || "Gagal memeriksa subscription",
    }
  }

  if (!accessResult.hasAccess) {
    return {
      success: false as const,
      error: getSubscriptionAccessErrorMessage(accessResult),
    }
  }

  return { success: true as const }
}

async function resolveActorUserId(userId?: string) {
  if (userId) {
    return userId
  }

  const session = await auth()
  return session?.user?.id || null
}

async function resolveAuthorizedActor(
  operation: CreditOperationType,
  userId?: string
) {
  const actorUserId = await resolveActorUserId(userId)
  if (!actorUserId) {
    return {
      success: false as const,
      error: "Unauthorized",
    }
  }

  const accessCheck = await ensureImageGenerationAccess(operation, actorUserId)
  if (!accessCheck.success) {
    return {
      success: false as const,
      error: accessCheck.error,
    }
  }

  return {
    success: true as const,
    userId: actorUserId,
  }
}

function normalizeBase64ContentType(base64Data: string) {
  if (base64Data.startsWith("/9j/")) {
    return "image/jpeg"
  }

  if (base64Data.startsWith("iVBOR")) {
    return "image/png"
  }

  if (base64Data.startsWith("UklGR")) {
    return "image/webp"
  }

  return "image/jpeg"
}

async function readImageInputAsBinary(imageInput: string, label: string): Promise<BinaryUpload> {
  if (imageInput.startsWith("http://") || imageInput.startsWith("https://")) {
    const response = await fetch(imageInput)
    if (!response.ok) {
      throw new Error(`Failed to fetch ${label} from URL`)
    }

    return {
      data: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type")?.split(";")[0] || "image/jpeg",
    }
  }

  const base64Data = imageInput.includes(",") ? imageInput.split(",")[1] : imageInput
  if (!base64Data || base64Data.length < 100) {
    throw new Error(`Invalid ${label} data`)
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(base64Data, "base64")
  } catch {
    throw new Error(`Failed to decode ${label}`)
  }

  if (buffer.length < 1000) {
    throw new Error(`${label} is too small. Please use a higher quality image.`)
  }

  return {
    data: new Uint8Array(buffer),
    contentType: normalizeBase64ContentType(base64Data),
  }
}

async function uploadPinnedAssets(inputs: string[]) {
  let pinnedEmail: string | null = null
  const mediaGenerationIds: string[] = []

  for (let index = 0; index < inputs.length; index++) {
    const binaryUpload = await readImageInputAsBinary(inputs[index], `image ${index + 1}`)
    const uploadResult = await uploadGoogleFlowAsset({
      binaryData: binaryUpload.data,
      contentType: binaryUpload.contentType,
      email: pinnedEmail,
    })

    if (!uploadResult.mediaGenerationId) {
      throw new Error(`Failed to upload image ${index + 1}`)
    }

    if (!pinnedEmail && uploadResult.email) {
      pinnedEmail = uploadResult.email
    }

    mediaGenerationIds.push(uploadResult.mediaGenerationId)
  }

  return mediaGenerationIds
}

async function enqueueImageRequest(params: {
  userId: string
  operation: "textToImage" | "imageToImage"
  prompt: string
  aspectRatio: "landscape" | "portrait"
  model: string
  requestPayload: Record<string, unknown>
}) {
  const queued = await enqueueGenerationQueueItem({
    userId: params.userId,
    operation: params.operation,
    prompt: params.prompt,
    aspectRatio: params.aspectRatio,
    model: params.model,
    requestPayload: params.requestPayload,
  })

  if (!queued.success) {
    logImageFailure({
      operation: params.operation,
      stage: "queue-submit",
      error: queued.error,
      userMessage: queued.error,
      jobId: queued.jobId,
      userId: params.userId,
      model: params.model,
      aspectRatio: params.aspectRatio,
      prompt: params.prompt,
      queuePosition: queued.queuePosition,
      extra: {
        requestPayloadKeys: Object.keys(params.requestPayload),
      },
    })
  }

  return {
    success: queued.success,
    jobId: queued.jobId,
    status: queued.status,
    queuePosition: queued.queuePosition,
    imageUrl: queued.imageUrl,
    imageUrls: queued.imageUrls,
    mediaGenerationId: queued.mediaGenerationId,
    error: queued.error,
  } satisfies GenerateImageResponse
}

export async function generateTextToImage(
  request: TextToImageRequest
): Promise<GenerateImageResponse> {
  let resolvedModel: string | undefined

  try {
    const actor = await resolveAuthorizedActor("textToImage", request.userId)
    if (!actor.success) {
      return { success: false, error: actor.error }
    }

    const captchaToken = await getImageCaptchaToken()
    const model = resolveGoogleFlowImageModel(undefined, 0)
    resolvedModel = model

    return enqueueImageRequest({
      userId: actor.userId,
      operation: "textToImage",
      prompt: request.prompt,
      aspectRatio: request.aspectRatio,
      model,
      requestPayload: {
        prompt: request.prompt,
        aspectRatio: request.aspectRatio,
        model,
        count: 1,
        ...(captchaToken ? { captchaToken } : {}),
      },
    })
  } catch (error) {
    const userMessage = toUserFacingGenerationError(
      extractNestedErrorMessage(error) || (error instanceof Error ? error.message : undefined),
      "image"
    )
    logImageFailure({
      operation: "textToImage",
      stage: "submit",
      error,
      userMessage,
      userId: request.userId,
      model: resolvedModel,
      aspectRatio: request.aspectRatio,
      prompt: request.prompt,
    })
    return {
      success: false,
      error: userMessage,
    }
  }
}

export async function checkImageJobStatus(
  jobId: string,
  operation?: CreditOperationType,
  userId?: string
): Promise<JobStatusResponse> {
  try {
    void operation

    const actorUserId = await resolveActorUserId(userId)
    if (actorUserId) {
      const queuedStatus = await getGoogleFlowQueueStatus(jobId, actorUserId)
      if (queuedStatus) {
        if (queuedStatus.status === "failed") {
          logImageFailure({
            operation: operation || "image-status",
            stage: "status-check",
            error: queuedStatus.error,
            userMessage: toUserFacingGenerationError(queuedStatus.error, "image"),
            jobId,
            providerJobId: queuedStatus.useapiJobId,
            userId: actorUserId,
            queuePosition: queuedStatus.queuePosition,
          })
        }

        return {
          success: queuedStatus.status !== "failed",
          status: queuedStatus.status,
          imageUrl: queuedStatus.imageUrl,
          imageUrls: queuedStatus.imageUrls,
          mediaGenerationId: queuedStatus.mediaGenerationId,
          queuePosition: queuedStatus.queuePosition,
          error:
            queuedStatus.status === "failed"
              ? toUserFacingGenerationError(queuedStatus.error, "image")
              : queuedStatus.error,
        }
      }
    }

    const result = await getGoogleFlowJob(jobId)

    if (result.status === "failed") {
      logImageFailure({
        operation: operation || "image-status",
        stage: "status-check",
        error: result.error,
        userMessage: toUserFacingGenerationError(result.error, "image"),
        jobId,
        providerJobId: result.jobId,
        userId: actorUserId,
      })
    }

    return {
      success: result.status !== "failed",
      status: result.status as JobStatusResponse["status"],
      imageUrls: result.imageUrls,
      mediaGenerationId: result.mediaGenerationId,
      error: result.status === "failed" ? toUserFacingGenerationError(result.error, "image") : result.error,
    }
  } catch (error) {
    const userMessage = toUserFacingGenerationError(
      extractNestedErrorMessage(error) || (error instanceof Error ? error.message : undefined),
      "image"
    )
    logImageFailure({
      operation: operation || "image-status",
      stage: "status-check",
      error,
      userMessage,
      jobId,
      userId: userId || null,
    })
    return {
      success: false,
      status: "failed",
      error: userMessage,
    }
  }
}

export async function generateImageToImage(
  request: ImageToImageRequest
): Promise<GenerateImageResponse> {
  let resolvedModel: string | undefined

  try {
    const actor = await resolveAuthorizedActor("imageToImage", request.userId)
    if (!actor.success) {
      return { success: false, error: actor.error }
    }

    const mediaIds = await uploadPinnedAssets(request.referenceImagesBase64.slice(0, 3))
    const captchaToken = await getImageCaptchaToken()
    const model = resolveGoogleFlowImageModel(undefined, mediaIds.length)
    resolvedModel = model
    const requestBody: Record<string, unknown> = {
      prompt: request.prompt,
      aspectRatio: request.aspectRatio,
      model,
      count: 1,
      ...(captchaToken ? { captchaToken } : {}),
    }

    mediaIds.forEach((mediaGenerationId, index) => {
      requestBody[`reference_${index + 1}`] = mediaGenerationId
    })

    return enqueueImageRequest({
      userId: actor.userId,
      operation: "imageToImage",
      prompt: request.prompt,
      aspectRatio: request.aspectRatio,
      model,
      requestPayload: requestBody,
    })
  } catch (error) {
    const userMessage = toUserFacingGenerationError(
      extractNestedErrorMessage(error) || (error instanceof Error ? error.message : undefined),
      "image"
    )
    logImageFailure({
      operation: "imageToImage",
      stage: "submit",
      error,
      userMessage,
      userId: request.userId,
      model: resolvedModel,
      aspectRatio: request.aspectRatio,
      prompt: request.prompt,
      extra: {
        referenceImageCount: request.referenceImagesBase64.length,
      },
    })
    return {
      success: false,
      error: userMessage,
    }
  }
}

export async function upscaleImage(
  request: UpscaleImageRequest
): Promise<UpscaleImageResponse> {
  try {
    const actor = await resolveAuthorizedActor("upscaleImage", request.userId)
    if (!actor.success) {
      return { success: false, error: actor.error }
    }

    if (!request.mediaGenerationId) {
      throw new Error("mediaGenerationId is required for upscaling")
    }

    const resolution = request.resolution || "2k"
    const queued = await enqueueGenerationQueueItem({
      userId: actor.userId,
      operation: "upscaleImage",
      prompt: `Upscale image ke ${resolution.toUpperCase()}`,
      requestPayload: {
        mediaGenerationId: request.mediaGenerationId,
        resolution,
        async: true,
      },
    })

    if (!queued.success) {
      return {
        success: false,
        error: queued.error,
      }
    }

    return {
      success: true,
      jobId: queued.jobId,
      status: queued.status,
      queuePosition: queued.queuePosition,
    }
  } catch (error) {
    const userMessage = toUserFacingGenerationError(
      extractNestedErrorMessage(error) || (error instanceof Error ? error.message : undefined),
      "imageUpscale"
    )
    logImageFailure({
      operation: "upscaleImage",
      stage: "submit",
      error,
      userMessage,
      jobId: request.mediaGenerationId,
      userId: request.userId,
      extra: {
        resolution: request.resolution || "2k",
      },
    })
    return {
      success: false,
      error: userMessage,
    }
  }
}
