/**
 * Shopee Open Platform - Affiliate Marketing Solution (AMS) API Client
 * 
 * Documentation: https://open.shopee.com/documents/v2
 * 
 * Endpoints used:
 * - /api/v2/ams/search_item — Search affiliate products
 * - /api/v2/ams/get_item_detail — Get product details
 * - /api/v2/ams/get_category_list — Get product categories
 * 
 * Authentication: HMAC-SHA256 signature
 * Base string: partner_id + api_path + timestamp + access_token + shop_id
 */

import crypto from "crypto"

// ============================================================
// Configuration
// ============================================================

const SHOPEE_PARTNER_ID = process.env.SHOPEE_PARTNER_ID || ""
const SHOPEE_PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY || ""
const SHOPEE_ACCESS_TOKEN = process.env.SHOPEE_ACCESS_TOKEN || ""
const SHOPEE_SHOP_ID = process.env.SHOPEE_SHOP_ID || ""

// Shopee API hosts per region
const SHOPEE_HOSTS: Record<string, string> = {
    id: "https://partner.shopeemobile.com",    // Indonesia
    my: "https://partner.shopeemobile.com",    // Malaysia
    sg: "https://partner.shopeemobile.com",    // Singapore
    th: "https://partner.shopeemobile.com",    // Thailand
    vn: "https://partner.shopeemobile.com",    // Vietnam
    ph: "https://partner.shopeemobile.com",    // Philippines
}

const SHOPEE_REGION = process.env.SHOPEE_REGION || "id"
const BASE_URL = SHOPEE_HOSTS[SHOPEE_REGION] || SHOPEE_HOSTS.id

// ============================================================
// Types
// ============================================================

export interface ShopeeProduct {
    item_id: number
    shop_id: number
    item_name: string
    item_description: string
    item_price: number          // price in local currency (cents)
    item_original_price: number // original price (cents)
    currency: string
    item_sold: number           // total units sold
    item_rating: number         // average rating (0-5)
    item_image: string          // main image URL
    item_images: string[]       // all image URLs
    item_url: string            // product URL
    category_id: number
    category_name: string
    commission_rate: number     // affiliate commission rate (percentage)
    commission_amount: number   // estimated commission per sale
    shop_name: string
    shop_rating: number
}

export interface ShopeeCategory {
    category_id: number
    category_name: string
    parent_category_id: number | null
    has_children: boolean
}

export interface ShopeeSearchParams {
    keyword?: string
    category_id?: number
    sort_by?: "relevance" | "sales" | "price_asc" | "price_desc" | "commission"
    price_min?: number
    price_max?: number
    page?: number
    limit?: number
}

interface ShopeeApiResponse<T> {
    error: string
    message: string
    request_id: string
    response: T
}

// ============================================================
// Authentication
// ============================================================

/**
 * Generate HMAC-SHA256 signature for Shopee API authentication.
 * Base string: partner_id + api_path + timestamp + access_token + shop_id
 */
function generateSignature(apiPath: string, timestamp: number): string {
    const baseString = `${SHOPEE_PARTNER_ID}${apiPath}${timestamp}${SHOPEE_ACCESS_TOKEN}${SHOPEE_SHOP_ID}`

    return crypto
        .createHmac("sha256", SHOPEE_PARTNER_KEY)
        .update(baseString)
        .digest("hex")
}

/**
 * Generate common query parameters for Shopee API requests.
 */
function getCommonParams(apiPath: string) {
    const timestamp = Math.floor(Date.now() / 1000)
    const sign = generateSignature(apiPath, timestamp)

    return {
        partner_id: SHOPEE_PARTNER_ID,
        timestamp: timestamp.toString(),
        access_token: SHOPEE_ACCESS_TOKEN,
        shop_id: SHOPEE_SHOP_ID,
        sign,
    }
}

// ============================================================
// API Client
// ============================================================

/**
 * Make an authenticated request to the Shopee API.
 */
async function shopeeRequest<T>(
    apiPath: string,
    params: Record<string, string> = {}
): Promise<T> {
    const commonParams = getCommonParams(apiPath)
    const allParams = { ...commonParams, ...params }

    const queryString = new URLSearchParams(allParams).toString()
    const url = `${BASE_URL}${apiPath}?${queryString}`

    console.log(`[Shopee API] Requesting: ${apiPath}`)

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
        },
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Shopee API error (${response.status}): ${errorText}`)
    }

    const data = (await response.json()) as ShopeeApiResponse<T>

    if (data.error && data.error !== "") {
        throw new Error(`Shopee API error: ${data.error} - ${data.message}`)
    }

    return data.response
}

// ============================================================
// Public API Methods
// ============================================================

/**
 * Check if Shopee API credentials are configured.
 */
export function isShopeeConfigured(): boolean {
    return !!(
        SHOPEE_PARTNER_ID &&
        SHOPEE_PARTNER_KEY &&
        SHOPEE_ACCESS_TOKEN &&
        SHOPEE_SHOP_ID
    )
}

/**
 * Search affiliate products on Shopee.
 * Uses the AMS (Affiliate Marketing Solution) search endpoint.
 */
export async function searchShopeeProducts(
    params: ShopeeSearchParams
): Promise<{
    products: ShopeeProduct[]
    total: number
}> {
    if (!isShopeeConfigured()) {
        throw new Error("Shopee API credentials not configured. Please set SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY, SHOPEE_ACCESS_TOKEN, SHOPEE_SHOP_ID in .env")
    }

    const apiPath = "/api/v2/ams/search_item"
    const queryParams: Record<string, string> = {}

    if (params.keyword) queryParams.keyword = params.keyword
    if (params.category_id) queryParams.category_id = params.category_id.toString()
    if (params.sort_by) queryParams.sort_by = params.sort_by
    if (params.price_min) queryParams.price_min = params.price_min.toString()
    if (params.price_max) queryParams.price_max = params.price_max.toString()
    if (params.page) queryParams.offset = ((params.page - 1) * (params.limit || 20)).toString()
    if (params.limit) queryParams.limit = params.limit.toString()

    const response = await shopeeRequest<{
        items: ShopeeProduct[]
        total_count: number
    }>(apiPath, queryParams)

    return {
        products: response.items || [],
        total: response.total_count || 0,
    }
}

/**
 * Get product details by item_id.
 */
export async function getShopeeProductDetail(
    itemId: number
): Promise<ShopeeProduct | null> {
    if (!isShopeeConfigured()) {
        throw new Error("Shopee API credentials not configured")
    }

    const apiPath = "/api/v2/ams/get_item_detail"
    
    try {
        const response = await shopeeRequest<ShopeeProduct>(apiPath, {
            item_id: itemId.toString(),
        })
        return response
    } catch (error) {
        console.error(`[Shopee API] Failed to get product detail for ${itemId}:`, error)
        return null
    }
}

/**
 * Get Shopee product categories.
 */
export async function getShopeeCategories(): Promise<ShopeeCategory[]> {
    if (!isShopeeConfigured()) {
        throw new Error("Shopee API credentials not configured")
    }

    const apiPath = "/api/v2/ams/get_category_list"

    try {
        const response = await shopeeRequest<{ category_list: ShopeeCategory[] }>(apiPath)
        return response.category_list || []
    } catch (error) {
        console.error("[Shopee API] Failed to get categories:", error)
        return []
    }
}

/**
 * Search for trending/best-selling products on Shopee.
 * This is a convenience method that searches sorted by sales.
 */
export async function searchShopeeTrendingProducts(params: {
    keyword?: string
    category_id?: number
    limit?: number
}): Promise<ShopeeProduct[]> {
    const result = await searchShopeeProducts({
        keyword: params.keyword || "produk terlaris",
        category_id: params.category_id,
        sort_by: "sales",
        limit: params.limit || 10,
        page: 1,
    })
    return result.products
}

/**
 * Convert a Shopee product to the internal AffiliateProduct format.
 */
export function mapShopeeToAffiliateProduct(product: ShopeeProduct) {
    // Shopee prices are typically in cents, convert to full currency
    const price = Math.round(product.item_price / 100000)
    const originalPrice = product.item_original_price 
        ? Math.round(product.item_original_price / 100000) 
        : null

    return {
        name: product.item_name,
        description: `${product.item_name} - Rating: ${product.item_rating?.toFixed(1) || "N/A"}/5 | Terjual: ${product.item_sold?.toLocaleString("id-ID") || "0"} | Shop: ${product.shop_name || "N/A"}`,
        price: price > 0 ? price : Math.round(product.item_price),
        originalPrice: originalPrice && originalPrice > price ? originalPrice : null,
        category: mapShopeeCategoryName(product.category_name),
        platform: "shopee" as const,
        productUrl: product.item_url || `https://shopee.co.id/product/${product.shop_id}/${product.item_id}`,
        imageUrl: product.item_image
            ? (product.item_image.startsWith("http")
                ? product.item_image
                : `https://cf.shopee.co.id/file/${product.item_image}`)
            : null,
        sellingPoints: generateSellingPoints(product),
        targetAudience: null as string | null,
        commission: product.commission_rate
            ? `${product.commission_rate}%`
            : null,
        isFeatured: product.item_sold > 1000,
        soldCount: product.item_sold,
        rating: product.item_rating,
    }
}

// ============================================================
// Helpers
// ============================================================

/**
 * Map Shopee category names to internal category names.
 */
function mapShopeeCategoryName(categoryName: string | undefined): string {
    if (!categoryName) return "Home & Living"

    const lower = categoryName.toLowerCase()

    if (lower.includes("kecantikan") || lower.includes("beauty") || lower.includes("skincare") || lower.includes("perawatan")) {
        return "Beauty & Skincare"
    }
    if (lower.includes("fashion") || lower.includes("pakaian") || lower.includes("baju")) {
        return "Fashion"
    }
    if (lower.includes("makanan") || lower.includes("food") || lower.includes("minuman")) {
        return "Food & Beverage"
    }
    if (lower.includes("kesehatan") || lower.includes("health") || lower.includes("suplemen")) {
        return "Health & Supplements"
    }
    if (lower.includes("rumah") || lower.includes("home") || lower.includes("living")) {
        return "Home & Living"
    }
    if (lower.includes("elektronik") || lower.includes("gadget") || lower.includes("hp") || lower.includes("electronic")) {
        return "Electronics"
    }
    if (lower.includes("bayi") || lower.includes("baby") || lower.includes("ibu")) {
        return "Mom & Baby"
    }
    if (lower.includes("olahraga") || lower.includes("sport") || lower.includes("outdoor")) {
        return "Sports & Outdoor"
    }

    return "Home & Living"
}

/**
 * Generate selling points from Shopee product data.
 */
function generateSellingPoints(product: ShopeeProduct): string {
    const points: string[] = []

    if (product.item_sold > 0) {
        points.push(`• Terjual ${product.item_sold.toLocaleString("id-ID")}+ unit`)
    }
    if (product.item_rating > 0) {
        points.push(`• Rating ${product.item_rating.toFixed(1)}/5 bintang`)
    }
    if (product.commission_rate > 0) {
        points.push(`• Komisi affiliate ${product.commission_rate}%`)
    }
    if (product.shop_rating > 0) {
        points.push(`• Dari toko rating ${product.shop_rating.toFixed(1)}/5`)
    }
    if (product.item_original_price > product.item_price) {
        const discount = Math.round(
            ((product.item_original_price - product.item_price) / product.item_original_price) * 100
        )
        points.push(`• Diskon ${discount}% dari harga asli`)
    }
    if (product.shop_name) {
        points.push(`• Official shop: ${product.shop_name}`)
    }

    if (points.length < 3) {
        points.push("• Tersedia di Shopee Indonesia")
        points.push("• Gratis ongkir untuk pesanan pertama")
    }

    return points.join("\n")
}
