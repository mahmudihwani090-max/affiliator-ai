import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import {
  getGoogleFlowImageModelCandidates,
  getGoogleFlowJob,
  submitGoogleFlowImage,
  submitGoogleFlowImageUpscale,
  submitGoogleFlowVideo,
  submitGoogleFlowVideoExtend,
  submitGoogleFlowVideoUpscale,
  type GoogleFlowImageSubmissionResult,
  type GoogleFlowJobStatus,
  type GoogleFlowNormalizedJobResult,
  type GoogleFlowVideoOperation,
} from "@/lib/useapi/google-flow"
import {
  extractNestedErrorMessage,
  shouldRetryImageModelFallback,
  toUserFacingGenerationError,
} from "@/lib/generation-errors"
import { logGenerationFailure } from "@/lib/generation-logger"

const PENDING_QUEUE_STATUSES = ["queued", "submitting", "running"] as const
const ACTIVE_QUEUE_STATUSES = ["submitting", "running"] as const
const STALE_SUBMITTING_WINDOW_MS = 2 * 60 * 1000
const MAX_PENDING_GENERATION_REQUESTS = 10

export type GoogleFlowImageOperation = "textToImage" | "imageToImage" | "upscaleImage"
export type GoogleFlowQueueOperation = GoogleFlowVideoOperation | GoogleFlowImageOperation

type QueueRequestPayload = Record<string, unknown>

export interface EnqueueVideoQueueInput {
  userId: string
  operation: GoogleFlowQueueOperation
  requestPayload: QueueRequestPayload
  prompt?: string
  aspectRatio?: string
  model?: string
}

export interface EnqueueVideoQueueResult {
  success: boolean
  jobId?: string
  status?: GoogleFlowJobStatus
  queuePosition?: number
  videoUrls?: string[]
  imageUrls?: string[]
  imageUrl?: string
  mediaGenerationId?: string
  error?: string
}

export interface VideoQueueStatusResult {
  success: boolean
  jobId?: string
  useapiJobId?: string
  status: GoogleFlowJobStatus
  queuePosition?: number
  videoUrls?: string[]
  imageUrls?: string[]
  imageUrl?: string
  mediaGenerationId?: string
  error?: string
}

export interface VideoQueueSummary {
  totalPending: number
  activeCount: number
  queuedCount: number
  limit: number
  activeJobId?: string
  activePrompt?: string
  activeOperation?: string
  nextQueuedJobId?: string
  items: Array<{
    jobId: string
    status: string
    prompt?: string
    operation: string
    createdAt: string
    queuePosition: number
  }>
}

function isRecord(value: Prisma.JsonValue | unknown): value is QueueRequestPayload {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function serializePayload(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue
}

function isImageQueueOperation(operation: string): operation is GoogleFlowImageOperation {
  return operation === "textToImage" || operation === "imageToImage" || operation === "upscaleImage"
}

function isImageUpscaleQueueOperation(operation: string) {
  return operation === "upscaleImage"
}

function getImageReferenceCount(payload: QueueRequestPayload) {
  return Object.keys(payload).filter((key) => /^reference_\d+$/.test(key)).length
}

function summarizeQueuePayload(payload: QueueRequestPayload) {
  return {
    keys: Object.keys(payload),
    prompt: typeof payload.prompt === "string" ? payload.prompt : undefined,
    aspectRatio: typeof payload.aspectRatio === "string" ? payload.aspectRatio : undefined,
    model: typeof payload.model === "string" ? payload.model : undefined,
    resolution: typeof payload.resolution === "string" ? payload.resolution : undefined,
    count: typeof payload.count === "number" ? payload.count : undefined,
    seed: typeof payload.seed === "number" ? payload.seed : undefined,
    referenceImageCount: Object.keys(payload).filter((key) => /^(reference_|referenceImage_)/.test(key)).length,
    hasStartImage: Boolean(payload.startImage),
    hasEndImage: Boolean(payload.endImage),
  }
}

function logQueueFailure(params: {
  operation: string
  stage: "queue-submit" | "queue-status" | "provider-job" | "validation" | "webhook"
  error?: unknown
  userMessage?: string
  jobId?: string
  providerJobId?: string | null
  userId?: string
  model?: string | null
  prompt?: string | null
  aspectRatio?: string | null
  queuePosition?: number
  extra?: Record<string, unknown>
}) {
  logGenerationFailure({
    kind: isImageQueueOperation(params.operation) ? "image" : "video",
    ...params,
    providerJobId: params.providerJobId ?? undefined,
    prompt: params.prompt ?? undefined,
    aspectRatio: params.aspectRatio ?? undefined,
  })
}

async function submitImageQueueItemWithFallback(
  item: { operation: string; requestPayload: QueueRequestPayload; model: string | null },
) {
  if (isImageUpscaleQueueOperation(item.operation)) {
    return {
      submitResult: await submitGoogleFlowImageUpscale(item.requestPayload),
      modelUsed: item.model || undefined,
    }
  }

  const candidates = getGoogleFlowImageModelCandidates(item.model || undefined, getImageReferenceCount(item.requestPayload))
  let lastError: Error | null = null

  for (let index = 0; index < candidates.length; index++) {
    const modelCandidate = candidates[index]

    try {
      return {
        submitResult: await submitGoogleFlowImage({
          ...item.requestPayload,
          model: modelCandidate,
        }),
        modelUsed: modelCandidate,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Failed to submit queued image generation request")
      const message = extractNestedErrorMessage(error) || lastError.message
      if (index === candidates.length - 1 || !shouldRetryImageModelFallback(message)) {
        throw new Error(message)
      }
    }
  }

  throw lastError || new Error("Failed to submit queued image generation request")
}

function extractEncodedImageDataUrl(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return undefined
  }

  const encodedImage = (raw as { encodedImage?: unknown }).encodedImage
  if (typeof encodedImage !== "string" || !encodedImage) {
    return undefined
  }

  return `data:image/jpeg;base64,${encodedImage}`
}

async function resetStaleSubmittingItems(userId: string) {
  const staleThreshold = new Date(Date.now() - STALE_SUBMITTING_WINDOW_MS)

  await prisma.videoQueueItem.updateMany({
    where: {
      userId,
      status: "submitting",
      updatedAt: { lt: staleThreshold },
    },
    data: {
      status: "queued",
      error: null,
      startedAt: null,
    },
  })
}

async function getQueuePosition(userId: string, queueItemId: string) {
  const item = await prisma.videoQueueItem.findUnique({
    where: { id: queueItemId },
    select: { createdAt: true, userId: true },
  })

  if (!item || item.userId !== userId) {
    return undefined
  }

  const ahead = await prisma.videoQueueItem.count({
    where: {
      userId,
      status: { in: [...PENDING_QUEUE_STATUSES] },
      createdAt: { lt: item.createdAt },
    },
  })

  return ahead + 1
}

async function claimNextQueuedVideoItem(userId: string) {
  await resetStaleSubmittingItems(userId)

  const activeItem = await prisma.videoQueueItem.findFirst({
    where: {
      userId,
      status: { in: [...ACTIVE_QUEUE_STATUSES] },
    },
    orderBy: { createdAt: "asc" },
  })

  if (activeItem) {
    return null
  }

  const nextItem = await prisma.videoQueueItem.findFirst({
    where: {
      userId,
      status: "queued",
    },
    orderBy: { createdAt: "asc" },
  })

  if (!nextItem) {
    return null
  }

  const claimed = await prisma.videoQueueItem.updateMany({
    where: {
      id: nextItem.id,
      status: "queued",
    },
    data: {
      status: "submitting",
      startedAt: new Date(),
      error: null,
      replyRef: nextItem.id,
    },
  })

  if (claimed.count === 0) {
    return null
  }

  return nextItem.id
}

async function markTerminalAndContinue(userId: string) {
  await maybeDispatchNextQueuedVideo(userId)
}

async function submitQueuedQueueItem(queueItemId: string) {
  const item = await prisma.videoQueueItem.findUnique({
    where: { id: queueItemId },
  })

  if (!item || item.status !== "submitting") {
    return
  }

  if (!isRecord(item.requestPayload)) {
    logQueueFailure({
      operation: item.operation,
      stage: "validation",
      error: "Invalid queued request payload",
      userMessage: "Invalid queued request payload",
      jobId: item.id,
      userId: item.userId,
      model: item.model,
      prompt: item.prompt,
      aspectRatio: item.aspectRatio,
    })

    await prisma.videoQueueItem.update({
      where: { id: queueItemId },
      data: {
        status: "failed",
        error: "Invalid queued request payload",
        completedAt: new Date(),
      },
    })
    await markTerminalAndContinue(item.userId)
    return
  }

  const requestPayload = item.requestPayload

  try {
    const imageSubmission = isImageQueueOperation(item.operation)
      ? await submitImageQueueItemWithFallback({
          operation: item.operation,
          requestPayload,
          model: item.model,
        })
      : null

    const submitResult = imageSubmission
      ? imageSubmission.submitResult
      : item.operation === "upscaleVideo"
        ? await submitGoogleFlowVideoUpscale(requestPayload, {
            enableWebhook: true,
            replyRef: item.id,
          })
        : item.operation === "extendVideo"
          ? await submitGoogleFlowVideoExtend(requestPayload, {
              enableWebhook: true,
              replyRef: item.id,
            })
          : await submitGoogleFlowVideo(requestPayload, {
              enableWebhook: true,
              replyRef: item.id,
            })

    if (submitResult.jobId && !(imageSubmission && hasImmediateImageResult(imageSubmission.submitResult))) {
      await prisma.videoQueueItem.update({
        where: { id: queueItemId },
        data: {
          status: "running",
          useapiJobId: submitResult.jobId,
          model: imageSubmission?.modelUsed || item.model,
          resultPayload: serializePayload({
            submission: submitResult.raw,
          }),
        },
      })
      return
    }

    await prisma.videoQueueItem.update({
      where: { id: queueItemId },
      data: {
        status: "completed",
        completedAt: new Date(),
        model: imageSubmission?.modelUsed || item.model,
          resultPayload: serializePayload(
            imageSubmission
              ? {
                  submission: imageSubmission.submitResult.raw,
                  imageUrl:
                    extractEncodedImageDataUrl(imageSubmission.submitResult.raw) ||
                    imageSubmission.submitResult.imageUrls[0],
                  imageUrls: imageSubmission.submitResult.imageUrls,
                  mediaGenerationId: imageSubmission.submitResult.mediaGenerationId,
                }
              : "videoUrls" in submitResult
                ? {
                    submission: submitResult.raw,
                    videoUrls: submitResult.videoUrls,
                    mediaGenerationId: submitResult.mediaGenerationId,
                  }
                : (() => {
                    throw new Error("Invalid video submission result")
                  })()
          ),
      },
    })

    await markTerminalAndContinue(item.userId)
  } catch (error) {
    const userMessage = toUserFacingGenerationError(
      extractNestedErrorMessage(error) || (error instanceof Error ? error.message : undefined),
      isImageQueueOperation(item.operation) ? "image" : "video"
    )

    logQueueFailure({
      operation: item.operation,
      stage: "queue-submit",
      error,
      userMessage,
      jobId: item.id,
      userId: item.userId,
      model: item.model,
      prompt: item.prompt,
      aspectRatio: item.aspectRatio,
      extra: {
        requestPayload: summarizeQueuePayload(item.requestPayload),
      },
    })

    await prisma.videoQueueItem.update({
      where: { id: queueItemId },
      data: {
        status: "failed",
        error: userMessage,
        completedAt: new Date(),
      },
    })

    await markTerminalAndContinue(item.userId)
  }
}

export async function maybeDispatchNextQueuedVideo(userId: string) {
  const claimedQueueItemId = await claimNextQueuedVideoItem(userId)

  if (!claimedQueueItemId) {
    return null
  }

  await submitQueuedQueueItem(claimedQueueItemId)
  return claimedQueueItemId
}

function normalizeQueueStatus(status: string): GoogleFlowJobStatus {
  if (
    status === "queued" ||
    status === "submitting" ||
    status === "created" ||
    status === "started" ||
    status === "completed" ||
    status === "failed"
  ) {
    return status
  }

  return "running"
}

function extractStoredQueueResult(value: Prisma.JsonValue | null) {
  if (!isRecord(value)) {
    return {
      videoUrls: [] as string[],
      imageUrls: [] as string[],
      imageUrl: undefined as string | undefined,
      mediaGenerationId: undefined as string | undefined,
    }
  }

  const videoUrls = Array.isArray(value.videoUrls)
    ? value.videoUrls.filter((entry): entry is string => typeof entry === "string")
    : []

  const imageUrls = Array.isArray(value.imageUrls)
    ? value.imageUrls.filter((entry): entry is string => typeof entry === "string")
    : []

  return {
    videoUrls,
    imageUrls,
    imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : undefined,
    mediaGenerationId: typeof value.mediaGenerationId === "string" ? value.mediaGenerationId : undefined,
  }
}

function hasImmediateImageResult(submitResult: GoogleFlowImageSubmissionResult) {
  return Boolean(submitResult.imageUrls.length || extractEncodedImageDataUrl(submitResult.raw))
}

async function updateQueueItemFromJobResult(
  queueItemId: string,
  operation: GoogleFlowQueueOperation,
  jobResult: GoogleFlowNormalizedJobResult,
  userId: string
) {
  if (jobResult.status === "completed") {
    await prisma.videoQueueItem.update({
      where: { id: queueItemId },
      data: {
        status: "completed",
        completedAt: new Date(),
        resultPayload: serializePayload({
          job: jobResult.raw,
          ...(isImageQueueOperation(operation)
            ? {
                imageUrl: jobResult.imageUrls[0],
                imageUrls: jobResult.imageUrls,
              }
            : {
                videoUrls: jobResult.videoUrls,
              }),
          mediaGenerationId: jobResult.mediaGenerationId,
        }),
        error: null,
      },
    })
    await markTerminalAndContinue(userId)
    return
  }

  if (jobResult.status === "failed") {
    const userMessage = toUserFacingGenerationError(jobResult.error, isImageQueueOperation(operation) ? "image" : "video")

    logQueueFailure({
      operation,
      stage: "queue-status",
      error: jobResult.error,
      userMessage,
      jobId: queueItemId,
      providerJobId: jobResult.jobId,
      userId,
      extra: {
        mediaGenerationId: jobResult.mediaGenerationId,
      },
    })

    await prisma.videoQueueItem.update({
      where: { id: queueItemId },
      data: {
        status: "failed",
        completedAt: new Date(),
        resultPayload: serializePayload({
          job: jobResult.raw,
        }),
        error: userMessage,
      },
    })
    await markTerminalAndContinue(userId)
    return
  }

  await prisma.videoQueueItem.update({
    where: { id: queueItemId },
    data: {
      status: "running",
      resultPayload: serializePayload({
        job: jobResult.raw,
      }),
      error: null,
    },
  })
}

function buildQueueStatusResult(params: {
  itemId: string
  useapiJobId?: string | null
  status: GoogleFlowJobStatus
  queuePosition?: number
  resultPayload?: Prisma.JsonValue | null
  error?: string | null
  context: "image" | "video"
}) {
  const storedResult = extractStoredQueueResult(params.resultPayload || null)

  return {
    success: params.status !== "failed",
    jobId: params.itemId,
    useapiJobId: params.useapiJobId || undefined,
    status: params.status,
    queuePosition: params.queuePosition,
    videoUrls: storedResult.videoUrls,
    imageUrls: storedResult.imageUrls,
    imageUrl: storedResult.imageUrl,
    mediaGenerationId: storedResult.mediaGenerationId,
    error:
      params.status === "failed"
        ? toUserFacingGenerationError(params.error, params.context)
        : params.error || undefined,
  } satisfies VideoQueueStatusResult
}

export async function enqueueGoogleFlowQueueItem(input: EnqueueVideoQueueInput): Promise<EnqueueVideoQueueResult> {
  const pendingCount = await prisma.videoQueueItem.count({
    where: {
      userId: input.userId,
      status: { in: [...PENDING_QUEUE_STATUSES] },
    },
  })

  if (pendingCount >= MAX_PENDING_GENERATION_REQUESTS) {
    return {
      success: false,
      error: `Batas antrean generate tercapai. Maksimal ${MAX_PENDING_GENERATION_REQUESTS} request aktif dan menunggu per user.`,
    }
  }

  const queueItem = await prisma.videoQueueItem.create({
    data: {
      userId: input.userId,
      operation: input.operation,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      model: input.model,
      requestPayload: serializePayload(input.requestPayload),
    },
  })

  await prisma.videoQueueItem.update({
    where: { id: queueItem.id },
    data: {
      replyRef: queueItem.id,
    },
  })

  await maybeDispatchNextQueuedVideo(input.userId)

  const refreshedItem = await prisma.videoQueueItem.findUnique({
    where: { id: queueItem.id },
  })

  const queuePosition = await getQueuePosition(input.userId, queueItem.id)
  const storedResult = extractStoredQueueResult(refreshedItem?.resultPayload || null)

  return {
    success: true,
    jobId: queueItem.id,
    status: normalizeQueueStatus(refreshedItem?.status || queueItem.status),
    queuePosition,
    videoUrls: storedResult.videoUrls,
    imageUrls: storedResult.imageUrls,
    imageUrl: storedResult.imageUrl,
    mediaGenerationId: storedResult.mediaGenerationId,
  }
}

export const enqueueGenerationQueueItem = enqueueGoogleFlowQueueItem
export const enqueueVideoQueueItem = enqueueGoogleFlowQueueItem

export async function getGoogleFlowQueueStatus(jobId: string, userId: string): Promise<VideoQueueStatusResult | null> {
  let item = await prisma.videoQueueItem.findFirst({
    where: {
      id: jobId,
      userId,
    },
  })

  if (!item) {
    item = await prisma.videoQueueItem.findFirst({
      where: {
        useapiJobId: jobId,
        userId,
      },
    })
  }

  if (!item) {
    return null
  }

  if (item.status === "queued" || item.status === "submitting") {
    await maybeDispatchNextQueuedVideo(userId)
    const latestItem = await prisma.videoQueueItem.findUnique({
      where: { id: item.id },
    })

    return buildQueueStatusResult({
      itemId: item.id,
      useapiJobId: latestItem?.useapiJobId,
      status: normalizeQueueStatus(latestItem?.status || item.status),
      queuePosition: await getQueuePosition(userId, item.id),
      resultPayload: latestItem?.resultPayload,
      error: latestItem?.error,
      context: isImageQueueOperation(item.operation) ? "image" : "video",
    })
  }

  if (item.status === "running" && item.useapiJobId) {
    try {
      const jobResult = await getGoogleFlowJob(item.useapiJobId)
      await updateQueueItemFromJobResult(item.id, item.operation as GoogleFlowQueueOperation, jobResult, userId)
    } catch (error) {
      const userMessage = toUserFacingGenerationError(
        extractNestedErrorMessage(error) || (error instanceof Error ? error.message : undefined),
        isImageQueueOperation(item.operation) ? "image" : "video"
      )

      logQueueFailure({
        operation: item.operation,
        stage: "queue-status",
        error,
        userMessage,
        jobId: item.id,
        providerJobId: item.useapiJobId,
        userId: item.userId,
        model: item.model,
        prompt: item.prompt,
        aspectRatio: item.aspectRatio,
      })

      await prisma.videoQueueItem.update({
        where: { id: item.id },
        data: {
            error: userMessage,
        },
      })
    }
  }

  const latestItem = await prisma.videoQueueItem.findUnique({
    where: { id: item.id },
  })

  return buildQueueStatusResult({
    itemId: item.id,
    useapiJobId: latestItem?.useapiJobId,
    status: normalizeQueueStatus(latestItem?.status || item.status),
    queuePosition:
      latestItem?.status === "queued" || latestItem?.status === "submitting"
        ? await getQueuePosition(userId, item.id)
        : undefined,
    resultPayload: latestItem?.resultPayload,
    error: latestItem?.error,
    context: isImageQueueOperation(item.operation) ? "image" : "video",
  })
}

export const getVideoQueueStatus = getGoogleFlowQueueStatus
export const getGenerationQueueStatus = getGoogleFlowQueueStatus

export async function handleGoogleFlowQueueWebhook(params: {
  payload: unknown
  replyRef?: string | null
}) {
  const payload = params.payload && typeof params.payload === "object"
    ? (params.payload as {
        jobid?: string
        jobId?: string
        status?: string
        error?: string | { message?: string }
      })
    : null

  const queueItem = params.replyRef
    ? await prisma.videoQueueItem.findUnique({ where: { id: params.replyRef } })
    : payload?.jobid || payload?.jobId
      ? await prisma.videoQueueItem.findFirst({
          where: {
            useapiJobId: payload.jobid || payload.jobId,
          },
        })
      : null

  if (!queueItem) {
    return { updated: false }
  }

  const normalizedPayload = {
    raw: params.payload,
    jobId: payload?.jobid || payload?.jobId || queueItem.useapiJobId || undefined,
    status: normalizeQueueStatus(payload?.status || queueItem.status),
    type: "video",
    videoUrls: [] as string[],
    imageUrls: [] as string[],
    mediaGenerationId: undefined as string | undefined,
    error:
      extractNestedErrorMessage(payload?.error),
  } satisfies GoogleFlowNormalizedJobResult

  if (normalizedPayload.status === "completed" || normalizedPayload.status === "failed") {
    const latest = queueItem.useapiJobId
      ? await getGoogleFlowJob(queueItem.useapiJobId).catch(() => normalizedPayload)
      : normalizedPayload

    await updateQueueItemFromJobResult(queueItem.id, queueItem.operation as GoogleFlowQueueOperation, latest, queueItem.userId)
    return { updated: true }
  }

  await prisma.videoQueueItem.update({
    where: { id: queueItem.id },
    data: {
      status: "running",
      resultPayload: serializePayload({
        job: params.payload,
      }),
    },
  })

  return { updated: true }
}

export const handleGoogleFlowVideoWebhook = handleGoogleFlowQueueWebhook
export const handleGoogleFlowGenerationWebhook = handleGoogleFlowQueueWebhook

export async function getDirectGoogleFlowVideoStatus(jobId: string): Promise<VideoQueueStatusResult> {
  const jobResult = await getGoogleFlowJob(jobId)

  if (jobResult.status === "failed") {
    logQueueFailure({
      operation: jobResult.type || "video-status",
      stage: "provider-job",
      error: jobResult.error,
      userMessage: toUserFacingGenerationError(jobResult.error, "video"),
      jobId,
      providerJobId: jobResult.jobId,
      extra: {
        mediaGenerationId: jobResult.mediaGenerationId,
      },
    })
  }

  return {
    success: jobResult.status !== "failed",
    jobId,
    useapiJobId: jobResult.jobId,
    status: jobResult.status,
    videoUrls: jobResult.videoUrls,
    mediaGenerationId: jobResult.mediaGenerationId,
    error: jobResult.status === "failed" ? toUserFacingGenerationError(jobResult.error, "video") : jobResult.error,
  }
}

export const getDirectGoogleFlowGenerationStatus = getDirectGoogleFlowVideoStatus

export async function getVideoQueueSummaryByUserId(userId: string): Promise<VideoQueueSummary> {
  const oldestPending = await prisma.videoQueueItem.findFirst({
    where: {
      userId,
      status: { in: [...PENDING_QUEUE_STATUSES] },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })

  if (oldestPending) {
    await getVideoQueueStatus(oldestPending.id, userId)
  } else {
    await maybeDispatchNextQueuedVideo(userId)
  }

  const pendingItems = await prisma.videoQueueItem.findMany({
    where: {
      userId,
      status: { in: [...PENDING_QUEUE_STATUSES] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      prompt: true,
      operation: true,
      createdAt: true,
    },
  })

  const activeStatuses = new Set<string>(ACTIVE_QUEUE_STATUSES)
  const activeItems = pendingItems.filter((item) => activeStatuses.has(item.status))
  const queuedItems = pendingItems.filter((item) => item.status === "queued")
  const activeItem = activeItems[0]
  const nextQueuedItem = queuedItems[0]

  return {
    totalPending: pendingItems.length,
    activeCount: activeItems.length,
    queuedCount: queuedItems.length,
    limit: MAX_PENDING_GENERATION_REQUESTS,
    activeJobId: activeItem?.id,
    activePrompt: activeItem?.prompt || undefined,
    activeOperation: activeItem?.operation || undefined,
    nextQueuedJobId: nextQueuedItem?.id,
    items: pendingItems.map((item, index) => ({
      jobId: item.id,
      status: item.status,
      prompt: item.prompt || undefined,
      operation: item.operation,
      createdAt: item.createdAt.toISOString(),
      queuePosition: index + 1,
    })),
  }
}

export const getGenerationQueueSummaryByUserId = getVideoQueueSummaryByUserId