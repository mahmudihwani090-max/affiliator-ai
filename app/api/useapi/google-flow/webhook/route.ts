import { NextRequest, NextResponse } from "next/server"

import { handleGoogleFlowGenerationWebhook } from "@/lib/useapi/google-flow-generation-queue"

function isWebhookAuthorized(request: NextRequest) {
  const configuredSecret = process.env.USEAPI_WEBHOOK_SECRET

  if (!configuredSecret) {
    return true
  }

  return request.nextUrl.searchParams.get("secret") === configuredSecret
}

export async function POST(request: NextRequest) {
  if (!isWebhookAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized webhook" }, { status: 401 })
  }

  try {
    const payload = await request.json()
    const replyRef = request.nextUrl.searchParams.get("replyRef")

    const result = await handleGoogleFlowGenerationWebhook({
      payload,
      replyRef,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error("[UseAPI Webhook] Failed to process webhook:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to process webhook",
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  if (!isWebhookAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized webhook" }, { status: 401 })
  }

  return NextResponse.json({
    success: true,
    endpoint: "/api/useapi/google-flow/webhook",
    requiresSecret: Boolean(process.env.USEAPI_WEBHOOK_SECRET),
  })
}