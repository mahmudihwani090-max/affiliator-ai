"use client"

import type { GoogleFlowJobStatus } from "@/lib/useapi/google-flow"

type AspectRatio = "landscape" | "portrait"
type VideoResolution = "1080p" | "4K"
type ImageResolution = "2k" | "4k"
type JobOperation =
  | "textToImage"
  | "imageToImage"
  | "upscaleImage"
  | "textToVideo"
  | "imageToVideo"
  | "upscaleVideo"
  | "upscaleVideo4K"
  | "extendVideo"

type JsonRecord = Record<string, unknown>
type ApiResult = {
  success?: boolean
  error?: string
} & JsonRecord

type ImageGenerationResult = ApiResult & {
  imageUrl?: string
  imageUrls?: string[]
  jobId?: string
  mediaGenerationId?: string
  queuePosition?: number
  status?: GoogleFlowJobStatus
}

type VideoGenerationResult = ApiResult & {
  jobId?: string
  mediaGenerationId?: string
  queuePosition?: number
  status?: GoogleFlowJobStatus
  videoUrl?: string
  videoUrls?: string[]
}

export class ApiRequestError extends Error {
  endpoint: string
  status: number
  payload: JsonRecord

  constructor(endpoint: string, status: number, payload: JsonRecord) {
    super(typeof payload.error === "string" ? payload.error : "Request failed")
    this.name = "ApiRequestError"
    this.endpoint = endpoint
    this.status = status
    this.payload = payload
  }
}

async function requestJson<T extends ApiResult>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-Version": "1",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => ({}))) as T
  if (!response.ok) {
    throw new ApiRequestError(input, response.status, payload)
  }

  return payload
}

function withErrorFallback<T extends ApiResult>(promise: Promise<T>): Promise<T> {
  return promise.catch((error) => ({
    success: false,
    error: error instanceof Error ? error.message : "Unknown error",
  } as T))
}

export function generateTextToImage(request: {
  prompt: string
  aspectRatio: AspectRatio
}) {
  return withErrorFallback(requestJson<ImageGenerationResult>("/api/generate/image", {
    method: "POST",
    body: JSON.stringify(request),
  }))
}

export function generateImageToImage(request: {
  prompt: string
  referenceImagesBase64: string[]
  aspectRatio: AspectRatio
}) {
  return withErrorFallback(requestJson<ImageGenerationResult>("/api/generate/image", {
    method: "POST",
    body: JSON.stringify({
      prompt: request.prompt,
      aspectRatio: request.aspectRatio,
      referenceImages: request.referenceImagesBase64,
    }),
  }))
}

export function checkImageJobStatus(
  jobId: string,
  operation?: Extract<JobOperation, "textToImage" | "imageToImage" | "upscaleImage">
) {
  const query = operation ? `?operation=${encodeURIComponent(operation)}` : ""

  return withErrorFallback(requestJson<ImageGenerationResult>(`/api/jobs/${encodeURIComponent(jobId)}${query}`, {
    method: "GET",
    headers: {
      "X-API-Version": "1",
    },
  }))
}

export function upscaleImage(request: {
  mediaGenerationId: string
  resolution?: ImageResolution
}) {
  return withErrorFallback(requestJson<ImageGenerationResult>("/api/upscale/image", {
    method: "POST",
    body: JSON.stringify(request),
  }))
}

export function generateTextToVideo(request: {
  prompt: string
  aspectRatio: AspectRatio
  model?: string
  count?: number
  seed?: number
}) {
  return withErrorFallback(requestJson<VideoGenerationResult>("/api/generate/video", {
    method: "POST",
    body: JSON.stringify(request),
  }))
}

export function submitTextToVideo(request: {
  prompt: string
  aspectRatio?: AspectRatio
  model?: string
  count?: number
  seed?: number
}) {
  return withErrorFallback(requestJson<VideoGenerationResult>("/api/generate/video", {
    method: "POST",
    body: JSON.stringify({
      prompt: request.prompt,
      aspectRatio: request.aspectRatio || "landscape",
      model: request.model,
      count: request.count,
      seed: request.seed,
    }),
  }).then((payload) => ({
    success: Boolean(payload.success),
    message: typeof payload.error === "string" ? payload.error : undefined,
    jobId: typeof payload.jobId === "string" ? payload.jobId : undefined,
    status: typeof payload.status === "string" ? payload.status : undefined,
    queuePosition: typeof payload.queuePosition === "number" ? payload.queuePosition : undefined,
    prompt: request.prompt,
  })))
}

export function generateImageToVideo(request: {
  prompt: string
  startImageBase64: string
  aspectRatio: AspectRatio
  model?: string
}) {
  return withErrorFallback(requestJson<VideoGenerationResult>("/api/generate/video", {
    method: "POST",
    body: JSON.stringify({
      prompt: request.prompt,
      aspectRatio: request.aspectRatio,
      model: request.model,
      startImage: request.startImageBase64,
    }),
  }))
}

export function generateFrameToFrameVideo(request: {
  prompt: string
  startImageBase64: string
  endImageBase64: string
  aspectRatio: AspectRatio
  model?: string
}) {
  return withErrorFallback(requestJson<VideoGenerationResult>("/api/generate/video", {
    method: "POST",
    body: JSON.stringify({
      prompt: request.prompt,
      aspectRatio: request.aspectRatio,
      model: request.model,
      startImage: request.startImageBase64,
      endImage: request.endImageBase64,
    }),
  }))
}

export function generateReferenceToVideo(request: {
  prompt: string
  referenceImagesBase64: string[]
  aspectRatio: AspectRatio
  model?: string
}) {
  return withErrorFallback(requestJson<VideoGenerationResult>("/api/generate/video", {
    method: "POST",
    body: JSON.stringify({
      prompt: request.prompt,
      aspectRatio: request.aspectRatio,
      model: request.model,
      referenceImages: request.referenceImagesBase64,
    }),
  }))
}

export function checkVideoJobStatus(
  jobId: string,
  operation?: Extract<JobOperation, "textToVideo" | "imageToVideo" | "upscaleVideo" | "upscaleVideo4K" | "extendVideo">
) {
  const query = operation ? `?operation=${encodeURIComponent(operation)}` : ""

  return withErrorFallback(requestJson<VideoGenerationResult>(`/api/jobs/${encodeURIComponent(jobId)}${query}`, {
    method: "GET",
    headers: {
      "X-API-Version": "1",
    },
  }))
}

export function upscaleVideo(request: {
  mediaGenerationId: string
  resolution?: VideoResolution
}) {
  return withErrorFallback(requestJson<VideoGenerationResult>("/api/upscale/video", {
    method: "POST",
    body: JSON.stringify(request),
  }))
}

export function extendVideo(request: {
  mediaGenerationId: string
  prompt: string
}) {
  return withErrorFallback(requestJson<VideoGenerationResult>("/api/generate/video/extend", {
    method: "POST",
    body: JSON.stringify(request),
  }))
}