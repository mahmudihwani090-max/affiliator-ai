"use server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import {
    isShopeeConfigured,
    searchShopeeProducts,
    mapShopeeToAffiliateProduct,
    type ShopeeSearchParams,
} from "@/lib/shopee-api"
import {
    isTikTokConfigured,
    searchTikTokAffiliateProducts,
    mapTikTokToAffiliateProduct,
    type TikTokSearchParams,
} from "@/lib/tiktok-shop-api"

// ============================================================
// Types
// ============================================================

export interface MarketplaceProduct {
    name: string
    description: string
    price: number
    originalPrice: number | null
    category: string
    platform: "shopee" | "tiktok"
    productUrl: string | null
    imageUrl: string | null
    sellingPoints: string
    targetAudience: string | null
    commission: string | null
    isFeatured: boolean
    soldCount: number
    rating: number
}

export type MarketplaceSource = "shopee" | "tiktok" | "both"

interface DiscoveryResult {
    success: boolean
    products?: MarketplaceProduct[]
    source?: MarketplaceSource
    error?: string
    shopeeConfigured?: boolean
    tiktokConfigured?: boolean
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
// API Status Check
// ============================================================

/**
 * Check which marketplace APIs are configured and available.
 */
export async function getMarketplaceApiStatus(): Promise<{
    shopee: boolean
    tiktok: boolean
    ai: boolean
}> {
    return {
        shopee: isShopeeConfigured(),
        tiktok: isTikTokConfigured(),
        ai: true, // Gemini AI is always available (uses existing keys)
    }
}

// ============================================================
// Marketplace Discovery
// ============================================================

/**
 * Discover trending products from Shopee API.
 */
export async function discoverShopeeProducts(params: {
    keyword?: string
    category?: string
    sortBy?: "relevance" | "sales" | "price_asc" | "price_desc" | "commission"
    limit?: number
}): Promise<DiscoveryResult> {
    try {
        const { isAdmin, error } = await checkAdminAccess()
        if (!isAdmin) return { success: false, error }

        if (!isShopeeConfigured()) {
            return {
                success: false,
                error: "Shopee API belum dikonfigurasi. Silakan isi SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY, SHOPEE_ACCESS_TOKEN, SHOPEE_SHOP_ID di file .env",
                shopeeConfigured: false,
            }
        }

        const searchParams: ShopeeSearchParams = {
            keyword: params.keyword || "produk terlaris",
            sort_by: params.sortBy || "sales",
            limit: Math.min(params.limit || 10, 20),
            page: 1,
        }

        console.log("[Marketplace Discovery] Searching Shopee products:", searchParams)

        const result = await searchShopeeProducts(searchParams)
        const products = result.products.map(mapShopeeToAffiliateProduct)

        console.log(`[Marketplace Discovery] Found ${products.length} Shopee products`)

        return {
            success: true,
            products,
            source: "shopee",
            shopeeConfigured: true,
        }
    } catch (error) {
        console.error("[Marketplace Discovery] Shopee error:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Gagal mengambil data dari Shopee",
            shopeeConfigured: isShopeeConfigured(),
        }
    }
}

/**
 * Discover trending products from TikTok Shop API.
 */
export async function discoverTikTokProducts(params: {
    keyword?: string
    category?: string
    sortBy?: "RELEVANCE" | "SALES" | "PRICE_ASC" | "PRICE_DESC" | "NEWEST" | "COMMISSION_DESC"
    limit?: number
}): Promise<DiscoveryResult> {
    try {
        const { isAdmin, error } = await checkAdminAccess()
        if (!isAdmin) return { success: false, error }

        if (!isTikTokConfigured()) {
            return {
                success: false,
                error: "TikTok Shop API belum dikonfigurasi. Silakan isi TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET, TIKTOK_SHOP_ACCESS_TOKEN di file .env",
                tiktokConfigured: false,
            }
        }

        const searchParams: TikTokSearchParams = {
            keyword: params.keyword || "trending",
            sort_type: params.sortBy || "SALES",
            page_size: Math.min(params.limit || 10, 20),
            page: 1,
        }

        console.log("[Marketplace Discovery] Searching TikTok Shop products:", searchParams)

        const result = await searchTikTokAffiliateProducts(searchParams)
        const products = result.products.map(mapTikTokToAffiliateProduct)

        console.log(`[Marketplace Discovery] Found ${products.length} TikTok products`)

        return {
            success: true,
            products,
            source: "tiktok",
            tiktokConfigured: true,
        }
    } catch (error) {
        console.error("[Marketplace Discovery] TikTok error:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Gagal mengambil data dari TikTok Shop",
            tiktokConfigured: isTikTokConfigured(),
        }
    }
}

/**
 * Discover trending products from both Shopee and TikTok Shop.
 * Merges results from both platforms, sorted by sold count.
 */
export async function discoverAllMarketplaceProducts(params: {
    keyword?: string
    limit?: number
}): Promise<DiscoveryResult> {
    try {
        const { isAdmin, error } = await checkAdminAccess()
        if (!isAdmin) return { success: false, error }

        const limitPerPlatform = Math.ceil((params.limit || 10) / 2)
        const allProducts: MarketplaceProduct[] = []
        const errors: string[] = []

        // Fetch from both platforms in parallel
        const [shopeeResult, tiktokResult] = await Promise.allSettled([
            isShopeeConfigured()
                ? discoverShopeeProducts({
                      keyword: params.keyword,
                      sortBy: "sales",
                      limit: limitPerPlatform,
                  })
                : Promise.resolve(null),
            isTikTokConfigured()
                ? discoverTikTokProducts({
                      keyword: params.keyword,
                      sortBy: "SALES",
                      limit: limitPerPlatform,
                  })
                : Promise.resolve(null),
        ])

        // Process Shopee results
        if (shopeeResult.status === "fulfilled" && shopeeResult.value?.success && shopeeResult.value.products) {
            allProducts.push(...shopeeResult.value.products)
        } else if (shopeeResult.status === "rejected") {
            errors.push(`Shopee: ${shopeeResult.reason}`)
        } else if (shopeeResult.status === "fulfilled" && shopeeResult.value && !shopeeResult.value.success) {
            errors.push(`Shopee: ${shopeeResult.value.error}`)
        }

        // Process TikTok results
        if (tiktokResult.status === "fulfilled" && tiktokResult.value?.success && tiktokResult.value.products) {
            allProducts.push(...tiktokResult.value.products)
        } else if (tiktokResult.status === "rejected") {
            errors.push(`TikTok: ${tiktokResult.reason}`)
        } else if (tiktokResult.status === "fulfilled" && tiktokResult.value && !tiktokResult.value.success) {
            errors.push(`TikTok: ${tiktokResult.value.error}`)
        }

        if (allProducts.length === 0) {
            return {
                success: false,
                error: errors.length > 0
                    ? `Tidak ada produk ditemukan. ${errors.join("; ")}`
                    : "Tidak ada marketplace API yang dikonfigurasi. Silakan isi API keys di .env",
                shopeeConfigured: isShopeeConfigured(),
                tiktokConfigured: isTikTokConfigured(),
            }
        }

        // Sort by sold count (descending)
        allProducts.sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0))

        // Limit total results
        const limited = allProducts.slice(0, params.limit || 10)

        return {
            success: true,
            products: limited,
            source: "both",
            shopeeConfigured: isShopeeConfigured(),
            tiktokConfigured: isTikTokConfigured(),
        }
    } catch (error) {
        console.error("[Marketplace Discovery] Combined error:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Gagal mengambil data marketplace",
            shopeeConfigured: isShopeeConfigured(),
            tiktokConfigured: isTikTokConfigured(),
        }
    }
}

// ============================================================
// Save Products to Database
// ============================================================

/**
 * Save marketplace-discovered products to the database.
 * Deduplicates by checking existing product names (case-insensitive).
 */
export async function saveMarketplaceProducts(
    products: MarketplaceProduct[]
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
            // Skip products with invalid price
            if (!product.price || product.price <= 0) {
                skippedCount++
                continue
            }

            // Check for duplicate by name (case insensitive)
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
                    source: `marketplace-${product.platform}`,
                    createdById: userId,
                },
            })
            savedCount++
        }

        revalidatePath("/dashboard/affiliator-machine")
        revalidatePath("/admin/affiliate-products")

        return { success: true, savedCount, skippedCount }
    } catch (error) {
        console.error("[Marketplace Discovery] Save error:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Gagal menyimpan produk",
        }
    }
}
