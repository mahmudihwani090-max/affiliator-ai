const GENERATION_QUEUE_SUMMARY_CHANNEL = "generation-queue-summary"
const GENERATION_QUEUE_SUMMARY_STORAGE_KEY = "generation-queue-summary:refresh"

export const GENERATION_QUEUE_SUMMARY_REFRESH_EVENT = "generation-queue-summary:refresh"
export function dispatchGenerationQueueSummaryRefresh() {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(new Event(GENERATION_QUEUE_SUMMARY_REFRESH_EVENT))

  try {
    const channel = new BroadcastChannel(GENERATION_QUEUE_SUMMARY_CHANNEL)
    channel.postMessage({ type: GENERATION_QUEUE_SUMMARY_REFRESH_EVENT, timestamp: Date.now() })
    channel.close()
  } catch {
    // Ignore unsupported BroadcastChannel errors.
  }

  try {
    window.localStorage.setItem(GENERATION_QUEUE_SUMMARY_STORAGE_KEY, `${Date.now()}`)
  } catch {
    // Ignore storage errors.
  }
}

export function subscribeGenerationQueueSummaryRefresh(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {}
  }

  const handleRefresh = () => callback()
  const handleStorage = (event: StorageEvent) => {
    if (event.key === GENERATION_QUEUE_SUMMARY_STORAGE_KEY) {
      callback()
    }
  }

  window.addEventListener(GENERATION_QUEUE_SUMMARY_REFRESH_EVENT, handleRefresh)
  window.addEventListener("storage", handleStorage)

  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(GENERATION_QUEUE_SUMMARY_CHANNEL)
    channel.addEventListener("message", handleRefresh)
  } catch {
    channel = null
  }

  return () => {
    window.removeEventListener(GENERATION_QUEUE_SUMMARY_REFRESH_EVENT, handleRefresh)
    window.removeEventListener("storage", handleStorage)

    if (channel) {
      channel.removeEventListener("message", handleRefresh)
      channel.close()
    }
  }
}
