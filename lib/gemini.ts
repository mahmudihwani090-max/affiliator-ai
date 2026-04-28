import { GoogleGenAI } from "@google/genai"

const keys = (process.env.GEMINI_API_KEYS || process.env.API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)

if (keys.length === 0) {
    console.warn("[Gemini] No GEMINI_API_KEYS found in environment")
}

let currentKeyIndex = 0

// Models to try in order (each has separate quota)
const FALLBACK_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
]

/**
 * Get a Gemini client instance, rotating through available API keys.
 */
export function getGeminiClient(): GoogleGenAI {
    if (keys.length === 0) {
        throw new Error("No Gemini API keys configured")
    }
    const key = keys[currentKeyIndex % keys.length]
    currentKeyIndex++
    return new GoogleGenAI({ apiKey: key })
}

function is429Error(error: unknown): boolean {
    if (!error || typeof error !== "object") return false
    if ("status" in error && (error as { status: number }).status === 429) return true
    const msg = error instanceof Error ? error.message : String(error)
    return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")
}

/**
 * Execute a Gemini API call with automatic retry across keys AND models.
 * Strategy: try all keys for model 1, then all keys for model 2, etc.
 */
async function withRetry<T>(
    fn: (client: GoogleGenAI, model: string) => Promise<T>,
    preferredModel?: string
): Promise<T> {
    const models = preferredModel
        ? [preferredModel, ...FALLBACK_MODELS.filter(m => m !== preferredModel)]
        : FALLBACK_MODELS

    let lastError: Error | null = null

    for (const model of models) {
        // Try each key for this model
        for (let keyAttempt = 0; keyAttempt < keys.length; keyAttempt++) {
            const client = getGeminiClient()
            try {
                return await fn(client, model)
            } catch (error: unknown) {
                lastError = error instanceof Error ? error : new Error(String(error))

                if (is429Error(error)) {
                    console.warn(
                        `[Gemini] Rate limited on model="${model}", key ${keyAttempt + 1}/${keys.length}. Trying next...`
                    )
                    // Small delay before trying next key
                    await new Promise((r) => setTimeout(r, 500))
                    continue
                }

                // Non-429 error, throw immediately
                throw lastError
            }
        }

        // All keys exhausted for this model, try next model
        console.warn(`[Gemini] All keys exhausted for model="${model}". Trying next model...`)
        await new Promise((r) => setTimeout(r, 1000))
    }

    throw lastError || new Error("All Gemini API keys and models exhausted")
}

/**
 * Generate text content using Gemini with automatic key + model fallback.
 */
export async function generateText(
    prompt: string,
    options?: {
        model?: string
        temperature?: number
        maxOutputTokens?: number
    }
): Promise<string> {
    return withRetry(async (client, model) => {
        console.log(`[Gemini] Trying model="${model}"...`)
        const response = await client.models.generateContent({
            model,
            contents: prompt,
            config: {
                temperature: options?.temperature ?? 0.8,
                maxOutputTokens: options?.maxOutputTokens ?? 8192,
            },
        })

        const text = response.text
        if (!text) {
            throw new Error("Empty response from Gemini")
        }
        return text
    }, options?.model)
}

/**
 * Generate structured JSON output using Gemini with automatic key + model fallback.
 */
export async function generateJSON<T>(
    prompt: string,
    options?: {
        model?: string
        temperature?: number
        useSearch?: boolean
    }
): Promise<T> {
    return withRetry(async (client, model) => {
        console.log(`[Gemini] Trying model="${model}" (JSON mode, search=${options?.useSearch ?? false})...`)
        const response = await client.models.generateContent({
            model,
            contents: prompt,
            config: {
                temperature: options?.temperature ?? 0.7,
                maxOutputTokens: 8192,
                tools: options?.useSearch ? [{ googleSearch: {} }] : undefined,
            },
        })

        const text = response.text
        if (!text) {
            throw new Error("Empty response from Gemini")
        }

        // Try to parse JSON from the response (with search, response might not be pure JSON)
        try {
            return JSON.parse(text) as T
        } catch {
            // Try to extract JSON array or object from the text
            const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
            if (jsonMatch) {
                return JSON.parse(jsonMatch[1]) as T
            }
            // Try to find raw JSON array/object in text
            const rawJson = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/)
            if (rawJson) {
                return JSON.parse(rawJson[1]) as T
            }
            throw new Error("Failed to parse Gemini response as JSON")
        }
    }, options?.model)
}

