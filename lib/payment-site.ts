import { NextRequest } from "next/server"

const ORDER_ID_PREFIX = "AFP"
const DEFAULT_WEBSITE_CODE = "main"

export interface PaymentSiteContext {
  websiteCode: string
  originSite: string
  host: string
}

function sanitizeWebsiteCode(value?: string | null) {
  const normalized = (value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/\.+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

  return (normalized || DEFAULT_WEBSITE_CODE).slice(0, 12)
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

function extractHostFromOrigin(origin?: string | null) {
  if (!origin) {
    return ""
  }

  try {
    return new URL(origin).host
  } catch {
    return ""
  }
}

function buildOriginFromHeaders(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https"
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || ""

  if (!forwardedHost) {
    return request.nextUrl.origin
  }

  return `${forwardedProto}://${forwardedHost}`
}

export function resolvePaymentSiteContext(
  request: NextRequest,
  input?: {
    websiteCode?: string | null
    originSite?: string | null
  }
): PaymentSiteContext {
  const envOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || null)
  const requestOrigin = normalizeOrigin(input?.originSite) || normalizeOrigin(request.headers.get("origin")) || buildOriginFromHeaders(request) || envOrigin
  const host = extractHostFromOrigin(requestOrigin) || request.headers.get("host") || request.nextUrl.host
  const configuredWebsiteCode = process.env.NEXT_PUBLIC_WEBSITE_CODE || process.env.WEBSITE_CODE || null

  return {
    websiteCode: sanitizeWebsiteCode(input?.websiteCode || configuredWebsiteCode || host),
    originSite: normalizeOrigin(requestOrigin) || envOrigin || request.nextUrl.origin,
    host,
  }
}

export function buildPaymentOrderId(params: { websiteCode: string; userId: string; now?: number }) {
  const timeKey = (params.now || Date.now()).toString(36).toUpperCase()
  const userKey = params.userId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase() || "USER"
  const randomKey = Math.random().toString(36).slice(2, 6).toUpperCase()
  const siteKey = sanitizeWebsiteCode(params.websiteCode).toUpperCase()

  return `${ORDER_ID_PREFIX}-${siteKey}-${timeKey}-${userKey}-${randomKey}`
}

export function parsePaymentOrderId(orderId: string) {
  const match = orderId.match(/^([A-Z]+)-([A-Z0-9-]+)-([A-Z0-9]+)-([A-Z0-9]+)-([A-Z0-9]+)$/)

  if (!match || match[1] !== ORDER_ID_PREFIX) {
    return null
  }

  return {
    prefix: match[1],
    websiteCode: match[2].toLowerCase(),
    timeKey: match[3],
    userKey: match[4],
    randomKey: match[5],
  }
}

export function buildMidtransCallbacks(originSite: string, orderId: string) {
  const safeOrigin = normalizeOrigin(originSite)
  if (!safeOrigin) {
    return undefined
  }

  return {
    finish: `${safeOrigin}/dashboard/credits?payment=finish&orderId=${encodeURIComponent(orderId)}`,
    pending: `${safeOrigin}/dashboard/credits?payment=pending&orderId=${encodeURIComponent(orderId)}`,
    error: `${safeOrigin}/dashboard/credits?payment=error&orderId=${encodeURIComponent(orderId)}`,
  }
}