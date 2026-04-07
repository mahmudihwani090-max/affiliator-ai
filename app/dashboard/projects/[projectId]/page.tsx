"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  ArrowLeft, ChevronDown, ChevronUp, Download, Film, ImageIcon, LayoutGrid,
  Loader2, Plus, Sparkles, Trash2, Video, X, Zap, FastForward, AlertTriangle, Clock3,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { toUserFacingGenerationError } from "@/lib/generation-errors"
import {
  dispatchGenerationQueueSummaryRefresh,
  subscribeGenerationQueueSummaryRefresh,
} from "@/lib/generation-queue-events"
import { getGenerationQueueNotice } from "@/lib/generation-queue-notice"
import { useIsMobile } from "@/hooks/use-mobile"
import Lottie from "lottie-react"

import { getProject, addProjectAsset, deleteProjectAsset } from "@/app/actions/project"
import { generateTextToImage, generateImageToImage, checkImageJobStatus, upscaleImage, generateTextToVideo, generateImageToVideo, generateFrameToFrameVideo, generateReferenceToVideo, checkVideoJobStatus, upscaleVideo, extendVideo } from "@/lib/client/generation-api"

type AspectRatio = "landscape" | "portrait"
type VideoMode = "text" | "frames" | "reference"
// Model is always veo-3.1-fast-relaxed
type FilterType = "all" | "images" | "videos"

type Asset = {
  id: string
  type: string
  source: string
  name: string
  url: string
  prompt: string | null
  aspectRatio: string | null
  mediaGenerationId: string | null
  createdAt: string
}

type Project = {
  id: string
  name: string
  description: string | null
  assets: Asset[]
}

type PendingGenerationJob = {
  jobId: string
  type: "image" | "video"
  modeLabel: string
  prompt: string
  aspectRatio: AspectRatio
  status: "queued" | "submitting" | "running"
  queuePosition?: number
}

type SubmittingGenerationJob = {
  id: string
  type: "image" | "video"
  modeLabel: string
  prompt: string
  aspectRatio: AspectRatio
}

type SharedGenerationQueueSummary = {
  totalPending: number
  activeCount: number
  queuedCount: number
  limit: number
}

const POLL_INTERVAL = 4000
const PROJECT_QUEUE_LIMIT = 10

function createLocalGenerationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  return `generation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string
  const isMobile = useIsMobile()

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [filter, setFilter] = useState<FilterType>("all")
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [assetPickerMode, setAssetPickerMode] = useState<"reference" | "start" | "end">("reference")

  // Generate bar state
  const [generateType, setGenerateType] = useState<"image" | "video">("image")
  const [prompt, setPrompt] = useState("")
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("landscape")
  const videoModel = "veo-3.1-fast-relaxed"
  const [videoMode, setVideoMode] = useState<VideoMode>("text")
  const [videoCount, setVideoCount] = useState(1)
  const [referenceImages, setReferenceImages] = useState<string[]>([])
  const [startImage, setStartImage] = useState<string | null>(null)
  const [endImage, setEndImage] = useState<string | null>(null)
  const [submittingGenerationJobs, setSubmittingGenerationJobs] = useState<SubmittingGenerationJob[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isUpscaling, setIsUpscaling] = useState(false)
  const [isComposerExpanded, setIsComposerExpanded] = useState(true)
  const [showExtendInput, setShowExtendInput] = useState(false)
  const [extendPrompt, setExtendPrompt] = useState("")
  const [pendingGenerationJobs, setPendingGenerationJobs] = useState<PendingGenerationJob[]>([])
  const [sharedQueueSummary, setSharedQueueSummary] = useState<SharedGenerationQueueSummary>({
    totalPending: 0,
    activeCount: 0,
    queuedCount: 0,
    limit: PROJECT_QUEUE_LIMIT,
  })
  const [pollingJobId, setPollingJobId] = useState<string | null>(null)
  const [processingLabel, setProcessingLabel] = useState<string | null>(null)
  const [catAnimation, setCatAnimation] = useState<object | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const generationPollingRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({})

  const pollingCompletedRef = useRef(false)
  const loadingSkeletonRef = useRef<HTMLDivElement>(null)
  const uploadFileRef = useRef<HTMLInputElement>(null)
  const refImgInputRef = useRef<HTMLInputElement>(null)
  const startImgInputRef = useRef<HTMLInputElement>(null)
  const endImgInputRef = useRef<HTMLInputElement>(null)

  const fetchProject = useCallback(async () => {
    const res = await getProject(projectId)
    if (res.success && res.project) {
      const p = res.project as unknown as Project
      setProject(p)
      setSelectedAsset(prev => {
        if (prev) return p.assets.find(a => a.id === prev.id) ?? p.assets[0] ?? null
        return p.assets[0] ?? null
      })
    } else {
      toast.error("Project tidak ditemukan")
      router.push("/dashboard/projects")
    }
    setLoading(false)
  }, [projectId, router])

  useEffect(() => { fetchProject() }, [fetchProject])
  useEffect(() => () => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    Object.values(generationPollingRefs.current).forEach((intervalId) => clearInterval(intervalId))
  }, [])
  useEffect(() => { setIsComposerExpanded(!isMobile) }, [isMobile])

  // Load cat Lottie animation
  useEffect(() => {
    fetch("/cat-loading.json")
      .then(res => res.json())
      .then(data => setCatAnimation(data))
      .catch(() => {})
  }, [])

  const loadSharedQueueSummary = useCallback(async () => {
    try {
      const response = await fetch("/api/generation-queue/summary", {
        cache: "no-store",
      })

      if (!response.ok) {
        return
      }

      const data = (await response.json()) as {
        success?: boolean
        summary?: SharedGenerationQueueSummary
      }

      if (data.success && data.summary) {
        setSharedQueueSummary(data.summary)
      }
    } catch {
      // Keep last known server summary if refresh fails.
    }
  }, [])

  useEffect(() => {
    void loadSharedQueueSummary()
    const intervalId = window.setInterval(() => {
      void loadSharedQueueSummary()
    }, POLL_INTERVAL)
    const unsubscribe = subscribeGenerationQueueSummaryRefresh(() => {
      void loadSharedQueueSummary()
    })

    return () => {
      window.clearInterval(intervalId)
      unsubscribe()
    }
  }, [loadSharedQueueSummary])

  const addPendingGenerationJob = useCallback((job: PendingGenerationJob) => {
    setPendingGenerationJobs(prev => {
      if (prev.some(item => item.jobId === job.jobId)) {
        return prev
      }

      return [job, ...prev]
    })

    setTimeout(() => {
      loadingSkeletonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 100)
  }, [])

  const updatePendingGenerationJob = useCallback((jobId: string, updates: Partial<PendingGenerationJob>) => {
    setPendingGenerationJobs(prev => prev.map(job => job.jobId === jobId ? { ...job, ...updates } : job))
  }, [])

  const clearPendingGenerationJob = useCallback((jobId: string) => {
    const intervalId = generationPollingRefs.current[jobId]
    if (intervalId) {
      clearInterval(intervalId)
      delete generationPollingRefs.current[jobId]
    }

    setPendingGenerationJobs(prev => prev.filter(job => job.jobId !== jobId))
  }, [])

  const addSubmittingGenerationJob = useCallback((job: SubmittingGenerationJob) => {
    setSubmittingGenerationJobs(prev => [job, ...prev])

    setTimeout(() => {
      loadingSkeletonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 100)
  }, [])

  const clearSubmittingGenerationJob = useCallback((jobId: string) => {
    setSubmittingGenerationJobs(prev => prev.filter(job => job.id !== jobId))
  }, [])

  const filteredAssets = (project?.assets ?? []).filter(a =>
    filter === "images" ? a.type === "image"
    : filter === "videos" ? a.type === "video"
    : true
  )
  const filteredSubmittingGenerationJobs = submittingGenerationJobs.filter(job =>
    filter === "images" ? job.type === "image"
    : filter === "videos" ? job.type === "video"
    : true
  )
  const filteredPendingGenerationJobs = pendingGenerationJobs.filter(job =>
    filter === "images" ? job.type === "image"
    : filter === "videos" ? job.type === "video"
    : true
  )
  const pendingServerBackedGenerateCount = Math.max(sharedQueueSummary.totalPending, pendingGenerationJobs.length)
  const effectiveQueueLimit = sharedQueueSummary.limit || PROJECT_QUEUE_LIMIT
  const totalPendingGenerateCount = pendingServerBackedGenerateCount + submittingGenerationJobs.length
  const isGenerateControlsDisabled = isGenerating
  const hasQueuedPendingGeneration = sharedQueueSummary.queuedCount > 0 || pendingGenerationJobs.some(job => job.status === "queued")
  const pendingGenerationMessage = submittingGenerationJobs.length > 0
    ? `${totalPendingGenerateCount}/${effectiveQueueLimit} request aktif`
    : hasQueuedPendingGeneration
      ? `${totalPendingGenerateCount}/${effectiveQueueLimit} request dalam antrean`
      : `${totalPendingGenerateCount}/${effectiveQueueLimit} request sedang diproses`
  const selectedInputCount = generateType === "image"
    ? referenceImages.length
    : videoMode === "reference"
      ? referenceImages.length
      : Number(Boolean(startImage)) + Number(Boolean(endImage))
  const composerSummary = [
    generateType === "image"
      ? "Image"
      : `Video ${videoMode === "text" ? "Text" : videoMode === "frames" ? "Frames" : "Reference"}`,
    aspectRatio === "landscape" ? "Landscape" : "Portrait",
    selectedInputCount > 0 ? `${selectedInputCount} input` : null,
    prompt.trim() ? "Prompt siap" : isMobile ? "Tap untuk buka panel" : "Klik untuk minimize / expand",
  ].filter(Boolean).join(" • ")

  // ── Polling helpers ────────────────────────────────────────────

  const startPollingImage = (
    jobId: string,
    pr: string,
    ratio: AspectRatio,
    operation: "textToImage" | "imageToImage" | "upscaleImage",
    modeLabel: string,
    initialStatus?: "queued" | "submitting" | "created" | "started" | "running" | "completed" | "failed",
    initialQueuePosition?: number,
    onCompleted?: (imageUrl: string, mediaGenId?: string) => Promise<void>,
  ) => {
    addPendingGenerationJob({
      jobId,
      type: "image",
      modeLabel,
      prompt: pr,
      aspectRatio: ratio,
      status: initialStatus === "queued" ? "queued" : initialStatus === "submitting" ? "submitting" : "running",
      queuePosition: initialQueuePosition,
    })

    let isChecking = false
    generationPollingRefs.current[jobId] = setInterval(async () => {
      if (isChecking) return
      isChecking = true

      try {
        const s = await checkImageJobStatus(jobId, operation)
        const completedImageUrl = s.imageUrl || s.imageUrls?.[0]
        if (s.status === "completed" && completedImageUrl) {
          clearPendingGenerationJob(jobId)
          dispatchGenerationQueueSummaryRefresh()
          if (onCompleted) {
            await onCompleted(completedImageUrl, s.mediaGenerationId)
          } else {
            await saveAsset("image", completedImageUrl, pr, ratio, s.mediaGenerationId)
          }
        } else if (s.status === "failed") {
          clearPendingGenerationJob(jobId)
          dispatchGenerationQueueSummaryRefresh()
          toast.error(toUserFacingGenerationError(s.error, operation === "upscaleImage" ? "imageUpscale" : "image"))
        } else {
          updatePendingGenerationJob(jobId, {
            status: s.status === "queued" ? "queued" : s.status === "submitting" ? "submitting" : "running",
            queuePosition: s.queuePosition,
          })
        }
      } finally {
        isChecking = false
      }
    }, POLL_INTERVAL)
  }

  const startPollingVideo = (
    jobId: string,
    pr: string,
    ratio: AspectRatio,
    op: "textToVideo" | "imageToVideo",
    modeLabel: string,
    initialStatus?: "queued" | "submitting" | "created" | "started" | "running" | "completed" | "failed",
    initialQueuePosition?: number,
  ) => {
    addPendingGenerationJob({
      jobId,
      type: "video",
      modeLabel,
      prompt: pr,
      aspectRatio: ratio,
      status: initialStatus === "queued" ? "queued" : initialStatus === "submitting" ? "submitting" : "running",
      queuePosition: initialQueuePosition,
    })

    let isChecking = false
    generationPollingRefs.current[jobId] = setInterval(async () => {
      if (isChecking) return
      isChecking = true

      try {
        const s = await checkVideoJobStatus(jobId, op)
        if (s.status === "completed" && s.videoUrls?.[0]) {
          clearPendingGenerationJob(jobId)
          dispatchGenerationQueueSummaryRefresh()
          await saveAsset("video", s.videoUrls[0], pr, ratio, s.mediaGenerationId)
        } else if (s.status === "failed") {
          clearPendingGenerationJob(jobId)
          dispatchGenerationQueueSummaryRefresh()
          toast.error(toUserFacingGenerationError(s.error, "video"))
        } else {
          updatePendingGenerationJob(jobId, {
            status: s.status === "queued" ? "queued" : s.status === "submitting" ? "submitting" : "running",
            queuePosition: s.queuePosition,
          })
        }
      } finally {
        isChecking = false
      }
    }, POLL_INTERVAL)
  }

  const saveAsset = async (type: "image" | "video", url: string, pr: string, ratio: AspectRatio, mediaGenId?: string) => {
    const res = await addProjectAsset(projectId, {
      type, source: "generated",
      name: `${type === "image" ? "Image" : "Video"} - ${new Date().toLocaleString("id-ID")}`,
      url, prompt: pr, aspectRatio: ratio,
      mediaGenerationId: mediaGenId,
    })
    if (res.success) {
      toast.success(`${type === "image" ? "Gambar" : "Video"} berhasil digenerate!`)
      fetchProject()
    } else {
      toast.error("Gagal menyimpan hasil generate")
    }
  }

  const saveAssetRaw = async (source: "upscaled" | "extended", label: string, url: string, pr?: string, ratio?: string, mediaGenId?: string) => {
    const res = await addProjectAsset(projectId, {
      type: "video", source,
      name: `${label} - ${new Date().toLocaleString("id-ID")}`,
      url, prompt: pr, aspectRatio: ratio,
      mediaGenerationId: mediaGenId,
    })
    if (res.success) {
      toast.success(`Video berhasil di-${source === "upscaled" ? "upscale" : "extend"} dan disimpan!`)
      fetchProject()
    } else {
      toast.error(`Gagal menyimpan hasil ${source === "upscaled" ? "upscale" : "extend"}`)
    }
  }

  const saveImageAssetRaw = async (label: string, url: string, pr?: string, ratio?: string, mediaGenId?: string) => {
    const res = await addProjectAsset(projectId, {
      type: "image", source: "upscaled",
      name: `${label} - ${new Date().toLocaleString("id-ID")}`,
      url, prompt: pr, aspectRatio: ratio,
      mediaGenerationId: mediaGenId,
    })
    if (res.success) {
      toast.success("Image berhasil di-upscale dan disimpan!")
      fetchProject()
    } else {
      toast.error("Gagal menyimpan hasil upscale")
    }
  }

  const startPollingUpscale = (jobId: string, resolution: string, creditOp: "upscaleVideo" | "upscaleVideo4K", pr?: string, ratio?: string) => {
    setPollingJobId(jobId)
    setProcessingLabel(`Upscaling video ke ${resolution}`)
    pollingCompletedRef.current = false
    pollingRef.current = setInterval(async () => {
      if (pollingCompletedRef.current) return
      const s = await checkVideoJobStatus(jobId, creditOp)
      if (pollingCompletedRef.current) return
      if (s.status === "completed" && s.videoUrls?.[0]) {
        pollingCompletedRef.current = true
        clearInterval(pollingRef.current!); setPollingJobId(null); setIsGenerating(false); setProcessingLabel(null)
        await saveAssetRaw("upscaled", `Upscaled ${resolution}`, s.videoUrls[0], pr, ratio, s.mediaGenerationId)
      } else if (s.status === "failed") {
        pollingCompletedRef.current = true
        clearInterval(pollingRef.current!); setPollingJobId(null); setIsGenerating(false); setProcessingLabel(null)
        toast.error(toUserFacingGenerationError(s.error, "videoUpscale"))
      }
    }, POLL_INTERVAL)
  }

  const startPollingExtend = (jobId: string, pr: string, ratio?: string) => {
    setPollingJobId(jobId)
    setProcessingLabel("Extending video")
    pollingCompletedRef.current = false
    pollingRef.current = setInterval(async () => {
      if (pollingCompletedRef.current) return
      const s = await checkVideoJobStatus(jobId, "extendVideo")
      if (pollingCompletedRef.current) return
      if (s.status === "completed" && s.videoUrls?.[0]) {
        pollingCompletedRef.current = true
        clearInterval(pollingRef.current!); setPollingJobId(null); setIsGenerating(false); setProcessingLabel(null)
        await saveAssetRaw("extended", "Extended", s.videoUrls[0], pr, ratio, s.mediaGenerationId)
      } else if (s.status === "failed") {
        pollingCompletedRef.current = true
        clearInterval(pollingRef.current!); setPollingJobId(null); setIsGenerating(false); setProcessingLabel(null)
        toast.error(toUserFacingGenerationError(s.error, "video"))
      }
    }, POLL_INTERVAL)
  }

  // ── Generate ───────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerateControlsDisabled) return

    const currentPrompt = prompt.trim()
    const currentAspectRatio = aspectRatio
    const currentGenerateType = generateType
    const currentVideoMode = videoMode
    const currentReferenceImages = [...referenceImages]
    const currentStartImage = startImage
    const currentEndImage = endImage
    const submittingJobId = createLocalGenerationId()

    setPrompt("")
    setReferenceImages([])
    setStartImage(null)
    setEndImage(null)

    addSubmittingGenerationJob({
      id: submittingJobId,
      type: currentGenerateType,
      modeLabel: currentGenerateType === "image"
        ? currentReferenceImages.length > 0 ? "Image Reference" : "Text to Image"
        : currentVideoMode === "frames"
          ? currentEndImage ? "Frames" : "I2V"
          : currentVideoMode === "reference"
            ? "R2V"
            : "T2V",
      prompt: currentPrompt,
      aspectRatio: currentAspectRatio,
    })

    try {
      if (currentGenerateType === "image") {
        let result
        const imageOperation = currentReferenceImages.length > 0 ? "imageToImage" : "textToImage"

        if (currentReferenceImages.length > 0) {
          const stripped = currentReferenceImages.map(img => img.includes(",") ? img.split(",")[1] : img)
          result = await generateImageToImage({
            prompt: currentPrompt,
            referenceImagesBase64: stripped,
            aspectRatio: currentAspectRatio,
          })
        } else {
          result = await generateTextToImage({ prompt: currentPrompt, aspectRatio: currentAspectRatio })
        }

        if (!result.success) {
          toast.error(result.error || "Gagal")
          return
        }

        const immediateImageUrl = result.imageUrl || result.imageUrls?.[0]

        if (!immediateImageUrl && result.jobId) {
          dispatchGenerationQueueSummaryRefresh()
          clearSubmittingGenerationJob(submittingJobId)
          startPollingImage(
            result.jobId,
            currentPrompt,
            currentAspectRatio,
            imageOperation,
            currentReferenceImages.length > 0 ? "Image Reference" : "Text to Image",
            result.status,
            result.queuePosition,
          )
          toast.info("Request gambar dikirim. Input tetap bisa dipakai untuk generate lagi.")
          return
        }

        if (immediateImageUrl) {
          await saveAsset("image", immediateImageUrl, currentPrompt, currentAspectRatio, result.mediaGenerationId)
        }

        return
      }

      let result
      let operation: "textToVideo" | "imageToVideo" = "textToVideo"
      let modeLabel = "T2V"

      if (currentVideoMode === "frames" && currentStartImage) {
        const strippedStart = currentStartImage.includes(",") ? currentStartImage.split(",")[1] : currentStartImage
        operation = "imageToVideo"
        modeLabel = currentEndImage ? "Frames" : "I2V"

        if (currentEndImage) {
          const strippedEnd = currentEndImage.includes(",") ? currentEndImage.split(",")[1] : currentEndImage
          result = await generateFrameToFrameVideo({
            prompt: currentPrompt,
            startImageBase64: strippedStart,
            endImageBase64: strippedEnd,
            aspectRatio: currentAspectRatio,
            model: videoModel,
          })
        } else {
          result = await generateImageToVideo({
            prompt: currentPrompt,
            startImageBase64: strippedStart,
            aspectRatio: currentAspectRatio,
            model: videoModel,
          })
        }
      } else if (currentVideoMode === "reference" && currentReferenceImages.length > 0) {
        operation = "imageToVideo"
        modeLabel = "R2V"
        const stripped = currentReferenceImages.map(img => img.includes(",") ? img.split(",")[1] : img)
        result = await generateReferenceToVideo({
          prompt: currentPrompt,
          referenceImagesBase64: stripped,
          aspectRatio: currentAspectRatio,
          model: videoModel,
        })
      } else {
        result = await generateTextToVideo({
          prompt: currentPrompt,
          aspectRatio: currentAspectRatio,
          model: videoModel,
        })
      }

      if (!result.success) {
        toast.error(result.error || "Gagal")
        return
      }

      if (result.jobId) {
        clearSubmittingGenerationJob(submittingJobId)
        dispatchGenerationQueueSummaryRefresh()
        const queueNotice = getGenerationQueueNotice(result, modeLabel)
        toast.info(queueNotice?.message || "Request video dikirim. Input tetap bisa dipakai untuk generate lagi.")
        startPollingVideo(
          result.jobId,
          currentPrompt,
          currentAspectRatio,
          operation,
          modeLabel,
          result.status,
          result.queuePosition,
        )
        return
      }

      if (result.videoUrl) {
        await saveAsset("video", result.videoUrl, currentPrompt, currentAspectRatio)
      }
    } catch (error) {
      console.error("Project generation failed:", error)
      toast.error(error instanceof Error ? error.message : "Gagal memproses generate")
    } finally {
      clearSubmittingGenerationJob(submittingJobId)
    }
  }

  // ── File upload ─────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith("image/")
      const isVideo = file.type.startsWith("video/")
      if (!isImage && !isVideo) { toast.error(`"${file.name}" tidak didukung`); continue }

      // Upload to Cloudinary via API route, then save URL to DB
      const formData = new FormData()
      formData.append("file", file)
      const uploadRes = await fetch("/api/upload-asset", { method: "POST", body: formData })
      if (!uploadRes.ok) { toast.error(`Gagal upload "${file.name}"`); continue }
      const { url } = await uploadRes.json()

      const res = await addProjectAsset(projectId, {
        type: isImage ? "image" : "video", source: "uploaded", name: file.name, url,
      })
      if (res.success) { toast.success(`"${file.name}" diupload`); fetchProject() }
      else toast.error(`Gagal upload "${file.name}"`)
    }
    e.target.value = ""
  }

  // ── Pick from project ──────────────────────────────────────────

  const handlePickFromProject = (asset: Asset) => {
    if (assetPickerMode === "reference") {
      if (referenceImages.includes(asset.url)) {
        setReferenceImages(prev => prev.filter(u => u !== asset.url))
      } else if (referenceImages.length < 3) {
        setReferenceImages(prev => [...prev, asset.url])
      }
    } else if (assetPickerMode === "end") {
      setEndImage(asset.url)
      setAssetPickerOpen(false)
    } else {
      setStartImage(asset.url)
      setAssetPickerOpen(false)
    }
  }

  const handleDeleteAsset = async (asset: Asset) => {
    setDeleteTarget(asset)
  }

  const confirmDeleteAsset = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    const res = await deleteProjectAsset(projectId, deleteTarget.id)
    if (res.success) {
      toast.success("Asset dihapus")
      if (selectedAsset?.id === deleteTarget.id) setSelectedAsset(null)
      fetchProject()
    } else toast.error("Gagal menghapus")
    setIsDeleting(false)
    setDeleteTarget(null)
  }

  const handleDownload = (asset: Asset) => {
    const a = document.createElement("a")
    a.href = asset.url
    a.download = asset.name
    a.target = "_blank"
    a.click()
  }

  const handleRefImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    Array.from(e.target.files).slice(0, 3 - referenceImages.length).forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        if (ev.target?.result) setReferenceImages(prev => prev.length < 3 ? [...prev, ev.target!.result as string] : prev)
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ""
  }

  const handleStartImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { if (ev.target?.result) setStartImage(ev.target.result as string) }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  const handleEndImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { if (ev.target?.result) setEndImage(ev.target.result as string) }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  if (loading) {
    return (
      <div className="-mx-4 -mb-4 flex items-center justify-center bg-background" style={{ height: "calc(100vh - 64px)" }}>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!project) return null

  return (
    <div
      className="-mx-4 -mb-4 bg-background text-foreground flex flex-col overflow-hidden"
      style={{ height: "calc(100vh - 64px)" }}
    >
      {/* ── Top bar ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <button
          onClick={() => router.push("/dashboard/projects")}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-accent"
        >
          <ArrowLeft className="size-4" />
        </button>
        <h1 className="text-sm font-medium text-foreground flex-1 truncate">{project.name}</h1>
        {totalPendingGenerateCount > 0 && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-medium",
              submittingGenerationJobs.length > 0 || hasQueuedPendingGeneration
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-sky-200 bg-sky-50 text-sky-900"
            )}
          >
            {submittingGenerationJobs.length > 0 || hasQueuedPendingGeneration ? (
              <Clock3 className="size-3.5 shrink-0" />
            ) : (
              <Loader2 className="size-3.5 shrink-0 animate-spin" />
            )}
            <span className="hidden sm:inline">{pendingGenerationMessage}</span>
            {totalPendingGenerateCount > 0 && (
              <span className="rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] font-semibold text-current">
                {totalPendingGenerateCount}/{effectiveQueueLimit}
              </span>
            )}
          </div>
        )}
        <button
          onClick={() => uploadFileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-border"
        >
          <Plus className="size-3.5" /> Upload
        </button>
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Left icon sidebar */}
        <div className="w-12 border-r border-border flex flex-col items-center pt-4 gap-1.5 shrink-0 bg-background/60">
          {(["all", "videos", "images"] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              title={f === "all" ? "All" : f === "images" ? "Images" : "Videos"}
              className={cn(
                "p-2.5 rounded-xl transition-colors",
                filter === f ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {f === "all" ? <LayoutGrid className="size-4" />
                : f === "videos" ? <Film className="size-4" />
                : <ImageIcon className="size-4" />}
            </button>
          ))}
        </div>

        {/* Center: scrollable media grid */}
        <div className="flex-1 overflow-y-auto px-5 py-4 pb-44">
          {filteredAssets.length === 0 && filteredSubmittingGenerationJobs.length === 0 && filteredPendingGenerationJobs.length === 0 && !isGenerating ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-20">
              <p className="text-muted-foreground text-sm">
                {filter === "all" ? "Belum ada media. Upload atau generate!" : `Belum ada ${filter === "images" ? "gambar" : "video"}.`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {/* Lottie skeleton loading — first grid item */}
              {isGenerating && (
                <div ref={loadingSkeletonRef} className="rounded-2xl overflow-hidden bg-card border border-border shadow-sm">
                  <div className="relative aspect-square w-full flex items-center justify-center bg-gradient-to-br from-muted to-background">
                    {catAnimation ? (
                      <Lottie
                        animationData={catAnimation}
                        loop
                        className="w-28 h-28"
                      />
                    ) : (
                      <Loader2 className="size-8 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <div className="px-3 py-2 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Loader2 className="size-3 animate-spin text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground font-medium">
                        {pollingJobId
                          ? (processingLabel || `Processing ${generateType === "video" ? "video" : "image"}...`)
                          : "Sending..."}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      <div className="h-2 bg-muted rounded-full w-3/4 animate-pulse" />
                      <div className="h-2 bg-muted rounded-full w-1/2 animate-pulse" />
                    </div>
                  </div>
                </div>
              )}

              {filteredSubmittingGenerationJobs.map((job, index) => (
                <div
                  key={job.id}
                  ref={!isGenerating && index === 0 ? loadingSkeletonRef : undefined}
                  className="rounded-2xl overflow-hidden bg-card border border-border shadow-sm"
                >
                  <div className="relative aspect-square w-full flex items-center justify-center bg-gradient-to-br from-muted to-background">
                    {catAnimation ? (
                      <Lottie
                        animationData={catAnimation}
                        loop
                        className="w-28 h-28"
                      />
                    ) : (
                      <Loader2 className="size-8 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <div className="px-3 py-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Clock3 className="size-3 shrink-0 text-amber-500" />
                        <span className="truncate text-[11px] text-muted-foreground font-medium">
                          Mengirim request
                        </span>
                      </div>
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {job.type === "image" ? "Image" : "Video"}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-xs text-foreground">
                      {job.prompt}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{job.modeLabel}</span>
                      <span>{job.aspectRatio === "landscape" ? "Landscape" : "Portrait"}</span>
                    </div>
                  </div>
                </div>
              ))}

              {filteredPendingGenerationJobs.map((job, index) => (
                <div
                  key={job.jobId}
                  ref={!isGenerating && filteredSubmittingGenerationJobs.length === 0 && index === 0 ? loadingSkeletonRef : undefined}
                  className="rounded-2xl overflow-hidden bg-card border border-border shadow-sm"
                >
                  <div className="relative aspect-square w-full flex items-center justify-center bg-gradient-to-br from-muted to-background">
                    {catAnimation ? (
                      <Lottie
                        animationData={catAnimation}
                        loop
                        className="w-28 h-28"
                      />
                    ) : (
                      <Loader2 className="size-8 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <div className="px-3 py-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {job.status === "queued" ? (
                          <Clock3 className="size-3 shrink-0 text-amber-500" />
                        ) : (
                          <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
                        )}
                        <span className="truncate text-[11px] text-muted-foreground font-medium">
                          {job.status === "queued"
                            ? job.queuePosition && job.queuePosition > 1
                              ? `Menunggu di posisi ${job.queuePosition}`
                              : "Menunggu giliran"
                            : job.status === "submitting"
                              ? "Mengirim ke worker"
                              : "Sedang diproses"}
                        </span>
                      </div>
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {job.type === "image" ? "Image" : "Video"}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-xs text-foreground">
                      {job.prompt}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{job.modeLabel}</span>
                      <span>{job.aspectRatio === "landscape" ? "Landscape" : "Portrait"}</span>
                    </div>
                  </div>
                </div>
              ))}

              {filteredAssets.map(asset => {
                const createdMs = new Date(asset.createdAt).getTime()
                const now = Date.now()
                const msIn3Days = 3 * 24 * 60 * 60 * 1000
                const remaining = msIn3Days - (now - createdMs)
                const isExpired = remaining <= 0
                const isExpiring = remaining > 0 && remaining <= msIn3Days
                const hoursLeft = Math.max(0, Math.ceil(remaining / (60 * 60 * 1000)))

                return (
                <div
                  key={asset.id}
                  className={cn("rounded-2xl overflow-hidden bg-card border shadow-sm", isExpired ? "border-red-300 opacity-60" : isExpiring && hoursLeft <= 24 ? "border-orange-300" : "border-border")}
                >
                  {asset.type === "image" ? (
                    <div className="relative">
                      <img
                        src={asset.url}
                        alt={asset.name}
                        className="w-full aspect-square object-cover block cursor-pointer"
                        onClick={() => setPreviewAsset(asset)}
                      />
                      {isExpiring && (
                        <div className={cn("absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium backdrop-blur-sm", hoursLeft <= 24 ? "bg-red-500/80 text-white" : "bg-orange-500/80 text-white")}>
                          <AlertTriangle className="size-3" />
                          {hoursLeft <= 24 ? `Expired in ${hoursLeft}h` : `Expired in ${Math.ceil(hoursLeft / 24)}d`}
                        </div>
                      )}
                      {isExpired && (
                        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-red-600/80 text-white backdrop-blur-sm">
                          <AlertTriangle className="size-3" /> Expired
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      className="relative bg-muted aspect-square cursor-pointer"
                      onClick={() => setPreviewAsset(asset)}
                    >
                      <video src={asset.url} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-background/80 flex items-center justify-center border border-border/60">
                          <Video className="size-4 text-foreground/70" />
                        </div>
                      </div>
                      {isExpiring && (
                        <div className={cn("absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium backdrop-blur-sm", hoursLeft <= 24 ? "bg-red-500/80 text-white" : "bg-orange-500/80 text-white")}>
                          <AlertTriangle className="size-3" />
                          {hoursLeft <= 24 ? `${hoursLeft}j lagi` : `${Math.ceil(hoursLeft / 24)}h lagi`}
                        </div>
                      )}
                      {isExpired && (
                        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-red-600/80 text-white backdrop-blur-sm">
                          <AlertTriangle className="size-3" /> Expired
                        </div>
                      )}
                    </div>
                  )}
                  <div className="px-3 py-2">
                    {asset.prompt && (
                      <p className="text-muted-foreground text-xs line-clamp-2 mb-2">{asset.prompt}</p>
                    )}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleDownload(asset)}
                        className="p-1.5 rounded-lg bg-accent hover:bg-accent/80 text-muted-foreground hover:text-foreground transition-colors"
                        title="Download"
                      >
                        <Download className="size-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteAsset(asset)}
                        className="p-1.5 rounded-lg bg-accent hover:bg-red-500/15 text-muted-foreground hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Generate bar (bottom) ────────────────────────────────── */}
      <div className="shrink-0 px-4 pb-4 pt-3 border-t border-border bg-background">
        <Collapsible open={isComposerExpanded} onOpenChange={setIsComposerExpanded} className="mx-auto max-w-2xl bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent text-muted-foreground">
                {generateType === "image" ? <ImageIcon className="size-4" /> : <Video className="size-4" />}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">Generate Panel</p>
                <p className="truncate text-[11px] text-muted-foreground">{composerSummary}</p>
              </div>
            </div>

            {isGenerating && (
              <div className="hidden items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[11px] text-muted-foreground sm:flex">
                <Loader2 className="size-3 animate-spin" />
                {pollingJobId ? "Processing" : "Sending"}
              </div>
            )}

            {!isGenerating && totalPendingGenerateCount > 0 && (
              <div className="hidden items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[11px] text-muted-foreground sm:flex">
                {submittingGenerationJobs.length > 0 || hasQueuedPendingGeneration ? (
                  <Clock3 className="size-3 text-amber-500" />
                ) : (
                  <Loader2 className="size-3 animate-spin" />
                )}
                {totalPendingGenerateCount}/{effectiveQueueLimit} antrean
              </div>
            )}

            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title={isComposerExpanded ? "Minimize panel" : "Expand panel"}
              >
                {isComposerExpanded ? "Minimize" : "Expand"}
                {isComposerExpanded ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
              </button>
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent className="space-y-0">
            {/* Options row */}
            <div className="flex items-center gap-1 px-3 pt-2.5 pb-1 flex-wrap">
              {/* Image / Video tab */}
              <div className="flex gap-0.5 bg-accent rounded-lg p-0.5 mr-2">
                <button
                  onClick={() => { setGenerateType("image"); setStartImage(null); setEndImage(null); setVideoMode("text") }}
                  disabled={isGenerateControlsDisabled}
                  className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors", generateType === "image" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  <ImageIcon className="size-3" /> Image
                </button>
                <button
                  onClick={() => { setGenerateType("video"); setReferenceImages([]) }}
                  disabled={isGenerateControlsDisabled}
                  className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors", generateType === "video" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  <Video className="size-3" /> Video
                </button>
              </div>

              {/* Aspect ratio */}
              <div className="flex gap-0.5 bg-accent rounded-lg p-0.5 mr-2">
                {(["landscape", "portrait"] as AspectRatio[]).map(r => (
                  <button
                    key={r}
                    onClick={() => setAspectRatio(r)}
                    disabled={isGenerateControlsDisabled}
                    className={cn("px-2.5 py-1 rounded-md text-xs font-medium transition-colors capitalize", aspectRatio === r ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  >
                    {r}
                  </button>
                ))}
              </div>

              {/* Model */}
              {generateType === "video" ? (
                <span className="px-2.5 py-1 rounded-lg text-xs bg-accent text-muted-foreground">⚡ Veo 3.1 Fast</span>
              ) : (
                <span className="px-2.5 py-1 rounded-lg text-xs bg-accent text-muted-foreground">🍌 Nano Banana 2</span>
              )}
            </div>

            {/* Video mode & count row */}
            {generateType === "video" && (
              <div className="flex items-center gap-1 px-3 pb-1 flex-wrap">
                {/* Video mode selector */}
                <div className="flex gap-0.5 bg-accent rounded-lg p-0.5 mr-2">
                  {([
                    { value: "text" as VideoMode, label: "Text" },
                    { value: "frames" as VideoMode, label: "Frames" },
                    { value: "reference" as VideoMode, label: "Reference" },
                  ]).map(m => (
                    <button
                      key={m.value}
                      onClick={() => {
                        setVideoMode(m.value)
                        if (m.value === "text") { setStartImage(null); setEndImage(null); setReferenceImages([]) }
                        if (m.value === "frames") { setReferenceImages([]) }
                        if (m.value === "reference") { setStartImage(null); setEndImage(null) }
                      }}
                      disabled={isGenerateControlsDisabled}
                      className={cn("px-2.5 py-1 rounded-md text-xs font-medium transition-colors", videoMode === m.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Count selector */}
                <div className="flex gap-0.5 bg-accent rounded-lg p-0.5">
                  {[1, 2].map(c => (
                    <button
                      key={c}
                      onClick={() => setVideoCount(c)}
                      disabled={isGenerateControlsDisabled}
                      className={cn("px-2.5 py-1 rounded-md text-xs font-medium transition-colors", videoCount === c ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                    >
                      {c}×
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Reference / start / end image chips */}
            {(referenceImages.length > 0 || startImage || endImage) && (
              <div className="flex gap-2 px-3 py-1.5 items-center overflow-x-auto">
                {generateType === "image" && referenceImages.map((img, i) => (
                  <div key={i} className="relative size-9 rounded-lg overflow-hidden shrink-0">
                    <img src={img} className="w-full h-full object-cover" alt="" />
                    <button
                      onClick={() => setReferenceImages(prev => prev.filter((_, j) => j !== i))}
                      className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                    >
                      <X className="size-3 text-white" />
                    </button>
                  </div>
                ))}
                {generateType === "video" && videoMode === "reference" && referenceImages.map((img, i) => (
                  <div key={i} className="relative size-9 rounded-lg overflow-hidden shrink-0">
                    <img src={img} className="w-full h-full object-cover" alt="" />
                    <button
                      onClick={() => setReferenceImages(prev => prev.filter((_, j) => j !== i))}
                      className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                    >
                      <X className="size-3 text-white" />
                    </button>
                  </div>
                ))}
                {generateType === "video" && videoMode === "frames" && startImage && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-muted-foreground font-medium">START</span>
                    <div className="relative size-9 rounded-lg overflow-hidden shrink-0">
                      <img src={startImage} className="w-full h-full object-cover" alt="" />
                      <button
                        onClick={() => setStartImage(null)}
                        className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                      >
                        <X className="size-3 text-white" />
                      </button>
                    </div>
                  </div>
                )}
                {generateType === "video" && videoMode === "frames" && endImage && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-muted-foreground font-medium">END</span>
                    <div className="relative size-9 rounded-lg overflow-hidden shrink-0">
                      <img src={endImage} className="w-full h-full object-cover" alt="" />
                      <button
                        onClick={() => setEndImage(null)}
                        className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                      >
                        <X className="size-3 text-white" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Prompt input row */}
            <div className="flex items-end gap-2 px-3 pb-2.5">
              {(generateType === "image" || videoMode !== "text") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    disabled={isGenerateControlsDisabled}
                    title="Tambah gambar"
                    className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
                  >
                    <Plus className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="bg-popover border-border text-popover-foreground">
                  {generateType === "image" ? (
                    <>
                      <DropdownMenuItem
                        onClick={() => { setAssetPickerMode("reference"); setAssetPickerOpen(true) }}
                        className="hover:bg-accent focus:bg-accent text-popover-foreground text-xs cursor-pointer gap-2"
                      >
                        <LayoutGrid className="size-3.5" /> Pilih dari Project
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => refImgInputRef.current?.click()}
                        className="hover:bg-accent focus:bg-accent text-popover-foreground text-xs cursor-pointer gap-2"
                      >
                        <ImageIcon className="size-3.5" /> Upload dari Device
                      </DropdownMenuItem>
                    </>
                  ) : videoMode === "frames" ? (
                    <>
                      <DropdownMenuItem
                        onClick={() => { setAssetPickerMode("start"); setAssetPickerOpen(true) }}
                        className="hover:bg-accent focus:bg-accent text-popover-foreground text-xs cursor-pointer gap-2"
                      >
                        <LayoutGrid className="size-3.5" /> Start Frame dari Project
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => startImgInputRef.current?.click()}
                        className="hover:bg-accent focus:bg-accent text-popover-foreground text-xs cursor-pointer gap-2"
                      >
                        <ImageIcon className="size-3.5" /> Upload Start Frame
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => { setAssetPickerMode("end"); setAssetPickerOpen(true) }}
                        className="hover:bg-accent focus:bg-accent text-popover-foreground text-xs cursor-pointer gap-2"
                      >
                        <LayoutGrid className="size-3.5" /> End Frame dari Project
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => endImgInputRef.current?.click()}
                        className="hover:bg-accent focus:bg-accent text-popover-foreground text-xs cursor-pointer gap-2"
                      >
                        <ImageIcon className="size-3.5" /> Upload End Frame
                      </DropdownMenuItem>
                    </>
                  ) : videoMode === "reference" ? (
                    <>
                      <DropdownMenuItem
                        onClick={() => { setAssetPickerMode("reference"); setAssetPickerOpen(true) }}
                        className="hover:bg-accent focus:bg-accent text-popover-foreground text-xs cursor-pointer gap-2"
                      >
                        <LayoutGrid className="size-3.5" /> Pilih dari Project
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => refImgInputRef.current?.click()}
                        className="hover:bg-accent focus:bg-accent text-popover-foreground text-xs cursor-pointer gap-2"
                      >
                        <ImageIcon className="size-3.5" /> Upload dari Device
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
              )}

              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate() } }}
                placeholder="What do you want to create?"
                disabled={isGenerateControlsDisabled}
                rows={1}
                className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm resize-none outline-none py-2 max-h-20"
                style={{ lineHeight: "1.5" }}
              />

              <button
                onClick={handleGenerate}
                disabled={isGenerateControlsDisabled || !prompt.trim()}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors shrink-0",
                  isGenerateControlsDisabled || !prompt.trim()
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary hover:bg-primary/90 text-primary-foreground"
                )}
              >
                {generateType === "image"
                  ? <><ImageIcon className="size-3.5" /> Generate</>
                  : <><Video className="size-3.5" /> Generate</>
                }
              </button>
            </div>

            {/* Subscription info */}
            <div className="px-4 pb-2 text-[11px] text-muted-foreground">
              Subscription aktif diperlukan untuk generate. Tidak ada pemotongan kredit per request.
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Hidden inputs */}
      <input ref={uploadFileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileUpload} />
      <input ref={refImgInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleRefImageUpload} />
      <input ref={startImgInputRef} type="file" accept="image/*" className="hidden" onChange={handleStartImageUpload} />
      <input ref={endImgInputRef} type="file" accept="image/*" className="hidden" onChange={handleEndImageUpload} />

      {/* ── Asset picker ─────────────────────────────────────── */}
      {assetPickerOpen && (() => {
        const projectImages = (project?.assets ?? []).filter(a => a.type === "image")
        return (
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setAssetPickerOpen(false)}
          >
            <div
              className="bg-popover text-popover-foreground rounded-2xl shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col overflow-hidden border border-border"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <p className="text-sm font-medium text-popover-foreground">
                  {assetPickerMode === "reference" ? "Pilih reference image (maks 3)" : assetPickerMode === "end" ? "Pilih end frame" : "Pilih start frame"}
                </p>
                <button onClick={() => setAssetPickerOpen(false)} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
                  <X className="size-4 text-muted-foreground" />
                </button>
              </div>
              <div className="overflow-y-auto p-4">
                {projectImages.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-10">Belum ada gambar di project ini.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {projectImages.map(asset => {
                      const selected = assetPickerMode === "reference"
                        ? referenceImages.includes(asset.url)
                        : assetPickerMode === "end"
                        ? endImage === asset.url
                        : startImage === asset.url
                      return (
                        <button
                          key={asset.id}
                          onClick={() => handlePickFromProject(asset)}
                          className={cn(
                            "relative aspect-square rounded-xl overflow-hidden transition-all",
                            selected ? "ring-2 ring-primary" : "hover:ring-2 hover:ring-border"
                          )}
                        >
                          <img src={asset.url} className="w-full h-full object-cover" alt={asset.name} />
                          {selected && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <span className="text-white text-lg">✓</span>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              {assetPickerMode === "reference" && (
                <div className="px-4 py-3 border-t border-border shrink-0">
                  <button
                    onClick={() => setAssetPickerOpen(false)}
                    className="w-full py-2 rounded-xl bg-accent hover:bg-accent/80 text-foreground text-sm font-medium transition-colors"
                  >
                    Selesai ({referenceImages.length}/3 dipilih)
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Preview dialog ──────────────────────────────────── */}
      {previewAsset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => { setPreviewAsset(null); setShowExtendInput(false) }}
        >
          <div
            className="bg-card text-card-foreground rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden border border-border"
            onClick={e => e.stopPropagation()}
          >
            <div className="relative">
              {previewAsset.type === "video" ? (
                <video
                  src={previewAsset.url}
                  controls
                  autoPlay
                  playsInline
                  className="w-full max-h-[60vh] object-contain bg-black"
                />
              ) : (
                <img
                  src={previewAsset.url}
                  alt={previewAsset.name}
                  className="w-full max-h-[60vh] object-contain bg-muted"
                />
              )}
              <button
                className="absolute top-3 right-3 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
                onClick={() => { setPreviewAsset(null); setShowExtendInput(false) }}
              >
                <X className="size-4" />
              </button>
            </div>
            {previewAsset.prompt && (
              <p className="text-muted-foreground text-xs px-4 pt-3 line-clamp-2">{previewAsset.prompt}</p>
            )}
            <div className="flex items-center gap-2 px-4 py-3 flex-wrap">
              {/* Use as Reference — image only */}
              {previewAsset.type === "image" && (
                <button
                  onClick={() => {
                    setReferenceImages(prev => {
                      if (prev.includes(previewAsset.url)) return prev
                      if (prev.length >= 3) { toast.error("Maksimal 3 reference images"); return prev }
                      return [...prev, previewAsset.url]
                    })
                    setGenerateType("image")
                    setPreviewAsset(null)
                    toast.success("Ditambahkan sebagai reference image")
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors"
                >
                  <ImageIcon className="size-3.5" /> Use as Reference
                </button>
              )}

              {/* Upscale — image */}
              {previewAsset.type === "image" && (
                <button
                  onClick={async () => {
                    if (!previewAsset.mediaGenerationId) {
                      toast.error("Image ini tidak bisa di-upscale karena tidak memiliki mediaGenerationId.")
                      return
                    }
                    const assetPrompt = previewAsset.prompt || "Upscale image"
                    const assetAspectRatio = previewAsset.aspectRatio || undefined
                    const assetRatio = previewAsset.aspectRatio === "portrait" ? "portrait" : "landscape"
                    setIsUpscaling(true)
                    const result = await upscaleImage({ mediaGenerationId: previewAsset.mediaGenerationId })
                    if (result.success && result.jobId) {
                      dispatchGenerationQueueSummaryRefresh()
                      const queueNotice = getGenerationQueueNotice(result, "Upscale Image")
                      if (queueNotice) {
                        toast.info(queueNotice.message)
                      }
                      startPollingImage(
                        result.jobId,
                        assetPrompt,
                        assetRatio,
                        "upscaleImage",
                        "Upscale Image",
                        result.status,
                        result.queuePosition,
                        async (imageUrl, mediaGenId) => {
                          await saveImageAssetRaw("Upscaled", imageUrl, previewAsset.prompt || undefined, assetAspectRatio, mediaGenId)
                        }
                      )
                    } else if (result.success && result.imageUrl) {
                      await saveImageAssetRaw("Upscaled", result.imageUrl, previewAsset.prompt || undefined, assetAspectRatio)
                    } else {
                      toast.error(result.error || "Upscale gagal")
                    }
                    setIsUpscaling(false)
                    setPreviewAsset(null)
                  }}
                  disabled={isUpscaling}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors"
                >
                  {isUpscaling
                    ? <><Loader2 className="size-3.5 animate-spin" /> Upscaling…</>
                    : <><Sparkles className="size-3.5" /> Upscale</>
                  }
                </button>
              )}

              {/* Upscale — video */}
              {previewAsset.type === "video" && (["1080p", "4K"] as const).map((res) => (
                <button
                  key={res}
                  onClick={async () => {
                    if (!previewAsset.mediaGenerationId) {
                      toast.error("Video ini tidak bisa di-upscale karena tidak memiliki mediaGenerationId.")
                      return
                    }
                    const creditOp = res === "4K" ? "upscaleVideo4K" as const : "upscaleVideo" as const
                    const assetPrompt = previewAsset.prompt || undefined
                    const assetRatio = previewAsset.aspectRatio || undefined
                    const mediaGenId = previewAsset.mediaGenerationId
                    setPreviewAsset(null); setShowExtendInput(false)
                    setIsGenerating(true)
                    setTimeout(() => loadingSkeletonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100)
                    toast.info(`Memulai upscale video ke ${res}...`)
                    const result = await upscaleVideo({ mediaGenerationId: mediaGenId, resolution: res })
                    if (!result.success) {
                      toast.error(result.error || "Upscale gagal")
                      setIsGenerating(false)
                      return
                    }
                    if (result.jobId) {
                      startPollingUpscale(result.jobId, res, creditOp, assetPrompt, assetRatio)
                    } else if (result.videoUrl) {
                      setIsGenerating(false)
                      await saveAssetRaw("upscaled", `Upscaled ${res}`, result.videoUrl, assetPrompt, assetRatio)
                    }
                  }}
                  disabled={isGenerating}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors"
                >
                  <Zap className="size-3.5" /> Upscale {res}
                </button>
              ))}

              {/* Extend — video only */}
              {previewAsset.type === "video" && !showExtendInput && (
                <button
                  onClick={() => {
                    if (!previewAsset.mediaGenerationId) {
                      toast.error("Video ini tidak bisa di-extend karena tidak memiliki mediaGenerationId.")
                      return
                    }
                    setExtendPrompt("")
                    setShowExtendInput(true)
                  }}
                  disabled={isGenerating}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors"
                >
                  <FastForward className="size-3.5" /> Extend
                </button>
              )}

              <div className="flex-1" />
              <button
                onClick={() => { handleDownload(previewAsset); setPreviewAsset(null) }}
                className="p-2 rounded-xl bg-accent hover:bg-accent/80 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Download className="size-4" />
              </button>
            </div>

            {/* Extend prompt input */}
            {showExtendInput && previewAsset.type === "video" && (
              <div className="flex gap-2 px-4 pb-4">
                <input
                  type="text"
                  value={extendPrompt}
                  onChange={(e) => setExtendPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setShowExtendInput(false)
                      setExtendPrompt("")
                    }
                  }}
                  placeholder="Deskripsikan apa yang terjadi selanjutnya..."
                  autoFocus
                  disabled={isGenerating}
                  className="flex-1 px-3 py-2 rounded-xl text-xs bg-muted border border-border focus:border-primary focus:outline-none placeholder:text-muted-foreground"
                />
                <button
                  onClick={async () => {
                    if (!extendPrompt.trim()) {
                      toast.error("Prompt wajib diisi untuk extend video.")
                      return
                    }
                    const trimmedPrompt = extendPrompt.trim()
                    const assetRatio = previewAsset.aspectRatio || undefined
                    const mediaGenId = previewAsset.mediaGenerationId!
                    setPreviewAsset(null); setShowExtendInput(false); setExtendPrompt("")
                    setIsGenerating(true)
                    setTimeout(() => loadingSkeletonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100)
                    toast.info("Memulai extend video...")
                    const result = await extendVideo({
                      mediaGenerationId: mediaGenId,
                      prompt: trimmedPrompt,
                    })
                    if (!result.success) {
                      toast.error(result.error || "Extend gagal")
                      setIsGenerating(false)
                      return
                    }
                    if (result.jobId) {
                      startPollingExtend(result.jobId, trimmedPrompt, assetRatio)
                    } else if (result.videoUrl) {
                      setIsGenerating(false)
                      await saveAssetRaw("extended", "Extended", result.videoUrl, trimmedPrompt, assetRatio)
                    }
                  }}
                  disabled={isGenerating || !extendPrompt.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                  <FastForward className="size-3.5" /> Extend
                </button>
                <button
                  onClick={() => { setShowExtendInput(false); setExtendPrompt("") }}
                  disabled={isGenerating}
                  className="p-2 rounded-xl bg-accent hover:bg-accent/80 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!isDeleting && !open) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          {isDeleting ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-10 w-10 animate-spin text-red-500" />
              <div className="text-center">
                <p className="font-medium">Menghapus asset...</p>
              </div>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" /> Hapus Asset
                </DialogTitle>
                <DialogDescription>
                  Hapus &quot;{deleteTarget?.name}&quot;? Aksi ini tidak bisa dibatalkan.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-0">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 rounded-lg border border-border hover:bg-accent text-sm font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={confirmDeleteAsset}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 text-sm font-medium transition-colors"
                >
                  <Trash2 className="h-4 w-4" /> Hapus
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
