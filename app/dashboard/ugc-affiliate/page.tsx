"use client"

import Image from "next/image"
import Lottie from "lottie-react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { ApiRequestError, checkImageJobStatus, checkVideoJobStatus, extendVideo, generateImageToImage, generateImageToVideo } from "@/lib/client/generation-api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { toUserFacingGenerationError } from "@/lib/generation-errors"
import { buildUgcAffiliateScenePrompt, buildUgcAffiliateVideoPrompt, type UgcAffiliateConfig } from "@/lib/ugc-affiliate"
import {
    CircleDot,
    ChevronDown,
    Copy,
    Download,
    Image as ImageIcon,
    Loader2,
    MessageSquare,
    RefreshCcw,
    Play,
    Sparkles,
    Video,
    X,
} from "lucide-react"
import { toast } from "sonner"

type AspectRatio = "landscape" | "portrait"

type GenerationProgressState = {
    stage: "idle" | "preparing-scene" | "generating-scene" | "preparing-video" | "generating-video" | "completed"
    label: string
    description: string
    percent: number
}

type GeneratedReviewVideo = {
    id: string
    prompt: string
    scenePrompt: string
    draftPrompt: string
    videoUrl: string
    sceneImageUrl: string
    aspectRatio: AspectRatio
    createdAt: Date
    mediaGenerationId?: string
    referenceImages: [string, string, string]
    sourceConfig: UgcAffiliateConfig
    isPromptEditorOpen: boolean
    actionStatus: "idle" | "regenerating" | "duplicating" | "extending"
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

const creatorPersonaOptions = [
    "Affiliate creator yang ramah dan meyakinkan",
    "Beauty reviewer yang jujur dan detail",
    "Lifestyle creator yang santai",
    "Trusted mom creator",
    "Premium niche reviewer",
]

const presetStyleOptions = [
    "Testimonial",
    "Soft Sell",
    "Hard Sell",
    "Before-After",
    "Day in My Life",
]

const languageOptions = ["Indonesian", "English", "Bilingual"]

const toneOptions = [
    "Energetic",
    "Warm",
    "Trustworthy",
    "Elegant",
    "Playful",
]

const ctaOptions = [
    "Click Link in Bio",
    "Order Sekarang",
    "DM untuk Konsultasi",
    "Coba Sekarang",
    "Checkout Hari Ini",
]

const aspectRatioOptions: Array<{ value: AspectRatio; label: string }> = [
    { value: "portrait", label: "9:16 (Tiktok/Reels)" },
    { value: "landscape", label: "16:9 (YouTube/Landing)" },
]

const defaultConfig: UgcAffiliateConfig = {
    productCategory: "Beauty / Skincare",
    productName: "",
    targetAudience: "",
    keySellingPoints: "",
    reviewAngle: "Review jujur yang menunjukkan manfaat utama produk dalam pemakaian nyata",
    presetStyle: "Testimonial",
    creatorPersona: "Affiliate creator yang ramah dan meyakinkan",
    language: "Indonesian",
    tone: "Trustworthy",
    callToAction: "Click Link in Bio",
    aspectRatio: "portrait",
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

function UploadBox({
    title,
    description,
    onClick,
    children,
}: {
    title: string
    description: string
    onClick: () => void
    children?: ReactNode
}) {
    return (
        <div className="space-y-3">
            <FieldLabel>{title}</FieldLabel>
            <button
                type="button"
                onClick={onClick}
                className="flex min-h-[160px] w-full flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center transition hover:border-emerald-400/50 hover:bg-gray-100 dark:border-white/12 dark:bg-[#0b0b0b] dark:hover:bg-[#101010]"
            >
                <div className="mb-4 text-zinc-500">
                    <ImageIcon className="h-10 w-10" />
                </div>
                <p className="text-lg font-medium text-zinc-500 dark:text-zinc-400 md:text-xl">{description}</p>
            </button>
            {children}
        </div>
    )
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

function logUgcAffiliateError(stage: string, error: unknown, extra?: Record<string, unknown>) {
    if (error instanceof ApiRequestError) {
        console.error("[UGC Affiliate] API request failed", {
            stage,
            endpoint: error.endpoint,
            status: error.status,
            payload: error.payload,
            ...extra,
        })
        return
    }

    console.error("[UGC Affiliate] Operation failed", {
        stage,
        error,
        ...(error instanceof Error ? { message: error.message, stack: error.stack } : {}),
        ...extra,
    })
}

export default function UgcAffiliatePage() {
    const [config, setConfig] = useState<UgcAffiliateConfig>(defaultConfig)
    const [productImage, setProductImage] = useState<string | null>(null)
    const [modelImage, setModelImage] = useState<string | null>(null)
    const [backgroundImage, setBackgroundImage] = useState<string | null>(null)
    const [generatedVideos, setGeneratedVideos] = useState<GeneratedReviewVideo[]>([])
    const [isGenerating, setIsGenerating] = useState(false)
    const [catAnimation, setCatAnimation] = useState<object | null>(null)
    const [generationProgress, setGenerationProgress] = useState<GenerationProgressState>({
        stage: "idle",
        label: "Siap generate",
        description: "Isi brief dan upload 3 referensi untuk memulai pipeline image-to-video.",
        percent: 0,
    })

    const productInputRef = useRef<HTMLInputElement>(null)
    const modelInputRef = useRef<HTMLInputElement>(null)
    const backgroundInputRef = useRef<HTMLInputElement>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        fetch("/cat-loading.json")
            .then((res) => res.json())
            .then((data) => setCatAnimation(data))
            .catch(() => {})
    }, [])

    const updateGenerationProgress = (next: GenerationProgressState) => {
        setGenerationProgress(next)
    }

    const updateConfig = <K extends keyof UgcAffiliateConfig>(key: K, value: UgcAffiliateConfig[K]) => {
        setConfig((current) => ({ ...current, [key]: value }))
    }

    const handleSingleImageUpload = async (
        event: React.ChangeEvent<HTMLInputElement>,
        onSuccess: (value: string) => void,
        successMessage: string
    ) => {
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

            onSuccess(await readFileAsDataUrl(file))
            toast.success(successMessage)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Gagal upload gambar")
        } finally {
            event.target.value = ""
        }
    }

    const pollVideo = async (jobId: string, maxAttempts = 120) => {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 5000))

            const progressPercent = Math.min(99, 66 + Math.round(((attempt + 1) / maxAttempts) * 33))
            updateGenerationProgress({
                stage: "generating-video",
                label: "Stage 2/2: Generating video",
                description: "Scene image sedang dianimasikan menjadi video affiliate review.",
                percent: progressPercent,
            })

            const statusResult = await checkVideoJobStatus(jobId, "imageToVideo")
            if (statusResult.status === "completed" && statusResult.videoUrls?.length) {
                updateGenerationProgress({
                    stage: "completed",
                    label: "Selesai",
                    description: "Video affiliate berhasil dibuat.",
                    percent: 100,
                })
                return {
                    videoUrl: statusResult.videoUrls[0],
                    mediaGenerationId: statusResult.mediaGenerationId,
                }
            }

            if (statusResult.status === "failed") {
                logUgcAffiliateError("pollVideo", new Error(statusResult.error || "Video job failed"), {
                    jobId,
                    attempt: attempt + 1,
                    statusResult,
                })
                throw new Error(toUserFacingGenerationError(statusResult.error, "video"))
            }
        }

        logUgcAffiliateError("pollVideoTimeout", new Error("Job timed out"), {
            jobId,
            maxAttempts,
        })
        throw new Error(toUserFacingGenerationError("Job timed out", "video"))
    }

    const pollImage = async (jobId: string, maxAttempts = 90) => {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 4000))

            const progressPercent = Math.min(62, 14 + Math.round(((attempt + 1) / maxAttempts) * 48))
            updateGenerationProgress({
                stage: "generating-scene",
                label: "Stage 1/2: Generating scene image",
                description: "Produk, model, dan background sedang digabung menjadi satu scene yang siap dianimasikan.",
                percent: progressPercent,
            })

            const statusResult = await checkImageJobStatus(jobId, "imageToImage")
            const sceneImageUrl = statusResult.imageUrls?.[0] || statusResult.imageUrl
            if (statusResult.status === "completed" && sceneImageUrl) {
                updateGenerationProgress({
                    stage: "preparing-video",
                    label: "Stage 2/2: Preparing video",
                    description: "Scene image berhasil dibuat. Menyiapkan start frame untuk video affiliate.",
                    percent: 64,
                })
                return {
                    sceneImageUrl,
                    mediaGenerationId: typeof statusResult.mediaGenerationId === "string" ? statusResult.mediaGenerationId : undefined,
                }
            }

            if (statusResult.status === "failed") {
                logUgcAffiliateError("pollImage", new Error(statusResult.error || "Scene image job failed"), {
                    jobId,
                    attempt: attempt + 1,
                    statusResult,
                })
                throw new Error(toUserFacingGenerationError(statusResult.error, "image"))
            }
        }

        logUgcAffiliateError("pollImageTimeout", new Error("Scene image job timed out"), {
            jobId,
            maxAttempts,
        })
        throw new Error(toUserFacingGenerationError("Job timed out", "image"))
    }

    const updateGeneratedVideo = (videoId: string, updater: (video: GeneratedReviewVideo) => GeneratedReviewVideo) => {
        setGeneratedVideos((current) => current.map((video) => (video.id === videoId ? updater(video) : video)))
    }

    const createGeneratedVideo = async (params: {
        scenePrompt: string
        videoPrompt: string
        aspectRatio: AspectRatio
        referenceImages: [string, string, string]
    }) => {
        updateGenerationProgress({
            stage: "preparing-scene",
            label: "Stage 1/2: Preparing scene",
            description: "Mengirim 3 referensi untuk compose scene image affiliate yang rapi.",
            percent: 8,
        })

        const sceneResult = await generateImageToImage({
            prompt: params.scenePrompt,
            referenceImagesBase64: params.referenceImages,
            aspectRatio: params.aspectRatio,
        })

        if (!sceneResult.success || !sceneResult.jobId) {
            logUgcAffiliateError("createGeneratedScene", new Error(sceneResult.error || "Gagal memulai generate scene image"), {
                result: sceneResult,
                aspectRatio: params.aspectRatio,
                promptPreview: params.scenePrompt.slice(0, 160),
                referenceImageCount: params.referenceImages.length,
            })
            throw new Error(sceneResult.error || "Gagal memulai generate scene image")
        }

        const scene = await pollImage(sceneResult.jobId)
        updateGenerationProgress({
            stage: "preparing-video",
            label: "Stage 2/2: Preparing video",
            description: "Scene image sudah siap. Mengirim start frame untuk generate video review.",
            percent: 68,
        })
        const videoResult = await generateImageToVideo({
            prompt: params.videoPrompt,
            startImageBase64: scene.sceneImageUrl,
            aspectRatio: params.aspectRatio,
            model: "veo-3.1-fast-relaxed",
        })

        if (!videoResult.success || !videoResult.jobId) {
            logUgcAffiliateError("createGeneratedVideo", new Error(videoResult.error || "Gagal memulai generate video"), {
                result: videoResult,
                aspectRatio: params.aspectRatio,
                promptPreview: params.videoPrompt.slice(0, 160),
                sceneImageUrl: scene.sceneImageUrl.slice(0, 160),
            })
            throw new Error(videoResult.error || "Gagal memulai generate video")
        }

        const video = await pollVideo(videoResult.jobId)

        return {
            ...video,
            sceneImageUrl: scene.sceneImageUrl,
        }
    }

    const prependGeneratedVideo = (params: {
        prompt: string
        scenePrompt: string
        aspectRatio: AspectRatio
        referenceImages: [string, string, string]
        videoUrl: string
        sceneImageUrl: string
        mediaGenerationId?: string
        sourceConfig: UgcAffiliateConfig
    }) => {
        setGeneratedVideos((current) => [
            {
                id: Date.now().toString(),
                prompt: params.prompt,
                scenePrompt: params.scenePrompt,
                draftPrompt: params.prompt,
                videoUrl: params.videoUrl,
                sceneImageUrl: params.sceneImageUrl,
                aspectRatio: params.aspectRatio,
                createdAt: new Date(),
                mediaGenerationId: params.mediaGenerationId,
                referenceImages: params.referenceImages,
                sourceConfig: params.sourceConfig,
                isPromptEditorOpen: false,
                actionStatus: "idle",
            },
            ...current,
        ])
    }

    const handleRegenerateVideo = async (videoId: string) => {
        const target = generatedVideos.find((video) => video.id === videoId)
        if (!target) {
            return
        }

        updateGeneratedVideo(videoId, (video) => ({ ...video, actionStatus: "regenerating" }))

        try {
            const result = await createGeneratedVideo({
                scenePrompt: target.scenePrompt,
                videoPrompt: target.prompt,
                aspectRatio: target.aspectRatio,
                referenceImages: target.referenceImages,
            })

            prependGeneratedVideo({
                prompt: target.prompt,
                scenePrompt: target.scenePrompt,
                aspectRatio: target.aspectRatio,
                referenceImages: target.referenceImages,
                videoUrl: result.videoUrl,
                sceneImageUrl: result.sceneImageUrl,
                mediaGenerationId: result.mediaGenerationId,
                sourceConfig: target.sourceConfig,
            })

            toast.success("Video berhasil diregenerate")
        } catch (error) {
            logUgcAffiliateError("handleRegenerateVideo", error, {
                videoId,
                mediaGenerationId: target.mediaGenerationId,
            })
            toast.error(toUserFacingGenerationError(error instanceof Error ? error.message : undefined, "video"))
        } finally {
            updateGeneratedVideo(videoId, (video) => ({ ...video, actionStatus: "idle" }))
        }
    }

    const handleDuplicateWithEditedPrompt = async (videoId: string) => {
        const target = generatedVideos.find((video) => video.id === videoId)
        if (!target) {
            return
        }

        const prompt = target.draftPrompt.trim()
        if (!prompt) {
            toast.error("Prompt edit tidak boleh kosong")
            return
        }

        updateGeneratedVideo(videoId, (video) => ({ ...video, actionStatus: "duplicating" }))

        try {
            const scenePrompt = buildUgcAffiliateScenePrompt(target.sourceConfig)
            const result = await createGeneratedVideo({
                scenePrompt,
                videoPrompt: prompt,
                aspectRatio: target.aspectRatio,
                referenceImages: target.referenceImages,
            })

            prependGeneratedVideo({
                prompt,
                scenePrompt,
                aspectRatio: target.aspectRatio,
                referenceImages: target.referenceImages,
                videoUrl: result.videoUrl,
                sceneImageUrl: result.sceneImageUrl,
                mediaGenerationId: result.mediaGenerationId,
                sourceConfig: target.sourceConfig,
            })

            toast.success("Video duplikat dengan prompt baru berhasil dibuat")
        } catch (error) {
            logUgcAffiliateError("handleDuplicateWithEditedPrompt", error, {
                videoId,
                mediaGenerationId: target.mediaGenerationId,
                promptPreview: prompt.slice(0, 160),
            })
            toast.error(toUserFacingGenerationError(error instanceof Error ? error.message : undefined, "video"))
        } finally {
            updateGeneratedVideo(videoId, (video) => ({ ...video, actionStatus: "idle" }))
        }
    }

    const handleExtendVideo = async (videoId: string) => {
        const target = generatedVideos.find((video) => video.id === videoId)
        if (!target?.mediaGenerationId) {
            toast.error("Video ini belum punya media generation id untuk extend")
            return
        }

        const prompt = target.draftPrompt.trim() || target.prompt

        updateGeneratedVideo(videoId, (video) => ({ ...video, actionStatus: "extending" }))

        try {
            const result = await extendVideo({
                mediaGenerationId: target.mediaGenerationId,
                prompt,
            })

            if (!result.success || !result.jobId) {
                logUgcAffiliateError("extendVideo", new Error(result.error || "Gagal memulai extend video"), {
                    result,
                    videoId,
                    mediaGenerationId: target.mediaGenerationId,
                    promptPreview: prompt.slice(0, 160),
                })
                throw new Error(result.error || "Gagal memulai extend video")
            }

            const pollResult = await pollVideo(result.jobId)

            prependGeneratedVideo({
                prompt,
                scenePrompt: target.scenePrompt,
                aspectRatio: target.aspectRatio,
                referenceImages: target.referenceImages,
                videoUrl: pollResult.videoUrl,
                sceneImageUrl: target.sceneImageUrl,
                mediaGenerationId: pollResult.mediaGenerationId,
                sourceConfig: target.sourceConfig,
            })

            toast.success("Video berhasil diperpanjang")
        } catch (error) {
            logUgcAffiliateError("handleExtendVideo", error, {
                videoId,
                mediaGenerationId: target.mediaGenerationId,
                promptPreview: prompt.slice(0, 160),
            })
            toast.error(toUserFacingGenerationError(error instanceof Error ? error.message : undefined, "video"))
        } finally {
            updateGeneratedVideo(videoId, (video) => ({ ...video, actionStatus: "idle" }))
        }
    }

    const handleGenerateVideo = async () => {
        if (!productImage) {
            toast.error("Foto produk wajib diisi")
            return
        }

        if (!modelImage) {
            toast.error("Foto model wajib diisi")
            return
        }

        if (!backgroundImage) {
            toast.error("Background wajib diisi")
            return
        }

        if (!config.productName.trim()) {
            toast.error("Nama produk wajib diisi")
            return
        }

        if (!config.targetAudience.trim()) {
            toast.error("Target audience wajib diisi")
            return
        }

        if (!config.keySellingPoints.trim()) {
            toast.error("Selling points wajib diisi")
            return
        }

        setIsGenerating(true)
        updateGenerationProgress({
            stage: "preparing-scene",
            label: "Stage 1/2: Preparing scene",
            description: "Memvalidasi brief dan menyiapkan pipeline UGC Affiliate.",
            percent: 3,
        })
        const scenePrompt = buildUgcAffiliateScenePrompt(config)
        const prompt = buildUgcAffiliateVideoPrompt(config)
        const referenceImages: [string, string, string] = [productImage, modelImage, backgroundImage]
        const sourceConfig = { ...config }

        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
        }, 50)

        try {
            toast.info("Menyusun scene image dari produk, model, dan background...")
            const result = await createGeneratedVideo({
                scenePrompt,
                videoPrompt: prompt,
                aspectRatio: config.aspectRatio,
                referenceImages,
            })

            prependGeneratedVideo({
                prompt,
                scenePrompt,
                aspectRatio: config.aspectRatio,
                referenceImages,
                videoUrl: result.videoUrl,
                sceneImageUrl: result.sceneImageUrl,
                mediaGenerationId: result.mediaGenerationId,
                sourceConfig,
            })

            toast.success("UGC Affiliate video berhasil dibuat")
        } catch (error) {
            logUgcAffiliateError("handleGenerateVideo", error, {
                aspectRatio: config.aspectRatio,
                productName: config.productName,
                promptPreview: prompt.slice(0, 160),
            })
            toast.error(toUserFacingGenerationError(error instanceof Error ? error.message : undefined, "video"))
        } finally {
            setIsGenerating(false)
            setTimeout(() => {
                setGenerationProgress((current) => current.stage === "completed"
                    ? current
                    : {
                        stage: "idle",
                        label: "Siap generate",
                        description: "Isi brief dan upload 3 referensi untuk memulai pipeline image-to-video.",
                        percent: 0,
                    })
            }, 400)
        }
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

    const handleDuplicateAsNewDraft = (videoId: string) => {
        const target = generatedVideos.find((video) => video.id === videoId)
        if (!target) {
            return
        }

        setConfig({ ...target.sourceConfig })
        setProductImage(target.referenceImages[0])
        setModelImage(target.referenceImages[1])
        setBackgroundImage(target.referenceImages[2])

        window.scrollTo({ top: 0, behavior: "smooth" })
        toast.success("Draft di atas sudah diisi dari hasil video ini")
    }

    return (
        <div className="min-h-screen bg-gray-50 text-slate-900 dark:bg-[#070707] dark:text-white">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
                <input
                    ref={productInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) => handleSingleImageUpload(event, setProductImage, "Foto produk berhasil ditambahkan")}
                />
                <input
                    ref={modelInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) => handleSingleImageUpload(event, setModelImage, "Foto model berhasil ditambahkan")}
                />
                <input
                    ref={backgroundInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) => handleSingleImageUpload(event, setBackgroundImage, "Background berhasil ditambahkan")}
                />

                <div className="rounded-[2rem] border border-gray-200 bg-white p-5 shadow-lg md:p-6 dark:border-white/8 dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_30%),#0a0a0a] dark:shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
                    <div className="flex flex-col gap-3">
                        <div>
                            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-300">
                                <Sparkles className="h-3.5 w-3.5" />
                                UGC Affiliate
                            </div>
                            <h1 className="text-2xl font-black tracking-tight md:text-3xl">UGC Affiliate Product Review</h1>
                            <p className="mt-2 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
                                Upload 3 gambar seperti Auto Scene: produk, model, dan background. Sistem akan compose satu scene image dulu, lalu memakai scene itu sebagai start frame untuk generate video review affiliate.
                            </p>
                        </div>
                    </div>
                </div>

                <ConfigSection icon={<CircleDot className="h-6 w-6" />} title="Brief Produk">
                    <div className="grid gap-6 md:grid-cols-2">
                        <div>
                            <FieldLabel>Kategori Produk</FieldLabel>
                            <DarkSelect value={config.productCategory} onValueChange={(value) => updateConfig("productCategory", value)} options={productCategories} />
                        </div>
                        <div>
                            <FieldLabel>Nama Produk</FieldLabel>
                            <DarkInput value={config.productName} onChange={(event) => updateConfig("productName", event.target.value)} placeholder="Contoh: Glow Serum" />
                        </div>
                        <div className="md:col-span-2">
                            <FieldLabel>Target Audience</FieldLabel>
                            <DarkInput value={config.targetAudience} onChange={(event) => updateConfig("targetAudience", event.target.value)} placeholder="Contoh: wanita 23-35 yang cari skincare glowing" />
                        </div>
                        <div className="md:col-span-2">
                            <FieldLabel>Key Selling Points</FieldLabel>
                            <DarkTextarea value={config.keySellingPoints} onChange={(event) => updateConfig("keySellingPoints", event.target.value)} placeholder="Masukkan manfaat utama, bahan unggulan, promo, atau alasan beli." />
                        </div>
                        <div className="md:col-span-2">
                            <FieldLabel>Review Angle</FieldLabel>
                            <DarkTextarea value={config.reviewAngle} onChange={(event) => updateConfig("reviewAngle", event.target.value)} placeholder="Contoh: review jujur setelah pemakaian, fokus ke hasil kulit lebih lembap dan glowing." />
                        </div>
                    </div>
                </ConfigSection>

                <ConfigSection icon={<MessageSquare className="h-6 w-6" />} title="Style Review">
                    <div className="grid gap-6 md:grid-cols-2">
                        <div>
                            <FieldLabel>Creator Persona</FieldLabel>
                            <DarkSelect value={config.creatorPersona} onValueChange={(value) => updateConfig("creatorPersona", value)} options={creatorPersonaOptions} />
                        </div>
                        <div>
                            <FieldLabel>Preset Style UGC</FieldLabel>
                            <DarkSelect value={config.presetStyle} onValueChange={(value) => updateConfig("presetStyle", value)} options={presetStyleOptions} />
                        </div>
                        <div>
                            <FieldLabel>Bahasa</FieldLabel>
                            <DarkSelect value={config.language} onValueChange={(value) => updateConfig("language", value)} options={languageOptions} />
                        </div>
                        <div>
                            <FieldLabel>Tone</FieldLabel>
                            <DarkSelect value={config.tone} onValueChange={(value) => updateConfig("tone", value)} options={toneOptions} />
                        </div>
                        <div>
                            <FieldLabel>Call to Action</FieldLabel>
                            <DarkSelect value={config.callToAction} onValueChange={(value) => updateConfig("callToAction", value)} options={ctaOptions} />
                        </div>
                        <div className="md:col-span-2">
                            <FieldLabel>Rasio Aspek</FieldLabel>
                            <DarkSelect
                                value={config.aspectRatio === "portrait" ? "9:16 (Tiktok/Reels)" : "16:9 (YouTube/Landing)"}
                                onValueChange={(value) => updateConfig("aspectRatio", value.startsWith("9:16") ? "portrait" : "landscape")}
                                options={aspectRatioOptions.map((option) => option.label)}
                            />
                        </div>
                    </div>
                </ConfigSection>

                <ConfigSection icon={<Video className="h-6 w-6" />} title="Media Referensi">
                    <div className="grid gap-8 md:grid-cols-3">
                        <UploadBox title="Foto Produk" description="Upload foto produk utama" onClick={() => productInputRef.current?.click()}>
                            {productImage ? (
                                <div className="relative max-w-[220px] overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-[#090909]">
                                    <Image src={productImage} alt="Product reference" width={320} height={320} unoptimized className="aspect-square w-full object-cover" />
                                    <button type="button" onClick={() => setProductImage(null)} className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white">
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ) : null}
                        </UploadBox>
                        <UploadBox title="Foto Model" description="Upload wajah creator/model" onClick={() => modelInputRef.current?.click()}>
                            {modelImage ? (
                                <div className="relative max-w-[220px] overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-[#090909]">
                                    <Image src={modelImage} alt="Model reference" width={320} height={320} unoptimized className="aspect-square w-full object-cover" />
                                    <button type="button" onClick={() => setModelImage(null)} className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white">
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ) : null}
                        </UploadBox>
                        <UploadBox title="Background" description="Upload background review" onClick={() => backgroundInputRef.current?.click()}>
                            {backgroundImage ? (
                                <div className="relative max-w-[220px] overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-[#090909]">
                                    <Image src={backgroundImage} alt="Background reference" width={320} height={320} unoptimized className="aspect-square w-full object-cover" />
                                    <button type="button" onClick={() => setBackgroundImage(null)} className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white">
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ) : null}
                        </UploadBox>
                    </div>
                </ConfigSection>

                <Card className="rounded-[2rem] border-gray-200 bg-white dark:border-white/8 dark:bg-[#111111] py-0 text-foreground">
                    <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:p-6">
                        <div>
                            <h3 className="text-base font-semibold text-foreground">Generate video review</h3>
                            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                                Sistem akan membuat scene image yang rapi dulu dari 3 referensi, lalu scene tersebut dipakai sebagai start frame video.
                            </p>
                        </div>
                        <Button onClick={handleGenerateVideo} disabled={isGenerating} className="h-11 rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-black hover:bg-emerald-400 md:min-w-56">
                            {isGenerating ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Play className="mr-2 h-4 w-4" />
                                    Generate Review Video
                                </>
                            )}
                        </Button>
                    </div>
                </Card>

                {isGenerating ? (
                    <Card className="rounded-[2rem] border-emerald-300/50 bg-emerald-50/70 py-0 text-foreground dark:border-emerald-500/20 dark:bg-emerald-500/10">
                        <div className="grid gap-6 p-5 md:grid-cols-[180px,1fr] md:items-center md:p-6">
                            <div className="flex items-center justify-center">
                                {catAnimation ? (
                                    <div className="w-full max-w-[160px]">
                                        <Lottie animationData={catAnimation} loop />
                                    </div>
                                ) : (
                                    <div className="flex h-28 w-28 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                                        <Loader2 className="h-10 w-10 animate-spin" />
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-300">Pipeline Progress</p>
                                        <h3 className="mt-1 text-lg font-black text-foreground">{generationProgress.label}</h3>
                                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{generationProgress.description}</p>
                                    </div>
                                    <div className="rounded-full border border-emerald-400/30 bg-white px-3 py-1 text-sm font-semibold text-emerald-700 dark:bg-white/5 dark:text-emerald-200">
                                        {generationProgress.percent}%
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="h-3 overflow-hidden rounded-full bg-emerald-200/60 dark:bg-white/10">
                                        <div
                                            className="h-full rounded-full bg-emerald-500 transition-[width] duration-500 ease-out"
                                            style={{ width: `${generationProgress.percent}%` }}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                                        <span>Compose scene image</span>
                                        <span>Animate to review video</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                ) : null}

                {generatedVideos.length === 0 ? (
                    <Card className="rounded-[2rem] border border-dashed border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-[#101010] py-0">
                        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-600 dark:text-emerald-300">
                                <Video className="h-10 w-10" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground">Video hasil akan muncul di sini</h2>
                            <p className="mt-3 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
                                Setelah brief lengkap dan 3 media terisi, sistem akan compose scene review dulu lalu mengubahnya menjadi video UGC affiliate.
                            </p>
                        </div>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <h2 className="text-xl font-black text-foreground">Hasil UGC Affiliate</h2>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">Video review product yang sudah digenerate.</p>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            {generatedVideos.map((video) => (
                                <Card key={video.id} className="overflow-hidden rounded-[1.75rem] border-gray-200 bg-white dark:border-white/10 dark:bg-[#111111] py-0 text-foreground">
                                    <div className="bg-gray-200 dark:bg-black p-2">
                                        <video
                                            src={`/api/image-proxy?url=${encodeURIComponent(video.videoUrl)}`}
                                            controls
                                            playsInline
                                            preload="metadata"
                                            className={`w-full rounded-xl bg-gray-200 dark:bg-black object-contain ${video.aspectRatio === "portrait" ? "aspect-[9/16]" : "aspect-video"}`}
                                        />
                                    </div>
                                    <div className="space-y-3 p-5">
                                        <div className="flex items-center justify-between gap-3">
                                            <h3 className="font-semibold text-foreground">UGC Review Video</h3>
                                            <span className="text-xs text-zinc-500 dark:text-zinc-400">{video.createdAt.toLocaleTimeString()}</span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/15">{video.sourceConfig.presetStyle}</Badge>
                                            <Badge variant="secondary" className="bg-gray-100 text-zinc-600 hover:bg-gray-100 dark:bg-white/8 dark:text-zinc-200 dark:hover:bg-white/8">{video.sourceConfig.tone}</Badge>
                                            <Badge variant="outline" className="border-gray-200 text-zinc-500 dark:border-white/10 dark:text-zinc-300">{video.sourceConfig.aspectRatio === "portrait" ? "9:16" : "16:9"}</Badge>
                                        </div>
                                        <Collapsible
                                            open={video.isPromptEditorOpen}
                                            onOpenChange={(isOpen) => updateGeneratedVideo(video.id, (current) => ({ ...current, isPromptEditorOpen: isOpen }))}
                                        >
                                            <CollapsibleTrigger asChild>
                                                <Button variant="outline" className="w-full justify-between border-gray-200 bg-transparent text-foreground hover:bg-gray-100 dark:border-white/10 dark:hover:bg-white/5">
                                                    <span>Edit prompt</span>
                                                    <ChevronDown className={`h-4 w-4 transition-transform ${video.isPromptEditorOpen ? "rotate-180" : ""}`} />
                                                </Button>
                                            </CollapsibleTrigger>
                                            <CollapsibleContent className="pt-2">
                                                <Textarea
                                                    value={video.draftPrompt}
                                                    onChange={(event) => updateGeneratedVideo(video.id, (current) => ({ ...current, draftPrompt: event.target.value }))}
                                                    className="min-h-[128px] rounded-2xl border-gray-300 bg-gray-50 dark:border-white/10 dark:bg-[#090909] px-4 py-3 text-sm text-foreground placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30"
                                                />
                                            </CollapsibleContent>
                                        </Collapsible>
                                        <Collapsible>
                                            <CollapsibleTrigger asChild>
                                                <Button variant="outline" className="w-full justify-between border-gray-200 bg-transparent text-foreground hover:bg-gray-100 dark:border-white/10 dark:hover:bg-white/5">
                                                    <span>Lihat scene image</span>
                                                    <ChevronDown className="h-4 w-4" />
                                                </Button>
                                            </CollapsibleTrigger>
                                            <CollapsibleContent className="pt-2">
                                                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-[#090909]">
                                                    <Image src={video.sceneImageUrl} alt="Generated UGC scene" width={1200} height={1200} unoptimized className={`w-full object-contain ${video.aspectRatio === "portrait" ? "aspect-[9/16]" : "aspect-video"}`} />
                                                </div>
                                            </CollapsibleContent>
                                        </Collapsible>
                                        <p className="line-clamp-6 text-sm text-zinc-500 dark:text-zinc-400">{video.prompt}</p>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <Button
                                                variant="outline"
                                                className="border-gray-200 bg-transparent text-foreground hover:bg-gray-100 dark:border-white/10 dark:hover:bg-white/5"
                                                onClick={() => handleRegenerateVideo(video.id)}
                                                disabled={video.actionStatus !== "idle"}
                                            >
                                                {video.actionStatus === "regenerating" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                                                Regenerate
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="border-gray-200 bg-transparent text-foreground hover:bg-gray-100 dark:border-white/10 dark:hover:bg-white/5"
                                                onClick={() => handleDuplicateWithEditedPrompt(video.id)}
                                                disabled={video.actionStatus !== "idle"}
                                            >
                                                {video.actionStatus === "duplicating" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
                                                Duplicate with edited prompt
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="border-gray-200 bg-transparent text-foreground hover:bg-gray-100 dark:border-white/10 dark:hover:bg-white/5"
                                                onClick={() => handleDuplicateAsNewDraft(video.id)}
                                                disabled={video.actionStatus !== "idle"}
                                            >
                                                <Copy className="mr-2 h-4 w-4" />
                                                Duplicate as new draft
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="border-gray-200 bg-transparent text-foreground hover:bg-gray-100 dark:border-white/10 dark:hover:bg-white/5"
                                                onClick={() => handleExtendVideo(video.id)}
                                                disabled={video.actionStatus !== "idle" || !video.mediaGenerationId}
                                            >
                                                {video.actionStatus === "extending" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Video className="mr-2 h-4 w-4" />}
                                                Extend Video
                                            </Button>
                                            <Button variant="outline" className="border-gray-200 bg-transparent text-foreground hover:bg-gray-100 dark:border-white/10 dark:hover:bg-white/5" onClick={() => downloadVideo(video.videoUrl, `${video.id}.mp4`)}>
                                                <Download className="mr-2 h-4 w-4" />
                                                Download Video
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>
        </div>
    )
}