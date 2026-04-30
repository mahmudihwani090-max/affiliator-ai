"use server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import {
    parseKalodataCSV,
    aiKalodataResearch,
    mapKalodataToAffiliateProduct,
    type KalodataProduct,
} from "@/lib/kalodata"

// ============================================================
// Types
// ============================================================

export interface KalodataDiscoveryProduct {
    name: string
    description: string
    price: number
    originalPrice: number | null
    category: string
    platform: "tiktok"
    productUrl: string | null
    imageUrl: string | null
    sellingPoints: string
    targetAudience: string | null
    commission: string | null
    isFeatured: boolean
    soldCount: number
    rating: number
    // Extra Kalodata-specific fields for display
    revenue: number
    videoCount: number
    creatorCount: number
    growthRate: number
    shopName: string | null
}

// ============================================================
// Auth Check
// ============================================================

async function checkAdminAccess() {
    const session = await auth()
    if (!session?.user?.id) {
        return { isAdmin: false as const, error: "Unauthorized" }
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
    })

    if (user?.role !== "admin") {
        return { isAdmin: false as const, error: "Admin access required" }
    }

    return { isAdmin: true as const, userId: session.user.id }
}

// ============================================================
// CSV Import
// ============================================================

/**
 * Import products from a Kalodata CSV export.
 * Accepts the CSV content as a string.
 */
export async function importKalodataCSV(csvContent: string): Promise<{
    success: boolean
    products?: KalodataDiscoveryProduct[]
    rowCount?: number
    errors?: string[]
    error?: string
}> {
    try {
        const { isAdmin, error } = await checkAdminAccess()
        if (!isAdmin) return { success: false, error }

        console.log("[Kalodata Import] Parsing CSV...")

        const parsed = parseKalodataCSV(csvContent)

        if (!parsed.success || !parsed.products) {
            return {
                success: false,
                errors: parsed.errors,
                error: parsed.errors?.[0] || "Gagal memparse CSV",
            }
        }

        console.log(`[Kalodata Import] Parsed ${parsed.products.length} products`)

        // Convert to our format
        const products: KalodataDiscoveryProduct[] = parsed.products.map(kp => {
            const mapped = mapKalodataToAffiliateProduct(kp)
            return {
                ...mapped,
                revenue: kp.revenue,
                videoCount: kp.videoCount,
                creatorCount: kp.creatorCount,
                growthRate: kp.growthRate,
                shopName: kp.shopName,
            }
        })

        return {
            success: true,
            products,
            rowCount: products.length,
            errors: parsed.errors,
        }
    } catch (error) {
        console.error("[Kalodata Import] Error:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Gagal mengimport CSV",
        }
    }
}

// ============================================================
// AI Research (Kalodata-style)
// ============================================================

/**
 * AI-powered trending product research, styled like Kalodata analytics.
 * Uses Gemini + Google Search to find real trending products.
 */
export async function discoverKalodataProducts(params: {
    category?: string
    keyword?: string
    count?: number
    sortBy?: "sales" | "revenue" | "growth" | "commission"
    timeRange?: "24h" | "7d" | "30d"
}): Promise<{
    success: boolean
    products?: KalodataDiscoveryProduct[]
    insight?: string
    error?: string
}> {
    try {
        const { isAdmin, error } = await checkAdminAccess()
        if (!isAdmin) return { success: false, error }

        console.log("[Kalodata Discovery] Starting AI research:", params)

        const result = await aiKalodataResearch({
            category: params.category,
            keyword: params.keyword,
            count: params.count || 10,
            sortBy: params.sortBy || "sales",
            timeRange: params.timeRange || "7d",
        })

        if (!result.success || !result.products) {
            return {
                success: false,
                error: result.error || "Gagal melakukan riset",
            }
        }

        console.log(`[Kalodata Discovery] Found ${result.products.length} products`)

        // Convert to our format
        const products: KalodataDiscoveryProduct[] = result.products.map(kp => {
            const mapped = mapKalodataToAffiliateProduct(kp)
            return {
                ...mapped,
                revenue: kp.revenue,
                videoCount: kp.videoCount,
                creatorCount: kp.creatorCount,
                growthRate: kp.growthRate,
                shopName: kp.shopName,
            }
        })

        return {
            success: true,
            products,
            insight: result.insight,
        }
    } catch (error) {
        console.error("[Kalodata Discovery] Error:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Gagal melakukan riset Kalodata",
        }
    }
}

// ============================================================
// Save Products to Database
// ============================================================

/**
 * Save Kalodata-discovered products to the database.
 * Deduplicates by checking existing product names.
 */
export async function saveKalodataProducts(
    products: KalodataDiscoveryProduct[]
): Promise<{
    success: boolean
    savedCount?: number
    skippedCount?: number
    error?: string
}> {
    try {
        const { isAdmin, userId, error } = await checkAdminAccess()
        if (!isAdmin) return { success: false, error }

        let savedCount = 0
        let skippedCount = 0

        for (const product of products) {
            // Skip invalid price
            if (!product.price || product.price <= 0) {
                skippedCount++
                continue
            }

            // Check for duplicate
            const existing = await prisma.affiliateProduct.findFirst({
                where: {
                    name: { equals: product.name, mode: "insensitive" },
                },
            })

            if (existing) {
                skippedCount++
                continue
            }

            await prisma.affiliateProduct.create({
                data: {
                    name: product.name,
                    description: product.description,
                    price: product.price,
                    originalPrice: product.originalPrice,
                    category: product.category,
                    platform: product.platform,
                    productUrl: product.productUrl,
                    imageUrl: product.imageUrl,
                    sellingPoints: product.sellingPoints,
                    targetAudience: product.targetAudience || null,
                    commission: product.commission || null,
                    isFeatured: product.isFeatured,
                    isActive: true,
                    source: "kalodata",
                    createdById: userId,
                },
            })
            savedCount++
        }

        revalidatePath("/dashboard/affiliator-machine")
        revalidatePath("/admin/affiliate-products")

        return { success: true, savedCount, skippedCount }
    } catch (error) {
        console.error("[Kalodata Save] Error:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Gagal menyimpan produk",
        }
    }
}
