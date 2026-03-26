import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { getGenerationQueueSummaryByUserId } from "@/lib/useapi/google-flow-generation-queue"

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const summary = await getGenerationQueueSummaryByUserId(session.user.id)

    return NextResponse.json(
      {
        success: true,
        summary,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    )
  } catch (error) {
    console.error("[Generation Queue Summary] Failed to load queue summary:", error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load generation queue summary",
      },
      { status: 500 }
    )
  }
}