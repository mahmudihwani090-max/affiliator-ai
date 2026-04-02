"use client"

import Image from "next/image"
import { useRef, useState, type ReactNode } from "react"

import { checkImageJobStatus, generateImageToImage } from "@/app/actions/generate-image"
import { checkVideoJobStatus, generateImageToVideo } from "@/app/actions/generate-video"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { buildAutoScenePrompts, type AutoSceneFormConfig, type AutoSceneSceneCount } from "@/lib/auto-scene"
import { toUserFacingGenerationError } from "@/lib/generation-errors"
import {
    CircleDot,
    Download,
    Image as ImageIcon,
    ImagePlus,
    Loader2,
    MessageSquare,
    Play,
    Sparkles,
    Video,
    X,
} from "lucide-react"
import { toast } from "sonner"

type AspectRatio = "landscape" | "portrait"

type AutoSceneFrame = {
    id: string
    title: string
    prompt: string
    imageUrl?: string
    videoUrl?: string
    status: "queued" | "generating" | "completed" | "failed"
    videoStatus?: "idle" | "generating" | "completed" | "failed"
    error?: string
    videoError?: string
}

const productCategories = [
    "Beauty / Skincare",
    "Fashion / Apparel",
    "Food / Beverage",
    "Supplements",
    "Home Living",
    "Electronics",
    "Mom & Baby",
    "Health / Wellness",
]

const aspectRatioOptions: Array<{ value: AspectRatio; label: string }> = [
    { value: "portrait", label: "9:16 (Tiktok/Reels)" },
    { value: "landscape", label: "16:9 (YouTube/Landing)" },
]

const cameraStyleOptions = [
    "Cinematic",
    "Commercial Clean",
    "Luxury Editorial",
    "Dynamic Handheld",
    "Studio Beauty",
]

const productPositionOptions = [
    "Digunakan (Applied/Used)",
    "Hero Packshot",
    "Dipegang Model",
    "Flat Lay Styling",
    "Close-Up Texture",
]

const backgroundOptions = [
    "Auto (Sesuai Konteks)",
    "Studio Minimal",
    "Bathroom / Vanity",
    "Lifestyle Home",
    "Nature Fresh",
    "Luxury Marble Set",
]

const languageOptions = ["Indonesian", "English", "Bilingual"]

const languageStyleOptions = [
    "Casual/TikTok",
    "Soft Selling",
    "Premium Persuasive",
    "Educative",
    "Hard Selling",
]

const toneOptions = [
    "Energetic",
    "Warm",
    "Trustworthy",
    "Elegant",
    "Playful",
]

const sceneCountOptions: Array<{ value: AutoSceneSceneCount; label: string }> = [
    { value: 3, label: "3 Scene" },
    { value: 4, label: "4 Scene" },
    { value: 5, label: "5 Scene" },
    { value: 6, label: "6 Scene" },
]

const hookOptions = [
    "Problem-Agitation (Masalah)",
    "Direct Benefit",
    "Transformation / Before-After",
    "Curiosity Hook",
    "Social Proof Hook",
]

const ctaOptions = [
    "Click Link in Bio",
    "Order Sekarang",
    "DM untuk Konsultasi",
    "Coba Sekarang",
    "Checkout Hari Ini",
]

const defaultConfig: AutoSceneFormConfig = {
    productCategory: "Beauty / Skincare",
    targetAudience: "",
    productDetails: "",
    aspectRatio: "portrait",
    cameraStyle: "Cinematic",
    productPosition: "Digunakan (Applied/Used)",
    backgroundStyle: "Auto (Sesuai Konteks)",
    language: "Indonesian",
    languageStyle: "Casual/TikTok",
    tone: "Energetic",
    sceneCount: 3,
    hook: "Problem-Agitation (Masalah)",
    callToAction: "Click Link in Bio",
}

function mapAspectRatio(value: AspectRatio) {
    return value === "portrait" ? "portrait" : "landscape"
}

function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (event) => {
            if (typeof event.target?.result === "string") {
                resolve(event.target.result)
                return
            }

            reject(new Error("Gagal membaca file"))
        }
        reader.onerror = () => reject(new Error("Gagal membaca file"))
        reader.readAsDataURL(file)
    })
}

function ConfigSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
    return (
        <Card className="rounded-[2rem] border-gray-200 bg-white py-0 text-foreground shadow-lg dark:border-white/8 dark:bg-[#111111] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="space-y-6 p-5 md:p-6">
                <div className="flex items-center gap-3">
                    <div className="text-emerald-500 dark:text-emerald-400">{icon}</div>
                    <h2 className="text-lg font-black uppercase tracking-[0.08em] md:text-xl">{title}</h2>
                </div>
                {children}
            </div>
        </Card>
    )
}

function FieldLabel({ children }: { children: ReactNode }) {
    return <label className="mb-2 block text-sm font-semibold text-zinc-600 dark:text-zinc-400">{children}</label>
}

function DarkInput({ className, ...props }: React.ComponentProps<typeof Input>) {
    return (
        <Input
            {...props}
            className={`h-14 rounded-2xl border-gray-300 bg-gray-50 px-4 text-base text-foreground placeholder:text-zinc-400 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30 dark:border-white/10 dark:bg-[#090909] dark:placeholder:text-zinc-500 ${className ?? ""}`}
        />
    )
}

function DarkTextarea({ className, ...props }: React.ComponentProps<typeof Textarea>) {
    return (
        <Textarea
            {...props}
            className={`min-h-[140px] rounded-2xl border-gray-300 bg-gray-50 px-4 py-4 text-base text-foreground placeholder:text-zinc-400 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30 dark:border-white/10 dark:bg-[#090909] dark:placeholder:text-zinc-500 ${className ?? ""}`}
        />
    )
}

function DarkSelect({
    value,
    onValueChange,
    options,
}: {
    value: string
    onValueChange: (value: string) => void
    options: string[]
}) {
    return (
        <Select value={value} onValueChange={onValueChange}>
            <SelectTrigger className="h-14 w-full rounded-2xl border-gray-300 bg-gray-50 px-4 text-base text-foreground data-[placeholder]:text-zinc-500 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30 dark:border-white/10 dark:bg-[#090909]">
                <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-gray-200 bg-white text-foreground dark:border-white/10 dark:bg-[#111111]">
                {options.map((option) => (
                    <SelectItem key={option} value={option} className="text-sm text-foreground focus:bg-gray-100 dark:focus:bg-white/10">
                        {option}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

function UploadBox({
    title,
    description,
    icon,
    onClick,
    disabled,
    children,
}: {
    title: string
    description: string
    icon: ReactNode
    onClick: () => void
    disabled?: boolean
    children?: ReactNode
}) {
    return (
        <div className="space-y-3">
            <FieldLabel>{title}</FieldLabel>
            <button
                type="button"
                onClick={onClick}
                disabled={disabled}
                className="flex min-h-[160px] w-full flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center transition hover:border-emerald-400/50 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/12 dark:bg-[#0b0b0b] dark:hover:bg-[#101010]"
            >
                <div className="mb-4 text-zinc-500">{icon}</div>
                <p className="text-lg font-medium text-zinc-500 dark:text-zinc-400 md:text-xl">{description}</p>
            </button>
            {children}
        </div>
    )
}

export default function AutoScenePage() {
    const [config, setConfig] = useState<AutoSceneFormConfig>(defaultConfig)
    const [productImages, setProductImages] = useState<string[]>([])
    const [modelImage, setModelImage] = useState<string | null>(null)
    const [backgroundImage, setBackgroundImage] = useState<string | null>(null)
    const [sceneFrames, setSceneFrames] = useState<AutoSceneFrame[]>([])
    const [isGenerating, setIsGenerating] = useState(false)

    const productInputRef = useRef<HTMLInputElement>(null)
    const modelInputRef = useRef<HTMLInputElement>(null)
    const backgroundInputRef = useRef<HTMLInputElement>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const updateConfig = <K extends keyof AutoSceneFormConfig>(key: K, value: AutoSceneFormConfig[K]) => {
        setConfig((current) => ({ ...current, [key]: value }))
    }

    const handleProductUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? [])
        if (!files.length) {
            return
        }

        if (productImages.length >= 5) {
            toast.error("Maksimal 5 foto produk")
            return
        }

        const availableSlots = 5 - productImages.length
        const selectedFiles = files.slice(0, availableSlots)

        try {
            const uploadedImages = await Promise.all(
                selectedFiles.map(async (file) => {
                    if (!file.type.startsWith("image/")) {
                        throw new Error("Semua file harus berupa gambar")
                    }

                    if (file.size > 10 * 1024 * 1024) {
                        throw new Error("Ukuran gambar maksimal 10MB")
                    }

                    return readFileAsDataUrl(file)
                })
            )

            setProductImages((current) => [...current, ...uploadedImages].slice(0, 5))
            toast.success(`${uploadedImages.length} foto produk ditambahkan`)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Gagal upload foto produk")
        } finally {
            event.target.value = ""
        }
    }

    const handleModelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) {
            return
        }

        try {
            if (!file.type.startsWith("image/")) {
                throw new Error("File harus berupa gambar")
            }

            if (file.size > 10 * 1024 * 1024) {
                throw new Error("Ukuran gambar maksimal 10MB")
            }

            setModelImage(await readFileAsDataUrl(file))
            toast.success("Foto model berhasil ditambahkan")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Gagal upload foto model")
        } finally {
            event.target.value = ""
        }
    }

    const handleBackgroundUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) {
            return
        }

        try {
            if (!file.type.startsWith("image/")) {
                throw new Error("File harus berupa gambar")
            }

            if (file.size > 10 * 1024 * 1024) {
                throw new Error("Ukuran gambar maksimal 10MB")
            }

            setBackgroundImage(await readFileAsDataUrl(file))
            toast.success("Background referensi berhasil ditambahkan")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Gagal upload background")
        } finally {
            event.target.value = ""
        }
    }

    const removeProductImage = (index: number) => {
        setProductImages((current) => current.filter((_, currentIndex) => currentIndex !== index))
    }

    const pollSceneImage = async (jobId: string, maxAttempts = 90) => {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 4000))

            const statusResult = await checkImageJobStatus(jobId, "imageToImage")

            if (statusResult.status === "completed" && statusResult.imageUrls?.length) {
                return statusResult.imageUrls[0]
            }

            if (statusResult.status === "failed") {
                throw new Error(toUserFacingGenerationError(statusResult.error, "image"))
            }
        }

        throw new Error(toUserFacingGenerationError("Job timed out", "image"))
    }

    const pollSceneVideo = async (jobId: string, maxAttempts = 120) => {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 5000))

            const statusResult = await checkVideoJobStatus(jobId, "imageToVideo")

            if (statusResult.status === "completed" && statusResult.videoUrls?.length) {
                return statusResult.videoUrls[0]
            }

            if (statusResult.status === "failed") {
                throw new Error(toUserFacingGenerationError(statusResult.error, "video"))
            }
        }

        throw new Error(toUserFacingGenerationError("Job timed out", "video"))
    }

    const handleGenerateVideo = async (sceneId: string) => {
        const scene = sceneFrames.find((item) => item.id === sceneId)
        if (!scene?.imageUrl) {
            toast.error("Gambar scene belum tersedia")
            return
        }

        setSceneFrames((current) =>
            current.map((item) =>
                item.id === sceneId
                    ? { ...item, videoStatus: "generating", videoError: undefined }
                    : item
            )
        )

        try {
            const result = await generateImageToVideo({
                prompt: scene.prompt,
                startImageBase64: scene.imageUrl,
                aspectRatio: mapAspectRatio(config.aspectRatio),
            })

            if (!result.success || !result.jobId) {
                throw new Error(result.error || "Gagal memulai generate video")
            }

            const videoUrl = await pollSceneVideo(result.jobId)

            setSceneFrames((current) =>
                current.map((item) =>
                    item.id === sceneId
                        ? { ...item, videoStatus: "completed", videoUrl }
                        : item
                )
            )

            toast.success("Video scene berhasil dibuat")
        } catch (error) {
            const message = toUserFacingGenerationError(error instanceof Error ? error.message : undefined, "video")

            setSceneFrames((current) =>
                current.map((item) =>
                    item.id === sceneId
                        ? { ...item, videoStatus: "failed", videoError: message }
                        : item
                )
            )

            toast.error(message)
        }
    }

    const handleGenerateScenes = async () => {
        if (!productImages.length) {
            toast.error("Minimal upload 1 foto produk")
            return
        }

        if (!modelImage) {
            toast.error("Foto model referensi wajib diisi")
            return
        }

        if (!backgroundImage) {
            toast.error("Background referensi wajib diisi")
            return
        }

        if (!config.targetAudience.trim()) {
            toast.error("Target audience wajib diisi")
            return
        }

        if (!config.productDetails.trim()) {
            toast.error("Detail/USP produk wajib diisi")
            return
        }

        setIsGenerating(true)
        const prompts = buildAutoScenePrompts(config)
        const initialFrames: AutoSceneFrame[] = prompts.map((scene) => ({
            id: scene.id,
            title: scene.title,
            prompt: scene.prompt,
            status: "queued",
            videoStatus: "idle",
        }))
        setSceneFrames(initialFrames)

        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
        }, 50)

        const referenceImages = [productImages[0], modelImage, backgroundImage]
        let completed = 0

        try {
            for (const scene of prompts) {
                setSceneFrames((prev) => prev.map((frame) => (
                    frame.id === scene.id
                        ? { ...frame, status: "generating", error: undefined }
                        : frame
                )))

                try {
                    const result = await generateImageToImage({
                        prompt: scene.prompt,
                        referenceImagesBase64: referenceImages,
                        aspectRatio: mapAspectRatio(config.aspectRatio),
                    })

                    if (!result.success) {
                        throw new Error(result.error || "Gagal generate scene")
                    }

                    let imageUrl = result.imageUrl || result.imageUrls?.[0]
                    if (!imageUrl && result.jobId) {
                        imageUrl = await pollSceneImage(result.jobId)
                    }

                    if (!imageUrl) {
                        throw new Error("Tidak ada gambar yang dihasilkan untuk scene ini")
                    }

                    completed += 1
                    setSceneFrames((prev) => prev.map((frame) => (
                        frame.id === scene.id
                            ? { ...frame, status: "completed", imageUrl }
                            : frame
                    )))
                } catch (error) {
                    setSceneFrames((prev) => prev.map((frame) => (
                        frame.id === scene.id
                            ? {
                                ...frame,
                                status: "failed",
                                error: toUserFacingGenerationError(error instanceof Error ? error.message : undefined, "image"),
                            }
                            : frame
                    )))
                }
            }

            toast.success(`${completed}/${prompts.length} scene berhasil dibuat`)
        } catch (error) {
            console.error("Auto scene generation failed:", error)
            toast.error(error instanceof Error ? error.message : "Gagal membuat auto scene")
        } finally {
            setIsGenerating(false)
        }
    }

    const downloadImage = (imageUrl: string, filename: string) => {
        const link = document.createElement("a")
        link.href = imageUrl
        link.download = filename
        link.target = "_blank"
        link.click()
    }

    const downloadVideo = async (videoUrl: string, filename: string) => {
        try {
            const proxiedUrl = `/api/image-proxy?url=${encodeURIComponent(videoUrl)}`
            const response = await fetch(proxiedUrl)
            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement("a")
            link.href = url
            link.download = filename
            link.click()
            window.URL.revokeObjectURL(url)
        } catch {
            toast.error("Gagal mendownload video")
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 text-slate-900 dark:bg-[#070707] dark:text-white">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
                <input
                    ref={productInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={handleProductUpload}
                />
                <input
                    ref={modelInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleModelUpload}
                />
                <input
                    ref={backgroundInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleBackgroundUpload}
                />

                <div className="rounded-[2rem] border border-gray-200 bg-white p-5 shadow-lg md:p-6 dark:border-white/8 dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_30%),#0a0a0a] dark:shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
                    <div className="flex flex-col gap-3">
                        <div>
                            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-300">
                                <Sparkles className="h-3.5 w-3.5" />
                                Auto Scene Builder
                            </div>
                            <h1 className="text-2xl font-black tracking-tight md:text-3xl">Konfigurasi Auto Scene</h1>
                            <p className="mt-2 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
                                Form ini disusun untuk kebutuhan konten promo vertikal seperti pada layout referensi Anda: detail produk, pengaturan visual, script, lalu aset visual untuk generate storyboard otomatis.
                            </p>
                        </div>
                    </div>
                </div>

                <ConfigSection icon={<CircleDot className="h-6 w-6" />} title="Detail Produk">
                    <div className="grid gap-6">
                        <div>
                            <FieldLabel>Kategori Produk</FieldLabel>
                            <DarkSelect
                                value={config.productCategory}
                                onValueChange={(value) => updateConfig("productCategory", value)}
                                options={productCategories}
                            />
                        </div>

                        <div>
                            <FieldLabel>Target Audiens</FieldLabel>
                            <DarkInput
                                value={config.targetAudience}
                                onChange={(event) => updateConfig("targetAudience", event.target.value)}
                                placeholder="Contoh: Ibu muda 25-35 tahun"
                            />
                        </div>

                        <div>
                            <FieldLabel>Detail/USP Produk</FieldLabel>
                            <DarkTextarea
                                value={config.productDetails}
                                onChange={(event) => updateConfig("productDetails", event.target.value)}
                                placeholder="Sebutkan keunggulan produk, bahan, atau promo..."
                            />
                        </div>
                    </div>
                </ConfigSection>

                <ConfigSection icon={<Video className="h-6 w-6" />} title="Pengaturan Visual">
                    <div className="grid gap-6 md:grid-cols-2">
                        <div>
                            <FieldLabel>Rasio Aspek</FieldLabel>
                            <DarkSelect
                                value={config.aspectRatio === "portrait" ? "9:16 (Tiktok/Reels)" : "16:9 (YouTube/Landing)"}
                                onValueChange={(value) => updateConfig("aspectRatio", value.startsWith("9:16") ? "portrait" : "landscape")}
                                options={aspectRatioOptions.map((option) => option.label)}
                            />
                        </div>
                        <div>
                            <FieldLabel>Gaya Kamera</FieldLabel>
                            <DarkSelect
                                value={config.cameraStyle}
                                onValueChange={(value) => updateConfig("cameraStyle", value)}
                                options={cameraStyleOptions}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <FieldLabel>Posisi Produk</FieldLabel>
                            <DarkSelect
                                value={config.productPosition}
                                onValueChange={(value) => updateConfig("productPosition", value)}
                                options={productPositionOptions}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <FieldLabel>Background</FieldLabel>
                            <DarkSelect
                                value={config.backgroundStyle}
                                onValueChange={(value) => updateConfig("backgroundStyle", value)}
                                options={backgroundOptions}
                            />
                        </div>
                    </div>
                </ConfigSection>

                <ConfigSection icon={<MessageSquare className="h-6 w-6" />} title="Pengaturan Script">
                    <div className="grid gap-6 md:grid-cols-2">
                        <div>
                            <FieldLabel>Bahasa</FieldLabel>
                            <DarkSelect
                                value={config.language}
                                onValueChange={(value) => updateConfig("language", value)}
                                options={languageOptions}
                            />
                        </div>
                        <div>
                            <FieldLabel>Gaya Bahasa</FieldLabel>
                            <DarkSelect
                                value={config.languageStyle}
                                onValueChange={(value) => updateConfig("languageStyle", value)}
                                options={languageStyleOptions}
                            />
                        </div>
                        <div>
                            <FieldLabel>Nada (Tone)</FieldLabel>
                            <DarkSelect
                                value={config.tone}
                                onValueChange={(value) => updateConfig("tone", value)}
                                options={toneOptions}
                            />
                        </div>
                        <div>
                            <FieldLabel>Jumlah Scene</FieldLabel>
                            <DarkSelect
                                value={`${config.sceneCount} Scene`}
                                onValueChange={(value) => updateConfig("sceneCount", Number.parseInt(value, 10) as AutoSceneSceneCount)}
                                options={sceneCountOptions.map((option) => option.label)}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <FieldLabel>Hook (Awal Video)</FieldLabel>
                            <DarkSelect
                                value={config.hook}
                                onValueChange={(value) => updateConfig("hook", value)}
                                options={hookOptions}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <FieldLabel>Call to Action (Akhir Video)</FieldLabel>
                            <DarkSelect
                                value={config.callToAction}
                                onValueChange={(value) => updateConfig("callToAction", value)}
                                options={ctaOptions}
                            />
                        </div>
                    </div>
                </ConfigSection>

                <ConfigSection icon={<ImageIcon className="h-6 w-6" />} title="Aset Visual">
                    <div className="grid gap-8">
                        <UploadBox
                            title="Foto Produk (Max 5)"
                            description="Klik untuk upload foto produk"
                            icon={<ImagePlus className="h-10 w-10" />}
                            onClick={() => productInputRef.current?.click()}
                            disabled={productImages.length >= 5}
                        >
                            {productImages.length > 0 ? (
                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                                    {productImages.map((image, index) => (
                                        <div key={`${image.slice(0, 24)}-${index}`} className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-[#090909]">
                                            <Image
                                                src={image}
                                                alt={`Product ${index + 1}`}
                                                width={320}
                                                height={320}
                                                unoptimized
                                                className="aspect-square w-full object-cover"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeProductImage(index)}
                                                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                        </UploadBox>

                        <UploadBox
                            title="Foto Model Referensi (1 Wajah)"
                            description="Upload foto wajah model yang jelas"
                            icon={<ImageIcon className="h-10 w-10" />}
                            onClick={() => modelInputRef.current?.click()}
                        >
                            {modelImage ? (
                                <div className="relative max-w-[220px] overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-[#090909]">
                                    <Image
                                        src={modelImage}
                                        alt="Model reference"
                                        width={320}
                                        height={320}
                                        unoptimized
                                        className="aspect-square w-full object-cover"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setModelImage(null)}
                                        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ) : null}
                        </UploadBox>

                        <UploadBox
                            title="Background Referensi"
                            description="Upload background atau environment referensi"
                            icon={<ImageIcon className="h-10 w-10" />}
                            onClick={() => backgroundInputRef.current?.click()}
                        >
                            {backgroundImage ? (
                                <div className="relative max-w-[220px] overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-[#090909]">
                                    <Image
                                        src={backgroundImage}
                                        alt="Background reference"
                                        width={320}
                                        height={320}
                                        unoptimized
                                        className="aspect-square w-full object-cover"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setBackgroundImage(null)}
                                        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ) : null}
                        </UploadBox>
                    </div>
                </ConfigSection>

                <Card className="rounded-[2rem] border-gray-200 bg-white py-0 text-foreground dark:border-white/8 dark:bg-[#111111]">
                    <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:p-6">
                        <div>
                            <h3 className="text-base font-semibold">Generate storyboard</h3>
                            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                                Setelah gambar scene selesai dibuat, setiap card hasil akan menampilkan tombol untuk langsung generate video dari scene tersebut.
                            </p>
                        </div>
                        <Button
                            onClick={handleGenerateScenes}
                            disabled={isGenerating}
                            className="h-11 rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-black hover:bg-emerald-400 md:min-w-52"
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="mr-2 h-4 w-4" />
                                    Generate {config.sceneCount} Scene
                                </>
                            )}
                        </Button>
                    </div>
                </Card>

                {sceneFrames.length === 0 ? (
                    <Card className="rounded-[2rem] border border-dashed border-gray-200 bg-white py-0 dark:border-white/10 dark:bg-[#101010]">
                        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-500 dark:text-emerald-300">
                                <Sparkles className="h-10 w-10" />
                            </div>
                            <h2 className="text-xl font-bold">Preview scene akan muncul di sini</h2>
                            <p className="mt-3 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
                                Setelah konfigurasi diisi dan aset visual diupload, sistem akan generate storyboard sesuai jumlah scene yang Anda pilih.
                            </p>
                        </div>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-black">Hasil Auto Scene</h2>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">Storyboard visual berdasarkan konfigurasi form terbaru.</p>
                            </div>
                            <Button
                                variant="outline"
                                onClick={() => setSceneFrames([])}
                                disabled={isGenerating}
                                className="border-gray-200 bg-transparent text-foreground hover:bg-gray-100 dark:border-white/10 dark:hover:bg-white/5"
                            >
                                Reset Results
                            </Button>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {sceneFrames.map((scene, index) => (
                                <Card key={scene.id} className="overflow-hidden rounded-[1.75rem] border-gray-200 bg-white py-0 text-foreground dark:border-white/10 dark:bg-[#111111]">
                                    <div className="flex aspect-[4/5] items-center justify-center overflow-hidden bg-gray-100 dark:bg-[#0a0a0a]">
                                        {scene.imageUrl ? (
                                            <Image
                                                src={scene.imageUrl}
                                                alt={scene.title}
                                                width={800}
                                                height={1000}
                                                unoptimized
                                                className="h-full w-full object-cover"
                                            />
                                        ) : scene.status === "failed" ? (
                                            <div className="px-6 text-center text-sm text-red-400">
                                                {scene.error || "Scene gagal dibuat"}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center gap-3 text-zinc-500">
                                                <Loader2 className={`h-6 w-6 ${scene.status === "generating" ? "animate-spin" : ""}`} />
                                                <span className="text-sm">
                                                    {scene.status === "queued" ? "Queued" : "Generating..."}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-3 p-5">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <h3 className="font-semibold">Scene {index + 1}</h3>
                                                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{scene.title}</p>
                                            </div>
                                            <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                                                {scene.status}
                                            </span>
                                        </div>

                                        <p className="line-clamp-6 text-sm text-zinc-400">{scene.prompt}</p>

                                        {scene.imageUrl ? (
                                            <div className="space-y-2">
                                                <Button
                                                    className="w-full bg-emerald-500 text-black hover:bg-emerald-400"
                                                    onClick={() => handleGenerateVideo(scene.id)}
                                                    disabled={scene.videoStatus === "generating" || scene.videoStatus === "completed"}
                                                >
                                                    {scene.videoStatus === "generating" ? (
                                                        <>
                                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            Generating Video...
                                                        </>
                                                    ) : scene.videoStatus === "completed" ? (
                                                        <>
                                                            <Play className="mr-2 h-4 w-4" />
                                                            Regenerate Video
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Play className="mr-2 h-4 w-4" />
                                                            Generate Video
                                                        </>
                                                    )}
                                                </Button>

                                                <Button
                                                    variant="outline"
                                                    className="w-full border-gray-200 bg-transparent text-foreground hover:bg-gray-100 dark:border-white/10 dark:hover:bg-white/5"
                                                    onClick={() => {
                                                        if (!scene.imageUrl) {
                                                            return
                                                        }

                                                        downloadImage(scene.imageUrl, `${scene.id}.jpg`)
                                                    }}
                                                >
                                                    <Download className="mr-2 h-4 w-4" />
                                                    Download Scene
                                                </Button>

                                                {scene.videoError ? (
                                                    <p className="text-xs text-red-400">{scene.videoError}</p>
                                                ) : null}

                                                {scene.videoUrl ? (
                                                    <div className="space-y-2 rounded-2xl border border-gray-200 bg-gray-100 p-2.5 dark:border-white/10 dark:bg-black/20">
                                                        <video
                                                            src={`/api/image-proxy?url=${encodeURIComponent(scene.videoUrl)}`}
                                                            controls
                                                            playsInline
                                                            preload="metadata"
                                                            className="aspect-[9/16] w-full rounded-xl bg-gray-200 object-contain dark:bg-black"
                                                        />
                                                        <Button
                                                            variant="outline"
                                                            className="w-full border-gray-200 bg-transparent text-foreground hover:bg-gray-100 dark:border-white/10 dark:hover:bg-white/5"
                                                            onClick={() => {
                                                                if (!scene.videoUrl) {
                                                                    return
                                                                }

                                                                downloadVideo(scene.videoUrl, `${scene.id}.mp4`)
                                                            }}
                                                        >
                                                            <Download className="mr-2 h-4 w-4" />
                                                            Download Video
                                                        </Button>
                                                    </div>
                                                ) : scene.videoStatus === "completed" ? (
                                                    <p className="text-xs text-zinc-400">Video selesai dibuat.</p>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                {isGenerating ? (
                    <Card className="rounded-[2rem] border border-gray-200 bg-white py-0 text-foreground dark:border-white/10 dark:bg-[#111111]">
                        <div className="flex items-center gap-4 p-6">
                            <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
                            <div>
                                <p className="text-sm text-zinc-600 dark:text-zinc-300">Menyusun prompt dan generate {config.sceneCount} scene...</p>
                                <p className="mt-1 text-xs text-zinc-500">Proses berjalan berurutan untuk menjaga konsistensi visual produk dan model.</p>
                            </div>
                        </div>
                    </Card>
                ) : null}

                <div ref={messagesEndRef} />
            </div>
        </div>
    )
}