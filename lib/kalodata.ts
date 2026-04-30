/**
 * Kalodata Integration Module
 * 
 * Kalodata (kalodata.com) is a TikTok Shop analytics platform.
 * They do NOT provide a public API, so we integrate via:
 * 
 * 1. CSV Import — Parse exported CSV/Excel data from Kalodata
 * 2. AI Research — Use Gemini AI + Google Search to replicate 
 *    Kalodata-style trending product research
 * 
 * Usage flow:
 * - Admin exports "Top Products" from Kalodata dashboard
 * - Admin uploads the CSV file in our admin panel
 * - System parses and maps the data to our AffiliateProduct format
 * - OR: Admin clicks "Kalodata AI Research" to get AI-curated results
 */

import { generateJSON } from "@/lib/gemini"

// ============================================================
// Types
// ============================================================

export interface KalodataProduct {
    productName: string
    productUrl: string | null
    imageUrl: string | null
    category: string
    price: number
    revenue: number
    unitsSold: number
    commission: number           // percentage
    commissionAmount: number     // per unit
    shopName: string | null
    rating: number
    videoCount: number           // number of promo videos
    creatorCount: number         // number of creators promoting
    growthRate: number           // sales growth percentage
    platform: "tiktok"
}

export interface KalodataCSVRow {
    [key: string]: string
}

export interface ParsedKalodataResult {
    success: boolean
    products?: KalodataProduct[]
    rowCount?: number
    errors?: string[]
}

// ============================================================
// CSV Parser — Parse Kalodata Export Files
// ============================================================

/**
 * Known Kalodata CSV column header mappings.
 * Kalodata exports in both English and Chinese headers.
 */
const COLUMN_MAPPINGS: Record<string, string> = {
    // English headers
    "product name": "productName",
    "product title": "productName",
    "product": "productName",
    "name": "productName",
    "title": "productName",
    "product url": "productUrl",
    "product link": "productUrl",
    "url": "productUrl",
    "link": "productUrl",
    "image": "imageUrl",
    "image url": "imageUrl",
    "thumbnail": "imageUrl",
    "category": "category",
    "product category": "category",
    "price": "price",
    "current price": "price",
    "sale price": "price",
    "revenue": "revenue",
    "total revenue": "revenue",
    "sales amount": "revenue",
    "gmv": "revenue",
    "units sold": "unitsSold",
    "sales volume": "unitsSold",
    "total sold": "unitsSold",
    "sold": "unitsSold",
    "sales": "unitsSold",
    "items sold": "unitsSold",
    "commission rate": "commission",
    "commission %": "commission",
    "commission": "commission",
    "commission amount": "commissionAmount",
    "shop name": "shopName",
    "shop": "shopName",
    "store": "shopName",
    "store name": "shopName",
    "seller": "shopName",
    "rating": "rating",
    "product rating": "rating",
    "score": "rating",
    "video count": "videoCount",
    "videos": "videoCount",
    "related videos": "videoCount",
    "# videos": "videoCount",
    "creator count": "creatorCount",
    "creators": "creatorCount",
    "# creators": "creatorCount",
    "related creators": "creatorCount",
    "growth rate": "growthRate",
    "growth": "growthRate",
    "sales growth": "growthRate",
    // Chinese headers (Kalodata sometimes uses these)
    "商品名称": "productName",
    "商品标题": "productName",
    "商品链接": "productUrl",
    "商品图片": "imageUrl",
    "分类": "category",
    "类目": "category",
    "价格": "price",
    "销售额": "revenue",
    "销量": "unitsSold",
    "佣金率": "commission",
    "佣金": "commissionAmount",
    "店铺": "shopName",
    "店铺名称": "shopName",
    "评分": "rating",
    "关联视频数": "videoCount",
    "关联达人数": "creatorCount",
    "增长率": "growthRate",
}

/**
 * Parse a CSV string from Kalodata export.
 * Handles various CSV formats and column header variations.
 */
export function parseKalodataCSV(csvContent: string): ParsedKalodataResult {
    const errors: string[] = []

    try {
        // Split into lines and handle different line endings
        const lines = csvContent
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .split("\n")
            .filter(line => line.trim().length > 0)

        if (lines.length < 2) {
            return { success: false, errors: ["File CSV kosong atau hanya memiliki header"] }
        }

        // Parse header row
        const headers = parseCSVLine(lines[0])
        const columnMap = mapColumns(headers)

        if (!columnMap.productName && columnMap.productName !== 0) {
            return {
                success: false,
                errors: [
                    "Kolom 'Product Name' tidak ditemukan di CSV.",
                    `Kolom yang terdeteksi: ${headers.join(", ")}`,
                    "Pastikan file CSV berasal dari export Kalodata."
                ]
            }
        }

        // Parse data rows
        const products: KalodataProduct[] = []

        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i])
            if (values.length === 0) continue

            try {
                const product = mapRowToProduct(values, columnMap)
                if (product.productName && product.productName.trim().length > 0) {
                    products.push(product)
                }
            } catch (err) {
                errors.push(`Baris ${i + 1}: ${err instanceof Error ? err.message : "Parse error"}`)
            }
        }

        if (products.length === 0) {
            return {
                success: false,
                errors: ["Tidak ada produk valid yang berhasil di-parse dari CSV", ...errors]
            }
        }

        return {
            success: true,
            products,
            rowCount: products.length,
            errors: errors.length > 0 ? errors : undefined,
        }
    } catch (error) {
        return {
            success: false,
            errors: [`Gagal memparse CSV: ${error instanceof Error ? error.message : "Unknown error"}`]
        }
    }
}

/**
 * Parse a single CSV line, handling quoted fields correctly.
 */
function parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ""
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
        const char = line[i]

        if (char === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"'
                i++ // skip escaped quote
            } else {
                inQuotes = !inQuotes
            }
        } else if (char === "," && !inQuotes) {
            result.push(current.trim())
            current = ""
        } else {
            current += char
        }
    }

    result.push(current.trim())
    return result
}

/**
 * Map CSV headers to our known column names.
 * Returns a mapping of our field names to column indices.
 */
function mapColumns(headers: string[]): Record<string, number> {
    const map: Record<string, number> = {}

    headers.forEach((header, index) => {
        const normalized = header.toLowerCase().trim().replace(/['"]/g, "")
        const mappedField = COLUMN_MAPPINGS[normalized]
        if (mappedField && !(mappedField in map)) {
            map[mappedField] = index
        }
    })

    return map
}

/**
 * Convert a CSV row to a KalodataProduct object.
 */
function mapRowToProduct(
    values: string[],
    columnMap: Record<string, number>
): KalodataProduct {
    const get = (field: string): string => {
        const idx = columnMap[field]
        if (idx === undefined || idx >= values.length) return ""
        return values[idx].replace(/^["']|["']$/g, "").trim()
    }

    const getNum = (field: string, defaultVal = 0): number => {
        const raw = get(field)
            .replace(/[,$¥€£₫₱฿%\s]/g, "")
            .replace(/[kKM万亿]/g, (match) => {
                if (match === "k" || match === "K") return "000"
                if (match === "M") return "000000"
                if (match === "万") return "0000"
                if (match === "亿") return "00000000"
                return ""
            })
        const num = parseFloat(raw)
        return isNaN(num) ? defaultVal : num
    }

    return {
        productName: get("productName"),
        productUrl: get("productUrl") || null,
        imageUrl: get("imageUrl") || null,
        category: get("category") || "Uncategorized",
        price: getNum("price"),
        revenue: getNum("revenue"),
        unitsSold: getNum("unitsSold"),
        commission: getNum("commission"),
        commissionAmount: getNum("commissionAmount"),
        shopName: get("shopName") || null,
        rating: getNum("rating"),
        videoCount: getNum("videoCount"),
        creatorCount: getNum("creatorCount"),
        growthRate: getNum("growthRate"),
        platform: "tiktok",
    }
}

// ============================================================
// Category Mapping
// ============================================================

const KALODATA_CATEGORY_MAP: Record<string, string> = {
    "beauty": "Beauty & Skincare",
    "skincare": "Beauty & Skincare",
    "cosmetics": "Beauty & Skincare",
    "makeup": "Beauty & Skincare",
    "kecantikan": "Beauty & Skincare",
    "fashion": "Fashion",
    "clothing": "Fashion",
    "apparel": "Fashion",
    "pakaian": "Fashion",
    "food": "Food & Beverage",
    "snack": "Food & Beverage",
    "beverage": "Food & Beverage",
    "makanan": "Food & Beverage",
    "health": "Health & Supplements",
    "supplement": "Health & Supplements",
    "vitamin": "Health & Supplements",
    "kesehatan": "Health & Supplements",
    "home": "Home & Living",
    "kitchen": "Home & Living",
    "household": "Home & Living",
    "rumah": "Home & Living",
    "electronic": "Electronics",
    "gadget": "Electronics",
    "phone": "Electronics",
    "tech": "Electronics",
    "baby": "Mom & Baby",
    "kids": "Mom & Baby",
    "mom": "Mom & Baby",
    "bayi": "Mom & Baby",
    "sport": "Sports & Outdoor",
    "outdoor": "Sports & Outdoor",
    "fitness": "Sports & Outdoor",
    "olahraga": "Sports & Outdoor",
}

/**
 * Map Kalodata category names to our internal categories.
 */
export function mapKalodataCategory(category: string): string {
    if (!category) return "Home & Living"

    const lower = category.toLowerCase()

    // Direct match
    for (const [keyword, mapped] of Object.entries(KALODATA_CATEGORY_MAP)) {
        if (lower.includes(keyword)) {
            return mapped
        }
    }

    return "Home & Living" // fallback
}

// ============================================================
// Convert Kalodata Products to Affiliate Products
// ============================================================

/**
 * Convert a KalodataProduct to the internal AffiliateProduct format.
 */
export function mapKalodataToAffiliateProduct(product: KalodataProduct) {
    // Try to determine IDR price (Kalodata might show in different currencies)
    let price = product.price
    if (price > 0 && price < 100) {
        // Likely USD, convert roughly to IDR
        price = Math.round(price * 16000)
    }

    const sellingPoints: string[] = []

    if (product.unitsSold > 0) {
        sellingPoints.push(`• Terjual ${product.unitsSold.toLocaleString("id-ID")}+ unit (data Kalodata)`)
    }
    if (product.revenue > 0) {
        sellingPoints.push(`• Revenue: Rp${product.revenue.toLocaleString("id-ID")}`)
    }
    if (product.rating > 0) {
        sellingPoints.push(`• Rating: ${product.rating.toFixed(1)}/5`)
    }
    if (product.commission > 0) {
        sellingPoints.push(`• Komisi affiliate: ${product.commission}%`)
    }
    if (product.videoCount > 0) {
        sellingPoints.push(`• ${product.videoCount.toLocaleString("id-ID")} video promo terkait`)
    }
    if (product.creatorCount > 0) {
        sellingPoints.push(`• ${product.creatorCount.toLocaleString("id-ID")} creator mempromosikan`)
    }
    if (product.growthRate > 0) {
        sellingPoints.push(`• Growth rate: +${product.growthRate.toFixed(0)}%`)
    }
    if (product.shopName) {
        sellingPoints.push(`• Dari toko: ${product.shopName}`)
    }

    if (sellingPoints.length < 3) {
        sellingPoints.push("• Trending di TikTok Shop Indonesia")
        sellingPoints.push("• Cocok untuk konten UGC/review")
    }

    return {
        name: product.productName,
        description: `${product.productName}${product.shopName ? ` - ${product.shopName}` : ""} | Terjual: ${product.unitsSold.toLocaleString("id-ID")}+ | Rating: ${product.rating > 0 ? product.rating.toFixed(1) : "N/A"}/5`,
        price: price > 0 ? Math.round(price) : 0,
        originalPrice: null as number | null,
        category: mapKalodataCategory(product.category),
        platform: "tiktok" as const,
        productUrl: product.productUrl,
        imageUrl: product.imageUrl,
        sellingPoints: sellingPoints.join("\n"),
        targetAudience: null as string | null,
        commission: product.commission > 0 ? `${product.commission}%` : null,
        isFeatured: product.unitsSold > 500 || product.growthRate > 50,
        soldCount: product.unitsSold,
        rating: product.rating,
    }
}

// ============================================================
// AI-Powered Kalodata Research
// ============================================================

/**
 * Use Gemini AI + Google Search to research trending TikTok Shop products
 * similar to what Kalodata shows. This replicates Kalodata's insights
 * without needing their API or subscription.
 */
export async function aiKalodataResearch(params: {
    category?: string
    keyword?: string
    count?: number
    sortBy?: "sales" | "revenue" | "growth" | "commission"
    timeRange?: "24h" | "7d" | "30d"
}): Promise<{
    success: boolean
    products?: KalodataProduct[]
    insight?: string
    error?: string
}> {
    try {
        const count = Math.min(params.count || 10, 15)
        const sortLabel = {
            sales: "terjual terbanyak",
            revenue: "revenue tertinggi",
            growth: "pertumbuhan tercepat",
            commission: "komisi tertinggi",
        }[params.sortBy || "sales"]

        const timeLabel = {
            "24h": "24 jam terakhir",
            "7d": "7 hari terakhir",
            "30d": "30 hari terakhir",
        }[params.timeRange || "7d"]

        const categoryFilter = params.category && params.category !== "all"
            ? `Kategori: ${params.category}`
            : "Semua kategori populer"

        const keywordFilter = params.keyword?.trim()
            ? `Keyword pencarian: "${params.keyword.trim()}"`
            : ""

        const prompt = `Kamu adalah analis data e-commerce yang ahli dalam TikTok Shop Indonesia, mirip seperti Kalodata analytics.

Tugas: Riset dan berikan data ${count} produk TRENDING di TikTok Shop Indonesia saat ini.

Filter:
- Periode: ${timeLabel}
- Sorting: ${sortLabel}
- ${categoryFilter}
${keywordFilter ? `- ${keywordFilter}` : ""}

=== LANGKAH RISET WAJIB (GUNAKAN GOOGLE SEARCH) ===

STEP 1 - Cari produk trending:
- Cari: "produk terlaris TikTok Shop Indonesia 2025 ${params.keyword || ""}"
- Cari: "trending product TikTok Shop ${params.category || ""}"
- Cari: "best seller TikTok Shop Indonesia minggu ini"

STEP 2 - WAJIB cari URL produk ASLI untuk setiap produk:
- Cari: "[nama produk] site:tiktok.com" atau "[nama produk] TikTok Shop link"
- Cari: "[nama produk] shopee.co.id" sebagai alternatif
- Format URL TikTok: https://www.tiktok.com/view/product/[ID] atau https://s.tiktok.com/[ID]
- Format URL Shopee: https://shopee.co.id/[slug]-i.[shopid].[itemid]
- JANGAN isi null kecuali benar-benar tidak ditemukan

STEP 3 - WAJIB cari URL GAMBAR untuk setiap produk:
- Cari: "[nama produk] product image" di Google Images
- Ambil URL gambar dari halaman produk marketplace
- URL gambar biasanya dari: p-id.iproto.egg, img.lazcdn.com, cf.shopee.co.id, lf16-co.bytetos.com
- Bisa juga dari official website brand atau marketplace listing
- Format harus URL langsung ke file gambar (jpg, png, webp)
- JANGAN isi null — USAHAKAN selalu ada gambar

STEP 4 - Kumpulkan data analytics:
- Harga dalam Rupiah (IDR)
- Estimasi total revenue, units sold
- Commission rate affiliate
- Nama toko/seller
- Rating, video count, creator count, growth rate

=== FORMAT RESPONSE ===

Berikan response dalam format JSON:
{
    "products": [
        {
            "productName": "Nama Produk Lengkap dan Spesifik (termasuk brand)",
            "productUrl": "https://www.tiktok.com/view/product/... ATAU https://shopee.co.id/... (WAJIB ISI URL ASLI)",
            "imageUrl": "https://... (WAJIB ISI URL GAMBAR PRODUK YANG VALID)",
            "category": "Beauty & Skincare",
            "price": 99000,
            "revenue": 5000000000,
            "unitsSold": 50000,
            "commission": 10,
            "commissionAmount": 9900,
            "shopName": "Nama Toko Resmi",
            "rating": 4.8,
            "videoCount": 1500,
            "creatorCount": 300,
            "growthRate": 150,
            "platform": "tiktok"
        }
    ],
    "insight": "Ringkasan singkat tren pasar TikTok Shop Indonesia saat ini (2-3 kalimat)"
}

=== ATURAN KETAT ===
1. productUrl WAJIB diisi dengan URL asli produk yang ditemukan dari pencarian Google. JANGAN null.
2. imageUrl WAJIB diisi dengan URL gambar produk yang valid. JANGAN null.
3. Harga WAJIB dalam Rupiah (IDR)
4. Revenue dalam Rupiah
5. Commission rate dalam persen (angka saja, tanpa %)
6. Data harus serealistis mungkin
7. growthRate dalam persen (contoh: 150 artinya +150%)
8. Prioritaskan produk yang BENAR-BENAR trending saat ini
9. Nama produk harus LENGKAP termasuk brand/merek`

        const result = await generateJSON<{
            products: KalodataProduct[]
            insight?: string
        }>(prompt, {
            temperature: 0.7,
            useSearch: true,
        })

        if (!result.products || !Array.isArray(result.products) || result.products.length === 0) {
            return { success: false, error: "AI tidak menemukan produk trending" }
        }

        // Validate and sanitize
        const validProducts = result.products
            .filter(p => p.productName && p.productName.trim().length > 0)
            .map(p => ({
                ...p,
                productName: p.productName.trim(),
                productUrl: p.productUrl || null,
                imageUrl: p.imageUrl || null,
                category: p.category || "Uncategorized",
                price: Math.round(Math.abs(p.price || 0)),
                revenue: Math.round(Math.abs(p.revenue || 0)),
                unitsSold: Math.round(Math.abs(p.unitsSold || 0)),
                commission: Math.abs(p.commission || 0),
                commissionAmount: Math.round(Math.abs(p.commissionAmount || 0)),
                shopName: p.shopName || null,
                rating: Math.min(5, Math.max(0, p.rating || 0)),
                videoCount: Math.round(Math.abs(p.videoCount || 0)),
                creatorCount: Math.round(Math.abs(p.creatorCount || 0)),
                growthRate: p.growthRate || 0,
                platform: "tiktok" as const,
            }))

        return {
            success: true,
            products: validProducts,
            insight: result.insight || undefined,
        }
    } catch (error) {
        console.error("[Kalodata AI Research] Error:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Gagal melakukan riset AI",
        }
    }
}
