"use server"

import { auth } from "@/lib/auth"
import { enqueueGenerationQueueItem } from "@/lib/useapi/google-flow-generation-queue"
import { resolveGoogleFlowVideoModel } from "@/lib/useapi/google-flow"
import { logGenerationFailure } from "@/lib/generation-logger"

import {
  checkGenerationAccess,
  getSubscriptionAccessErrorMessage,
} from "./subscription-access"
import { generateTextToVideo } from "./generate-video"
import { getCaptchaToken } from "@/lib/chaptcha"

export interface SubmitImageToVideoInput {
  prompt: string
  referenceImageIds: string[]
  endImageId?: string
  model?: "veo-3.1-quality" | "veo-3.1-fast" | "veo-3.1-fast-relaxed"
  aspectRatio?: "landscape" | "portrait"
  count?: number
  seed?: number
}

export interface SubmitVideoResponse {
  success: boolean
  message?: string
  jobId?: string
  status?: "queued" | "submitting" | "created" | "started" | "running" | "completed" | "failed"
  queuePosition?: number
  shouldShowUpgrade?: boolean
  shouldShowTopup?: boolean
  prompt?: string
}

async function requireSessionUser() {
  const session = await auth()

  if (!session?.user?.id || !session.user.email) {
    return null
  }

  return session.user
}

export async function submitImageToVideo(
  input: SubmitImageToVideoInput
): Promise<SubmitVideoResponse> {
  try {
    const user = await requireSessionUser()
    if (!user) {
      return {
        success: false,
        message: "Unauthorized - please login first",
      }
    }

    const accessCheck = await checkGenerationAccess("imageToVideo")
    if (!accessCheck.success) {
      return {
        success: false,
        message: accessCheck.error || "Gagal memeriksa subscription",
      }
    }

    if (!accessCheck.hasAccess) {
      return {
        success: false,
        message: getSubscriptionAccessErrorMessage(accessCheck),
        shouldShowUpgrade: true,
        shouldShowTopup: true,
      }
    }

    if (!input.referenceImageIds.length) {
      return {
        success: false,
        message: "At least one reference image is required",
      }
    }

    const isReferenceMode = input.referenceImageIds.length >= 2
    const isFrameToFrame = input.referenceImageIds.length === 1 && Boolean(input.endImageId)
    const model = resolveGoogleFlowVideoModel(
      isReferenceMode ? "referenceToVideo" : isFrameToFrame ? "frameToFrame" : "imageToVideo",
      input.model
    )
    const captchaToken = await getCaptchaToken()

    const requestPayload: Record<string, unknown> = {
      prompt: input.prompt,
      model,
      aspectRatio: input.aspectRatio || "landscape",
      count: input.count || 1,
      async: true,
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      ...(captchaToken ? { captchaToken } : {}),
    }

    if (isReferenceMode) {
      input.referenceImageIds.slice(0, 3).forEach((mediaGenerationId, index) => {
        requestPayload[`referenceImage_${index + 1}`] = mediaGenerationId
      })
    } else if (isFrameToFrame) {
      requestPayload.startImage = input.referenceImageIds[0]
      requestPayload.endImage = input.endImageId
    } else {
      requestPayload.startImage = input.referenceImageIds[0]
    }

    const queued = await enqueueGenerationQueueItem({
      userId: user.id,
      operation: isReferenceMode ? "referenceToVideo" : isFrameToFrame ? "frameToFrame" : "imageToVideo",
      prompt: input.prompt,
      aspectRatio: input.aspectRatio || "landscape",
      model,
      requestPayload,
    })

    if (!queued.success) {
      return {
        success: false,
        message: queued.error || "Failed to enqueue request",
      }
    }

    return {
      success: true,
      message: "Job submitted. Poll status until completion.",
      jobId: queued.jobId,
      status: queued.status,
      queuePosition: queued.queuePosition,
      prompt: input.prompt,
    }
  } catch (error) {
    logGenerationFailure({
      kind: "video",
      operation: "submitImageToVideo",
      stage: "submit",
      error,
      userMessage: error instanceof Error ? error.message : "Failed to submit video",
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      model: input.model,
      extra: {
        referenceImageCount: input.referenceImageIds.length,
        hasEndImage: Boolean(input.endImageId),
      },
    })
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to submit video",
    }
  }
}

export interface SubmitTextToVideoInput {
  prompt: string
  model?: "veo-3.1-quality" | "veo-3.1-fast" | "veo-3.1-fast-relaxed"
  aspectRatio?: "landscape" | "portrait"
  count?: number
  seed?: number
}

export async function submitTextToVideo(
  input: SubmitTextToVideoInput
): Promise<SubmitVideoResponse> {
  try {
    const result = await generateTextToVideo({
      prompt: input.prompt,
      model: input.model,
      aspectRatio: input.aspectRatio || "landscape",
      count: input.count,
      seed: input.seed,
    })

    if (!result.success) {
      return {
        success: false,
        message: result.error || "Generate gagal",
      }
    }

    return {
      success: true,
      message: "Job submitted. Poll status until completion.",
      jobId: result.jobId,
      status: result.status,
      queuePosition: result.queuePosition,
      prompt: input.prompt,
    }
  } catch (error) {
    logGenerationFailure({
      kind: "video",
      operation: "submitTextToVideo",
      stage: "submit",
      error,
      userMessage: error instanceof Error ? error.message : "Terjadi kesalahan",
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      model: input.model,
      extra: {
        count: input.count,
        seed: input.seed,
      },
    })
    return {
      success: false,
      message: error instanceof Error ? error.message : "Terjadi kesalahan",
    }
  }
}

export type CheckVideoJobStatusAction = typeof import("./generate-video").checkVideoJobStatus
