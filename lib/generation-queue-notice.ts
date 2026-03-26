type QueueAwareResult = {
  jobId?: string
  queuePosition?: number
  status?: string
}

export function getGenerationQueueNotice(result: QueueAwareResult, modeLabel: string) {
  if (!result.jobId) {
    return null
  }

  if ((result.queuePosition || 0) > 1) {
    return {
      title: `${modeLabel} masuk antrean`,
      message: `Request ini ada di posisi ${result.queuePosition}. Proses akan dimulai setelah request sebelumnya selesai.`,
    }
  }

  return {
    title: `${modeLabel} diproses`,
    message: `Request sedang diproses sekarang. Jika Anda submit lagi, request berikutnya akan otomatis masuk antrean.`,
  }
}
