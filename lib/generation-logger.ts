import { extractNestedErrorMessage } from "@/lib/generation-errors"

type GenerationKind = "image" | "video"
type GenerationFailureStage =
  | "submit"
  | "status-check"
  | "queue-submit"
  | "queue-status"
  | "provider-job"
  | "webhook"
  | "validation"

interface GenerationFailureLogInput {
  kind: GenerationKind
  operation: string
  stage: GenerationFailureStage
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
}

function truncate(value: string, maxLength = 220) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength)}...`
}

function looksLikeBase64(value: string) {
  return value.startsWith("data:") || (value.length > 180 && /^[A-Za-z0-9+/=\s]+$/.test(value))
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value == null) {
    return value
  }

  if (typeof value === "string") {
    const normalized = value.replace(/\s+/g, " ").trim()
    if (!normalized) {
      return normalized
    }

    if (looksLikeBase64(normalized)) {
      return `[redacted:${normalized.slice(0, 20)}... len=${normalized.length}]`
    }

    return truncate(normalized)
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncate(value.message || "Unknown error"),
      stack: value.stack ? truncate(value.stack, 500) : undefined,
    }
  }

  if (depth >= 3) {
    return "[max-depth]"
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((entry) => sanitizeValue(entry, depth + 1))
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    const output: Record<string, unknown> = {}

    for (const [key, entry] of Object.entries(record).slice(0, 20)) {
      output[key] = sanitizeValue(entry, depth + 1)
    }

    return output
  }

  return String(value)
}

function summarizeError(error: unknown) {
  return {
    message: extractNestedErrorMessage(error),
    raw: sanitizeValue(error),
  }
}

export function logGenerationFailure(input: GenerationFailureLogInput) {
  const payload = {
    timestamp: new Date().toISOString(),
    kind: input.kind,
    operation: input.operation,
    stage: input.stage,
    jobId: input.jobId,
    providerJobId: input.providerJobId,
    userId: input.userId || undefined,
    model: input.model || undefined,
    aspectRatio: input.aspectRatio,
    queuePosition: input.queuePosition,
    promptPreview: input.prompt ? truncate(input.prompt.replace(/\s+/g, " ").trim()) : undefined,
    userMessage: input.userMessage,
    error: summarizeError(input.error),
    extra: input.extra ? sanitizeValue(input.extra) : undefined,
  }

  console.error(`[generation:${input.kind}:${input.operation}:${input.stage}]`, payload)
}