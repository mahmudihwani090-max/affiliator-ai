import { NextRequest, NextResponse } from "next/server"
import { checkImageJobStatus } from "@/app/actions/generate-image"
import { checkVideoJobStatus } from "@/app/actions/generate-video"
import { validateApiOrSessionRequest, unauthorizedResponse } from "@/lib/api-auth"
import { type CreditOperationType } from "@/lib/credit-packages"

const VIDEO_OPERATIONS = new Set([
    "textToVideo",
    "imageToVideo",
    "upscaleVideo",
    "upscaleVideo4K",
    "extendVideo",
    "referenceToVideo",
    "frameToFrame",
])

const IMAGE_OPERATIONS = new Set([
    "textToImage",
    "imageToImage",
    "upscaleImage",
])

// CORS headers for production
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Version",
    "X-API-Version": "1",
}

// Handle OPTIONS preflight request
export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders })
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ jobId: string }> }
) {
    try {
        // Validate Bearer token
        const authResult = await validateApiOrSessionRequest(request)
        if (!authResult.authenticated) {
            return unauthorizedResponse(authResult.error || "Unauthorized")
        }

        const { jobId } = await params

        // Get operation type from query params for status routing and credit context.
        const { searchParams } = new URL(request.url)
        const operation = searchParams.get("operation")

        if (!jobId) {
            return NextResponse.json(
                { success: false, error: "Job ID is required" },
                { status: 400 }
            )
        }

        const isVideoOperation = operation ? VIDEO_OPERATIONS.has(operation) : false
        const isImageOperation = operation ? IMAGE_OPERATIONS.has(operation) : false

        // Fallback for legacy callers that do not pass an operation.
        const isVideoJob = isVideoOperation || (!isImageOperation && jobId.includes("v-"))

        let result

        if (isVideoJob) {
            result = await checkVideoJobStatus(jobId, operation as CreditOperationType | undefined, authResult.userId)
        } else {
            result = await checkImageJobStatus(jobId, operation as CreditOperationType | undefined, authResult.userId)
        }

        return NextResponse.json(result, { headers: corsHeaders })
    } catch (error) {
        console.error("Job status API error:", error)
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        )
    }
}
