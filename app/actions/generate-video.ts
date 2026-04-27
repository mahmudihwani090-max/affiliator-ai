"use server"

import { auth } from "@/lib/auth"
import {
  enqueueGenerationQueueItem,
  getDirectGoogleFlowGenerationStatus,
  getGenerationQueueStatus,
} from "@/lib/useapi/google-flow-generation-queue"
import {
  resolveGoogleFlowVideoModel,
  uploadGoogleFlowAsset,
  type GoogleFlowJobStatus,
} from "@/lib/useapi/google-flow"
import { extractNestedErrorMessage, toUserFacingGenerationError } from "@/lib/generation-errors"
import { logGenerationFailure } from "@/lib/generation-logger"

import {
  checkGenerationAccess as checkAccess,
  checkGenerationAccessByUserId as checkAccessByUserId,
  getSubscriptionAccessErrorMessage,
  type GenerationAccessOperation as AccessOperationType,
} from "./subscription-access"
import { getCaptchaToken } from "@/lib/chaptcha"

interface TextToVideoRequest {
  prompt: string
  aspectRatio: "landscape" | "portrait"
  model?: string
  count?: number
  seed?: number
  userId?: string
}

interface ImageToVideoRequest {
  prompt: string
  startImageBase64: string
  aspectRatio: "landscape" | "portrait"
  model?: string
  userId?: string
}

interface FrameToFrameRequest {
  prompt: string
  startImageBase64: string
  endImageBase64: string
  aspectRatio: "landscape" | "portrait"
  model?: string
  userId?: string
}

interface ReferenceToVideoRequest {
  prompt: string
  referenceImagesBase64: string[]
  aspectRatio: "landscape" | "portrait"
  model?: string
  userId?: string
}

interface GenerateVideoResponse {
  success: boolean
  videoUrl?: string
  videoUrls?: string[]
  jobId?: string
  status?: GoogleFlowJobStatus
  queuePosition?: number
  error?: string
}

interface VideoJobStatusResponse {
  success: boolean
  status: GoogleFlowJobStatus
  videoUrls?: string[]
  mediaGenerationId?: string
  queuePosition?: number
  error?: string
}

interface UpscaleVideoRequest {
  mediaGenerationId: string
  resolution?: "1080p" | "4K"
  userId?: string
}

interface UpscaleVideoResponse {
  success: boolean
  jobId?: string
  status?: GoogleFlowJobStatus
  queuePosition?: number
  videoUrl?: string
  error?: string
}

interface ExtendVideoRequest {
  mediaGenerationId: string
  prompt: string
  userId?: string
}

interface ExtendVideoResponse {
  success: boolean
  jobId?: string
  status?: GoogleFlowJobStatus
  queuePosition?: number
  videoUrl?: string
  error?: string
}

type BinaryUpload = {
  data: Uint8Array
  contentType: string
}

function logVideoFailure(params: {
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
    kind: "video",
    ...params,
  })
}

async function resolveActorUserId(userId?: string) {
  if (userId) {
    return userId
  }

  const session = await auth()
  return session?.user?.id || null
}

async function ensureVideoGenerationAccess(
  operation: AccessOperationType,
  userId?: string
) {
  const accessResult = userId
    ? await checkAccessByUserId(userId, operation)
    : await checkAccess(operation)

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

async function resolveAuthorizedActor(
  operation: AccessOperationType,
  userId?: string
) {
  const actorUserId = await resolveActorUserId(userId)
  if (!actorUserId) {
    return {
      success: false as const,
      error: "Unauthorized",
    }
  }

  const accessCheck = await ensureVideoGenerationAccess(operation, actorUserId)
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

async function enqueueVideoRequest(params: {
  userId: string
  operation: "textToVideo" | "imageToVideo" | "referenceToVideo" | "frameToFrame" | "upscaleVideo" | "extendVideo"
  prompt?: string
  aspectRatio?: "landscape" | "portrait"
  model?: string
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
    logVideoFailure({
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
    error: queued.error,
  } satisfies GenerateVideoResponse
}

export async function generateTextToVideo(
  request: TextToVideoRequest
): Promise<GenerateVideoResponse> {
  let resolvedModel: string | undefined

  try {
    const actor = await resolveAuthorizedActor("textToVideo", request.userId)
    if (!actor.success) {
      return { success: false, error: actor.error }
    }

    const model = resolveGoogleFlowVideoModel("textToVideo", request.model)
    resolvedModel = model
    const captchaToken = await getCaptchaToken()

    return enqueueVideoRequest({
      userId: actor.userId,
      operation: "textToVideo",
      prompt: request.prompt,
      aspectRatio: request.aspectRatio,
      model,
      requestPayload: {
        prompt: request.prompt,
        aspectRatio: request.aspectRatio,
        model,
        count: request.count || 1,
        async: true,
        ...(request.seed !== undefined ? { seed: request.seed } : {}),
        ...(captchaToken ? { captchaToken } : {}),
      },
    })
  } catch (error) {
    const userMessage = toUserFacingGenerationError(
      extractNestedErrorMessage(error) || (error instanceof Error ? error.message : undefined),
      "video"
    )
    logVideoFailure({
      operation: "textToVideo",
      stage: "submit",
      error,
      userMessage,
      userId: request.userId,
      model: resolvedModel,
      aspectRatio: request.aspectRatio,
      prompt: request.prompt,
      extra: {
        count: request.count,
        seed: request.seed,
      },
    })
    return {
      success: false,
      error: userMessage,
    }
  }
}

export async function checkVideoJobStatus(
  jobId: string,
  operation?: AccessOperationType,
  userId?: string
): Promise<VideoJobStatusResponse> {
  try {
    void operation

    const actorUserId = await resolveActorUserId(userId)
    if (actorUserId) {
      const queuedStatus = await getGenerationQueueStatus(jobId, actorUserId)
      if (queuedStatus) {
        if (queuedStatus.status === "failed") {
          logVideoFailure({
            operation: operation || "video-status",
            stage: "status-check",
            error: queuedStatus.error,
            userMessage: queuedStatus.error,
            jobId,
            providerJobId: queuedStatus.useapiJobId,
            userId: actorUserId,
            queuePosition: queuedStatus.queuePosition,
          })
        }

        return queuedStatus
      }
    }

    const directStatus = await getDirectGoogleFlowGenerationStatus(jobId)

    if (directStatus.status === "failed") {
      logVideoFailure({
        operation: operation || "video-status",
        stage: "status-check",
        error: directStatus.error,
        userMessage: directStatus.error,
        jobId,
        providerJobId: directStatus.useapiJobId,
        userId: actorUserId,
      })
    }

    return directStatus
  } catch (error) {
    const userMessage = toUserFacingGenerationError(
      extractNestedErrorMessage(error) || (error instanceof Error ? error.message : undefined),
      "video"
    )
    logVideoFailure({
      operation: operation || "video-status",
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

export async function generateImageToVideo(
  request: ImageToVideoRequest
): Promise<GenerateVideoResponse> {
  let resolvedModel: string | undefined

  try {
    const actor = await resolveAuthorizedActor("imageToVideo", request.userId)
    if (!actor.success) {
      return { success: false, error: actor.error }
    }

    const [startImageId] = await uploadPinnedAssets([request.startImageBase64])
    const model = resolveGoogleFlowVideoModel("imageToVideo", request.model)
    resolvedModel = model
    const captchaToken = await getCaptchaToken()

    return enqueueVideoRequest({
      userId: actor.userId,
      operation: "imageToVideo",
      prompt: request.prompt,
      aspectRatio: request.aspectRatio,
      model,
      requestPayload: {
        prompt: request.prompt,
        aspectRatio: request.aspectRatio,
        model,
        count: 1,
        async: true,
        startImage: startImageId,
        ...(captchaToken ? { captchaToken } : {}),
      },
    })
  } catch (error) {
    const userMessage = toUserFacingGenerationError(
      extractNestedErrorMessage(error) || (error instanceof Error ? error.message : undefined),
      "video"
    )
    logVideoFailure({
      operation: "imageToVideo",
      stage: "submit",
      error,
      userMessage,
      userId: request.userId,
      model: resolvedModel,
      aspectRatio: request.aspectRatio,
      prompt: request.prompt,
      extra: {
        hasStartImage: Boolean(request.startImageBase64),
      },
    })
    return {
      success: false,
      error: userMessage,
    }
  }
}

export async function generateReferenceToVideo(
  request: ReferenceToVideoRequest
): Promise<GenerateVideoResponse> {
  let resolvedModel: string | undefined

  try {
    const actor = await resolveAuthorizedActor("imageToVideo", request.userId)
    if (!actor.success) {
      return { success: false, error: actor.error }
    }

    if (!request.referenceImagesBase64.length) {
      throw new Error("At least one reference image is required")
    }

    const referenceImageIds = await uploadPinnedAssets(request.referenceImagesBase64.slice(0, 3))
    const model = resolveGoogleFlowVideoModel("referenceToVideo", request.model)
    resolvedModel = model
    const captchaToken = await getCaptchaToken()
    const requestPayload: Record<string, unknown> = {
      prompt: request.prompt,
      aspectRatio: request.aspectRatio,
      model,
      count: 1,
      async: true,
      ...(captchaToken ? { captchaToken } : {}),
    }

    referenceImageIds.forEach((mediaGenerationId, index) => {
      requestPayload[`referenceImage_${index + 1}`] = mediaGenerationId
    })

    return enqueueVideoRequest({
      userId: actor.userId,
      operation: "referenceToVideo",
      prompt: request.prompt,
      aspectRatio: request.aspectRatio,
      model,
      requestPayload,
    })
  } catch (error) {
    const userMessage = toUserFacingGenerationError(
      extractNestedErrorMessage(error) || (error instanceof Error ? error.message : undefined),
      "video"
    )
    logVideoFailure({
      operation: "referenceToVideo",
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

export async function upscaleVideo(
  request: UpscaleVideoRequest
): Promise<UpscaleVideoResponse> {
  try {
    const resolution = request.resolution || "1080p"
    const accessOperation: AccessOperationType = resolution === "4K" ? "upscaleVideo4K" : "upscaleVideo"
    const actor = await resolveAuthorizedActor(accessOperation, request.userId)
    if (!actor.success) {
      return { success: false, error: actor.error }
    }

    if (!request.mediaGenerationId) {
      throw new Error("mediaGenerationId is required for upscaling")
    }

    return enqueueVideoRequest({
      userId: actor.userId,
      operation: "upscaleVideo",
      requestPayload: {
        mediaGenerationId: request.mediaGenerationId,
        resolution,
        async: true,
      },
    })
  } catch (error) {
    const userMessage = toUserFacingGenerationError(
      extractNestedErrorMessage(error) || (error instanceof Error ? error.message : undefined),
      "videoUpscale"
    )
    logVideoFailure({
      operation: "upscaleVideo",
      stage: "submit",
      error,
      userMessage,
      jobId: request.mediaGenerationId,
      userId: request.userId,
      extra: {
        resolution: request.resolution || "1080p",
      },
    })
    return {
      success: false,
      error: userMessage,
    }
  }
}

export async function generateFrameToFrameVideo(
  request: FrameToFrameRequest
): Promise<GenerateVideoResponse> {
  let resolvedModel: string | undefined

  try {
    const actor = await resolveAuthorizedActor("imageToVideo", request.userId)
    if (!actor.success) {
      return { success: false, error: actor.error }
    }

    const [startImageId, endImageId] = await uploadPinnedAssets([
      request.startImageBase64,
      request.endImageBase64,
    ])
    const model = resolveGoogleFlowVideoModel("frameToFrame", request.model)
    resolvedModel = model
    const captchaToken = await getCaptchaToken()

    return enqueueVideoRequest({
      userId: actor.userId,
      operation: "frameToFrame",
      prompt: request.prompt,
      aspectRatio: request.aspectRatio,
      model,
      requestPayload: {
        prompt: request.prompt,
        aspectRatio: request.aspectRatio,
        model,
        count: 1,
        async: true,
        startImage: startImageId,
        endImage: endImageId,
        ...(captchaToken ? { captchaToken } : {}),
      },
    })
  } catch (error) {
    const userMessage = toUserFacingGenerationError(
      extractNestedErrorMessage(error) || (error instanceof Error ? error.message : undefined),
      "video"
    )
    logVideoFailure({
      operation: "frameToFrame",
      stage: "submit",
      error,
      userMessage,
      userId: request.userId,
      model: resolvedModel,
      aspectRatio: request.aspectRatio,
      prompt: request.prompt,
      extra: {
        hasStartImage: Boolean(request.startImageBase64),
        hasEndImage: Boolean(request.endImageBase64),
      },
    })
    return {
      success: false,
      error: userMessage,
    }
  }
}

export async function extendVideo(
  request: ExtendVideoRequest
): Promise<ExtendVideoResponse> {
  try {
    const actor = await resolveAuthorizedActor("extendVideo", request.userId)
    if (!actor.success) {
      return { success: false, error: actor.error }
    }

    if (!request.mediaGenerationId) {
      throw new Error("mediaGenerationId is required for extending")
    }

    if (!request.prompt.trim()) {
      throw new Error("Prompt is required for extending video")
    }

    return enqueueVideoRequest({
      userId: actor.userId,
      operation: "extendVideo",
      prompt: request.prompt,
      requestPayload: {
        mediaGenerationId: request.mediaGenerationId,
        prompt: request.prompt.trim(),
        async: true,
      },
    })
  } catch (error) {
    const userMessage = toUserFacingGenerationError(
      extractNestedErrorMessage(error) || (error instanceof Error ? error.message : undefined),
      "video"
    )
    logVideoFailure({
      operation: "extendVideo",
      stage: "submit",
      error,
      userMessage,
      jobId: request.mediaGenerationId,
      userId: request.userId,
      prompt: request.prompt,
    })
    return {
      success: false,
      error: userMessage,
    }
  }
}
