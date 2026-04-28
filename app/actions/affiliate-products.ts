"use server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export interface AffiliateProductItem {
    id: string
    name: string
    description: string
    price: number
    originalPrice: number | null
    category: string
    platform: string
    productUrl: string | null
    imageUrl: string | null
    sellingPoints: string
    targetAudience: string | null
    commission: string | null
    isFeatured: boolean
    isActive: boolean
    source: string
    createdAt: Date
}

const PRODUCT_CATEGORIES = [
    "Beauty & Skincare",
    "Fashion",
    "Food & Beverage",
    "Health & Supplements",
    "Home & Living",
    "Electronics",
    "Mom & Baby",
    "Sports & Outdoor",
]

const PRODUCT_PLATFORMS = ["tiktok", "shopee"]

export async function getProductCategories() {
    return PRODUCT_CATEGORIES
}

export async function getProductPlatforms() {
    return PRODUCT_PLATFORMS
}

export async function getFeaturedProducts(): Promise<{
    success: boolean
    products?: AffiliateProductItem[]
    error?: string
}> {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return { success: false, error: "Unauthorized" }
        }

        const products = await prisma.affiliateProduct.findMany({
            where: {
                isActive: true,
                isFeatured: true,
            },
            orderBy: { createdAt: "desc" },
            take: 12,
            select: {
                id: true,
                name: true,
                description: true,
                price: true,
                originalPrice: true,
                category: true,
                platform: true,
                productUrl: true,
                imageUrl: true,
                sellingPoints: true,
                targetAudience: true,
                commission: true,
                isFeatured: true,
                isActive: true,
                source: true,
                createdAt: true,
            },
        })

        return { success: true, products }
    } catch (error) {
        console.error("Error getting featured products:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function searchProducts(params: {
    query?: string
    category?: string
    platform?: string
    page?: number
    limit?: number
}): Promise<{
    success: boolean
    products?: AffiliateProductItem[]
    total?: number
    error?: string
}> {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return { success: false, error: "Unauthorized" }
        }

        const page = params.page || 1
        const limit = params.limit || 12
        const skip = (page - 1) * limit

        const where: Record<string, unknown> = {
            isActive: true,
        }

        if (params.query && params.query.trim()) {
            where.OR = [
                { name: { contains: params.query, mode: "insensitive" } },
                { description: { contains: params.query, mode: "insensitive" } },
                { sellingPoints: { contains: params.query, mode: "insensitive" } },
            ]
        }

        if (params.category && params.category !== "all") {
            where.category = params.category
        }

        if (params.platform && params.platform !== "all") {
            where.platform = params.platform
        }

        const [products, total] = await Promise.all([
            prisma.affiliateProduct.findMany({
                where,
                orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
                skip,
                take: limit,
                select: {
                    id: true,
                    name: true,
                    description: true,
                    price: true,
                    originalPrice: true,
                    category: true,
                    platform: true,
                    productUrl: true,
                    imageUrl: true,
                    sellingPoints: true,
                    targetAudience: true,
                    commission: true,
                    isFeatured: true,
                    isActive: true,
                    source: true,
                    createdAt: true,
                },
            }),
            prisma.affiliateProduct.count({ where }),
        ])

        return { success: true, products, total }
    } catch (error) {
        console.error("Error searching products:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function getProductById(id: string): Promise<{
    success: boolean
    product?: AffiliateProductItem
    error?: string
}> {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return { success: false, error: "Unauthorized" }
        }

        const product = await prisma.affiliateProduct.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                description: true,
                price: true,
                originalPrice: true,
                category: true,
                platform: true,
                productUrl: true,
                imageUrl: true,
                sellingPoints: true,
                targetAudience: true,
                commission: true,
                isFeatured: true,
                isActive: true,
                source: true,
                createdAt: true,
            },
        })

        if (!product) {
            return { success: false, error: "Product not found" }
        }

        return { success: true, product }
    } catch (error) {
        console.error("Error getting product:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function buildVideoPromptFromProduct(product: AffiliateProductItem): Promise<{
    success: boolean
    prompt?: string
    error?: string
}> {
    try {
        const platformLabel = product.platform === "tiktok" ? "TikTok Shop" : "Shopee"
        const priceFormatted = new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            minimumFractionDigits: 0,
        }).format(product.price)

        const discountInfo = product.originalPrice
            ? `\nDiskon dari ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(product.originalPrice)} menjadi ${priceFormatted}.`
            : ""

        const prompt = `Buat video promosi produk affiliate untuk ${platformLabel} dengan gaya UGC creator yang meyakinkan dan natural.

Produk: ${product.name}
Kategori: ${product.category}
Harga: ${priceFormatted}${discountInfo}
Selling Points: ${product.sellingPoints}
${product.targetAudience ? `Target Audience: ${product.targetAudience}` : ""}
${product.commission ? `Komisi: ${product.commission}` : ""}

Video harus menampilkan seorang creator wanita/pria Indonesia yang sedang memperlihatkan dan mereview produk ini secara natural di depan kamera smartphone, seolah-olah sedang membuat konten TikTok. Pencahayaan alami, background rumah/kamar yang rapi. Creator berbicara langsung ke kamera dengan antusias tentang keunggulan produk. Portrait 9:16 format.`

        return { success: true, prompt }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to build prompt",
        }
    }
}

// ===== ADMIN ACTIONS =====

async function checkAdminAccess() {
    const session = await auth()
    if (!session?.user?.id) {
        return { isAdmin: false, error: "Unauthorized" }
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
    })

    if (user?.role !== "admin") {
        return { isAdmin: false, error: "Admin access required" }
    }

    return { isAdmin: true, userId: session.user.id }
}

export async function adminCreateProduct(data: {
    name: string
    description: string
    price: number
    originalPrice?: number | null
    category: string
    platform: string
    productUrl?: string | null
    imageUrl?: string | null
    sellingPoints: string
    targetAudience?: string | null
    commission?: string | null
    isFeatured?: boolean
    source?: string
}): Promise<{ success: boolean; product?: AffiliateProductItem; error?: string }> {
    try {
        const { isAdmin, userId, error } = await checkAdminAccess()
        if (!isAdmin) return { success: false, error }

        if (!data.name.trim()) return { success: false, error: "Nama produk wajib diisi" }
        if (!data.description.trim()) return { success: false, error: "Deskripsi wajib diisi" }
        if (!data.sellingPoints.trim()) return { success: false, error: "Selling points wajib diisi" }
        if (data.price < 0) return { success: false, error: "Harga tidak valid" }

        const product = await prisma.affiliateProduct.create({
            data: {
                name: data.name.trim(),
                description: data.description.trim(),
                price: data.price,
                originalPrice: data.originalPrice || null,
                category: data.category,
                platform: data.platform,
                productUrl: data.productUrl || null,
                imageUrl: data.imageUrl || null,
                sellingPoints: data.sellingPoints.trim(),
                targetAudience: data.targetAudience?.trim() || null,
                commission: data.commission?.trim() || null,
                isFeatured: data.isFeatured || false,
                isActive: true,
                source: data.source || "admin",
                createdById: userId,
            },
            select: {
                id: true,
                name: true,
                description: true,
                price: true,
                originalPrice: true,
                category: true,
                platform: true,
                productUrl: true,
                imageUrl: true,
                sellingPoints: true,
                targetAudience: true,
                commission: true,
                isFeatured: true,
                isActive: true,
                source: true,
                createdAt: true,
            },
        })

        revalidatePath("/dashboard/affiliator-machine")
        revalidatePath("/admin/affiliate-products")

        return { success: true, product }
    } catch (error) {
        console.error("Error creating product:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function adminUpdateProduct(
    id: string,
    data: {
        name?: string
        description?: string
        price?: number
        originalPrice?: number | null
        category?: string
        platform?: string
        productUrl?: string | null
        imageUrl?: string | null
        sellingPoints?: string
        targetAudience?: string | null
        commission?: string | null
        isFeatured?: boolean
        isActive?: boolean
    }
): Promise<{ success: boolean; error?: string }> {
    try {
        const { isAdmin, error } = await checkAdminAccess()
        if (!isAdmin) return { success: false, error }

        await prisma.affiliateProduct.update({
            where: { id },
            data: {
                ...(data.name !== undefined && { name: data.name.trim() }),
                ...(data.description !== undefined && { description: data.description.trim() }),
                ...(data.price !== undefined && { price: data.price }),
                ...(data.originalPrice !== undefined && { originalPrice: data.originalPrice }),
                ...(data.category !== undefined && { category: data.category }),
                ...(data.platform !== undefined && { platform: data.platform }),
                ...(data.productUrl !== undefined && { productUrl: data.productUrl }),
                ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
                ...(data.sellingPoints !== undefined && { sellingPoints: data.sellingPoints.trim() }),
                ...(data.targetAudience !== undefined && { targetAudience: data.targetAudience?.trim() || null }),
                ...(data.commission !== undefined && { commission: data.commission?.trim() || null }),
                ...(data.isFeatured !== undefined && { isFeatured: data.isFeatured }),
                ...(data.isActive !== undefined && { isActive: data.isActive }),
            },
        })

        revalidatePath("/dashboard/affiliator-machine")
        revalidatePath("/admin/affiliate-products")

        return { success: true }
    } catch (error) {
        console.error("Error updating product:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function adminDeleteProduct(id: string): Promise<{ success: boolean; error?: string }> {
    try {
        const { isAdmin, error } = await checkAdminAccess()
        if (!isAdmin) return { success: false, error }

        await prisma.affiliateProduct.delete({ where: { id } })

        revalidatePath("/dashboard/affiliator-machine")
        revalidatePath("/admin/affiliate-products")

        return { success: true }
    } catch (error) {
        console.error("Error deleting product:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function adminGetAllProducts(params?: {
    page?: number
    limit?: number
    search?: string
}): Promise<{
    success: boolean
    products?: AffiliateProductItem[]
    total?: number
    error?: string
}> {
    try {
        const { isAdmin, error } = await checkAdminAccess()
        if (!isAdmin) return { success: false, error }

        const page = params?.page || 1
        const limit = params?.limit || 20
        const skip = (page - 1) * limit

        const where: Record<string, unknown> = {}
        if (params?.search) {
            where.OR = [
                { name: { contains: params.search, mode: "insensitive" } },
                { description: { contains: params.search, mode: "insensitive" } },
            ]
        }

        const [products, total] = await Promise.all([
            prisma.affiliateProduct.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
                select: {
                    id: true,
                    name: true,
                    description: true,
                    price: true,
                    originalPrice: true,
                    category: true,
                    platform: true,
                    productUrl: true,
                    imageUrl: true,
                    sellingPoints: true,
                    targetAudience: true,
                    commission: true,
                    isFeatured: true,
                    isActive: true,
                    source: true,
                    createdAt: true,
                },
            }),
            prisma.affiliateProduct.count({ where }),
        ])

        return { success: true, products, total }
    } catch (error) {
        console.error("Error getting all products:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}
