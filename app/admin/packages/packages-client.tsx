"use client"

import { useState } from "react"

import { saveSubscriptionPlan, type AdminSubscriptionPlan } from "@/app/actions/admin"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatPrice } from "@/lib/subscription"
import { FileImage, FileVideo, ImageIcon, Package, Save, Video, Zap } from "lucide-react"
import { toast } from "sonner"

type EditablePlan = {
    id: string
    code: string
    name: string
    description: string
    price: string
    durationDays: string
    isLifetime: boolean
    isActive: boolean
}

function toEditablePlan(plan: AdminSubscriptionPlan): EditablePlan {
    return {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description ?? "",
        price: plan.price.toString(),
        durationDays: plan.durationDays?.toString() ?? "",
        isLifetime: plan.isLifetime,
        isActive: plan.isActive,
    }
}

export function AdminPackagesClient({ initialPlans }: { initialPlans: AdminSubscriptionPlan[] }) {
    const [plans, setPlans] = useState<EditablePlan[]>(initialPlans.map(toEditablePlan))
    const [savingCode, setSavingCode] = useState<string | null>(null)

    function updatePlan(code: string, updater: (plan: EditablePlan) => EditablePlan) {
        setPlans((currentPlans) =>
            currentPlans.map((plan) => (plan.code === code ? updater(plan) : plan))
        )
    }

    async function handleSave(plan: EditablePlan) {
        const price = Number.parseInt(plan.price, 10)
        const durationDays = plan.durationDays ? Number.parseInt(plan.durationDays, 10) : null

        if (!Number.isInteger(price) || price < 0) {
            toast.error("Harga plan harus berupa angka bulat >= 0")
            return
        }

        if (!plan.isLifetime && (!Number.isInteger(durationDays) || (durationDays ?? 0) <= 0)) {
            toast.error("Durasi plan non-lifetime harus lebih dari 0 hari")
            return
        }

        setSavingCode(plan.code)

        const result = await saveSubscriptionPlan({
            code: plan.code,
            name: plan.name,
            description: plan.description,
            price,
            durationDays: plan.isLifetime ? null : durationDays,
            isLifetime: plan.isLifetime,
            isActive: plan.isActive,
        })

        if (result.success && result.plan) {
            setPlans((currentPlans) =>
                currentPlans.map((currentPlan) =>
                    currentPlan.code === plan.code ? toEditablePlan(result.plan as AdminSubscriptionPlan) : currentPlan
                )
            )
            toast.success(`Plan ${plan.name} berhasil diperbarui`)
        } else {
            toast.error(result.error || "Failed to update subscription plan")
        }

        setSavingCode(null)
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Package Configuration</h1>
                <p className="text-muted-foreground">
                    Data plan di halaman ini sekarang membaca dan mengubah tabel subscription_plans
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        Subscription Plans
                    </CardTitle>
                    <CardDescription>
                        Admin dapat mengubah nama, harga, durasi, dan status plan langsung dari database
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 xl:grid-cols-3">
                        {plans.map((plan) => (
                            <div key={plan.code} className="space-y-4 rounded-lg border p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-lg font-semibold">{plan.name || plan.code}</h3>
                                        <p className="text-sm text-muted-foreground">Code: {plan.code}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        {plan.code === "monthly-30-days" && (
                                            <Badge className="bg-gradient-to-r from-orange-500 to-red-500">
                                                Popular
                                            </Badge>
                                        )}
                                        <Badge variant={plan.isActive ? "default" : "secondary"}>
                                            {plan.isActive ? "Active" : "Inactive"}
                                        </Badge>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor={`${plan.code}-name`}>Nama</Label>
                                    <Input
                                        id={`${plan.code}-name`}
                                        value={plan.name}
                                        onChange={(event) =>
                                            updatePlan(plan.code, (currentPlan) => ({
                                                ...currentPlan,
                                                name: event.target.value,
                                            }))
                                        }
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor={`${plan.code}-description`}>Deskripsi</Label>
                                    <Textarea
                                        id={`${plan.code}-description`}
                                        value={plan.description}
                                        onChange={(event) =>
                                            updatePlan(plan.code, (currentPlan) => ({
                                                ...currentPlan,
                                                description: event.target.value,
                                            }))
                                        }
                                    />
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor={`${plan.code}-price`}>Harga</Label>
                                        <Input
                                            id={`${plan.code}-price`}
                                            type="number"
                                            min="0"
                                            value={plan.price}
                                            onChange={(event) =>
                                                updatePlan(plan.code, (currentPlan) => ({
                                                    ...currentPlan,
                                                    price: event.target.value,
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor={`${plan.code}-duration`}>Durasi (hari)</Label>
                                        <Input
                                            id={`${plan.code}-duration`}
                                            type="number"
                                            min="1"
                                            disabled={plan.isLifetime}
                                            value={plan.isLifetime ? "" : plan.durationDays}
                                            onChange={(event) =>
                                                updatePlan(plan.code, (currentPlan) => ({
                                                    ...currentPlan,
                                                    durationDays: event.target.value,
                                                }))
                                            }
                                        />
                                    </div>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>Tipe plan</Label>
                                        <Select
                                            value={plan.isLifetime ? "lifetime" : "duration"}
                                            onValueChange={(value) =>
                                                updatePlan(plan.code, (currentPlan) => ({
                                                    ...currentPlan,
                                                    isLifetime: value === "lifetime",
                                                    durationDays:
                                                        value === "lifetime"
                                                            ? ""
                                                            : currentPlan.durationDays || "30",
                                                }))
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="duration">Berdurasi</SelectItem>
                                                <SelectItem value="lifetime">Lifetime</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Status</Label>
                                        <Select
                                            value={plan.isActive ? "active" : "inactive"}
                                            onValueChange={(value) =>
                                                updatePlan(plan.code, (currentPlan) => ({
                                                    ...currentPlan,
                                                    isActive: value === "active",
                                                }))
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="active">Active</SelectItem>
                                                <SelectItem value="inactive">Inactive</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                                    Harga tampil: <span className="font-medium text-foreground">{formatPrice(Number.parseInt(plan.price || "0", 10) || 0)}</span>
                                    <div>
                                        Akses: {plan.isLifetime ? "Tanpa masa berlaku" : `${plan.durationDays || 0} hari akses penuh`}
                                    </div>
                                </div>

                                <Button
                                    className="w-full"
                                    onClick={() => handleSave(plan)}
                                    disabled={savingCode === plan.code}
                                >
                                    <Save className="h-4 w-4" />
                                    {savingCode === plan.code ? "Menyimpan..." : "Simpan ke database"}
                                </Button>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Zap className="h-5 w-5" />
                        Included Features
                    </CardTitle>
                    <CardDescription>
                        Semua fitur ini terbuka selama subscription aktif
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <div className="flex items-center gap-3 rounded-lg border p-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
                                <ImageIcon className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <p className="font-medium">Text to Image</p>
                                <p className="text-sm text-muted-foreground">Included</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 rounded-lg border p-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
                                <FileImage className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <p className="font-medium">Image to Image</p>
                                <p className="text-sm text-muted-foreground">Included</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 rounded-lg border p-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-500">
                                <Video className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <p className="font-medium">Text to Video</p>
                                <p className="text-sm text-muted-foreground">Included</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 rounded-lg border p-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-emerald-500">
                                <FileVideo className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <p className="font-medium">Image to Video</p>
                                <p className="text-sm text-muted-foreground">Included</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Default Seed Catalog</CardTitle>
                    <CardDescription>
                        Jika tabel subscription_plans kosong, aplikasi memakai katalog default bersama untuk runtime dan seed
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>
                        Seed default sekarang menggunakan file prisma/subscription-plans.json supaya tidak drift dengan fallback runtime.
                    </p>
                    <p>
                        Setelah database terisi, perubahan dari halaman ini akan menjadi sumber data utama untuk halaman subscription user.
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
