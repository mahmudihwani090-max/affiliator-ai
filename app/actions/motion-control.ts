"use server"

import { auth } from "@/lib/auth"
import { checkSubscriptionStatus } from "@/lib/subscription"

interface MotionControlRequest {
  imageUrl: string
  videoUrl: string
  prompt?: string
  characterOrientation?: "video" | "image"
  cfgScale?: number
  apiKey: string
}

interface MotionControlTaskResponse {
  success: boolean
  taskId?: string
  error?: string
  rawResponse?: unknown
}

interface MotionControlStatusResponse {
  success: boolean
  status?: string
  videoUrl?: string
  error?: string
}

async function requireAuthorizedSubscribedUser() {
  const session = await auth()
  if (!session?.user?.id) {
    return {
      success: false as const,
      error: "Unauthorized",
    }
  }

  const access = await checkSubscriptionStatus(session.user.id)
  if (!access.isActive) {
    return {
      success: false as const,
      error: "Subscription tidak aktif. Silakan berlangganan untuk menggunakan fitur generate.",
    }
  }

  return {
    success: true as const,
    userId: session.user.id,
  }
}

function extractTaskId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined
  }

  const record = payload as Record<string, unknown>
  const data =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : undefined

  const candidates = [
    data?.task_id,
    data?.taskId,
    data?.id,
    record.task_id,
    record.taskId,
    record.id,
  ]

  return candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0
  )
}

function extractGeneratedVideoUrl(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined
  }

  const record = payload as Record<string, unknown>
  const data =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : undefined

  const generated = data?.generated
  if (Array.isArray(generated)) {
    const firstUrl = generated.find(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    )
    if (firstUrl) {
      return firstUrl
    }
  }

  const candidates = [
    data?.video,
    data?.video_url,
    data?.result,
    data?.output,
    record.video,
    record.video_url,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate
    }

    if (candidate && typeof candidate === "object") {
      const candidateRecord = candidate as Record<string, unknown>
      const nestedUrl = [candidateRecord.url, candidateRecord.video, candidateRecord.video_url].find(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      )

      if (nestedUrl) {
        return nestedUrl
      }
    }
  }

  return undefined
}

export async function submitMotionControl(
  request: MotionControlRequest
): Promise<MotionControlTaskResponse> {
  const actor = await requireAuthorizedSubscribedUser()
  if (!actor.success) {
    return { success: false, error: actor.error }
  }

  if (!request.apiKey || request.apiKey.trim().length === 0) {
    return { success: false, error: "Freepik API Key wajib diisi" }
  }

  if (!request.imageUrl || !request.videoUrl) {
    return { success: false, error: "Image URL dan Video URL wajib diisi" }
  }

  try {
    const body: Record<string, unknown> = {
      image_url: request.imageUrl,
      video_url: request.videoUrl,
    }

    if (request.prompt && request.prompt.trim().length > 0) {
      body.prompt = request.prompt.trim()
    }

    if (request.characterOrientation) {
      body.character_orientation = request.characterOrientation
    }

    if (request.cfgScale !== undefined) {
      body.cfg_scale = request.cfgScale
    }

    const response = await fetch(
      "https://api.freepik.com/v1/ai/video/kling-v2-6-motion-control-pro",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-freepik-api-key": request.apiKey,
        },
        body: JSON.stringify(body),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      const errorMsg =
        errorData?.message || errorData?.error || `API error: ${response.status}`
      return { success: false, error: errorMsg }
    }

    const data = await response.json()
    const taskId = extractTaskId(data)

    if (!taskId) {
      return {
        success: false,
        error: "Freepik tidak mengembalikan task ID yang valid",
        rawResponse: data,
      }
    }

    return {
      success: true,
      taskId,
      rawResponse: data,
    }
  } catch (error) {
    console.error("Motion control error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function checkMotionControlStatus(
  taskId: string,
  apiKey: string
): Promise<MotionControlStatusResponse> {
  const actor = await requireAuthorizedSubscribedUser()
  if (!actor.success) {
    return { success: false, error: actor.error }
  }

  if (!apiKey || apiKey.trim().length === 0) {
    return { success: false, error: "API Key wajib diisi" }
  }

  try {
    const response = await fetch(
      `https://api.freepik.com/v1/ai/image-to-video/kling-v2-6/${taskId}`,
      {
        method: "GET",
        headers: {
          "x-freepik-api-key": apiKey,
        },
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      return {
        success: false,
        error: errorData?.message || `API error: ${response.status}`,
      }
    }

    const data = await response.json()
    const status =
      (typeof data?.data?.status === "string" && data.data.status) ||
      (typeof data?.status === "string" && data.status) ||
      "unknown"

    let videoUrl: string | undefined
    if (status === "completed" || status === "COMPLETED" || status === "SUCCESS") {
      videoUrl = extractGeneratedVideoUrl(data)
    }

    const normalizedStatus =
      status === "COMPLETED" || status === "SUCCESS"
        ? "completed"
        : status === "FAILED" || status === "ERROR"
          ? "failed"
          : status === "PROCESSING" || status === "IN_PROGRESS" || status === "PENDING"
            ? "processing"
            : status

    return {
      success: true,
      status: normalizedStatus,
      videoUrl,
    }
  } catch (error) {
    console.error("Motion control status error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
