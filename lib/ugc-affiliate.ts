export interface UgcAffiliateConfig {
  productCategory: string
  productName: string
  targetAudience: string
  keySellingPoints: string
  reviewAngle: string
  presetStyle: string
  creatorPersona: string
  language: string
  tone: string
  callToAction: string
  aspectRatio: "portrait" | "landscape"
}

function getPresetStyleDirection(presetStyle: string) {
  switch (presetStyle) {
    case "Testimonial":
      return "Structure the video like a believable customer testimonial with personal experience, credibility, and sincere product praise."
    case "Soft Sell":
      return "Keep the selling energy subtle, natural, and trust-based, avoiding aggressive commercial pressure."
    case "Hard Sell":
      return "Make the review highly persuasive, urgency-driven, and conversion-focused like a strong direct-response affiliate ad."
    case "Before-After":
      return "Center the storytelling on a visible transformation journey and a clear sense of improvement after using the product."
    case "Day in My Life":
      return "Make the review feel like part of a realistic daily routine, with natural lifestyle context and creator-led storytelling."
    default:
      return `Apply this UGC review style: ${presetStyle}.`
  }
}

function getAspectRatioDirection(aspectRatio: UgcAffiliateConfig["aspectRatio"]) {
  return aspectRatio === "portrait"
    ? "Compose the review for vertical short-form content with strong center framing, clean spacing for face, product, and hand gestures, and mobile-first storytelling."
    : "Compose the review for wide-format video with natural room composition, balanced subject placement, and cinematic side-to-side visual flow."
}

function getToneDirection(tone: string) {
  switch (tone) {
    case "Energetic":
      return "The performance should feel upbeat, fast, convincing, and socially engaging."
    case "Warm":
      return "The performance should feel friendly, approachable, and personally recommended."
    case "Trustworthy":
      return "The performance should feel credible, grounded, and sincerely helpful."
    case "Elegant":
      return "The performance should feel polished, premium, and aspirational while still human."
    case "Playful":
      return "The performance should feel lively, charming, and entertaining without losing product focus."
    default:
      return `The performance tone should feel ${tone}.`
  }
}

function getCallToActionDirection(callToAction: string) {
  switch (callToAction) {
    case "Click Link in Bio":
      return "End the video with a natural social-commerce energy that nudges viewers to click the link in bio."
    case "Order Sekarang":
      return "End the video with strong purchase intent and urgency, making the product feel ready to order immediately."
    case "DM untuk Konsultasi":
      return "End the video with a helpful and approachable tone that encourages viewers to reach out for more information."
    case "Coba Sekarang":
      return "End the video by making the product look easy, exciting, and low-risk to try right now."
    case "Checkout Hari Ini":
      return "End the video with conversion-driven commerce energy that encourages checkout today."
    default:
      return `The closing moment should support this call to action: ${callToAction}.`
  }
}

export function buildUgcAffiliatePrompt(config: UgcAffiliateConfig) {
  const productCategory = config.productCategory.trim()
  const productName = config.productName.trim() || "the product"
  const targetAudience = config.targetAudience.trim()
  const keySellingPoints = config.keySellingPoints.trim()
  const reviewAngle = config.reviewAngle.trim()
  const creatorPersona = config.creatorPersona.trim()

  return [
    `Create a realistic UGC affiliate product review video for ${productName}, a ${productCategory} product aimed at ${targetAudience}.`,
    `Use the uploaded product image as the exact product identity, the uploaded model image as the creator/reviewer identity, and the uploaded background image as the shooting environment anchor.`,
    `The creator persona should feel like ${creatorPersona}.`,
    `UGC preset style: ${config.presetStyle}.`,
    `The review angle should focus on this user intent: ${reviewAngle}.`,
    `The most important selling points that must be shown clearly through performance, interaction, and visual emphasis are: ${keySellingPoints}.`,
    `The creator should naturally hold, show, use, or demonstrate the product like a believable affiliate reviewer, not like a glossy brand commercial actor.`,
    `Use ${config.language} speaking sensibility and make the delivery feel ${config.tone}.`,
    getPresetStyleDirection(config.presetStyle),
    getToneDirection(config.tone),
    getAspectRatioDirection(config.aspectRatio),
    getCallToActionDirection(config.callToAction),
    "Keep the performance authentic, persuasive, and human, with natural gestures, believable expressions, and product-first storytelling.",
    "Keep the product packaging, label placement, shape, and materials consistent with the uploaded reference.",
    "Keep the creator face, skin tone, hairstyle, and identity consistent with the uploaded model reference.",
    "Use the uploaded background as the main environment and maintain visual continuity between the talent, product, and space.",
    "No text overlay, no subtitles burned into the image, no watermark, no split-screen, no extra duplicate people.",
  ].join(" ")
}