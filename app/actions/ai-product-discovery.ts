"use server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateJSON } from "@/lib/gemini"
import { revalidatePath } from "next/cache"

interface DiscoveredProduct {
    name: string
    description: string
    price: number
    originalPrice: number | null
    category: string
    platform: string
    productUrl: string | null
    imageUrl: string | null
    sellingPoints: string
    targetAudience: string
    commission: string
    isFeatured: boolean
}

const VALID_CATEGORIES = [
    "Beauty & Skincare",
    "Fashion",
    "Food & Beverage",
    "Health & Supplements",
    "Home & Living",
    "Electronics",
    "Mom & Baby",
    "Sports & Outdoor",
]

const VALID_PLATFORMS = ["tiktok", "shopee"]

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

/**
 * AI-powered product discovery using Gemini.
 * Generates trending product recommendations based on category, platform, and market trends.
 */
export async function aiDiscoverProducts(params: {
    category?: string
    platform?: string
    count?: number
    focus?: string
}): Promise<{
    success: boolean
    products?: DiscoveredProduct[]
    error?: string
}> {
    try {
        const { isAdmin, error } = await checkAdminAccess()
        if (!isAdmin) return { success: false, error }

        const count = Math.min(params.count || 5, 10)
        const categoryFilter = params.category && params.category !== "all"
            ? params.category
            : "semua kategori"
        const platformFilter = params.platform && params.platform !== "all"
            ? params.platform === "tiktok" ? "TikTok Shop" : "Shopee"
            : "TikTok Shop dan Shopee"
        const focusText = params.focus?.trim()
            ? `Fokus khusus: ${params.focus.trim()}`
            : ""

        const prompt = `Kamu adalah ahli affiliate marketing Indonesia yang sangat berpengalaman di ${platformFilter}.

Tugas: CARI dan berikan ${count} rekomendasi produk affiliate TERLARIS dan paling TRENDING saat ini di Indonesia untuk platform ${platformFilter}.

${categoryFilter !== "semua kategori" ? `Kategori: ${categoryFilter}` : "Cakup berbagai kategori populer."}
${focusText}

PENTING - Panduan riset produk:
- Gunakan Google Search untuk mencari produk yang SEDANG viral dan trending di TikTok Shop atau Shopee Indonesia
- Cari URL produk ASLI dari TikTok Shop (tokopedia/tiktok) atau Shopee (shopee.co.id)
- Cari URL gambar produk yang valid dan bisa diakses publik
- Prioritaskan produk dengan komisi affiliate tinggi
- Harga dalam Rupiah (IDR), tanpa desimal
- Berikan selling points yang persuasif untuk video UGC/review
- Target audience harus spesifik (contoh: "Wanita 20-35 tahun, pekerja kantoran")
- Berikan perkiraan komisi realistis (contoh: "10-15%" atau "Rp5.000-15.000/item")

UNTUK URL PRODUK:
- TikTok Shop: cari link seperti https://www.tiktok.com/view/product/... atau https://tokopedia.link/...
- Shopee: cari link seperti https://shopee.co.id/...
- Jika tidak menemukan URL asli, isi dengan null

UNTUK URL GAMBAR:
- Cari gambar produk dari website resmi, marketplace, atau sumber terpercaya
- URL harus berakhiran .jpg, .png, .webp atau URL gambar yang valid
- Jika tidak menemukan, isi dengan null

Kategori yang valid: ${VALID_CATEGORIES.join(", ")}
Platform yang valid: tiktok, shopee

Berikan response dalam format JSON array (HANYA JSON, tanpa teks lain):
[
  {
    "name": "Nama produk lengkap dan spesifik",
    "description": "Deskripsi produk 2-3 kalimat, menarik dan informatif",
    "price": 99000,
    "originalPrice": 150000,
    "category": "Beauty & Skincare",
    "platform": "tiktok",
    "productUrl": "https://shopee.co.id/... atau https://tiktok.com/... (URL asli produk)",
    "imageUrl": "https://... (URL gambar produk yang valid)",
    "sellingPoints": "• Selling point 1\\n• Selling point 2\\n• Selling point 3\\n• Selling point 4",
    "targetAudience": "Wanita 20-35 tahun, skincare enthusiast",
    "commission": "10-15%",
    "isFeatured": true
  }
]

Pastikan:
1. Setiap produk punya minimal 4 selling points (pakai bullet •)
2. Harga realistis sesuai pasar Indonesia
3. originalPrice selalu lebih tinggi dari price (untuk menunjukkan diskon), boleh null jika tidak ada diskon
4. isFeatured = true untuk produk yang benar-benar trending, false untuk yang biasa
5. Selling points ditulis persuasif untuk creator yang akan membuat video promo
6. category HARUS salah satu dari kategori valid yang disebutkan di atas
7. productUrl dan imageUrl WAJIB diisi dengan URL yang valid jika ditemukan dari pencarian`

        const products = await generateJSON<DiscoveredProduct[]>(prompt, {
            temperature: 0.9,
            useSearch: true,
        })

        if (!Array.isArray(products) || products.length === 0) {
            return { success: false, error: "AI tidak mengembalikan produk yang valid" }
        }

        // Validate and sanitize products
        const validProducts = products
            .filter(p => p.name && p.description && p.price > 0 && p.sellingPoints)
            .map(p => ({
                ...p,
                category: VALID_CATEGORIES.includes(p.category) ? p.category : "Beauty & Skincare",
                platform: VALID_PLATFORMS.includes(p.platform) ? p.platform : "tiktok",
                price: Math.round(p.price),
                originalPrice: p.originalPrice ? Math.round(p.originalPrice) : null,
                productUrl: p.productUrl || null,
                imageUrl: p.imageUrl || null,
                isFeatured: Boolean(p.isFeatured),
            }))

        return { success: true, products: validProducts }
    } catch (error) {
        console.error("[AI Product Discovery] Error:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Gagal melakukan AI discovery",
        }
    }
}

/**
 * Save AI-discovered products to the database.
 */
export async function saveDiscoveredProducts(
    products: DiscoveredProduct[]
): Promise<{
    success: boolean
    savedCount?: number
    error?: string
}> {
    try {
        const { isAdmin, userId, error } = await checkAdminAccess()
        if (!isAdmin) return { success: false, error }

        let savedCount = 0

        for (const product of products) {
            // Check for duplicate by name (case insensitive)
            const existing = await prisma.affiliateProduct.findFirst({
                where: {
                    name: { equals: product.name, mode: "insensitive" },
                },
            })

            if (existing) continue

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
                    source: "ai-discovery",
                    createdById: userId,
                },
            })
            savedCount++
        }

        revalidatePath("/dashboard/affiliator-machine")
        revalidatePath("/admin/affiliate-products")

        return { success: true, savedCount }
    } catch (error) {
        console.error("[Save Discovered Products] Error:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Gagal menyimpan produk",
        }
    }
}
