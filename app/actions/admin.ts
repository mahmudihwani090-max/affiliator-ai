"use server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { deleteFromCloudinary } from "@/lib/cloudinary"
import { calculateSubscriptionEndDate, listActiveSubscriptionPlans, listSubscriptionPlans } from "@/lib/subscription"
import { parsePaymentOrderId } from "@/lib/payment-site"

// Types
export interface AdminUser {
    id: string
    name: string | null
    email: string
    role: string
    discountPercent: number
    createdAt: Date
    currentPlan: string | null
    currentPlanCode: string | null
    subscriptionStatus: string | null
    subscriptionEndsAt: Date | null
    isLifetime: boolean
    _count?: {
        transactions: number
    }
}

export interface AdminSubscriptionPlan {
    id: string
    code: string
    name: string
    description: string | null
    price: number
    durationDays: number | null
    isLifetime: boolean
    isActive: boolean
}

export interface AdminTransaction {
    id: string
    orderId: string
    websiteCode: string | null
    plan: string
    amount: number
    status: string
    paymentType: string | null
    createdAt: Date
    user: {
        id: string
        name: string | null
        email: string
    }
}

export interface DashboardStats {
    totalUsers: number
    activeUsersThisMonth: number
    totalRevenue: number
    monthlyRevenue: number
    activeSubscriptions: number
    pendingTransactions: number
}

/**
 * Check if current user has admin access
 */
export async function checkAdminAccess(): Promise<{
    isAdmin: boolean
    userId?: string
    error?: string
}> {
    try {
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
    } catch (error) {
        console.error("Error checking admin access:", error)
        return { isAdmin: false, error: "Error checking access" }
    }
}

/**
 * Get all users with pagination
 */
export async function getAllUsers(
    page: number = 1,
    limit: number = 20,
    search: string = ""
): Promise<{
    success: boolean
    users?: AdminUser[]
    total?: number
    error?: string
}> {
    try {
        const { isAdmin, error } = await checkAdminAccess()
        if (!isAdmin) {
            return { success: false, error }
        }

        const skip = (page - 1) * limit

        const where = search
            ? {
                OR: [
                    { name: { contains: search, mode: "insensitive" as const } },
                    { email: { contains: search, mode: "insensitive" as const } },
                ],
            }
            : {}

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    discountPercent: true,
                    createdAt: true,
                    subscriptions: {
                        where: {
                            status: "active",
                            OR: [
                                { isLifetime: true },
                                { endDate: { gt: new Date() } },
                            ],
                        },
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: {
                            status: true,
                            endDate: true,
                            isLifetime: true,
                            plan: {
                                select: {
                                    code: true,
                                    name: true,
                                },
                            },
                        },
                    },
                    _count: {
                        select: { transactions: true },
                    },
                },
            }),
            prisma.user.count({ where }),
        ])

        return {
            success: true,
            users: users.map((user) => ({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                discountPercent: user.discountPercent,
                createdAt: user.createdAt,
                currentPlan: user.subscriptions[0]?.plan.name || null,
                currentPlanCode: user.subscriptions[0]?.plan.code || null,
                subscriptionStatus: user.subscriptions[0]?.status || null,
                subscriptionEndsAt: user.subscriptions[0]?.isLifetime ? null : (user.subscriptions[0]?.endDate ?? null),
                isLifetime: user.subscriptions[0]?.isLifetime || false,
                _count: user._count,
            })),
            total,
        }
    } catch (error) {
        console.error("Error getting users:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function getAdminSubscriptionPlans(): Promise<{
    success: boolean
    plans?: AdminSubscriptionPlan[]
    error?: string
}> {
    try {
        const { isAdmin, error } = await checkAdminAccess()
        if (!isAdmin) {
            return { success: false, error }
        }

        const plans = await listActiveSubscriptionPlans()

        return {
            success: true,
            plans: plans.map((plan) => ({
                id: plan.id,
                code: plan.code,
                name: plan.name,
                description: plan.description,
                price: plan.price,
                durationDays: plan.durationDays,
                isLifetime: plan.isLifetime,
                isActive: plan.isActive,
            })),
        }
    } catch (error) {
        console.error("Error getting subscription plans for admin:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function getAdminManageableSubscriptionPlans(): Promise<{
    success: boolean
    plans?: AdminSubscriptionPlan[]
    error?: string
}> {
    try {
        const { isAdmin, error } = await checkAdminAccess()
        if (!isAdmin) {
            return { success: false, error }
        }

        const plans = await listSubscriptionPlans()

        return {
            success: true,
            plans: plans.map((plan) => ({
                id: plan.id,
                code: plan.code,
                name: plan.name,
                description: plan.description,
                price: plan.price,
                durationDays: plan.durationDays,
                isLifetime: plan.isLifetime,
                isActive: plan.isActive,
            })),
        }
    } catch (error) {
        console.error("Error getting manageable subscription plans:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function saveSubscriptionPlan(data: {
    code: string
    name: string
    description?: string | null
    price: number
    durationDays?: number | null
    isLifetime: boolean
    isActive: boolean
}): Promise<{
    success: boolean
    plan?: AdminSubscriptionPlan
    error?: string
}> {
    try {
        const { isAdmin, error } = await checkAdminAccess()
        if (!isAdmin) {
            return { success: false, error }
        }

        const name = data.name.trim()
        const description = data.description?.trim() || null

        if (!data.code.trim()) {
            return { success: false, error: "Kode plan wajib diisi" }
        }

        if (!name) {
            return { success: false, error: "Nama plan wajib diisi" }
        }

        if (!Number.isInteger(data.price) || data.price < 0) {
            return { success: false, error: "Harga plan harus berupa angka bulat >= 0" }
        }

        if (!data.isLifetime) {
            if (!Number.isInteger(data.durationDays) || (data.durationDays ?? 0) <= 0) {
                return { success: false, error: "Durasi plan non-lifetime harus lebih dari 0 hari" }
            }
        }

        const plan = await prisma.subscriptionPlan.upsert({
            where: { code: data.code },
            update: {
                name,
                description,
                price: data.price,
                durationDays: data.isLifetime ? null : data.durationDays ?? null,
                isLifetime: data.isLifetime,
                isActive: data.isActive,
            },
            create: {
                code: data.code,
                name,
                description,
                price: data.price,
                durationDays: data.isLifetime ? null : data.durationDays ?? null,
                isLifetime: data.isLifetime,
                isActive: data.isActive,
            },
        })

        revalidatePath("/admin/packages")
        revalidatePath("/dashboard/credits")

        return {
            success: true,
            plan: {
                id: plan.id,
                code: plan.code,
                name: plan.name,
                description: plan.description,
                price: plan.price,
                durationDays: plan.durationDays,
                isLifetime: plan.isLifetime,
                isActive: plan.isActive,
            },
        }
    } catch (error) {
        console.error("Error saving subscription plan:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

/**
 * Update user details
 */
export async function updateUser(
    userId: string,
    data: {
        name?: string
        role?: string
        discountPercent?: number
        subscriptionPlanCode?: string | null
    }
): Promise<{
    success: boolean
    user?: AdminUser
    error?: string
}> {
    try {
        const { isAdmin, error } = await checkAdminAccess()
        if (!isAdmin) {
            return { success: false, error }
        }

        const { subscriptionPlanCode, ...userData } = data

        let selectedPlan:
            | {
                id: string
                code: string
                name: string
                durationDays: number | null
                isLifetime: boolean
            }
            | null = null

        if (subscriptionPlanCode) {
            selectedPlan = await prisma.subscriptionPlan.findFirst({
                where: {
                    code: subscriptionPlanCode,
                    isActive: true,
                },
                select: {
                    id: true,
                    code: true,
                    name: true,
                    durationDays: true,
                    isLifetime: true,
                },
            })

            if (!selectedPlan) {
                return {
                    success: false,
                    error: "Subscription plan tidak ditemukan di database. Jalankan seeder terlebih dahulu.",
                }
            }
        }

        const now = new Date()

        const user = await prisma.$transaction(async (tx) => {
            const activeSubscription = await tx.subscription.findFirst({
                where: {
                    userId,
                    status: "active",
                    OR: [
                        { isLifetime: true },
                        { endDate: { gt: now } },
                    ],
                },
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    planId: true,
                    plan: {
                        select: {
                            code: true,
                            name: true,
                        },
                    },
                },
            })

            if (subscriptionPlanCode !== undefined) {
                const shouldReplaceSubscription =
                    subscriptionPlanCode === null
                        ? Boolean(activeSubscription)
                        : !activeSubscription || activeSubscription.plan.code !== subscriptionPlanCode

                if (shouldReplaceSubscription && activeSubscription) {
                    await tx.subscription.updateMany({
                        where: {
                            userId,
                            status: "active",
                        },
                        data: {
                            status: "canceled",
                            canceledAt: now,
                            endDate: now,
                        },
                    })
                }

                if (shouldReplaceSubscription && selectedPlan) {
                    await tx.subscription.create({
                        data: {
                            userId,
                            planId: selectedPlan.id,
                            status: "active",
                            startDate: now,
                            endDate: calculateSubscriptionEndDate(
                                selectedPlan.durationDays,
                                selectedPlan.isLifetime
                            ),
                            isLifetime: selectedPlan.isLifetime,
                        },
                    })
                }
            }

            return tx.user.update({
                where: { id: userId },
                data: userData,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    discountPercent: true,
                    createdAt: true,
                    subscriptions: {
                        where: {
                            status: "active",
                            OR: [
                                { isLifetime: true },
                                { endDate: { gt: now } },
                            ],
                        },
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: {
                            status: true,
                            endDate: true,
                            isLifetime: true,
                            plan: {
                                select: {
                                    code: true,
                                    name: true,
                                },
                            },
                        },
                    },
                },
            })
        })

        revalidatePath("/admin/users")
        revalidatePath("/dashboard")
        revalidatePath("/dashboard/credits")
        revalidatePath("/dashboard/projects")
        return {
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                discountPercent: user.discountPercent,
                createdAt: user.createdAt,
                currentPlan: user.subscriptions[0]?.plan.name || null,
                currentPlanCode: user.subscriptions[0]?.plan.code || null,
                subscriptionStatus: user.subscriptions[0]?.status || null,
                subscriptionEndsAt: user.subscriptions[0]?.isLifetime ? null : (user.subscriptions[0]?.endDate ?? null),
                isLifetime: user.subscriptions[0]?.isLifetime || false,
            },
        }
    } catch (error) {
        console.error("Error updating user:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

/**
 * Delete a user
 */
export async function deleteUser(userId: string): Promise<{
    success: boolean
    error?: string
}> {
    try {
        const { isAdmin, userId: adminId, error } = await checkAdminAccess()
        if (!isAdmin) {
            return { success: false, error }
        }

        // Prevent self-delete
        if (userId === adminId) {
            return { success: false, error: "Cannot delete your own account" }
        }

        await prisma.user.delete({
            where: { id: userId },
        })

        revalidatePath("/admin/users")
        return { success: true }
    } catch (error) {
        console.error("Error deleting user:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

/**
 * Get all transactions with pagination
 */
export async function getAllTransactions(
    page: number = 1,
    limit: number = 20,
    status: string = ""
): Promise<{
    success: boolean
    transactions?: AdminTransaction[]
    total?: number
    error?: string
}> {
    try {
        const { isAdmin, error } = await checkAdminAccess()
        if (!isAdmin) {
            return { success: false, error }
        }

        const skip = (page - 1) * limit
        const where = status ? { status } : {}

        const [transactions, total] = await Promise.all([
            prisma.transaction.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    orderId: true,
                    subscriptionName: true,
                    amount: true,
                    status: true,
                    paymentType: true,
                    createdAt: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
            }),
            prisma.transaction.count({ where }),
        ])

        return {
            success: true,
            transactions: transactions.map((transaction) => ({
                id: transaction.id,
                orderId: transaction.orderId,
                websiteCode: parsePaymentOrderId(transaction.orderId)?.websiteCode || null,
                plan: transaction.subscriptionName,
                amount: transaction.amount,
                status: transaction.status,
                paymentType: transaction.paymentType,
                createdAt: transaction.createdAt,
                user: transaction.user,
            })),
            total,
        }
    } catch (error) {
        console.error("Error getting transactions:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

/**
 * Update transaction status
 */
export async function updateTransactionStatus(
    transactionId: string,
    status: string
): Promise<{
    success: boolean
    error?: string
}> {
    try {
        const { isAdmin, error } = await checkAdminAccess()
        if (!isAdmin) {
            return { success: false, error }
        }

        await prisma.transaction.update({
            where: { id: transactionId },
            data: { status },
        })

        revalidatePath("/admin/transactions")
        return { success: true }
    } catch (error) {
        console.error("Error updating transaction:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

/**
 * Credit adjustments are removed — access is fully subscription-based.
 * This stub is kept for backward compatibility with admin UI.
 */
export async function adjustUserCredits(
    _userId: string,
    _amount: number,
    _description: string
): Promise<{
    success: boolean
    newBalance?: number
    error?: string
}> {
    return {
        success: false,
        error: "Kelola akses lewat subscription plan.",
    }
}

/**
 * Admin endpoint returning subscription transaction history.
 */
export async function getCreditHistoryAdmin(
    page: number = 1,
    limit: number = 20,
    userId?: string
): Promise<{
    success: boolean
    history?: Array<{
        id: string
        amount: number
        type: string
        description: string
        balanceAfter: number
        createdAt: Date
        user: {
            id: string
            name: string | null
            email: string
        }
    }>
    total?: number
    error?: string
}> {
    try {
        const { isAdmin, error } = await checkAdminAccess()
        if (!isAdmin) {
            return { success: false, error }
        }

        const skip = (page - 1) * limit
        const where = userId ? { userId } : {}

        const [history, total] = await Promise.all([
            prisma.transaction.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    amount: true,
                    status: true,
                    subscriptionName: true,
                    createdAt: true,
                    paymentType: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
            }),
            prisma.transaction.count({ where }),
        ])

        return {
            success: true,
            history: history.map((item) => ({
                id: item.id,
                amount: item.amount,
                type: item.status,
                description: item.subscriptionName,
                balanceAfter: 0,
                createdAt: item.createdAt,
                paymentType: item.paymentType,
                user: item.user,
            })),
            total,
        }
    } catch (error) {
        console.error("Error getting subscription history:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

/**
 * Get dashboard statistics
 */
export async function getDashboardStats(): Promise<{
    success: boolean
    stats?: DashboardStats
    error?: string
}> {
    try {
        const { isAdmin, error } = await checkAdminAccess()
        if (!isAdmin) {
            return { success: false, error }
        }

        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

        const [
            totalUsers,
            activeUsersThisMonth,
            revenueData,
            monthlyRevenueData,
            activeSubscriptions,
            pendingTransactions,
        ] = await Promise.all([
            // Total users
            prisma.user.count(),

            // Active users this month (users with successful subscription purchases this month)
            prisma.transaction.groupBy({
                by: ["userId"],
                where: {
                    status: "success",
                    createdAt: { gte: startOfMonth },
                },
            }).then((result) => result.length),

            // Total revenue from successful transactions
            prisma.transaction.aggregate({
                where: { status: "success" },
                _sum: { amount: true },
            }),

            // Monthly revenue
            prisma.transaction.aggregate({
                where: {
                    status: "success",
                    createdAt: { gte: startOfMonth },
                },
                _sum: { amount: true },
            }),

            // Currently active subscriptions
            prisma.subscription.count({
                where: {
                    status: "active",
                    OR: [
                        { isLifetime: true },
                        { endDate: { gt: now } },
                    ],
                },
            }),

            // Pending transactions
            prisma.transaction.count({
                where: { status: "pending" },
            }),
        ])

        return {
            success: true,
            stats: {
                totalUsers,
                activeUsersThisMonth,
                totalRevenue: revenueData._sum.amount || 0,
                monthlyRevenue: monthlyRevenueData._sum.amount || 0,
                activeSubscriptions,
                pendingTransactions,
            },
        }
    } catch (error) {
        console.error("Error getting dashboard stats:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

/**
 * Get recent transactions for dashboard
 */
export async function getRecentTransactions(limit: number = 5): Promise<{
    success: boolean
    transactions?: AdminTransaction[]
    error?: string
}> {
    try {
        const { isAdmin, error } = await checkAdminAccess()
        if (!isAdmin) {
            return { success: false, error }
        }

        const transactions = await prisma.transaction.findMany({
            take: limit,
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                orderId: true,
            subscriptionName: true,
                amount: true,
                status: true,
                paymentType: true,
                createdAt: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        })

        return {
            success: true,
            transactions: transactions.map((transaction) => ({
                id: transaction.id,
                orderId: transaction.orderId,
                websiteCode: parsePaymentOrderId(transaction.orderId)?.websiteCode || null,
                plan: transaction.subscriptionName,
                amount: transaction.amount,
                status: transaction.status,
                paymentType: transaction.paymentType,
                createdAt: transaction.createdAt,
                user: transaction.user,
            })),
        }
    } catch (error) {
        console.error("Error getting recent transactions:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

/**
 * Delete all project assets older than 3 days (admin only)
 */
export async function deleteExpiredAssets() {
    const adminCheck = await checkAdminAccess()
    if (!adminCheck.isAdmin) {
        return { success: false, error: "Unauthorized" }
    }

    try {
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)

        // Fetch expired assets first to delete from Cloudinary
        const expiredAssets = await prisma.projectAsset.findMany({
            where: {
                createdAt: { lt: threeDaysAgo },
            },
            select: { id: true, url: true, type: true },
        })

        // Delete from Cloudinary in parallel
        const cloudinaryDeletes = expiredAssets
            .filter(a => a.url.includes("res.cloudinary.com"))
            .map(async (a) => {
                try {
                    const parts = a.url.split("/upload/")
                    if (parts[1]) {
                        const pathAfterUpload = parts[1].replace(/^v\d+\//, "")
                        const publicId = pathAfterUpload.replace(/\.[^.]+$/, "")
                        const resourceType = a.type === "video" ? "video" as const : "image" as const
                        await deleteFromCloudinary(publicId, resourceType)
                    }
                } catch (e) {
                    console.error(`Cloudinary delete failed for asset ${a.id}:`, e)
                }
            })

        await Promise.allSettled(cloudinaryDeletes)

        // Delete from DB
        const result = await prisma.projectAsset.deleteMany({
            where: {
                createdAt: { lt: threeDaysAgo },
            },
        })

        return {
            success: true,
            deletedCount: result.count,
        }
    } catch (error) {
        console.error("Error deleting expired assets:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

/**
 * Get count of expired assets (older than 3 days)
 */
export async function getExpiredAssetsCount() {
    const adminCheck = await checkAdminAccess()
    if (!adminCheck.isAdmin) {
        return { success: false, error: "Unauthorized" }
    }

    try {
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)

        const count = await prisma.projectAsset.count({
            where: {
                createdAt: {
                    lt: threeDaysAgo,
                },
            },
        })

        return { success: true, count }
    } catch (error) {
        console.error("Error counting expired assets:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}
