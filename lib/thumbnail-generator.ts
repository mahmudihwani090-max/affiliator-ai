export interface ThumbnailGeneratorConfig {
  contentTopic: string
  hookAngle: string
  focalSubject: string
  visualStyle: string
  emotion: string
  colorMood: string
  aspectRatio: "portrait" | "landscape"
}

function getAspectRatioDirection(aspectRatio: ThumbnailGeneratorConfig["aspectRatio"]) {
  return aspectRatio === "portrait"
    ? "Compose like a vertical short-form cover image with a bold focal point and clear space for headline placement."
    : "Compose like a strong video thumbnail with a bold focal point, readable hierarchy, and reserved area for headline placement."
}

export function buildThumbnailGeneratorPrompt(config: ThumbnailGeneratorConfig) {
  return [
    `Create a high-click-through thumbnail image for content about ${config.contentTopic}.`,
    `The main hook angle is: ${config.hookAngle}.`,
    `Focal subject to emphasize: ${config.focalSubject}.`,
    `Visual style: ${config.visualStyle}.`,
    `Emotional tone on the subject or scene: ${config.emotion}.`,
    `Color mood and palette direction: ${config.colorMood}.`,
    getAspectRatioDirection(config.aspectRatio),
    "Design the composition to feel instantly eye-catching, high-contrast, and algorithm-friendly.",
    "Reserve clean negative space for future headline text, but do not render any actual text in the image.",
    "If reference images are provided, use them for identity, styling, or subject accuracy.",
    "No watermark, no low-detail clutter, no unreadable text, no collage.",
  ].join(" ")
}