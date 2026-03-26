"use client"

import * as React from "react"
import { Clock3, LoaderCircle, ListTodo } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { subscribeGenerationQueueSummaryRefresh } from "@/lib/generation-queue-events"
import { cn } from "@/lib/utils"

type GenerationQueueSummary = {
  totalPending: number
  activeCount: number
  queuedCount: number
  limit: number
  activeJobId?: string
  activePrompt?: string
  activeOperation?: string
  nextQueuedJobId?: string
  items: Array<{
    jobId: string
    status: string
    prompt?: string
    operation: string
    createdAt: string
    queuePosition: number
  }>
}

interface GenerationQueueHeaderNoticeProps {
  initialSummary: GenerationQueueSummary
}

function buildQueueMessage(summary: GenerationQueueSummary) {
  if (summary.queuedCount > 0) {
    return `${summary.queuedCount} request menunggu giliran`
  }

  if (summary.activeCount > 0) {
    return `${summary.activeCount} request sedang diproses`
  }

  return ""
}

function buildDialogDescription(summary: GenerationQueueSummary) {
  if (summary.queuedCount > 0) {
    return `Request image dan video dijalankan satu per satu per akun. Ada ${summary.queuedCount} request yang akan diproses setelah job aktif selesai.`
  }

  return "Request image dan video dijalankan satu per satu per akun. Jika Anda submit lagi dari tab atau device lain, request berikutnya akan otomatis masuk antrean."
}

function formatOperationLabel(operation: string) {
  switch (operation) {
    case "textToImage":
      return "Text to Image"
    case "imageToImage":
      return "Image to Image"
    case "upscaleImage":
      return "Upscale Image"
    case "textToVideo":
      return "Text to Video"
    case "imageToVideo":
      return "Image to Video"
    case "referenceToVideo":
      return "Reference to Video"
    case "frameToFrame":
      return "Frame to Frame"
    case "upscaleVideo":
      return "Upscale Video"
    case "extendVideo":
      return "Extend Video"
    default:
      return operation
  }
}

function formatStatusLabel(status: string) {
  switch (status) {
    case "queued":
      return "Menunggu"
    case "submitting":
      return "Mengirim"
    case "running":
      return "Diproses"
    case "completed":
      return "Selesai"
    case "failed":
      return "Gagal"
    default:
      return status
  }
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "running":
    case "submitting":
      return "default"
    case "queued":
      return "secondary"
    case "failed":
      return "destructive"
    default:
      return "outline"
  }
}

export function GenerationQueueHeaderNotice({ initialSummary }: GenerationQueueHeaderNoticeProps) {
  const [summary, setSummary] = React.useState(initialSummary)

  const loadSummary = React.useCallback(async () => {
    try {
      const response = await fetch("/api/generation-queue/summary", {
        cache: "no-store",
      })

      if (!response.ok) {
        return
      }

      const data = (await response.json()) as {
        success?: boolean
        summary?: GenerationQueueSummary
      }

      if (data.success && data.summary) {
        setSummary(data.summary)
      }
    } catch {
      // Keep the last known summary when polling fails.
    }
  }, [])

  React.useEffect(() => {
    void loadSummary()
    const intervalId = window.setInterval(loadSummary, 4000)
    const unsubscribe = subscribeGenerationQueueSummaryRefresh(() => {
      void loadSummary()
    })

    return () => {
      window.clearInterval(intervalId)
      unsubscribe()
    }
  }, [loadSummary])

  if (summary.totalPending === 0) {
    return null
  }

  const message = buildQueueMessage(summary)
  const dialogDescription = buildDialogDescription(summary)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "h-auto rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-transparent",
            summary.queuedCount > 0
              ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/15"
              : "border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/15"
          )}
        >
          {summary.queuedCount > 0 ? (
            <Clock3 className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" />
          )}
          <span className="hidden sm:inline">{message}</span>
          <span className="sm:hidden">Antrean {summary.totalPending}</span>
          <Badge
            variant="outline"
            className={cn(
              "border-current/25 bg-transparent text-[10px]",
              summary.queuedCount > 0 ? "text-amber-900 dark:text-amber-200" : "text-sky-900 dark:text-sky-200"
            )}
          >
            {summary.totalPending}/{summary.limit}
          </Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListTodo className="h-5 w-5" />
            Antrean Generate
          </DialogTitle>
          <DialogDescription>
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">Total {summary.totalPending}</Badge>
            <Badge variant="outline">Aktif {summary.activeCount}</Badge>
            <Badge variant="outline">Menunggu {summary.queuedCount}</Badge>
          </div>
          <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {summary.items.map((item) => (
              <div
                key={item.jobId}
                className="flex flex-col gap-2 rounded-xl border bg-muted/20 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {item.prompt || "Request tanpa prompt"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatOperationLabel(item.operation)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">#{item.queuePosition}</Badge>
                    <Badge variant={getStatusVariant(item.status)}>
                      {formatStatusLabel(item.status)}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
