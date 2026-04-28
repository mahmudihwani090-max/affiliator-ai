"use client"

import { useState, useEffect } from "react"
import { Crown, RefreshCw, AlertCircle } from "lucide-react"
import { getUserSubscriptionStatus } from "@/app/actions/subscription"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { cn } from "@/lib/utils"

type SubscriptionSnapshot = {
    planName: string
    planCode: string
    status: string
    startDate: Date
    endDate: Date | null
    isLifetime: boolean
    isActive: boolean
}

interface SubscriptionDisplayProps {
    compact?: boolean
    className?: string
    showBuyButton?: boolean
}

export function SubscriptionDisplay({
    compact = false,
    className,
    showBuyButton = true
}: SubscriptionDisplayProps) {
    const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchSubscription = async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await getUserSubscriptionStatus()
            if (result.success) {
                setSubscription(result.subscription ?? null)
            } else {
                setError(result.error || "Failed to fetch subscription")
            }
        } catch (err) {
            setError("Failed to fetch subscription")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchSubscription()

        const interval = setInterval(fetchSubscription, 30000)
        return () => clearInterval(interval)
    }, [])

    const subscriptionLabel = subscription?.isActive
        ? subscription.planName
        : "Belum aktif"

    const subscriptionMeta = subscription?.isActive
        ? (subscription.endDate
            ? `Aktif sampai ${new Date(subscription.endDate).toLocaleDateString("id-ID")}`
            : "Aktif")
        : "Pilih plan untuk mulai generate"

    if (compact) {
        return (
            <Link
                href="/dashboard/subscription"
                className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent transition-colors",
                    className
                )}
            >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-amber-500/20 to-yellow-500/20">
                    <Crown className="w-4 h-4 text-amber-500" />
                </div>
                <div className="flex flex-col group-data-[collapsible=icon]:hidden">
                    <span className="text-xs text-muted-foreground">Subscription</span>
                    {loading ? (
                        <span className="text-sm font-medium animate-pulse">...</span>
                    ) : error ? (
                        <span className="text-sm text-destructive">Error</span>
                    ) : (
                        <span className="text-sm font-semibold">{subscriptionLabel}</span>
                    )}
                </div>
            </Link>
        )
    }

    return (
        <div className={cn(
            "flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-yellow-500/10 border border-amber-500/20",
            className
        )}>
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-amber-500/20 to-yellow-500/20">
                <Crown className="w-6 h-6 text-amber-500" />
            </div>

            <div className="flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Status Subscription</span>
                    <button
                        onClick={fetchSubscription}
                        disabled={loading}
                        className="p-1 hover:bg-accent rounded transition-colors"
                    >
                        <RefreshCw className={cn(
                            "w-3 h-3 text-muted-foreground",
                            loading && "animate-spin"
                        )} />
                    </button>
                </div>

                {error ? (
                    <div className="flex items-center gap-1 text-destructive">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm">{error}</span>
                    </div>
                ) : (
                    <div>
                        <p className="text-2xl font-bold">{loading ? "..." : subscriptionLabel}</p>
                        <p className="text-sm text-muted-foreground mt-1">{subscriptionMeta}</p>
                    </div>
                )}
            </div>

            {showBuyButton && (
                <Link href="/dashboard/subscription">
                    <Button size="sm" variant="default" className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white">
                        Pilih Plan
                    </Button>
                </Link>
            )}
        </div>
    )
}

export function useSubscription() {
    const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const refresh = async () => {
        setLoading(true)
        try {
            const result = await getUserSubscriptionStatus()
            if (result.success) {
                setSubscription(result.subscription ?? null)
                setError(null)
            } else {
                setError(result.error || "Failed to fetch subscription")
            }
        } catch (err) {
            setError("Failed to fetch subscription")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        refresh()
    }, [])

    return { subscription, loading, error, refresh }
}
