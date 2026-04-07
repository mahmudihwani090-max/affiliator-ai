import { NextResponse } from "next/server"
import { getAppVersion } from "@/lib/app-version"

export async function GET() {
  return NextResponse.json({
    success: true,
    version: getAppVersion(),
  })
}