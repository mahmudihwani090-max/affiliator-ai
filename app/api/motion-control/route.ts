import { NextRequest, NextResponse } from "next/server"
import { checkMotionControlStatus, submitMotionControl } from "@/app/actions/motion-control"

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Version",
  "X-API-Version": "1",
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get("taskId")
  const apiKey = searchParams.get("apiKey")

  if (!taskId || !apiKey) {
    return NextResponse.json(
      { success: false, error: "taskId dan apiKey wajib diisi" },
      { status: 400, headers }
    )
  }

  const result = await checkMotionControlStatus(taskId, apiKey)
  return NextResponse.json(result, { status: result.success ? 200 : 400, headers })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const result = await submitMotionControl(body)
    return NextResponse.json(result, { status: result.success ? 200 : 400, headers })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers }
    )
  }
}