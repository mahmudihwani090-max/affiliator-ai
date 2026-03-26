import { auth } from "@/lib/auth"
import { checkSubscriptionStatus } from "@/lib/subscription"
import { type CreditOperationType } from "@/lib/credit-packages"

export type GenerationAccessOperation = CreditOperationType

export function getSubscriptionAccessErrorMessage(result: { error?: string }) {
    return result.error || "Subscription tidak aktif. Silakan berlangganan untuk menggunakan fitur generate."
}

async function buildAccessResult(userId: string) {
    const { subscription, isActive } = await checkSubscriptionStatus(userId)

    return {
        success: true,
        hasAccess: isActive,
        required: 1,
        available: isActive ? 1 : 0,
        subscription,
        ...(isActive
            ? {}
            : { error: "Subscription tidak aktif. Silakan berlangganan untuk menggunakan fitur generate." }),
    }
}

export async function checkGenerationAccess(operation: GenerationAccessOperation) {
    void operation

    const session = await auth()
    if (!session?.user?.id) {
        return {
            success: false,
            hasAccess: false,
            error: "Unauthorized",
        }
    }

    return buildAccessResult(session.user.id)
}

export async function checkGenerationAccessByUserId(userId: string, operation: GenerationAccessOperation) {
    void operation

    return buildAccessResult(userId)
}

export async function consumeGenerationAccess(operation: GenerationAccessOperation, description: string) {
    void operation
    void description

    return { success: true }
}

export async function consumeGenerationAccessByUserId(
    userId: string,
    operation: GenerationAccessOperation,
    description: string
) {
    void userId
    void operation
    void description

    return { success: true }
}