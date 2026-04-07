import { NextRequest, NextResponse } from "next/server"
import { extendVideo } from "@/app/actions/generate-video"
import { validateApiOrSessionRequest, unauthorizedResponse } from "@/lib/api-auth"

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Version",
  "X-API-Version": "1",
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers })
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await validateApiOrSessionRequest(request)
    if (!authResult.authenticated) {
      return unauthorizedResponse(authResult.error || "Unauthorized")
    }

    const body = await request.json()
    const { mediaGenerationId, prompt } = body

    if (!mediaGenerationId || !prompt) {
      return NextResponse.json(
        { success: false, error: "mediaGenerationId dan prompt wajib diisi" },
        { status: 400, headers }
      )
    }

    const result = await extendVideo({
      mediaGenerationId,
      prompt,
      userId: authResult.userId,
    })

    if (!result.success) {
      console.error("Video extend API rejected request", {
        userId: authResult.userId,
        mediaGenerationId,
        promptPreview: typeof prompt === "string" ? prompt.slice(0, 160) : null,
        error: result.error,
      })
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400, headers }
      )
    }

    return NextResponse.json(result, { headers })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers }
    )
  }
}