/**
 * TikTok Shop Open API Client
 * 
 * Documentation: https://partner.tiktokshop.com/docv2
 * 
 * Endpoints used:
 * - /api/products/search — Search products
 * - /api/products/details — Get product details
 * - /api/affiliate/creator/marketplace/product/search — Affiliate product search
 * 
 * Authentication: HMAC-SHA256 signature
 * Signature: app_secret + path + sorted_params + body + app_secret
 */

import crypto from "crypto"

// ============================================================
// Configuration
// ============================================================

const TIKTOK_APP_KEY = process.env.TIKTOK_SHOP_APP_KEY || ""
const TIKTOK_APP_SECRET = process.env.TIKTOK_SHOP_APP_SECRET || ""
const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_SHOP_ACCESS_TOKEN || ""

// TikTok Shop API hosts per region
const TIKTOK_HOSTS: Record<string, string> = {
    id: "https://open-api.tiktokglobalshop.com",  // Indonesia
    my: "https://open-api.tiktokglobalshop.com",  // Malaysia
    sg: "https://open-api.tiktokglobalshop.com",  // Singapore
    th: "https://open-api.tiktokglobalshop.com",  // Thailand
    vn: "https://open-api.tiktokglobalshop.com",  // Vietnam
    ph: "https://open-api.tiktokglobalshop.com",  // Philippines
    us: "https://open-api.tiktokglobalshop.com",  // US
}

const TIKTOK_REGION = process.env.TIKTOK_SHOP_REGION || "id"
const BASE_URL = TIKTOK_HOSTS[TIKTOK_REGION] || TIKTOK_HOSTS.id

// ============================================================
// Types
// ============================================================

export interface TikTokProduct {
    id: string
    title: string
    description: string
    price: {
        currency: string
        original_price: string    // price in minor units (cents)
        sale_price: string        // current sale price
    }
    images: Array<{
        url: string
        width: number
        height: number
    }>
    video?: {
        url: string
    }
    category: {
        id: string
        name: string
    }
    sold_count: number
    rating: number
    review_count: number
    stock: number
    shop: {
        id: string
        name: string
        rating: number
    }
    commission_rate?: number     // affiliate commission percentage
    product_url?: string
    status: string
}

export interface TikTokSearchParams {
    keyword?: string
    category_id?: string
    sort_type?: "RELEVANCE" | "SALES" | "PRICE_ASC" | "PRICE_DESC" | "NEWEST" | "COMMISSION_DESC"
    price_min?: number
    price_max?: number
    page?: number
    page_size?: number
}

interface TikTokApiResponse<T> {
    code: number
    message: string
    request_id: string
    data: T
}

// ============================================================
// Authentication
// ============================================================

/**
 * Generate HMAC-SHA256 signature for TikTok Shop API authentication.
 * 
 * Steps:
 * 1. Extract all query params except 'sign' and 'access_token'
 * 2. Sort params alphabetically by key
 * 3. Concatenate: path + sorted {key}{value} pairs
 * 4. If body exists, append JSON-serialized body
 * 5. Wrap: app_secret + string + app_secret
 * 6. HMAC-SHA256 with app_secret as key
 */
function generateSignature(
    apiPath: string,
    params: Record<string, string>,
    body?: Record<string, unknown>
): string {
    // 1. Filter out sign and access_token
    const filteredParams: Record<string, string> = {}
    for (const [key, value] of Object.entries(params)) {
        if (key !== "sign" && key !== "access_token") {
            filteredParams[key] = value
        }
    }

    // 2. Sort by key
    const sortedKeys = Object.keys(filteredParams).sort()

    // 3. Concatenate: path + sorted key-value pairs
    let signString = apiPath
    for (const key of sortedKeys) {
        signString += `${key}${filteredParams[key]}`
    }

    // 4. Append body if present
    if (body) {
        signString += JSON.stringify(body)
    }

    // 5. Wrap with app_secret
    const wrappedString = `${TIKTOK_APP_SECRET}${signString}${TIKTOK_APP_SECRET}`

    // 6. HMAC-SHA256
    return crypto
        .createHmac("sha256", TIKTOK_APP_SECRET)
        .update(wrappedString)
        .digest("hex")
}

/**
 * Get common query parameters for TikTok Shop API requests.
 */
function getCommonParams(): Record<string, string> {
    return {
        app_key: TIKTOK_APP_KEY,
        timestamp: Math.floor(Date.now() / 1000).toString(),
    }
}

// ============================================================
// API Client
// ============================================================

/**
 * Make an authenticated GET request to the TikTok Shop API.
 */
async function tiktokGetRequest<T>(
    apiPath: string,
    params: Record<string, string> = {}
): Promise<T> {
    const commonParams = getCommonParams()
    const allParams = { ...commonParams, ...params }

    // Generate signature
    const sign = generateSignature(apiPath, allParams)
    allParams.sign = sign

    // Add access_token after signature generation
    if (TIKTOK_ACCESS_TOKEN) {
        allParams.access_token = TIKTOK_ACCESS_TOKEN
    }

    const queryString = new URLSearchParams(allParams).toString()
    const url = `${BASE_URL}${apiPath}?${queryString}`

    console.log(`[TikTok Shop API] GET: ${apiPath}`)

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "x-tts-access-token": TIKTOK_ACCESS_TOKEN,
        },
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`TikTok Shop API error (${response.status}): ${errorText}`)
    }

    const data = (await response.json()) as TikTokApiResponse<T>

    if (data.code !== 0) {
        throw new Error(`TikTok Shop API error (${data.code}): ${data.message}`)
    }

    return data.data
}

/**
 * Make an authenticated POST request to the TikTok Shop API.
 */
async function tiktokPostRequest<T>(
    apiPath: string,
    params: Record<string, string> = {},
    body?: Record<string, unknown>
): Promise<T> {
    const commonParams = getCommonParams()
    const allParams = { ...commonParams, ...params }

    // Generate signature (includes body in calculation)
    const sign = generateSignature(apiPath, allParams, body)
    allParams.sign = sign

    // Add access_token after signature generation
    if (TIKTOK_ACCESS_TOKEN) {
        allParams.access_token = TIKTOK_ACCESS_TOKEN
    }

    const queryString = new URLSearchParams(allParams).toString()
    const url = `${BASE_URL}${apiPath}?${queryString}`

    console.log(`[TikTok Shop API] POST: ${apiPath}`)

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-tts-access-token": TIKTOK_ACCESS_TOKEN,
        },
        body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`TikTok Shop API error (${response.status}): ${errorText}`)
    }

    const data = (await response.json()) as TikTokApiResponse<T>

    if (data.code !== 0) {
        throw new Error(`TikTok Shop API error (${data.code}): ${data.message}`)
    }

    return data.data
}

// ============================================================
// Public API Methods
// ============================================================

/**
 * Check if TikTok Shop API credentials are configured.
 */
export function isTikTokConfigured(): boolean {
    return !!(TIKTOK_APP_KEY && TIKTOK_APP_SECRET && TIKTOK_ACCESS_TOKEN)
}

/**
 * Search products on TikTok Shop.
 * Uses the product search endpoint to find products.
 */
export async function searchTikTokProducts(
    params: TikTokSearchParams
): Promise<{
    products: TikTokProduct[]
    total: number
}> {
    if (!isTikTokConfigured()) {
        throw new Error("TikTok Shop API credentials not configured. Please set TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET, TIKTOK_SHOP_ACCESS_TOKEN in .env")
    }

    const apiPath = "/api/products/search"
    const body: Record<string, unknown> = {
        page_size: params.page_size || 20,
    }

    if (params.keyword) body.keyword = params.keyword
    if (params.category_id) body.category_id = params.category_id
    if (params.sort_type) body.sort_type = params.sort_type
    if (params.page) body.page_number = params.page

    const response = await tiktokPostRequest<{
        products: TikTokProduct[]
        total_count: number
    }>(apiPath, {}, body)

    return {
        products: response.products || [],
        total: response.total_count || 0,
    }
}

/**
 * Search affiliate marketplace products on TikTok Shop.
 * This endpoint specifically returns products available for affiliate promotion.
 */
export async function searchTikTokAffiliateProducts(
    params: TikTokSearchParams
): Promise<{
    products: TikTokProduct[]
    total: number
}> {
    if (!isTikTokConfigured()) {
        throw new Error("TikTok Shop API credentials not configured")
    }

    const apiPath = "/api/affiliate/creator/marketplace/product/search"
    const body: Record<string, unknown> = {
        page_size: params.page_size || 20,
        sort_type: params.sort_type || "SALES",
    }

    if (params.keyword) body.keyword = params.keyword
    if (params.category_id) body.category_id = params.category_id
    if (params.page) body.page_number = params.page
    if (params.price_min) body.price_range = { min: params.price_min }
    if (params.price_max) {
        body.price_range = { ...(body.price_range as Record<string, unknown> || {}), max: params.price_max }
    }

    try {
        const response = await tiktokPostRequest<{
            products: TikTokProduct[]
            total_count: number
        }>(apiPath, {}, body)

        return {
            products: response.products || [],
            total: response.total_count || 0,
        }
    } catch (error) {
        // Fallback to regular product search if affiliate endpoint is not available
        console.warn("[TikTok Shop API] Affiliate search failed, falling back to regular search:", error)
        return searchTikTokProducts(params)
    }
}

/**
 * Get product details by product_id.
 */
export async function getTikTokProductDetail(
    productId: string
): Promise<TikTokProduct | null> {
    if (!isTikTokConfigured()) {
        throw new Error("TikTok Shop API credentials not configured")
    }

    const apiPath = "/api/products/details"

    try {
        const response = await tiktokGetRequest<TikTokProduct>(apiPath, {
            product_id: productId,
        })
        return response
    } catch (error) {
        console.error(`[TikTok Shop API] Failed to get product detail for ${productId}:`, error)
        return null
    }
}

/**
 * Search for trending/best-selling products on TikTok Shop.
 * Convenience method that searches sorted by sales volume.
 */
export async function searchTikTokTrendingProducts(params: {
    keyword?: string
    category_id?: string
    limit?: number
}): Promise<TikTokProduct[]> {
    const result = await searchTikTokAffiliateProducts({
        keyword: params.keyword || "trending",
        category_id: params.category_id,
        sort_type: "SALES",
        page_size: params.limit || 10,
        page: 1,
    })
    return result.products
}

/**
 * Convert a TikTok Shop product to the internal AffiliateProduct format.
 */
export function mapTikTokToAffiliateProduct(product: TikTokProduct) {
    // TikTok prices can be in minor units (cents), normalize to IDR
    const rawSalePrice = parseFloat(product.price?.sale_price || "0")
    const rawOriginalPrice = parseFloat(product.price?.original_price || "0")

    // Determine if price is in cents (> 100000 suggests it's in minor units for IDR)
    const priceMultiplier = rawSalePrice > 10000000 ? 0.01 : 1
    const price = Math.round(rawSalePrice * priceMultiplier)
    const originalPrice = rawOriginalPrice > 0
        ? Math.round(rawOriginalPrice * priceMultiplier)
        : null

    const mainImage = product.images?.[0]?.url || null

    return {
        name: product.title,
        description: `${product.title} - Rating: ${product.rating?.toFixed(1) || "N/A"}/5 | Terjual: ${product.sold_count?.toLocaleString("id-ID") || "0"} | Review: ${product.review_count || 0}`,
        price: price > 0 ? price : 0,
        originalPrice: originalPrice && originalPrice > price ? originalPrice : null,
        category: mapTikTokCategoryName(product.category?.name),
        platform: "tiktok" as const,
        productUrl: product.product_url || `https://www.tiktok.com/view/product/${product.id}`,
        imageUrl: mainImage,
        sellingPoints: generateTikTokSellingPoints(product),
        targetAudience: null as string | null,
        commission: product.commission_rate
            ? `${product.commission_rate}%`
            : null,
        isFeatured: product.sold_count > 500,
        soldCount: product.sold_count,
        rating: product.rating,
    }
}

// ============================================================
// Helpers
// ============================================================

/**
 * Map TikTok category names to internal category names.
 */
function mapTikTokCategoryName(categoryName: string | undefined): string {
    if (!categoryName) return "Home & Living"

    const lower = categoryName.toLowerCase()

    if (lower.includes("beauty") || lower.includes("skincare") || lower.includes("kecantikan") || lower.includes("cosmetic")) {
        return "Beauty & Skincare"
    }
    if (lower.includes("fashion") || lower.includes("clothing") || lower.includes("apparel") || lower.includes("pakaian")) {
        return "Fashion"
    }
    if (lower.includes("food") || lower.includes("beverage") || lower.includes("makanan") || lower.includes("snack")) {
        return "Food & Beverage"
    }
    if (lower.includes("health") || lower.includes("supplement") || lower.includes("kesehatan") || lower.includes("vitamin")) {
        return "Health & Supplements"
    }
    if (lower.includes("home") || lower.includes("living") || lower.includes("rumah") || lower.includes("kitchen")) {
        return "Home & Living"
    }
    if (lower.includes("electronic") || lower.includes("gadget") || lower.includes("phone") || lower.includes("tech")) {
        return "Electronics"
    }
    if (lower.includes("baby") || lower.includes("mom") || lower.includes("bayi") || lower.includes("kid")) {
        return "Mom & Baby"
    }
    if (lower.includes("sport") || lower.includes("outdoor") || lower.includes("olahraga") || lower.includes("fitness")) {
        return "Sports & Outdoor"
    }

    return "Home & Living"
}

/**
 * Generate selling points from TikTok Shop product data.
 */
function generateTikTokSellingPoints(product: TikTokProduct): string {
    const points: string[] = []

    if (product.sold_count > 0) {
        points.push(`• Terjual ${product.sold_count.toLocaleString("id-ID")}+ unit di TikTok Shop`)
    }
    if (product.rating > 0) {
        points.push(`• Rating ${product.rating.toFixed(1)}/5 (${product.review_count || 0} review)`)
    }
    if (product.commission_rate && product.commission_rate > 0) {
        points.push(`• Komisi affiliate ${product.commission_rate}%`)
    }
    if (product.shop?.name) {
        points.push(`• Dari toko: ${product.shop.name}`)
    }
    if (product.shop?.rating > 0) {
        points.push(`• Rating toko: ${product.shop.rating.toFixed(1)}/5`)
    }

    // Calculate discount if applicable
    const salePrice = parseFloat(product.price?.sale_price || "0")
    const originalPrice = parseFloat(product.price?.original_price || "0")
    if (originalPrice > salePrice && salePrice > 0) {
        const discount = Math.round(((originalPrice - salePrice) / originalPrice) * 100)
        points.push(`• Diskon ${discount}% dari harga asli`)
    }

    if (product.video?.url) {
        points.push("• Video produk tersedia")
    }

    if (points.length < 3) {
        points.push("• Tersedia di TikTok Shop Indonesia")
        points.push("• Cocok untuk konten UGC/review")
    }

    return points.join("\n")
}
