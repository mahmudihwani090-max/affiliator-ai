"use client"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Send,
    Image as ImageIcon,
    Film,
    Upload,
    X,
    Loader2,
    Download,
    Play,
    Key,
    Eye,
    EyeOff,
} from "lucide-react"
import {
    submitMotionControl,
    checkMotionControlStatus,
} from "@/app/actions/motion-control"
import { toast } from "sonner"

type CharacterOrientation = "video" | "image"

interface GeneratedVideo {
    id: string
    prompt: string
    videoUrl: string
    imagePreview: string
    videoPreview: string
    characterOrientation: CharacterOrientation
    createdAt: Date
}

async function uploadFileToCloudinary(file: File): Promise<string> {
    const formData = new FormData()
    formData.append("file", file)
    const res = await fetch("/api/upload-asset", {
        method: "POST",
        body: formData,
    })
    if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || "Upload failed")
    }
    const data = await res.json()
    return data.url
}

export default function MotionControlPage() {
    const [apiKey, setApiKey] = useState("")
    const [showApiKey, setShowApiKey] = useState(false)
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(null)
    const [videoFile, setVideoFile] = useState<File | null>(null)
    const [videoPreview, setVideoPreview] = useState<string | null>(null)
    const [prompt, setPrompt] = useState("")
    const [characterOrientation, setCharacterOrientation] =
        useState<CharacterOrientation>("video")
    const [cfgScale, setCfgScale] = useState("0.5")
    const [isGenerating, setIsGenerating] = useState(false)
    const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([])
    const [previewVideo, setPreviewVideo] = useState<string | null>(null)
    const imageInputRef = useRef<HTMLInputElement>(null)
    const videoInputRef = useRef<HTMLInputElement>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith("image/")) {
            toast.error("Pilih file gambar (JPG, PNG, WEBP)")
            return
        }
        if (file.size > 10 * 1024 * 1024) {
            toast.error("Ukuran gambar maksimal 10MB")
            return
        }
        setImageFile(file)
        const url = URL.createObjectURL(file)
        setImagePreview(url)
    }

    const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith("video/")) {
            toast.error("Pilih file video (MP4, MOV, WEBM)")
            return
        }
        if (file.size > 100 * 1024 * 1024) {
            toast.error("Ukuran video maksimal 100MB")
            return
        }
        setVideoFile(file)
        const url = URL.createObjectURL(file)
        setVideoPreview(url)
    }

    const removeImage = () => {
        setImageFile(null)
        if (imagePreview) URL.revokeObjectURL(imagePreview)
        setImagePreview(null)
        if (imageInputRef.current) imageInputRef.current.value = ""
    }

    const removeVideo = () => {
        setVideoFile(null)
        if (videoPreview) URL.revokeObjectURL(videoPreview)
        setVideoPreview(null)
        if (videoInputRef.current) videoInputRef.current.value = ""
    }

    const pollTaskStatus = useCallback(
        async (
            taskId: string,
            maxAttempts = 120
        ): Promise<string | null> => {
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                await new Promise((resolve) => setTimeout(resolve, 5000))

                const result = await checkMotionControlStatus(taskId, apiKey)

                if (!result.success) {
                    throw new Error(result.error || "Failed to check status")
                }

                if (result.status === "completed" && result.videoUrl) {
                    return result.videoUrl
                }

                if (result.status === "failed") {
                    throw new Error("Video generation failed")
                }

                if (attempt > 0 && attempt % 6 === 0) {
                    toast.info(
                        `Masih memproses... (${Math.round((attempt * 5) / 60)} menit)`
                    )
                }
            }
            throw new Error("Timeout: video generation took too long")
        },
        [apiKey]
    )

    const handleGenerate = async () => {
        if (!apiKey.trim()) {
            toast.error("Freepik API Key wajib diisi!")
            return
        }
        if (!imageFile) {
            toast.error("Upload gambar karakter terlebih dahulu!")
            return
        }
        if (!videoFile) {
            toast.error("Upload video referensi terlebih dahulu!")
            return
        }

        setIsGenerating(true)
        const currentImagePreview = imagePreview
        const currentVideoPreview = videoPreview

        try {
            // Upload to Cloudinary
            toast.info("📤 Mengupload gambar ke Cloudinary...")
            const uploadedImageUrl = await uploadFileToCloudinary(imageFile)

            toast.info("📤 Mengupload video ke Cloudinary...")
            const uploadedVideoUrl = await uploadFileToCloudinary(videoFile)

            toast.info("🎬 Mengirim ke Kling Motion Control API...")

            const parsedCfg = parseFloat(cfgScale)
            const result = await submitMotionControl({
                imageUrl: uploadedImageUrl,
                videoUrl: uploadedVideoUrl,
                prompt: prompt.trim() || undefined,
                characterOrientation,
                cfgScale: isNaN(parsedCfg) ? 0.5 : Math.max(0, Math.min(1, parsedCfg)),
                apiKey: apiKey.trim(),
            })

            if (!result.success) {
                throw new Error(result.error || "Generation failed")
            }

            if (!result.taskId) {
                throw new Error(
                    result.error || "Freepik tidak mengembalikan task ID yang valid"
                )
            }

            toast.info("⏳ Task submitted! Estimasi 1-5 menit...")

            const resultVideoUrl = await pollTaskStatus(result.taskId)

            if (resultVideoUrl) {
                const newVideo: GeneratedVideo = {
                    id: Date.now().toString(),
                    prompt: prompt.trim() || "(no prompt)",
                    videoUrl: resultVideoUrl,
                    imagePreview: currentImagePreview || "",
                    videoPreview: currentVideoPreview || "",
                    characterOrientation,
                    createdAt: new Date(),
                }

                setGeneratedVideos((prev) => [...prev, newVideo])
                toast.success("Video berhasil dibuat! 🎬")

                setTimeout(() => {
                    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
                }, 100)
            } else {
                throw new Error("No video URL returned")
            }
        } catch (error) {
            console.error("Motion control generation failed:", error)
            toast.error(
                error instanceof Error ? error.message : "Generation failed"
            )
        } finally {
            setIsGenerating(false)
        }
    }

    const downloadVideo = async (url: string, filename: string) => {
        try {
            const response = await fetch(url)
            const blob = await response.blob()
            const blobUrl = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = blobUrl
            a.download = filename
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            window.URL.revokeObjectURL(blobUrl)
            toast.success("Video didownload!")
        } catch {
            toast.error("Gagal mendownload video")
        }
    }

    return (
        <div className="flex flex-col h-[calc(100vh-5rem)] max-h-[calc(100vh-5rem)]">
            {/* Results Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {generatedVideos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center mb-4">
                            <Film className="w-10 h-10 text-violet-500" />
                        </div>
                        <h2 className="text-2xl font-semibold mb-2">
                            Motion Control
                        </h2>
                        <p className="text-muted-foreground max-w-md">
                            Transfer motion dari video referensi ke gambar karakter menggunakan
                            Kling 2.6 Pro Motion Control. Karakter akan bergerak mengikuti pola
                            dari video referensi.
                        </p>
                        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-full">
                                <Key className="w-3 h-3" />
                                Freepik API Key Required
                            </span>
                            <span>⏱️ 1-5 menit per video</span>
                        </div>
                    </div>
                ) : (
                    generatedVideos.map((video) => (
                        <div key={video.id} className="space-y-3">
                            {/* User info bubble */}
                            <div className="flex justify-end">
                                <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2 max-w-[80%]">
                                    <p className="text-sm">{video.prompt}</p>
                                    <div className="mt-2 flex gap-2">
                                        {video.imagePreview && (
                                            <img
                                                src={video.imagePreview}
                                                alt="Character"
                                                className="w-12 h-12 rounded object-cover"
                                            />
                                        )}
                                        {video.videoPreview && (
                                            <video
                                                src={video.videoPreview}
                                                className="w-16 h-12 rounded object-cover"
                                                muted
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Generated video */}
                            <div className="flex justify-start">
                                <Card className="overflow-hidden max-w-md w-full bg-gradient-to-br from-background to-muted/30 border-muted-foreground/20">
                                    <div className="aspect-video w-full relative overflow-hidden bg-black">
                                        <video
                                            src={video.videoUrl}
                                            controls
                                            playsInline
                                            preload="metadata"
                                            className="w-full h-full object-contain"
                                        />
                                    </div>

                                    <div className="p-3 space-y-3">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1.5">
                                                <span className="inline-block w-2 h-2 rounded-full bg-violet-500"></span>
                                                {video.characterOrientation === "video"
                                                    ? "🎥 Video Orientation"
                                                    : "🖼️ Image Orientation"}
                                            </span>
                                            <span>
                                                {video.createdAt.toLocaleTimeString()}
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="flex-1 min-w-[80px]"
                                                onClick={() =>
                                                    setPreviewVideo(video.videoUrl)
                                                }
                                            >
                                                <Play className="w-4 h-4 mr-1" />
                                                Preview
                                            </Button>
                                            <Button
                                                variant="default"
                                                size="sm"
                                                className="flex-1 min-w-[80px]"
                                                onClick={() =>
                                                    downloadVideo(
                                                        video.videoUrl,
                                                        `motion-control-${video.id}.mp4`
                                                    )
                                                }
                                            >
                                                <Download className="w-4 h-4 mr-1" />
                                                Download
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        </div>
                    ))
                )}

                {isGenerating && (
                    <div className="flex justify-start">
                        <Card className="p-6">
                            <div className="flex items-center gap-3">
                                <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
                                <div>
                                    <span className="text-sm text-muted-foreground">
                                        Generating motion control video...
                                    </span>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        ⏱️ Estimasi 1-5 menit
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area - Fixed at bottom */}
            <div className="border-t bg-background p-3 space-y-3">
                {/* API Key Row */}
                <div className="flex gap-2 items-end">
                    <div className="flex-1 space-y-1">
                        <Label htmlFor="api-key" className="text-xs text-muted-foreground flex items-center gap-1">
                            <Key className="w-3 h-3" />
                            Freepik API Key
                        </Label>
                        <div className="relative">
                            <Input
                                id="api-key"
                                type={showApiKey ? "text" : "password"}
                                placeholder="Masukkan Freepik API Key..."
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                className="pr-10 text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => setShowApiKey(!showApiKey)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showApiKey ? (
                                    <EyeOff className="w-4 h-4" />
                                ) : (
                                    <Eye className="w-4 h-4" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* File Upload with Previews */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Character Image Upload */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <ImageIcon className="w-3 h-3" />
                            Character Image
                        </Label>
                        <input
                            ref={imageInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleImageSelect}
                            className="hidden"
                        />
                        {imagePreview ? (
                            <div className="relative group">
                                <img
                                    src={imagePreview}
                                    alt="Character preview"
                                    className="w-full h-28 rounded-lg object-cover border"
                                />
                                <button
                                    onClick={removeImage}
                                    className="absolute top-1 right-1 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                                <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                                    {imageFile?.name}
                                </span>
                            </div>
                        ) : (
                            <button
                                onClick={() => imageInputRef.current?.click()}
                                className="w-full h-28 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-violet-500/50 transition-colors flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-violet-500"
                            >
                                <Upload className="w-5 h-5" />
                                <span className="text-xs">Upload gambar karakter</span>
                                <span className="text-[10px] opacity-60">JPG, PNG, WEBP · Max 10MB</span>
                            </button>
                        )}
                    </div>

                    {/* Reference Video Upload */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <Film className="w-3 h-3" />
                            Reference Video
                        </Label>
                        <input
                            ref={videoInputRef}
                            type="file"
                            accept="video/mp4,video/mov,video/webm,video/quicktime"
                            onChange={handleVideoSelect}
                            className="hidden"
                        />
                        {videoPreview ? (
                            <div className="relative group">
                                <video
                                    src={videoPreview}
                                    className="w-full h-28 rounded-lg object-cover border bg-black"
                                    muted
                                    playsInline
                                    onMouseEnter={(e) => e.currentTarget.play()}
                                    onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0 }}
                                />
                                <button
                                    onClick={removeVideo}
                                    className="absolute top-1 right-1 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                                <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                                    {videoFile?.name}
                                </span>
                                <span className="absolute top-1 left-1 text-[10px] bg-violet-600 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                    <Play className="w-2.5 h-2.5" /> Hover to play
                                </span>
                            </div>
                        ) : (
                            <button
                                onClick={() => videoInputRef.current?.click()}
                                className="w-full h-28 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-violet-500/50 transition-colors flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-violet-500"
                            >
                                <Upload className="w-5 h-5" />
                                <span className="text-xs">Upload video referensi</span>
                                <span className="text-[10px] opacity-60">MP4, MOV, WEBM · 3-30 detik</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Options Row */}
                <div className="flex gap-2 items-center">
                    <Select
                        value={characterOrientation}
                        onValueChange={(v) =>
                            setCharacterOrientation(v as CharacterOrientation)
                        }
                    >
                        <SelectTrigger className="w-[200px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="video">
                                🎥 Video Orientation (max 30s)
                            </SelectItem>
                            <SelectItem value="image">
                                🖼️ Image Orientation (max 10s)
                            </SelectItem>
                        </SelectContent>
                    </Select>

                    <div className="flex items-center gap-1.5">
                        <Label htmlFor="cfg-scale" className="text-xs text-muted-foreground whitespace-nowrap">
                            CFG Scale
                        </Label>
                        <Input
                            id="cfg-scale"
                            type="number"
                            min="0"
                            max="1"
                            step="0.1"
                            value={cfgScale}
                            onChange={(e) => setCfgScale(e.target.value)}
                            className="w-20 text-sm"
                        />
                    </div>
                </div>

                {/* Prompt + Send */}
                <div className="flex gap-2 items-end">
                    <Textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault()
                                handleGenerate()
                            }
                        }}
                        placeholder="Prompt opsional untuk memandu motion transfer..."
                        className="min-h-[40px] max-h-[100px] resize-none flex-1 text-sm"
                        rows={1}
                    />

                    <Button
                        onClick={handleGenerate}
                        disabled={
                            !apiKey.trim() ||
                            !imageFile ||
                            !videoFile ||
                            isGenerating
                        }
                        className="shrink-0 h-10 w-10 bg-violet-600 hover:bg-violet-700"
                        size="icon"
                        title={
                            !apiKey.trim()
                                ? "API Key wajib diisi"
                                : !imageFile
                                    ? "Upload gambar karakter"
                                    : !videoFile
                                        ? "Upload video referensi"
                                        : "Generate"
                        }
                    >
                        {isGenerating ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Send className="w-5 h-5" />
                        )}
                    </Button>
                </div>
            </div>

            {/* Preview Modal */}
            {previewVideo && (
                <div
                    className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
                    onClick={() => setPreviewVideo(null)}
                >
                    <div className="relative flex items-center justify-center max-w-[95vw] max-h-[85vh]">
                        <button
                            onClick={() => setPreviewVideo(null)}
                            className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors z-10"
                        >
                            <X className="w-8 h-8" />
                        </button>
                        <video
                            src={previewVideo}
                            controls
                            autoPlay
                            playsInline
                            preload="auto"
                            className="rounded-lg shadow-2xl w-full max-h-[80vh]"
                            style={{ objectFit: "contain" }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
