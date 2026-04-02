const GOOGLE_FLOW_BASE_URL = "https://api.useapi.net/v1/google-flow"
const RETRYABLE_STATUSES = new Set([429, 503])
const DEFAULT_MAX_RETRIES = 4
const DEFAULT_BACKOFF_MS = 5000

import { extractNestedErrorMessage } from "@/lib/generation-errors"

export type GoogleFlowVideoOperation =
  | "textToVideo"
  | "imageToVideo"
  | "referenceToVideo"
  | "frameToFrame"
  | "upscaleVideo"
  | "extendVideo"

export type GoogleFlowJobStatus =
  | "queued"
  | "submitting"
  | "created"
  | "started"
  | "running"
  | "completed"
  | "failed"

export interface GoogleFlowRequestOptions {
  replyRef?: string
  replyUrl?: string
  enableWebhook?: boolean
  maxRetries?: number
}

export interface GoogleFlowAssetUploadResult {
  raw: unknown
  email?: string
  mediaGenerationId?: string
  width?: number
  height?: number
}

export interface GoogleFlowVideoSubmissionResult {
  raw: unknown
  jobId?: string
  videoUrls: string[]
  mediaGenerationId?: string
}

export interface GoogleFlowImageSubmissionResult {
  raw: unknown
  jobId?: string
  imageUrls: string[]
  mediaGenerationId?: string
}

export interface GoogleFlowNormalizedJobResult {
  raw: unknown
  jobId?: string
  type?: string
  status: GoogleFlowJobStatus
  videoUrls: string[]
  imageUrls: string[]
  mediaGenerationId?: string
  error?: string
}

type RequestInitWithBody = Omit<RequestInit, "body"> & {
  body?: BodyInit | null
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeOrigin(origin?: string | null) {
  if (!origin) {
    return ""
  }

  try {
    return new URL(origin).origin
  } catch {
    return ""
  }
}

function getConfiguredSiteOrigin() {
  return normalizeOrigin(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      null
  )
}

function getUseApiToken() {
  const token = process.env.USEAPI_API_TOKEN || process.env.USEAPI_TOKEN

  if (!token) {
    throw new Error("USEAPI_API_TOKEN is not configured")
  }

  return token
}

function buildBackoffDelay(attempt: number) {
  const jitter = Math.floor(Math.random() * 750)
  return DEFAULT_BACKOFF_MS * Math.pow(2, attempt) + jitter
}

async function parseResponseBody(response: Response) {
  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function getNestedErrorMessage(data: unknown, fallbackStatus: number) {
  return extractNestedErrorMessage(data) || `API Error: ${fallbackStatus}`
}

function buildRequestHeaders(extraHeaders?: HeadersInit) {
  return {
    Authorization: `Bearer ${getUseApiToken()}`,
    ...(extraHeaders || {}),
  }
}

async function requestGoogleFlow<T>(
  path: string,
  init: RequestInitWithBody,
  options?: { maxRetries?: number }
) {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(`${GOOGLE_FLOW_BASE_URL}${path}`, init)
    const data = (await parseResponseBody(response)) as T

    if (response.ok) {
      return { response, data }
    }

    if (RETRYABLE_STATUSES.has(response.status) && attempt < maxRetries) {
      await sleep(buildBackoffDelay(attempt))
      continue
    }

    lastError = new Error(getNestedErrorMessage(data, response.status))
    ;(lastError as Error & { cause?: unknown }).cause = data
    throw lastError
  }

  throw lastError || new Error("Unknown Google Flow request failure")
}

function withReplyOptions(
  body: Record<string, unknown>,
  options?: GoogleFlowRequestOptions
) {
  const requestBody = { ...body }
  if (options?.replyRef) {
    requestBody.replyRef = options.replyRef
  }

  if (options?.replyUrl) {
    requestBody.replyUrl = options.replyUrl
    return requestBody
  }

  if (!options?.enableWebhook || !options.replyRef) {
    return requestBody
  }

  const origin = getConfiguredSiteOrigin()
  if (!origin) {
    return requestBody
  }

  const webhookUrl = new URL("/api/useapi/google-flow/webhook", origin)
  const webhookSecret = process.env.USEAPI_WEBHOOK_SECRET

  if (webhookSecret) {
    webhookUrl.searchParams.set("secret", webhookSecret)
  }

  webhookUrl.searchParams.set("replyRef", options.replyRef)
  requestBody.replyUrl = webhookUrl.toString()

  return requestBody
}

function uniqueStrings(values: Array<string | undefined | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
}

function parseVideoMedia(items: unknown[] | undefined) {
  const videoUrls: string[] = []
  let mediaGenerationId: string | undefined

  if (!items) {
    return { videoUrls, mediaGenerationId }
  }

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue
    }

    const candidate = item as {
      videoUrl?: string
      mediaGenerationId?: string
      video?: {
        generatedVideo?: {
          mediaGenerationId?: string
        }
      }
    }

    if (candidate.videoUrl) {
      videoUrls.push(candidate.videoUrl)
    }

    if (!mediaGenerationId) {
      mediaGenerationId = candidate.mediaGenerationId || candidate.video?.generatedVideo?.mediaGenerationId
    }
  }

  return {
    videoUrls: uniqueStrings(videoUrls),
    mediaGenerationId,
  }
}

function parseVideoOperations(items: unknown[] | undefined) {
  const videoUrls: string[] = []
  let mediaGenerationId: string | undefined

  if (!items) {
    return { videoUrls, mediaGenerationId }
  }

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue
    }

    const candidate = item as {
      mediaGenerationId?: string
      video?: {
        fifeUrl?: string
        mediaGenerationId?: string
      }
      operation?: {
        metadata?: {
          video?: {
            fifeUrl?: string
            mediaGenerationId?: string
          }
        }
      }
    }

    const url = candidate.video?.fifeUrl || candidate.operation?.metadata?.video?.fifeUrl
    if (url) {
      videoUrls.push(url)
    }

    if (!mediaGenerationId) {
      mediaGenerationId =
        candidate.mediaGenerationId ||
        candidate.video?.mediaGenerationId ||
        candidate.operation?.metadata?.video?.mediaGenerationId
    }
  }

  return {
    videoUrls: uniqueStrings(videoUrls),
    mediaGenerationId,
  }
}

function parseImageMedia(items: unknown[] | undefined) {
  const imageUrls: string[] = []
  let mediaGenerationId: string | undefined

  if (!items) {
    return { imageUrls, mediaGenerationId }
  }

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue
    }

    const candidate = item as {
      image?: {
        generatedImage?: {
          fifeUrl?: string
          mediaGenerationId?: string
        }
      }
    }

    const generatedImage = candidate.image?.generatedImage
    if (generatedImage?.fifeUrl) {
      imageUrls.push(generatedImage.fifeUrl)
    }

    if (!mediaGenerationId) {
      mediaGenerationId = generatedImage?.mediaGenerationId
    }
  }

  return {
    imageUrls: uniqueStrings(imageUrls),
    mediaGenerationId,
  }
}

export function resolveGoogleFlowVideoModel(
  operation: GoogleFlowVideoOperation,
  requestedModel?: string
) {
  const configuredDefault = process.env.USEAPI_GOOGLE_FLOW_DEFAULT_VIDEO_MODEL || "veo-3.1-fast"
  const configuredReferenceDefault =
    process.env.USEAPI_GOOGLE_FLOW_DEFAULT_REFERENCE_VIDEO_MODEL || "veo-3.1-fast"
  const configuredRelaxedFallback =
    process.env.USEAPI_GOOGLE_FLOW_RELAXED_VIDEO_MODEL || "veo-3.1-fast-relaxed"

  const allowedModels =
    operation === "referenceToVideo"
      ? [configuredReferenceDefault, configuredRelaxedFallback, "veo-3.1-fast"]
      : [requestedModel || configuredDefault, configuredRelaxedFallback, "veo-3.1-fast", "veo-3.1-quality"]

  for (const candidate of allowedModels) {
    if (!candidate) {
      continue
    }

    if (operation === "referenceToVideo" && candidate === "veo-3.1-quality") {
      continue
    }

    return candidate
  }

  return operation === "referenceToVideo" ? "veo-3.1-fast" : "veo-3.1-fast"
}

export function getGoogleFlowImageModelCandidates(requestedModel?: string, referenceCount: number = 0) {
  const configuredDefault = process.env.USEAPI_GOOGLE_FLOW_DEFAULT_IMAGE_MODEL || "nano-banana-pro"
  const fallbackChain = [requestedModel, configuredDefault, "nano-banana-2", "nano-banana", "imagen-4"]
  const candidates: string[] = []

  for (const candidate of fallbackChain) {
    if (!candidate) {
      continue
    }

    if (referenceCount > 3 && ["imagen-4", "nano-banana"].includes(candidate)) {
      continue
    }

    if (!candidates.includes(candidate)) {
      candidates.push(candidate)
    }
  }

  if (candidates.length === 0) {
    candidates.push(referenceCount > 3 ? "nano-banana-2" : "nano-banana")
  }

  return candidates
}

export function resolveGoogleFlowImageModel(requestedModel?: string, referenceCount: number = 0) {
  return getGoogleFlowImageModelCandidates(requestedModel, referenceCount)[0]
}

function extractGoogleFlowJobError(data: Record<string, unknown>) {
  return extractNestedErrorMessage([
    data.error,
    data.response,
    data.response && typeof data.response === "object" ? (data.response as { error?: unknown }).error : undefined,
    data.operations,
    data.media,
  ])
}

export async function uploadGoogleFlowAsset(params: {
  binaryData: Uint8Array
  contentType: string
  email?: string | null
  maxRetries?: number
}) {
  const path = params.email ? `/assets/${encodeURIComponent(params.email)}` : "/assets"
  const requestBody = new Uint8Array(params.binaryData).buffer
  const { data } = await requestGoogleFlow<{
    email?: string
    width?: number
    height?: number
    mediaGenerationId?: string | { mediaGenerationId?: string }
  }>(
    path,
    {
      method: "POST",
      headers: buildRequestHeaders({
        "Content-Type": params.contentType,
      }),
      body: requestBody,
    },
    {
      maxRetries: params.maxRetries,
    }
  )

  return {
    raw: data,
    email: data.email,
    width: data.width,
    height: data.height,
    mediaGenerationId:
      typeof data.mediaGenerationId === "object"
        ? data.mediaGenerationId?.mediaGenerationId
        : data.mediaGenerationId,
  } satisfies GoogleFlowAssetUploadResult
}

export async function submitGoogleFlowVideo(
  body: Record<string, unknown>,
  options?: GoogleFlowRequestOptions
) {
  const requestBody = withReplyOptions(body, options)
  const { data } = await requestGoogleFlow<Record<string, unknown>>(
    "/videos",
    {
      method: "POST",
      headers: buildRequestHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(requestBody),
    },
    {
      maxRetries: options?.maxRetries,
    }
  )

  const parsedMedia = parseVideoMedia(Array.isArray(data.media) ? data.media : undefined)
  const parsedOperations = parseVideoOperations(Array.isArray(data.operations) ? data.operations : undefined)

  return {
    raw: data,
    jobId: typeof data.jobId === "string" ? data.jobId : typeof data.jobid === "string" ? data.jobid : undefined,
    videoUrls: uniqueStrings([...parsedMedia.videoUrls, ...parsedOperations.videoUrls]),
    mediaGenerationId: parsedMedia.mediaGenerationId || parsedOperations.mediaGenerationId,
  } satisfies GoogleFlowVideoSubmissionResult
}

export async function submitGoogleFlowVideoUpscale(
  body: Record<string, unknown>,
  options?: GoogleFlowRequestOptions
) {
  const { data } = await requestGoogleFlow<Record<string, unknown>>(
    "/videos/upscale",
    {
      method: "POST",
      headers: buildRequestHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(withReplyOptions(body, options)),
    },
    {
      maxRetries: options?.maxRetries,
    }
  )

  const parsedOperations = parseVideoOperations(Array.isArray(data.operations) ? data.operations : undefined)

  return {
    raw: data,
    jobId: typeof data.jobId === "string" ? data.jobId : typeof data.jobid === "string" ? data.jobid : undefined,
    videoUrls: parsedOperations.videoUrls,
    mediaGenerationId: parsedOperations.mediaGenerationId,
  } satisfies GoogleFlowVideoSubmissionResult
}

export async function submitGoogleFlowVideoExtend(
  body: Record<string, unknown>,
  options?: GoogleFlowRequestOptions
) {
  const { data } = await requestGoogleFlow<Record<string, unknown>>(
    "/videos/extend",
    {
      method: "POST",
      headers: buildRequestHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(withReplyOptions(body, options)),
    },
    {
      maxRetries: options?.maxRetries,
    }
  )

  const parsedOperations = parseVideoOperations(Array.isArray(data.operations) ? data.operations : undefined)

  return {
    raw: data,
    jobId: typeof data.jobId === "string" ? data.jobId : typeof data.jobid === "string" ? data.jobid : undefined,
    videoUrls: parsedOperations.videoUrls,
    mediaGenerationId: parsedOperations.mediaGenerationId,
  } satisfies GoogleFlowVideoSubmissionResult
}

export async function submitGoogleFlowImage(
  body: Record<string, unknown>,
  options?: GoogleFlowRequestOptions
) {
  const { data } = await requestGoogleFlow<Record<string, unknown>>(
    "/images",
    {
      method: "POST",
      headers: buildRequestHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(withReplyOptions(body, options)),
    },
    {
      maxRetries: options?.maxRetries,
    }
  )

  const parsedMedia = parseImageMedia(Array.isArray(data.media) ? data.media : undefined)

  return {
    raw: data,
    jobId: typeof data.jobId === "string" ? data.jobId : typeof data.jobid === "string" ? data.jobid : undefined,
    imageUrls: parsedMedia.imageUrls,
    mediaGenerationId: parsedMedia.mediaGenerationId,
  } satisfies GoogleFlowImageSubmissionResult
}

export async function submitGoogleFlowImageUpscale(
  body: Record<string, unknown>,
  options?: GoogleFlowRequestOptions
) {
  const { data } = await requestGoogleFlow<Record<string, unknown>>(
    "/images/upscale",
    {
      method: "POST",
      headers: buildRequestHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(withReplyOptions(body, options)),
    },
    {
      maxRetries: options?.maxRetries,
    }
  )

  const parsedMedia = parseImageMedia(Array.isArray(data.media) ? data.media : undefined)

  return {
    raw: data,
    jobId: typeof data.jobId === "string" ? data.jobId : typeof data.jobid === "string" ? data.jobid : undefined,
    imageUrls: parsedMedia.imageUrls,
    mediaGenerationId: parsedMedia.mediaGenerationId,
  } satisfies GoogleFlowImageSubmissionResult
}

export async function getGoogleFlowJob(jobId: string, options?: { maxRetries?: number }) {
  const { data } = await requestGoogleFlow<Record<string, unknown>>(
    `/jobs/${jobId}`,
    {
      method: "GET",
      headers: buildRequestHeaders(),
    },
    {
      maxRetries: options?.maxRetries,
    }
  )

  const responsePayload =
    data.response && typeof data.response === "object"
      ? (data.response as { media?: unknown[]; operations?: unknown[] })
      : undefined

  const parsedVideoMedia = parseVideoMedia(responsePayload?.media)
  const parsedVideoOperations = parseVideoOperations(responsePayload?.operations)
  const parsedImageMedia = parseImageMedia(responsePayload?.media)

  const rawStatus = typeof data.status === "string" ? data.status : "running"
  const normalizedStatus: GoogleFlowJobStatus =
    rawStatus === "created" || rawStatus === "started" || rawStatus === "completed" || rawStatus === "failed"
      ? rawStatus
      : "running"

  return {
    raw: data,
    jobId: typeof data.jobid === "string" ? data.jobid : typeof data.jobId === "string" ? data.jobId : jobId,
    type: typeof data.type === "string" ? data.type : undefined,
    status: normalizedStatus,
    videoUrls: uniqueStrings([...parsedVideoMedia.videoUrls, ...parsedVideoOperations.videoUrls]),
    imageUrls: parsedImageMedia.imageUrls,
    mediaGenerationId:
      parsedVideoMedia.mediaGenerationId ||
      parsedVideoOperations.mediaGenerationId ||
      parsedImageMedia.mediaGenerationId,
    error: extractGoogleFlowJobError(data),
  } satisfies GoogleFlowNormalizedJobResult
}