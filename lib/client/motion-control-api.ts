"use client"

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-Version": "1",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error(payload.error || "Request failed")
  }

  return payload
}

export async function submitMotionControl(request: {
  imageUrl: string
  videoUrl: string
  prompt?: string
  characterOrientation?: "video" | "image"
  cfgScale?: number
  apiKey: string
}) {
  try {
    return await requestJson<{
      success: boolean
      taskId?: string
      error?: string
      rawResponse?: unknown
    }>("/api/motion-control", {
      method: "POST",
      body: JSON.stringify(request),
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function checkMotionControlStatus(taskId: string, apiKey: string) {
  try {
    return await requestJson<{
      success: boolean
      status?: string
      videoUrl?: string
      error?: string
    }>(`/api/motion-control?taskId=${encodeURIComponent(taskId)}&apiKey=${encodeURIComponent(apiKey)}`, {
      method: "GET",
      headers: {
        "X-API-Version": "1",
      },
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}