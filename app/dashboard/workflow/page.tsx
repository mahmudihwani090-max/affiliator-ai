"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Bot,
  Film,
  Image as ImageIcon,
  Plus,
  Route,
  Settings2,
  Sparkles,
  Workflow,
} from "lucide-react"
import { toast } from "sonner"
import { generateTextToImage, checkImageJobStatus, submitTextToVideo, checkVideoJobStatus } from "@/lib/client/generation-api"
import { toUserFacingGenerationError } from "@/lib/generation-errors"
import { getGenerationQueueNotice } from "@/lib/generation-queue-notice"

type StageId = "prompt" | "router" | "image" | "video" | "review" | "failed"
type BranchStatus = "idle" | "queued" | "running" | "completed" | "failed"
type NodeId = StageId

type PromptNote = {
  id: string
  text: string
  stageId: StageId
  createdAt: number
  imageStatus: BranchStatus
  videoStatus: BranchStatus
  imageUrl?: string
  videoUrl?: string
  imageError?: string
  videoError?: string
}

type Campaign = {
  id: string
  name: string
  notes: PromptNote[]
}

type QuickOutput = {
  id: string
  type: "image" | "video"
  prompt: string
  url: string
  createdAt: number
}

type NodePosition = {
  x: number
  y: number
}

type DraggingState = {
  nodeId: NodeId
  offsetX: number
  offsetY: number
}

const STORAGE_KEY = "afp.workflow.graph.canvas.v1"

const NODE_SIZE: Record<NodeId, { w: number; h: number }> = {
  prompt: { w: 190, h: 120 },
  router: { w: 210, h: 120 },
  image: { w: 200, h: 120 },
  video: { w: 200, h: 120 },
  review: { w: 190, h: 120 },
  failed: { w: 190, h: 120 },
}

const INITIAL_POSITIONS: Record<NodeId, NodePosition> = {
  prompt: { x: 40, y: 120 },
  router: { x: 300, y: 120 },
  image: { x: 610, y: 60 },
  video: { x: 610, y: 240 },
  review: { x: 900, y: 80 },
  failed: { x: 900, y: 260 },
}

const CONNECTIONS: Array<{ from: NodeId; to: NodeId }> = [
  { from: "prompt", to: "router" },
  { from: "router", to: "image" },
  { from: "router", to: "video" },
  { from: "image", to: "review" },
  { from: "video", to: "review" },
  { from: "image", to: "failed" },
  { from: "video", to: "failed" },
]

const NODE_META: Record<NodeId, { title: string; subtitle: string; color: string }> = {
  prompt: {
    title: "Prompt Node",
    subtitle: "Drop prompt note ke sini",
    color: "text-sky-500",
  },
  router: {
    title: "Router Node",
    subtitle: "Branch paralel image + video",
    color: "text-violet-500",
  },
  image: {
    title: "Image Node",
    subtitle: "Auto-run image pipeline",
    color: "text-emerald-500",
  },
  video: {
    title: "Video Node",
    subtitle: "Auto-run video pipeline",
    color: "text-blue-500",
  },
  review: {
    title: "Review Node",
    subtitle: "Hasil berhasil",
    color: "text-amber-500",
  },
  failed: {
    title: "Failed Node",
    subtitle: "Branch gagal",
    color: "text-rose-500",
  },
}

const DEFAULT_CAMPAIGN: Campaign = {
  id: "campaign-default",
  name: "Campaign Utama",
  notes: [
    {
      id: "seed-note-1",
      text: "Premium skincare commercial, elegant marble surface, soft cinematic keylight, hyper realistic",
      stageId: "prompt",
      createdAt: Date.now(),
      imageStatus: "idle",
      videoStatus: "idle",
    },
    {
      id: "seed-note-2",
      text: "Modern coffee ad in Indonesian cafe, warm sunlight, handheld movement, social media style",
      stageId: "prompt",
      createdAt: Date.now() + 1,
      imageStatus: "idle",
      videoStatus: "idle",
    },
  ],
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTerminal(status: BranchStatus) {
  return status === "idle" || status === "completed" || status === "failed"
}

function resolveStage(note: PromptNote): StageId {
  const imageDone = isTerminal(note.imageStatus)
  const videoDone = isTerminal(note.videoStatus)

  if (!imageDone || !videoDone) {
    return note.stageId
  }

  const hasSuccess = note.imageStatus === "completed" || note.videoStatus === "completed"
  const hasFailure = note.imageStatus === "failed" && note.videoStatus === "failed"

  if (hasFailure) return "failed"
  if (hasSuccess) return "review"

  return note.stageId
}

export default function WorkflowPage() {
  const router = useRouter()
  const canvasRef = useRef<HTMLDivElement | null>(null)

  const [campaigns, setCampaigns] = useState<Campaign[]>([DEFAULT_CAMPAIGN])
  const [activeCampaignId, setActiveCampaignId] = useState(DEFAULT_CAMPAIGN.id)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null)
  const [hoverNodeId, setHoverNodeId] = useState<NodeId | null>(null)

  const [nodePositions, setNodePositions] = useState<Record<NodeId, NodePosition>>(INITIAL_POSITIONS)
  const [draggingNode, setDraggingNode] = useState<DraggingState | null>(null)

  const [controlsOpen, setControlsOpen] = useState(false)
  const [newCampaignName, setNewCampaignName] = useState("")
  const [newPromptText, setNewPromptText] = useState("")

  const [quickOutputs, setQuickOutputs] = useState<QuickOutput[]>([])
  const [imageWorkerBusy, setImageWorkerBusy] = useState(false)
  const [videoWorkerBusy, setVideoWorkerBusy] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw) as {
        campaigns?: Campaign[]
        activeCampaignId?: string
        nodePositions?: Record<NodeId, NodePosition>
      }

      if (parsed.campaigns && parsed.campaigns.length > 0) {
        setCampaigns(parsed.campaigns)
        setActiveCampaignId(parsed.activeCampaignId || parsed.campaigns[0].id)
      }

      if (parsed.nodePositions) {
        setNodePositions(parsed.nodePositions)
      }
    } catch (error) {
      console.error("Failed to load workflow canvas state", error)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        campaigns,
        activeCampaignId,
        nodePositions,
      })
    )
  }, [campaigns, activeCampaignId, nodePositions])

  const activeCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === activeCampaignId) || campaigns[0],
    [campaigns, activeCampaignId]
  )

  const selectedNote = useMemo(
    () => activeCampaign?.notes.find((note) => note.id === selectedNoteId) || null,
    [activeCampaign, selectedNoteId]
  )

  const groupedNotes = useMemo(() => {
    const base: Record<StageId, PromptNote[]> = {
      prompt: [],
      router: [],
      image: [],
      video: [],
      review: [],
      failed: [],
    }

    if (!activeCampaign) return base

    for (const note of activeCampaign.notes) {
      base[note.stageId].push(note)
    }

    return base
  }, [activeCampaign])

  const updateActiveCampaign = (updater: (campaign: Campaign) => Campaign) => {
    setCampaigns((prev) =>
      prev.map((campaign) => {
        if (campaign.id !== activeCampaignId) return campaign
        return updater(campaign)
      })
    )
  }

  const patchNote = (noteId: string, updater: (note: PromptNote) => PromptNote) => {
    updateActiveCampaign((campaign) => ({
      ...campaign,
      notes: campaign.notes.map((note) => (note.id === noteId ? updater(note) : note)),
    }))
  }

  const createCampaign = () => {
    const name = newCampaignName.trim()
    if (!name) return

    const nextCampaign: Campaign = {
      id: `campaign-${Date.now()}`,
      name,
      notes: [],
    }

    setCampaigns((prev) => [nextCampaign, ...prev])
    setActiveCampaignId(nextCampaign.id)
    setSelectedNoteId(null)
    setNewCampaignName("")
    toast.success("Campaign dibuat")
  }

  const addPrompt = () => {
    const text = newPromptText.trim()
    if (!text) return

    const note: PromptNote = {
      id: `note-${Date.now()}`,
      text,
      stageId: "prompt",
      createdAt: Date.now(),
      imageStatus: "idle",
      videoStatus: "idle",
    }

    updateActiveCampaign((campaign) => ({
      ...campaign,
      notes: [note, ...campaign.notes],
    }))

    setSelectedNoteId(note.id)
    setNewPromptText("")
    toast.success("Prompt note ditambahkan")
  }

  const deleteSelectedNote = () => {
    if (!selectedNoteId) return

    updateActiveCampaign((campaign) => ({
      ...campaign,
      notes: campaign.notes.filter((note) => note.id !== selectedNoteId),
    }))

    setSelectedNoteId(null)
  }

  const moveNoteToStage = (noteId: string, stageId: StageId) => {
    patchNote(noteId, (note) => ({ ...note, stageId }))
  }

  const queueImage = (noteId: string, forceStage: StageId = "image") => {
    patchNote(noteId, (note) => ({
      ...note,
      stageId: forceStage,
      imageStatus: note.imageStatus === "running" ? "running" : "queued",
      imageError: undefined,
    }))
  }

  const queueVideo = (noteId: string, forceStage: StageId = "video") => {
    patchNote(noteId, (note) => ({
      ...note,
      stageId: forceStage,
      videoStatus: note.videoStatus === "running" ? "running" : "queued",
      videoError: undefined,
    }))
  }

  const queueBoth = (noteId: string) => {
    patchNote(noteId, (note) => ({
      ...note,
      stageId: "router",
      imageStatus: note.imageStatus === "running" ? "running" : "queued",
      videoStatus: note.videoStatus === "running" ? "running" : "queued",
      imageError: undefined,
      videoError: undefined,
    }))
  }

  const handleDropOnNode = (nodeId: NodeId) => {
    if (!draggedNoteId) return

    if (nodeId === "router") {
      queueBoth(draggedNoteId)
      return
    }

    if (nodeId === "image") {
      queueImage(draggedNoteId, "image")
      return
    }

    if (nodeId === "video") {
      queueVideo(draggedNoteId, "video")
      return
    }

    moveNoteToStage(draggedNoteId, nodeId)
  }

  const routeToTool = (kind: "image" | "video", prompt: string) => {
    const encoded = encodeURIComponent(prompt)
    if (kind === "image") {
      router.push(`/dashboard/image-generator?prompt=${encoded}`)
      return
    }
    router.push(`/dashboard/video-generator?prompt=${encoded}`)
  }

  const runImageBranch = async (note: PromptNote) => {
    setImageWorkerBusy(true)
    patchNote(note.id, (current) => ({
      ...current,
      imageStatus: "running",
      stageId: current.stageId === "router" ? "router" : "image",
    }))

    try {
      const result = await generateTextToImage({
        prompt: note.text,
        aspectRatio: "landscape",
      })

      if (!result.success) {
        throw new Error(result.error || "Generate image gagal")
      }

      let imageUrl = result.imageUrl || result.imageUrls?.[0]
      if (!imageUrl && result.jobId) {
        for (let i = 0; i < 60; i++) {
          await sleep(5000)
          const status = await checkImageJobStatus(result.jobId, "textToImage")
          if (status.status === "completed" && status.imageUrls?.[0]) {
            imageUrl = status.imageUrls[0]
            break
          }
          if (status.status === "failed") {
            throw new Error(toUserFacingGenerationError(status.error, "image"))
          }
        }
      }

      if (!imageUrl) {
        throw new Error("Image URL tidak ditemukan")
      }

      patchNote(note.id, (current) => {
        const next = {
          ...current,
          imageStatus: "completed" as BranchStatus,
          imageUrl,
        }
        return { ...next, stageId: resolveStage(next) }
      })

      setQuickOutputs((prev) => [
        {
          id: `out-${Date.now()}`,
          type: "image",
          prompt: note.text,
          url: imageUrl,
          createdAt: Date.now(),
        },
        ...prev,
      ])

      toast.success("Image branch selesai")
    } catch (error) {
      patchNote(note.id, (current) => {
        const next = {
          ...current,
          imageStatus: "failed" as BranchStatus,
          imageError: error instanceof Error ? error.message : "Image branch failed",
        }
        return { ...next, stageId: resolveStage(next) }
      })

      toast.error(error instanceof Error ? error.message : "Image branch gagal")
    } finally {
      setImageWorkerBusy(false)
    }
  }

  const runVideoBranch = async (note: PromptNote) => {
    setVideoWorkerBusy(true)
    patchNote(note.id, (current) => ({
      ...current,
      videoStatus: "running",
      stageId: current.stageId === "router" ? "router" : "video",
    }))

    try {
      const submitted = await submitTextToVideo({
        prompt: note.text,
        model: "veo-3.1-fast-relaxed",
        aspectRatio: "landscape",
      })

      if (!submitted.success || !submitted.jobId) {
        throw new Error(submitted.message || "Submit video gagal")
      }

      const queueNotice = getGenerationQueueNotice(submitted, "Workflow video")
      if (queueNotice) {
        toast.info(queueNotice.message)
      }

      let videoUrl: string | undefined
      for (let i = 0; i < 120; i++) {
        await sleep(5000)
        const status = await checkVideoJobStatus(submitted.jobId, "textToVideo")
        if (status.status === "completed" && status.videoUrls?.[0]) {
          videoUrl = status.videoUrls[0]
          break
        }
        if (status.status === "failed") {
          throw new Error(toUserFacingGenerationError(status.error, "video"))
        }
      }

      if (!videoUrl) {
        throw new Error("Video URL tidak ditemukan")
      }

      patchNote(note.id, (current) => {
        const next = {
          ...current,
          videoStatus: "completed" as BranchStatus,
          videoUrl,
        }
        return { ...next, stageId: resolveStage(next) }
      })

      setQuickOutputs((prev) => [
        {
          id: `out-${Date.now()}`,
          type: "video",
          prompt: note.text,
          url: videoUrl,
          createdAt: Date.now(),
        },
        ...prev,
      ])

      toast.success("Video branch selesai")
    } catch (error) {
      patchNote(note.id, (current) => {
        const next = {
          ...current,
          videoStatus: "failed" as BranchStatus,
          videoError: error instanceof Error ? error.message : "Video branch failed",
        }
        return { ...next, stageId: resolveStage(next) }
      })

      toast.error(error instanceof Error ? error.message : "Video branch gagal")
    } finally {
      setVideoWorkerBusy(false)
    }
  }

  // Auto-run image pipeline.
  useEffect(() => {
    if (!activeCampaign || imageWorkerBusy) return

    const nextImage = activeCampaign.notes.find((note) => note.imageStatus === "queued")
    if (!nextImage) return

    runImageBranch(nextImage)
  }, [activeCampaign, imageWorkerBusy])

  // Auto-run video pipeline.
  useEffect(() => {
    if (!activeCampaign || videoWorkerBusy) return

    const nextVideo = activeCampaign.notes.find((note) => note.videoStatus === "queued")
    if (!nextVideo) return

    runVideoBranch(nextVideo)
  }, [activeCampaign, videoWorkerBusy])

  useEffect(() => {
    if (!draggingNode) return

    const handleMouseMove = (event: MouseEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const size = NODE_SIZE[draggingNode.nodeId]
      const nextX = event.clientX - rect.left - draggingNode.offsetX
      const nextY = event.clientY - rect.top - draggingNode.offsetY

      const clampedX = Math.max(8, Math.min(nextX, rect.width - size.w - 8))
      const clampedY = Math.max(8, Math.min(nextY, rect.height - size.h - 8))

      setNodePositions((prev) => ({
        ...prev,
        [draggingNode.nodeId]: {
          x: clampedX,
          y: clampedY,
        },
      }))
    }

    const handleMouseUp = () => {
      setDraggingNode(null)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [draggingNode])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Badge variant="secondary" className="mb-2">Workflow</Badge>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Workflow className="h-6 w-6" />
            Graph Canvas Pipeline
          </h1>
          <p className="text-sm text-muted-foreground">
            Node draggable + koneksi dinamis + auto-run branch image/video.
          </p>
        </div>

        <Button size="icon" onClick={() => setControlsOpen(true)} aria-label="Workflow controls">
          <Settings2 className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardContent className="p-3">
          <div
            ref={canvasRef}
            className="relative h-[78vh] min-h-[620px] w-full overflow-auto rounded-xl border"
            style={{
              backgroundColor: "hsl(var(--background))",
              backgroundImage:
                "linear-gradient(to right, rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(to right, rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.08) 1px, transparent 1px)",
              backgroundSize: "96px 96px, 96px 96px, 24px 24px, 24px 24px",
              backgroundPosition: "0 0, 0 0, 0 0, 0 0",
            }}
          >
            <svg className="absolute inset-0 h-full w-full pointer-events-none" fill="none" aria-hidden="true">
              <defs>
                <marker id="graph-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" className="fill-slate-400" />
                </marker>
              </defs>

              {CONNECTIONS.map((connection, index) => {
                const from = nodePositions[connection.from]
                const to = nodePositions[connection.to]
                const fromSize = NODE_SIZE[connection.from]
                const toSize = NODE_SIZE[connection.to]

                const startX = from.x + fromSize.w
                const startY = from.y + fromSize.h / 2
                const endX = to.x
                const endY = to.y + toSize.h / 2
                const c1x = startX + Math.max(40, (endX - startX) * 0.45)
                const c2x = endX - Math.max(40, (endX - startX) * 0.45)

                const isFailure = connection.to === "failed"

                return (
                  <path
                    key={`${connection.from}-${connection.to}-${index}`}
                    d={`M ${startX} ${startY} C ${c1x} ${startY}, ${c2x} ${endY}, ${endX} ${endY}`}
                    stroke={isFailure ? "#f43f5e" : "#94a3b8"}
                    strokeOpacity={isFailure ? 0.5 : 0.8}
                    strokeWidth={2}
                    strokeDasharray={isFailure ? "6 6" : "0"}
                    markerEnd="url(#graph-arrow)"
                  />
                )
              })}
            </svg>

            {(Object.keys(NODE_META) as NodeId[]).map((nodeId) => {
              const node = NODE_META[nodeId]
              const position = nodePositions[nodeId]
              const size = NODE_SIZE[nodeId]
              const notes = groupedNotes[nodeId] || []

              return (
                <div
                  key={nodeId}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setHoverNodeId(nodeId)
                  }}
                  onDragLeave={() => setHoverNodeId(null)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setHoverNodeId(null)
                    handleDropOnNode(nodeId)
                    setDraggedNoteId(null)
                  }}
                  className={`absolute rounded-xl border bg-card/95 shadow-sm backdrop-blur ${
                    hoverNodeId === nodeId ? "border-primary ring-1 ring-primary/50" : "border-border"
                  }`}
                  style={{
                    width: size.w,
                    height: size.h,
                    left: position.x,
                    top: position.y,
                  }}
                >
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      const rect = event.currentTarget.getBoundingClientRect()
                      setDraggingNode({
                        nodeId,
                        offsetX: event.clientX - rect.left,
                        offsetY: event.clientY - rect.top,
                      })
                    }}
                    className="w-full flex items-center justify-between rounded-t-xl border-b px-3 py-1.5 cursor-move bg-muted/50"
                  >
                    <span className={`text-xs font-semibold ${node.color}`}>{node.title}</span>
                    <span className="text-[10px] text-muted-foreground">{notes.length}</span>
                  </button>

                  <div className="px-3 pt-2">
                    <p className="text-[11px] text-muted-foreground line-clamp-1">{node.subtitle}</p>
                    <div className="mt-2 space-y-1 max-h-[58px] overflow-auto">
                      {notes.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground/80">Drop prompt di sini</p>
                      ) : (
                        notes.slice(0, 3).map((note) => (
                          <button
                            key={note.id}
                            type="button"
                            draggable
                            onDragStart={() => setDraggedNoteId(note.id)}
                            onClick={() => setSelectedNoteId(note.id)}
                            className={`w-full rounded border px-1.5 py-1 text-left text-[10px] ${
                              selectedNoteId === note.id ? "border-primary bg-primary/10" : "hover:bg-muted"
                            }`}
                            title={note.text}
                          >
                            {note.text}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={controlsOpen} onOpenChange={setControlsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Workflow Controls</DialogTitle>
            <DialogDescription>
              Semua opsi diletakkan di popup supaya halaman tetap fokus ke canvas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium">Campaign</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={newCampaignName}
                  onChange={(event) => setNewCampaignName(event.target.value)}
                  placeholder="Nama campaign baru"
                />
                <Button onClick={createCampaign} disabled={!newCampaignName.trim()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {campaigns.map((campaign) => (
                  <Button
                    key={campaign.id}
                    size="sm"
                    variant={campaign.id === activeCampaignId ? "default" : "outline"}
                    onClick={() => {
                      setActiveCampaignId(campaign.id)
                      setSelectedNoteId(null)
                    }}
                  >
                    <Bot className="h-4 w-4 mr-2" />
                    {campaign.name}
                  </Button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium">Add Prompt</p>
              <Textarea
                value={newPromptText}
                onChange={(event) => setNewPromptText(event.target.value)}
                placeholder="Tulis prompt note baru"
                className="min-h-20"
              />
              <div className="flex justify-end">
                <Button onClick={addPrompt} disabled={!newPromptText.trim()}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Simpan Prompt
                </Button>
              </div>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium">Prompt Actions</p>
              {selectedNote ? (
                <>
                  <p className="text-xs text-muted-foreground line-clamp-3">{selectedNote.text}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" onClick={() => routeToTool("image", selectedNote.text)}>
                      <ImageIcon className="h-4 w-4 mr-2" />
                      Open Image Tool
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => routeToTool("video", selectedNote.text)}>
                      <Film className="h-4 w-4 mr-2" />
                      Open Video Tool
                    </Button>
                    <Button size="sm" onClick={() => queueImage(selectedNote.id, "image")}>Queue Image</Button>
                    <Button size="sm" onClick={() => queueVideo(selectedNote.id, "video")}>Queue Video</Button>
                    <Button size="sm" className="col-span-2" onClick={() => queueBoth(selectedNote.id)}>
                      <Route className="h-4 w-4 mr-2" />
                      Multi-Branch (Image + Video)
                    </Button>
                  </div>
                  <Button variant="destructive" size="sm" className="w-full" onClick={deleteSelectedNote}>
                    Hapus Prompt Terpilih
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Pilih prompt note pada canvas terlebih dahulu.
                </p>
              )}
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium">Quick Outputs</p>
              {quickOutputs.length === 0 ? (
                <p className="text-xs text-muted-foreground">Belum ada output.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {quickOutputs.slice(0, 6).map((output) => (
                    <div key={output.id} className="rounded border p-2">
                      <div className="mb-1 flex items-center justify-between">
                        <Badge variant="outline">{output.type}</Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(output.createdAt).toLocaleTimeString("id-ID")}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground line-clamp-2 mb-1">{output.prompt}</p>
                      {output.type === "image" ? (
                        <img src={output.url} alt="output" className="h-20 w-full rounded object-cover" />
                      ) : (
                        <video src={output.url} controls className="h-20 w-full rounded object-cover" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
