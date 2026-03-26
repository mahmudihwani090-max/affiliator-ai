export interface ModelStudioConfig {
  modelFocus: string
  targetLook: string
  stylingDetails: string
  shootStyle: string
  expressionAndPose: string
  backgroundMood: string
  aspectRatio: "portrait" | "landscape"
}

function getAspectRatioDirection(aspectRatio: ModelStudioConfig["aspectRatio"]) {
  return aspectRatio === "portrait"
    ? "Compose for vertical fashion or beauty content with strong subject framing and clean spacing around the body and face."
    : "Compose for wide editorial content with cinematic balance, layered depth, and strong spatial composition."
}

export function buildModelStudioPrompt(config: ModelStudioConfig) {
  return [
    `Create a premium model studio image focused on ${config.modelFocus}.`,
    `The target visual look should feel like ${config.targetLook}.`,
    `Styling details to emphasize: ${config.stylingDetails}.`,
    `Shoot style: ${config.shootStyle}.`,
    `Expression and pose direction: ${config.expressionAndPose}.`,
    `Background and mood direction: ${config.backgroundMood}.`,
    getAspectRatioDirection(config.aspectRatio),
    "If reference images are provided, preserve the same identity, facial structure, skin tone, hair, and overall styling DNA from the references.",
    "Maintain realistic anatomy, clean skin detail, natural hands, professional fashion photography quality, and premium studio lighting.",
    "No watermark, no text overlay, no collage, no extra people.",
  ].join(" ")
}