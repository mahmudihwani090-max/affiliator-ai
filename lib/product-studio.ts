export interface ProductStudioConfig {
  productCategory: string
  productName: string
  sellingPoints: string
  shotType: string
  backgroundStyle: string
  lightingStyle: string
  aspectRatio: "portrait" | "landscape"
}

function getAspectRatioDirection(aspectRatio: ProductStudioConfig["aspectRatio"]) {
  return aspectRatio === "portrait"
    ? "Compose for vertical commerce content with strong central product dominance and mobile-first readability."
    : "Compose for wide commercial imagery with cinematic balance and strong product staging."
}

export function buildProductStudioPrompt(config: ProductStudioConfig) {
  return [
    `Create a premium product studio image for ${config.productName}, a ${config.productCategory} product.`,
    `Main product selling points to express visually: ${config.sellingPoints}.`,
    `Shot type: ${config.shotType}.`,
    `Background style: ${config.backgroundStyle}.`,
    `Lighting style: ${config.lightingStyle}.`,
    getAspectRatioDirection(config.aspectRatio),
    "If reference images are provided, preserve the exact product identity including shape, label placement, materials, cap, proportions, and packaging details.",
    "The image should feel commercial, premium, polished, conversion-focused, and studio-grade.",
    "No text overlay, no watermark, no collage, no duplicate products unless composition naturally requires supporting repeats.",
  ].join(" ")
}