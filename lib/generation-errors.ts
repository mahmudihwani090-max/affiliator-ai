const GENERIC_ERROR_PATTERNS = [
  /^job failed$/i,
  /^google flow job failed$/i,
  /^unknown error occurred$/i,
  /^generate gagal$/i,
  /^failed to generate (image|video)$/i,
  /^failed to submit queued generation request$/i,
  /^failed to refresh queue status$/i,
  /^api error(?::\s*\d+)?$/i,
]

const NESTED_ERROR_KEYS = [
  "error",
  "message",
  "detail",
  "details",
  "reason",
  "description",
  "statusText",
  "failureReason",
  "finishReason",
  "cause",
] as const

type GenerationErrorContext = "image" | "video" | "imageUpscale" | "videoUpscale"

export function isGenericGenerationError(message?: string | null) {
  const normalized = message?.trim()
  if (!normalized) {
    return true
  }

  return GENERIC_ERROR_PATTERNS.some((pattern) => pattern.test(normalized))
}

function getDefaultMessage(context: GenerationErrorContext) {
  switch (context) {
    case "image":
      return "Generate gambar gagal. Coba ubah prompt atau ulangi beberapa saat lagi."
    case "video":
      return "Generate video gagal. Coba ubah prompt atau ulangi beberapa saat lagi."
    case "imageUpscale":
      return "Upscale gambar gagal. Coba ulang beberapa saat lagi."
    case "videoUpscale":
      return "Upscale video gagal. Coba ulang beberapa saat lagi."
  }
}

function cleanMessage(message: string) {
  return message.replace(/\s+/g, " ").trim()
}

function translateKnownError(message: string, context: GenerationErrorContext) {
  const lowerMessage = message.toLowerCase()

  if (lowerMessage.includes("useapi_api_token") || lowerMessage.includes("useapi_token")) {
    return "Server generate belum dikonfigurasi dengan benar. Hubungi admin untuk mengisi USEAPI API token."
  }

  if (lowerMessage.includes("unauthorized") || lowerMessage.includes("forbidden")) {
    return "Sesi Anda tidak valid atau akses ditolak. Silakan login ulang lalu coba lagi."
  }

  if (lowerMessage.includes("captcha")) {
    return "Captcha token gagal dibuat. Coba ulang beberapa saat lagi."
  }

  if (lowerMessage.includes("rate limit") || lowerMessage.includes("too many requests") || lowerMessage.includes("api error: 429")) {
    return "Server generate sedang padat. Tunggu sebentar lalu coba lagi."
  }

  if (lowerMessage.includes("service unavailable") || lowerMessage.includes("overloaded") || lowerMessage.includes("temporarily unavailable") || lowerMessage.includes("api error: 503")) {
    return "Layanan generate sedang sibuk. Coba ulang beberapa saat lagi."
  }

  if (lowerMessage.includes("timed out") || lowerMessage.includes("timeout")) {
    return context === "video"
      ? "Generate video terlalu lama dan melewati batas waktu. Coba ulang atau sederhanakan prompt."
      : "Generate gambar terlalu lama dan melewati batas waktu. Coba ulang atau sederhanakan prompt."
  }

  if (lowerMessage.includes("safety") || lowerMessage.includes("policy") || lowerMessage.includes("moderation")) {
    return "Request ditolak oleh sistem safety model. Ubah prompt atau gambar referensi lalu coba lagi."
  }

  if (lowerMessage.includes("quota") || lowerMessage.includes("billing") || lowerMessage.includes("insufficient credits")) {
    return "Credit atau kuota generate Anda tidak cukup untuk menjalankan request ini."
  }

  if (lowerMessage.includes("invalid image") || lowerMessage.includes("failed to decode image") || lowerMessage.includes("too small")) {
    return "File gambar referensi tidak valid atau kualitasnya terlalu rendah. Gunakan gambar yang lebih jelas lalu coba lagi."
  }

  if (lowerMessage.includes("failed to fetch image")) {
    return "Salah satu gambar referensi gagal diambil dari sumbernya. Coba upload ulang gambarnya."
  }

  if (lowerMessage.includes("reference image") && lowerMessage.includes("required")) {
    return "Gambar referensi wajib diisi sebelum generate dimulai."
  }

  return cleanMessage(message)
}

export function toUserFacingGenerationError(
  message: string | null | undefined,
  context: GenerationErrorContext
) {
  const normalized = message ? cleanMessage(message) : ""

  if (isGenericGenerationError(normalized)) {
    return getDefaultMessage(context)
  }

  return translateKnownError(normalized, context)
}

export function extractNestedErrorMessage(value: unknown, maxDepth = 5): string | undefined {
  const visited = new Set<unknown>()

  const visit = (candidate: unknown, depth: number): string | undefined => {
    if (!candidate || depth > maxDepth || visited.has(candidate)) {
      return undefined
    }

    if (typeof candidate === "string") {
      const normalized = cleanMessage(candidate)
      return normalized || undefined
    }

    if (candidate instanceof Error) {
      if (candidate.message) {
        return cleanMessage(candidate.message)
      }
      return undefined
    }

    if (typeof candidate !== "object") {
      return undefined
    }

    visited.add(candidate)

    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        const nestedMessage = visit(entry, depth + 1)
        if (nestedMessage) {
          return nestedMessage
        }
      }
      return undefined
    }

    const record = candidate as Record<string, unknown>

    for (const key of NESTED_ERROR_KEYS) {
      if (!(key in record)) {
        continue
      }

      const nestedMessage = visit(record[key], depth + 1)
      if (nestedMessage) {
        return nestedMessage
      }
    }

    for (const nestedValue of Object.values(record)) {
      const nestedMessage = visit(nestedValue, depth + 1)
      if (nestedMessage) {
        return nestedMessage
      }
    }

    return undefined
  }

  return visit(value, 0)
}

export function shouldRetryImageModelFallback(message?: string | null) {
  const lowerMessage = message?.toLowerCase() || ""

  if (!lowerMessage) {
    return true
  }

  if (
    lowerMessage.includes("safety") ||
    lowerMessage.includes("policy") ||
    lowerMessage.includes("moderation") ||
    lowerMessage.includes("invalid") ||
    lowerMessage.includes("required") ||
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("forbidden") ||
    lowerMessage.includes("too small")
  ) {
    return false
  }

  return true
}