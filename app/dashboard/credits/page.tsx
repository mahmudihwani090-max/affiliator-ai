"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Coins,
    Check,
    Sparkles,
    Zap,
    Crown,
    History,
    Loader2,
    ImageIcon,
    Video,
    Infinity,
    Shield,
} from "lucide-react"
import { CreditDisplay } from "@/components/credit-display"
import { formatPrice } from "@/lib/credit-packages"
import { getSubscriptionHistory, getSubscriptionPlans } from "@/app/actions/credit"
import { toast } from "sonner"
import { useSearchParams } from "next/navigation"

interface SubscriptionPlanItem {
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
}

const packageIcons = {
    "weekly-7-days": Zap,
    "monthly-30-days": Sparkles,
    lifetime: Crown,
}

const packageColors = {
    "weekly-7-days": "from-blue-500 to-cyan-500",
    "monthly-30-days": "from-purple-500 to-pink-500",
    lifetime: "from-amber-500 to-orange-500",
}

interface SubscriptionHistoryItem {
    id: string
    amount: number
    status: string
    description: string
    planCode: string
    paymentType: string | null
    createdAt: Date
}

export default function CreditsPage() {
    const searchParams = useSearchParams()
    const planFromUrl = searchParams.get("plan")
    const autoPurchaseTriggered = useRef(false)
    const [selectedPackage, setSelectedPackage] = useState<string | null>(null)
    const [isPurchasing, setIsPurchasing] = useState(false)
    const [plans, setPlans] = useState<SubscriptionPlanItem[]>([])
    const [plansLoading, setPlansLoading] = useState(true)
    const [history, setHistory] = useState<SubscriptionHistoryItem[]>([])
    const [historyLoading, setHistoryLoading] = useState(true)

    useEffect(() => {
        loadPlans()
        loadHistory()
    }, [])

    useEffect(() => {
        if (planFromUrl && plans.length > 0 && !autoPurchaseTriggered.current) {
            const matchedPlan = plans.find((p) => p.code === planFromUrl && p.isAvailable)
            if (matchedPlan) {
                autoPurchaseTriggered.current = true
                handlePurchase(matchedPlan.code)
            }
        }
    }, [planFromUrl, plans])

    const loadPlans = async () => {
        setPlansLoading(true)
        try {
            const result = await getSubscriptionPlans()
            if (result.success && result.plans) {
                setPlans(result.plans)
            }
        } catch (error) {
            console.error("Failed to load plans:", error)
        } finally {
            setPlansLoading(false)
        }
    }

    const loadHistory = async () => {
        setHistoryLoading(true)
        try {
            const result = await getSubscriptionHistory(20)
            if (result.success && result.history) {
                setHistory(result.history.map(h => ({
                    ...h,
                    createdAt: new Date(h.createdAt)
                })))
            }
        } catch (error) {
            console.error("Failed to load history:", error)
        } finally {
            setHistoryLoading(false)
        }
    }

    const handlePurchase = async (packageId: string) => {
        setIsPurchasing(true)
        setSelectedPackage(packageId)

        try {
            const originSite = window.location.origin
            const websiteCode = (process.env.NEXT_PUBLIC_WEBSITE_CODE || window.location.hostname).toLowerCase()

            const response = await fetch("/api/payment/create", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    planCode: packageId,
                    websiteCode,
                    originSite,
                }),
            })

            const result = await response.json()
            if (!response.ok) {
                throw new Error(result.error || "Gagal membuat transaksi")
            }

            if (result.redirect_url) {
                window.location.href = result.redirect_url
                return
            }

            toast.success("Transaksi berhasil dibuat")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Gagal memproses pembelian")
        } finally {
            setIsPurchasing(false)
            setSelectedPackage(null)
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case "success": return "text-green-500"
            case "pending": return "text-amber-500"
            case "failed": return "text-red-500"
            default: return "text-muted-foreground"
        }
    }

    return (
        <div className="container mx-auto py-6 px-4 space-y-8">
            <div className="flex flex-col gap-4">
                <h1 className="text-3xl font-bold">Subscription</h1>
                <p className="text-muted-foreground">
                    Pilih paket langganan untuk membuka semua fitur AI generator tanpa sistem kredit
                </p>
            </div>

            <CreditDisplay showBuyButton={false} />

            <Tabs defaultValue="packages" className="w-full">
                <TabsList className="grid w-full grid-cols-3 lg:w-[420px]">
                    <TabsTrigger value="packages">Paket Subscription</TabsTrigger>
                    <TabsTrigger value="pricing">Benefit</TabsTrigger>
                    <TabsTrigger value="history">Riwayat</TabsTrigger>
                </TabsList>

                <TabsContent value="packages" className="mt-6">
                    {plansLoading ? (
                        <div className="flex items-center justify-center py-16 text-muted-foreground">
                            <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {plans.map((plan) => {
                                const Icon = packageIcons[plan.code as keyof typeof packageIcons] || Coins
                                const colorClass = packageColors[plan.code as keyof typeof packageColors] || "from-slate-500 to-slate-700"
                                const isPopular = plan.code === "monthly-30-days"

                                return (
                                    <Card
                                        key={plan.code}
                                        className={`relative overflow-hidden transition-all hover:shadow-lg ${isPopular ? 'ring-2 ring-purple-500' : ''}`}
                                    >
                                        {isPopular && (
                                            <div className="absolute top-0 right-0">
                                                <Badge className="rounded-none rounded-bl-lg bg-purple-500">
                                                    Populer
                                                </Badge>
                                            </div>
                                        )}

                                        <CardHeader>
                                            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colorClass} flex items-center justify-center mb-4`}>
                                                <Icon className="w-6 h-6 text-white" />
                                            </div>
                                            <CardTitle className="text-xl">{plan.name}</CardTitle>
                                            <CardDescription>{plan.description}</CardDescription>
                                        </CardHeader>

                                        <CardContent className="space-y-4">
                                            <div>
                                                <span className="text-3xl font-bold">{formatPrice(plan.price)}</span>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <Check className="w-4 h-4 text-green-500" />
                                                    <span>Akses semua generator AI</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Check className="w-4 h-4 text-green-500" />
                                                    <span>{plan.isLifetime ? "Tanpa masa berlaku" : `${plan.durationDays} hari akses penuh`}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Check className="w-4 h-4 text-green-500" />
                                                    <span>Generate tanpa potong kredit per request</span>
                                                </div>
                                                {plan.availabilityNote ? (
                                                    <div className="flex items-center gap-2">
                                                        <Check className={`w-4 h-4 ${plan.isAvailable ? 'text-green-500' : 'text-red-500'}`} />
                                                        <span>{plan.availabilityNote}</span>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </CardContent>

                                        <CardFooter>
                                            <Button
                                                className={`w-full bg-gradient-to-r ${colorClass} hover:opacity-90`}
                                                onClick={() => handlePurchase(plan.code)}
                                                disabled={isPurchasing || !plan.isActive || !plan.isAvailable}
                                            >
                                                {isPurchasing && selectedPackage === plan.code ? (
                                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                ) : (
                                                    <Coins className="w-4 h-4 mr-2" />
                                                )}
                                                {plan.isAvailable ? 'Pilih Paket' : 'Kuota Habis'}
                                            </Button>
                                        </CardFooter>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="pricing" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Semua Fitur Termasuk</CardTitle>
                            <CardDescription>
                                Begitu subscription aktif, semua operasi AI di bawah ini bisa dipakai tanpa pemotongan kredit per request
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                            <ImageIcon className="w-5 h-5 text-purple-500" />
                                        </div>
                                        <div>
                                            <p className="font-medium">Text to Image</p>
                                            <p className="text-sm text-muted-foreground">Generate gambar dari teks</p>
                                        </div>
                                    </div>
                                    <Badge variant="secondary" className="text-lg">Included</Badge>
                                </div>

                                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center">
                                            <ImageIcon className="w-5 h-5 text-pink-500" />
                                        </div>
                                        <div>
                                            <p className="font-medium">Image to Image</p>
                                            <p className="text-sm text-muted-foreground">Edit gambar dengan AI</p>
                                        </div>
                                    </div>
                                    <Badge variant="secondary" className="text-lg">Included</Badge>
                                </div>

                                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                            <Video className="w-5 h-5 text-blue-500" />
                                        </div>
                                        <div>
                                            <p className="font-medium">Text to Video</p>
                                            <p className="text-sm text-muted-foreground">Generate video dari teks</p>
                                        </div>
                                    </div>
                                    <Badge variant="secondary" className="text-lg">Included</Badge>
                                </div>

                                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                                            <Video className="w-5 h-5 text-cyan-500" />
                                        </div>
                                        <div>
                                            <p className="font-medium">Image to Video</p>
                                            <p className="text-sm text-muted-foreground">Animasi dari gambar</p>
                                        </div>
                                    </div>
                                    <Badge variant="secondary" className="text-lg">Included</Badge>
                                </div>

                                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                            <Shield className="w-5 h-5 text-emerald-500" />
                                        </div>
                                        <div>
                                            <p className="font-medium">Upscale & Extend</p>
                                            <p className="text-sm text-muted-foreground">Upcale image/video dan extend video</p>
                                        </div>
                                    </div>
                                    <Badge variant="secondary" className="text-lg">Included</Badge>
                                </div>

                                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                                            <Infinity className="w-5 h-5 text-amber-500" />
                                        </div>
                                        <div>
                                            <p className="font-medium">Lifetime Option</p>
                                            <p className="text-sm text-muted-foreground">Akses permanen untuk penggunaan jangka panjang</p>
                                        </div>
                                    </div>
                                    <Badge variant="secondary" className="text-lg">Available</Badge>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="history" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <History className="w-5 h-5" />
                                Riwayat Transaksi
                            </CardTitle>
                            <CardDescription>
                                20 pembelian subscription terakhir
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {historyLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : history.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    Belum ada riwayat transaksi
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {history.map((item) => (
                                        <div
                                            key={item.id}
                                            className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-amber-500/20">
                                                    <Coins className="w-4 h-4 text-amber-500" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-sm">{item.description}</p>
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                        <Badge variant="outline" className={getStatusColor(item.status)}>
                                                            {item.status}
                                                        </Badge>
                                                        <span>•</span>
                                                        <span>{item.planCode}</span>
                                                        <span>•</span>
                                                        <span>{item.createdAt.toLocaleDateString('id-ID')}</span>
                                                        <span>{item.createdAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold">{formatPrice(item.amount)}</p>
                                                <p className="text-xs text-muted-foreground">{item.paymentType || "Menunggu pembayaran"}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
