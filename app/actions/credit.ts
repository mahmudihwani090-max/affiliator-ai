"use server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { listPublicSubscriptionPlans, checkSubscriptionStatus } from "@/lib/subscription"
import { type CreditOperationType } from "@/lib/credit-packages"

export type CreditHistoryType = "purchase" | "usage" | "refund" | "bonus" | "admin"

type SubscriptionSnapshot = {
    planName: string
    planCode: string
    status: string
    startDate: Date
    endDate: Date | null
    isLifetime: boolean
    isActive: boolean
}

function buildSubscriptionSnapshot(
    subscription:
        | {
            status: string
            startDate: Date
            endDate: Date | null
            isLifetime: boolean
            plan: {
                code: string
                name: string
            }
        }
        | null
): SubscriptionSnapshot | undefined {
    if (!subscription) {
        return undefined
    }

    return {
        planName: subscription.plan.name,
        planCode: subscription.plan.code,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        isLifetime: subscription.isLifetime,
        isActive:
            subscription.status === "active" &&
            (subscription.isLifetime || Boolean(subscription.endDate && subscription.endDate > new Date())),
    }
}

async function getAccessStatusByUserId(userId: string) {
    const { subscription, isActive } = await checkSubscriptionStatus(userId)

    return {
        isActive,
        subscription: buildSubscriptionSnapshot(subscription),
    }
}

async function getSubscriptionHistoryByUserId(userId: string, limit: number) {
    const history = await prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
            id: true,
            amount: true,
            status: true,
            paymentType: true,
            subscriptionName: true,
            subscriptionCode: true,
            createdAt: true,
        },
    })

    return history.map((item) => ({
        id: item.id,
        amount: item.amount,
        status: item.status,
        description: item.subscriptionName,
        planCode: item.subscriptionCode,
        createdAt: item.createdAt,
        paymentType: item.paymentType,
    }))
}

export async function getUserCredits(): Promise<{
    success: boolean
    credits?: number
    subscription?: SubscriptionSnapshot
    error?: string
}> {
    try {
        const session = await auth()

        if (!session?.user?.id) {
            return { success: false, error: "Unauthorized" }
        }

        const access = await getAccessStatusByUserId(session.user.id)

        return {
            success: true,
            credits: access.isActive ? 1 : 0,
            subscription: access.subscription,
        }
    } catch (error) {
        console.error("Error getting credits:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function checkSufficientCredits(
    _operation: CreditOperationType
): Promise<{
    success: boolean
    hasCredits?: boolean
    required?: number
    available?: number
    subscription?: SubscriptionSnapshot
    error?: string
}> {
    try {
        const session = await auth()

        if (!session?.user?.id) {
            return { success: false, error: "Unauthorized" }
        }

        const access = await getAccessStatusByUserId(session.user.id)

        return {
            success: true,
            hasCredits: access.isActive,
            required: 1,
            available: access.isActive ? 1 : 0,
            subscription: access.subscription,
            ...(access.isActive
                ? {}
                : { error: "Subscription tidak aktif. Silakan berlangganan untuk menggunakan fitur generate." }),
        }
    } catch (error) {
        console.error("Error checking credits:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function deductCredits(
    operation: CreditOperationType,
    _description: string
): Promise<{
    success: boolean
    remainingCredits?: number
    error?: string
}> {
    try {
        const access = await checkSufficientCredits(operation)
        if (!access.success) {
            return { success: false, error: access.error }
        }

        if (!access.hasCredits) {
            return {
                success: false,
                error: access.error || "Subscription tidak aktif",
            }
        }

        return { success: true }
    } catch (error) {
        console.error("Error deducting credits:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function addCredits(
    _amount: number,
    _type: CreditHistoryType,
    _description: string,
    _userId?: string
): Promise<{
    success: boolean
    newBalance?: number
    error?: string
}> {
    return {
        success: false,
        error: "Sistem kredit sudah dinonaktifkan. Gunakan subscription plan.",
    }
}

export async function getCreditHistory(limit: number = 20): Promise<{
    success: boolean
    history?: Array<{
        id: string
        amount: number
        type: string
        description: string
        balanceAfter: number
        createdAt: Date
    }>
    error?: string
}> {
    try {
        const subscriptionHistory = await getSubscriptionHistory(limit)

        if (!subscriptionHistory.success) {
            return {
                success: false,
                error: subscriptionHistory.error,
            }
        }

        return {
            success: true,
            history: (subscriptionHistory.history || []).map((item) => ({
                id: item.id,
                amount: item.amount,
                type: item.status,
                description: item.description,
                balanceAfter: 0,
                createdAt: item.createdAt,
            })),
        }
    } catch (error) {
        console.error("Error getting credit history:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function getSubscriptionPlans(): Promise<{
    success: boolean
    plans?: Array<{
        code: string
        name: string
        description: string | null
        price: number
        durationDays: number | null
        isLifetime: boolean
        isActive: boolean
        isAvailable: boolean
        limit: number | null
        claimedSlots: number | null
        remainingSlots: number | null
        availabilityNote: string | null
    }>
    error?: string
}> {
    try {
        const plans = await listPublicSubscriptionPlans()

        return {
            success: true,
            plans: plans.map((plan) => ({
                code: plan.code,
                name: plan.name,
                description: plan.description ?? null,
                price: plan.price,
                durationDays: plan.durationDays ?? null,
                isLifetime: plan.isLifetime,
                isActive: plan.isActive,
                isAvailable: plan.isAvailable,
                limit: plan.limit,
                claimedSlots: plan.claimedSlots,
                remainingSlots: plan.remainingSlots,
                availabilityNote: plan.availabilityNote,
            })),
        }
    } catch (error) {
        console.error("Error getting subscription plans:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function getUserSubscriptionStatus(): Promise<{
    success: boolean
    subscription?: SubscriptionSnapshot
    error?: string
}> {
    try {
        const session = await auth()

        if (!session?.user?.id) {
            return { success: false, error: "Unauthorized" }
        }

        const access = await getAccessStatusByUserId(session.user.id)

        return {
            success: true,
            subscription: access.subscription,
        }
    } catch (error) {
        console.error("Error getting user subscription:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function getSubscriptionHistory(limit: number = 20): Promise<{
    success: boolean
    history?: Array<{
        id: string
        amount: number
        status: string
        description: string
        planCode: string
        createdAt: Date
        paymentType: string | null
    }>
    error?: string
}> {
    try {
        const session = await auth()

        if (!session?.user?.id) {
            return { success: false, error: "Unauthorized" }
        }

        const history = await getSubscriptionHistoryByUserId(session.user.id, limit)

        return {
            success: true,
            history,
        }
    } catch (error) {
        console.error("Error getting subscription history:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function checkSufficientCreditsByUserId(
    userId: string,
    _operation: CreditOperationType
): Promise<{
    success: boolean
    hasCredits?: boolean
    required?: number
    available?: number
    subscription?: SubscriptionSnapshot
    error?: string
}> {
    try {
        const access = await getAccessStatusByUserId(userId)

        return {
            success: true,
            hasCredits: access.isActive,
            required: 1,
            available: access.isActive ? 1 : 0,
            subscription: access.subscription,
            ...(access.isActive
                ? {}
                : { error: "Subscription tidak aktif. Silakan berlangganan untuk menggunakan fitur generate." }),
        }
    } catch (error) {
        console.error("Error checking credits:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function deductCreditsByUserId(
    userId: string,
    operation: CreditOperationType,
    _description: string
): Promise<{
    success: boolean
    remainingCredits?: number
    error?: string
}> {
    try {
        const access = await checkSufficientCreditsByUserId(userId, operation)
        if (!access.success) {
            return { success: false, error: access.error }
        }

        if (!access.hasCredits) {
            return {
                success: false,
                error: access.error || "Subscription tidak aktif",
            }
        }

        return { success: true }
    } catch (error) {
        console.error("Error deducting credits:", error)
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}