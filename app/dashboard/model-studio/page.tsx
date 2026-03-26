"use client"

import Image from "next/image"
import { useRef, useState, type ReactNode } from "react"

import { checkImageJobStatus, generateImageToImage, generateTextToImage, upscaleImage } from "@/app/actions/generate-image"
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
import { toUserFacingGenerationError } from "@/lib/generation-errors"
import { buildModelStudioPrompt, type ModelStudioConfig } from "@/lib/model-studio"
import { CheckCircle2, Copy, Download, Eye, Image as ImageIcon, Loader2, RefreshCw, Sparkles, UserRound, X, ZoomIn } from "lucide-react"
import { toast } from "sonner"

type AspectRatio = "landscape" | "portrait"

type GeneratedStudioImage = {
    id: string
    prompt: string
    imageUrl: string
    aspectRatio: AspectRatio
    createdAt: Date
    referenceImages: string[]
    sourceConfig: ModelStudioConfig
    mediaGenerationId?: string
    isUpscaled?: boolean
}

type PollImageResult = {
    imageUrl: string | null
    mediaGenerationId?: string
}

type ModelPreset = {
    name: string
    description: string
    values: Partial<ModelStudioConfig>
}

const modelFocusOptions = ["Beauty portrait", "Fashion editorial", "Commercial lifestyle", "Clean headshot", "Luxury campaign"]
const shootStyleOptions = ["Studio beauty", "Editorial fashion", "Soft cinematic", "Commercial clean", "Luxury portrait"]
const backgroundMoodOptions = ["Minimal studio", "Soft gradient", "Luxury dark set", "Bright clean", "Editorial backdrop"]
const modelPresets: ModelPreset[] = [
    {
        name: "Beauty Campaign",
        description: "Close beauty portrait dengan skin detail yang clean dan premium.",
        values: {
            modelFocus: "Beauty portrait",
            targetLook: "clean premium beauty campaign",
            stylingDetails: "fresh luminous skin, polished makeup, premium wardrobe",
            shootStyle: "Studio beauty",
            expressionAndPose: "calm confident gaze, elegant pose",
            backgroundMood: "Soft gradient",
            aspectRatio: "portrait",
        },
    },
    {
        name: "Editorial Fashion",
        description: "Fashion look yang lebih berani dengan framing editorial.",
        values: {
            modelFocus: "Fashion editorial",
            targetLook: "high-fashion editorial spread with premium styling",
            stylingDetails: "sharp wardrobe styling, luxury accessories, refined makeup",
            shootStyle: "Editorial fashion",
            expressionAndPose: "confident editorial pose with strong body language",
            backgroundMood: "Editorial backdrop",
            aspectRatio: "portrait",
        },
    },
    {
        name: "Lifestyle Commercial",
        description: "Visual komersial yang hangat untuk ads dan brand campaign.",
        values: {
            modelFocus: "Commercial lifestyle",
            targetLook: "friendly premium commercial campaign",
            stylingDetails: "approachable wardrobe, polished grooming, commercial-ready look",
            shootStyle: "Commercial clean",
            expressionAndPose: "natural smile, easy relaxed pose",
            backgroundMood: "Bright clean",
            aspectRatio: "landscape",
        },
    },
    {
        name: "Luxury Portrait",
        description: "Portrait mewah dengan mood lebih gelap dan cinematic.",
        values: {
            modelFocus: "Luxury campaign",
            targetLook: "luxury brand portrait with cinematic polish",
            stylingDetails: "structured premium styling, glossy beauty finish, dramatic wardrobe",
            shootStyle: "Luxury portrait",
            expressionAndPose: "poised luxury pose with subtle intensity",
            backgroundMood: "Luxury dark set",
            aspectRatio: "portrait",
        },
    },
]

const defaultConfig: ModelStudioConfig = {
    modelFocus: "Beauty portrait",
    targetLook: "clean premium beauty campaign",
    stylingDetails: "fresh skin, polished styling, premium wardrobe",
    shootStyle: "Studio beauty",
    expressionAndPose: "confident, natural, elegant pose",
    backgroundMood: "Minimal studio",
    aspectRatio: "portrait",
}

function FieldLabel({ children }: { children: ReactNode }) {
    return <label className="mb-2 block text-sm font-semibold text-zinc-600 dark:text-zinc-400">{children}</label>
}

function DarkInput({ className, ...props }: React.ComponentProps<typeof Input>) {
    return <Input {...props} className={`h-14 rounded-2xl border-gray-300 bg-gray-50 px-4 text-base text-foreground placeholder:text-zinc-400 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30 dark:border-white/10 dark:bg-[#090909] dark:placeholder:text-zinc-500 ${className ?? ""}`} />
}

function DarkTextarea({ className, ...props }: React.ComponentProps<typeof Textarea>) {
    return <Textarea {...props} className={`min-h-[130px] rounded-2xl border-gray-300 bg-gray-50 px-4 py-4 text-base text-foreground placeholder:text-zinc-400 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30 dark:border-white/10 dark:bg-[#090909] dark:placeholder:text-zinc-500 ${className ?? ""}`} />
}

function DarkSelect({ value, onValueChange, options }: { value: string; onValueChange: (value: string) => void; options: string[] }) {
    return (
        <Select value={value} onValueChange={onValueChange}>
            <SelectTrigger className="h-14 w-full rounded-2xl border-gray-300 bg-gray-50 px-4 text-base text-foreground focus-visible:border-emerald-400 focus-visible:ring-emerald-400/30 dark:border-white/10 dark:bg-[#090909]">
                <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-gray-200 bg-white text-foreground dark:border-white/10 dark:bg-[#111111]">
                {options.map((option) => <SelectItem key={option} value={option} className="text-sm text-foreground focus:bg-gray-100 dark:focus:bg-white/10">{option}</SelectItem>)}
            </SelectContent>
        </Select>
    )
}

function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (event) => typeof event.target?.result === "string" ? resolve(event.target.result) : reject(new Error("Gagal membaca file"))
        reader.onerror = () => reject(new Error("Gagal membaca file"))
        reader.readAsDataURL(file)
    })
}

function getProxiedImageUrl(url: string) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`
}

async function downloadImage(imageUrl: string, filename: string) {
    try {
        if (imageUrl.startsWith("data:")) {
            const link = document.createElement("a")
            link.href = imageUrl
            link.download = filename
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            return
        }

        const response = await fetch(getProxiedImageUrl(imageUrl))
        const blob = await response.blob()
        const objectUrl = window.URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = objectUrl
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(objectUrl)
    } catch {
        toast.error("Gagal download image")
    }
}

export default function ModelStudioPage() {
    const [config, setConfig] = useState<ModelStudioConfig>(defaultConfig)
    const [referenceImages, setReferenceImages] = useState<string[]>([])
    const [generatedImages, setGeneratedImages] = useState<GeneratedStudioImage[]>([])
    const [isGenerating, setIsGenerating] = useState(false)
    const [previewImage, setPreviewImage] = useState<string | null>(null)
    const [upscalingId, setUpscalingId] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const updateConfig = <K extends keyof ModelStudioConfig>(key: K, value: ModelStudioConfig[K]) => setConfig((current) => ({ ...current, [key]: value }))
    const applyPreset = (preset: ModelPreset) => {
        setConfig((current) => ({ ...current, ...preset.values }))
        toast.success(`Preset ${preset.name} diterapkan`)
    }

    const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []).slice(0, 3 - referenceImages.length)
        try {
            const images = await Promise.all(files.map(async (file) => {
                if (!file.type.startsWith("image/")) throw new Error("File harus berupa gambar")
                return readFileAsDataUrl(file)
            }))
            setReferenceImages((current) => [...current, ...images].slice(0, 3))
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Gagal upload image")
        } finally {
            event.target.value = ""
        }
    }

    const pollImage = async (jobId: string, operation: "textToImage" | "imageToImage" | "upscaleImage", maxAttempts = 60): Promise<PollImageResult> => {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 5000))
            const status = await checkImageJobStatus(jobId, operation)
            if (status.status === "completed") {
                return {
                    imageUrl: status.imageUrl || status.imageUrls?.[0] || null,
                    mediaGenerationId: status.mediaGenerationId,
                }
            }
            if (status.status === "failed") throw new Error(toUserFacingGenerationError(status.error, operation === "upscaleImage" ? "imageUpscale" : "image"))
        }
        throw new Error(toUserFacingGenerationError("Job timed out", operation === "upscaleImage" ? "imageUpscale" : "image"))
    }

    const createImage = async (nextConfig: ModelStudioConfig, nextReferences: string[]) => {
        const prompt = buildModelStudioPrompt(nextConfig)
        const result = nextReferences.length > 0
            ? await generateImageToImage({ prompt, referenceImagesBase64: nextReferences.map((image) => image.split(",")[1] || image), aspectRatio: nextConfig.aspectRatio })
            : await generateTextToImage({ prompt, aspectRatio: nextConfig.aspectRatio })

        if (!result.success) throw new Error(result.error || "Gagal generate image")

        let imageUrl = result.imageUrl || result.imageUrls?.[0]
        let mediaGenerationId = result.mediaGenerationId

        if (!imageUrl && result.jobId) {
            const polledResult = await pollImage(result.jobId, nextReferences.length > 0 ? "imageToImage" : "textToImage")
            imageUrl = polledResult.imageUrl || undefined
            mediaGenerationId = polledResult.mediaGenerationId || mediaGenerationId
        }

        if (!imageUrl) throw new Error("Tidak ada image URL")

        return {
            prompt,
            imageUrl,
            mediaGenerationId,
        }
    }

    const handleGenerate = async () => {
        setIsGenerating(true)
        try {
            const generated = await createImage(config, referenceImages)
            setGeneratedImages((current) => [{
                id: Date.now().toString(),
                prompt: generated.prompt,
                imageUrl: generated.imageUrl,
                aspectRatio: config.aspectRatio,
                createdAt: new Date(),
                referenceImages: [...referenceImages],
                sourceConfig: { ...config },
                mediaGenerationId: generated.mediaGenerationId,
            }, ...current])
            toast.success("Model Studio image berhasil dibuat")
        } catch (error) {
            toast.error(toUserFacingGenerationError(error instanceof Error ? error.message : undefined, "image"))
        } finally {
            setIsGenerating(false)
        }
    }

    const handleRegenerate = async (image: GeneratedStudioImage) => {
        setIsGenerating(true)
        try {
            const generated = await createImage(image.sourceConfig, image.referenceImages)
            setGeneratedImages((current) => [{
                id: `${Date.now()}`,
                prompt: generated.prompt,
                imageUrl: generated.imageUrl,
                aspectRatio: image.sourceConfig.aspectRatio,
                createdAt: new Date(),
                referenceImages: [...image.referenceImages],
                sourceConfig: { ...image.sourceConfig },
                mediaGenerationId: generated.mediaGenerationId,
            }, ...current])
            toast.success("Variasi baru berhasil dibuat")
        } catch (error) {
            toast.error(toUserFacingGenerationError(error instanceof Error ? error.message : undefined, "image"))
        } finally {
            setIsGenerating(false)
        }
    }

    const handleDuplicateAsDraft = (image: GeneratedStudioImage) => {
        setConfig({ ...image.sourceConfig })
        setReferenceImages([...image.referenceImages])
        toast.success("Konfigurasi dimuat kembali ke form")
    }

    const handleUpscale = async (image: GeneratedStudioImage) => {
        if (!image.mediaGenerationId || image.isUpscaled) return

        try {
            setUpscalingId(image.id)
            const result = await upscaleImage({ mediaGenerationId: image.mediaGenerationId, resolution: "2k" })
            if (!result.success) throw new Error(result.error || "Gagal upscale image")

            let upscaledUrl = result.imageUrl
            if (!upscaledUrl && result.jobId) {
                const polledResult = await pollImage(result.jobId, "upscaleImage", 120)
                upscaledUrl = polledResult.imageUrl || undefined
            }
            if (!upscaledUrl) throw new Error("Tidak ada hasil upscale")

            setGeneratedImages((current) => current.map((item) => item.id === image.id ? { ...item, imageUrl: upscaledUrl, isUpscaled: true } : item))
            toast.success("Image berhasil di-upscale ke 2K")
        } catch (error) {
            toast.error(toUserFacingGenerationError(error instanceof Error ? error.message : undefined, "imageUpscale"))
        } finally {
            setUpscalingId(null)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 text-slate-900 dark:bg-[#070707] dark:text-white">
            <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
                <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleUpload} />

                <Card className="rounded-[2rem] border-gray-200 bg-white py-0 text-foreground shadow-lg dark:border-white/8 dark:bg-[#111111] dark:shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
                    <div className="space-y-6 p-5 md:p-6">
                        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                            <div>
                                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-300">
                                    <UserRound className="h-3.5 w-3.5" /> Model Studio
                                </div>
                                <h1 className="text-2xl font-black tracking-tight md:text-3xl">Model Studio</h1>
                                <p className="mt-2 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">Generate portrait, fashion, atau beauty studio image dengan reference identity, lalu lanjutkan dengan preview, regenerate, duplicate draft, dan upscale.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600 dark:text-zinc-300 md:min-w-[280px]">
                                <div className="rounded-2xl border border-gray-200 bg-gray-100 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                                    <p className="text-zinc-500">Reference</p>
                                    <p className="mt-1 font-semibold text-foreground">Maks. 3 image</p>
                                </div>
                                <div className="rounded-2xl border border-gray-200 bg-gray-100 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                                    <p className="text-zinc-500">Output</p>
                                    <p className="mt-1 font-semibold text-foreground">Portrait / landscape</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 rounded-[1.5rem] border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#0c0c0c]">
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">Preset Model</h2>
                                <p className="mt-1 text-sm text-zinc-500">Pilih preset untuk menyiapkan arah styling, mood, dan framing lebih cepat.</p>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{modelPresets.map((preset) => <button key={preset.name} type="button" onClick={() => applyPreset(preset)} className="rounded-2xl border border-gray-200 bg-gray-100 p-4 text-left transition hover:border-emerald-400/40 hover:bg-emerald-400/10 dark:border-white/10 dark:bg-white/5"><p className="text-sm font-semibold text-foreground">{preset.name}</p><p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{preset.description}</p></button>)}</div>
                        </div>

                        <div className="grid gap-6 md:grid-cols-2">
                            <div><FieldLabel>Model Focus</FieldLabel><DarkSelect value={config.modelFocus} onValueChange={(value) => updateConfig("modelFocus", value)} options={modelFocusOptions} /></div>
                            <div><FieldLabel>Shoot Style</FieldLabel><DarkSelect value={config.shootStyle} onValueChange={(value) => updateConfig("shootStyle", value)} options={shootStyleOptions} /></div>
                            <div><FieldLabel>Target Look</FieldLabel><DarkInput value={config.targetLook} onChange={(event) => updateConfig("targetLook", event.target.value)} /></div>
                            <div><FieldLabel>Background Mood</FieldLabel><DarkSelect value={config.backgroundMood} onValueChange={(value) => updateConfig("backgroundMood", value)} options={backgroundMoodOptions} /></div>
                            <div className="md:col-span-2"><FieldLabel>Styling Details</FieldLabel><DarkTextarea value={config.stylingDetails} onChange={(event) => updateConfig("stylingDetails", event.target.value)} /></div>
                            <div className="md:col-span-2"><FieldLabel>Expression & Pose</FieldLabel><DarkTextarea value={config.expressionAndPose} onChange={(event) => updateConfig("expressionAndPose", event.target.value)} /></div>
                            <div><FieldLabel>Aspect Ratio</FieldLabel><DarkSelect value={config.aspectRatio === "portrait" ? "9:16" : "16:9"} onValueChange={(value) => updateConfig("aspectRatio", value === "9:16" ? "portrait" : "landscape")} options={["9:16", "16:9"]} /></div>
                            <div><FieldLabel>Reference Images (Max 3)</FieldLabel><Button type="button" variant="outline" className="h-14 w-full rounded-2xl border-gray-300 bg-transparent text-foreground hover:bg-gray-100 dark:border-white/10 dark:text-white dark:hover:bg-white/5" onClick={() => inputRef.current?.click()}><ImageIcon className="mr-2 h-4 w-4" />Upload References</Button></div>
                        </div>

                        {referenceImages.length > 0 ? <div className="grid gap-3 sm:grid-cols-3">{referenceImages.map((image, index) => <div key={`${image.slice(0, 20)}-${index}`} className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-black"><Image src={image} alt={`Reference ${index + 1}`} width={240} height={240} unoptimized className="aspect-square w-full object-cover" /><button type="button" onClick={() => setReferenceImages((current) => current.filter((_, currentIndex) => currentIndex !== index))} className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white"><X className="h-4 w-4" /></button></div>)}</div> : null}

                        <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 md:flex-row md:items-center md:justify-between dark:border-white/10">
                            <p className="text-sm text-zinc-500">Gunakan draft saat ini untuk membuat hasil baru. Result card di bawah bisa langsung di-preview, di-regenerate, di-duplicate ke form, dan di-upscale.</p>
                            <Button onClick={handleGenerate} disabled={isGenerating} className="h-11 rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-black hover:bg-emerald-400">{isGenerating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</> : <><Sparkles className="mr-2 h-4 w-4" />Generate Model Image</>}</Button>
                        </div>
                    </div>
                </Card>

                {generatedImages.length > 0 ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{generatedImages.map((image) => {
                    const displayUrl = image.imageUrl.startsWith("data:") ? image.imageUrl : getProxiedImageUrl(image.imageUrl)
                    return (
                        <Card key={image.id} className="overflow-hidden rounded-[1.75rem] border-gray-200 bg-white py-0 text-foreground shadow-md dark:border-white/10 dark:bg-[#111111] dark:shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
                            <Image src={displayUrl} alt="Generated model studio" width={900} height={1200} unoptimized className={`w-full bg-gray-100 object-contain dark:bg-black ${image.aspectRatio === "portrait" ? "aspect-[9/16]" : "aspect-video"}`} />
                            <div className="space-y-4 p-5">
                                <div className="flex flex-wrap gap-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                                    <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 dark:border-white/10 dark:bg-white/5">{image.sourceConfig.modelFocus}</span>
                                    <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 dark:border-white/10 dark:bg-white/5">{image.sourceConfig.shootStyle}</span>
                                    <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 dark:border-white/10 dark:bg-white/5">{image.aspectRatio === "portrait" ? "9:16" : "16:9"}</span>
                                    {image.isUpscaled ? <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-emerald-300">2K Upscaled</span> : null}
                                </div>
                                <div className="flex items-center justify-between text-xs text-zinc-500">
                                    <span>{image.createdAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                                    <span>{image.referenceImages.length} refs</span>
                                </div>
                                <p className="line-clamp-5 text-sm text-zinc-500 dark:text-zinc-400">{image.prompt}</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button type="button" variant="outline" className="border-gray-200 bg-transparent text-foreground hover:bg-gray-100 dark:border-white/10 dark:hover:bg-white/5" onClick={() => setPreviewImage(displayUrl)}><Eye className="mr-2 h-4 w-4" />Preview</Button>
                                    <Button type="button" variant="outline" className="border-gray-200 bg-transparent text-foreground hover:bg-gray-100 dark:border-white/10 dark:hover:bg-white/5" onClick={() => handleRegenerate(image)} disabled={isGenerating}><RefreshCw className="mr-2 h-4 w-4" />Regenerate</Button>
                                    <Button type="button" variant="outline" className="border-gray-200 bg-transparent text-foreground hover:bg-gray-100 dark:border-white/10 dark:hover:bg-white/5" onClick={() => handleDuplicateAsDraft(image)}><Copy className="mr-2 h-4 w-4" />Duplicate Draft</Button>
                                    <Button type="button" variant="outline" className="border-gray-200 bg-transparent text-foreground hover:bg-gray-100 dark:border-white/10 dark:hover:bg-white/5" onClick={() => handleUpscale(image)} disabled={!image.mediaGenerationId || image.isUpscaled || upscalingId === image.id}>{upscalingId === image.id ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Upscaling...</> : image.isUpscaled ? <><CheckCircle2 className="mr-2 h-4 w-4" />Upscaled</> : <><ZoomIn className="mr-2 h-4 w-4" />Upscale 2K</>}</Button>
                                </div>
                                <Button type="button" className="h-10 w-full rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200" onClick={() => void downloadImage(image.imageUrl, `model-studio-${image.id}.${image.isUpscaled ? "jpg" : "png"}`)}><Download className="mr-2 h-4 w-4" />Download</Button>
                            </div>
                        </Card>
                    )
                })}</div> : <Card className="rounded-[1.75rem] border-dashed border-gray-200 bg-white py-10 text-center text-zinc-500 dark:border-white/10 dark:bg-[#111111]"><p className="text-sm">Belum ada hasil. Generate image pertama untuk mulai membangun variasi model studio.</p></Card>}
            </div>

            {previewImage ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setPreviewImage(null)}>
                    <button type="button" onClick={() => setPreviewImage(null)} className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
                        <X className="h-5 w-5" />
                    </button>
                    <div className="relative max-h-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
                        <Image src={previewImage} alt="Preview model studio" width={1600} height={1600} unoptimized className="max-h-[88vh] w-auto rounded-3xl object-contain" />
                    </div>
                </div>
            ) : null}
        </div>
    )
}