"use client"

import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

type VersionPayload = {
  success?: boolean
  version?: string
}

export function VersionRefreshNotice({
  initialVersion,
}: {
  initialVersion: string
}) {
  const [hasUpdate, setHasUpdate] = useState(false)

  useEffect(() => {
    let cancelled = false

    const checkVersion = async () => {
      try {
        const response = await fetch("/api/version", {
          cache: "no-store",
        })

        if (!response.ok) {
          return
        }

        const payload = (await response.json()) as VersionPayload
        if (!cancelled && payload.version && payload.version !== initialVersion) {
          setHasUpdate(true)
        }
      } catch {
        // Ignore transient network failures and keep polling.
      }
    }

    const intervalId = window.setInterval(() => {
      void checkVersion()
    }, 60000)

    void checkVersion()

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [initialVersion])

  if (!hasUpdate) {
    return null
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
      <div className="flex min-w-0 flex-col">
        <span className="font-medium">Versi baru tersedia</span>
        <span className="text-xs opacity-80">Refresh untuk sinkron dengan build terbaru.</span>
      </div>
      <Button
        type="button"
        size="sm"
        className="h-8 shrink-0 rounded-lg"
        onClick={() => window.location.reload()}
      >
        <RefreshCw className="mr-2 h-4 w-4" />
        Refresh
      </Button>
    </div>
  )
}