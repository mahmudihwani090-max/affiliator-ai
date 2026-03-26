export interface AutoScenePrompt {
  id: string
  title: string
  prompt: string
}

export type AutoSceneSceneCount = 3 | 4 | 5 | 6

export interface AutoSceneFormConfig {
  productCategory: string
  targetAudience: string
  productDetails: string
  aspectRatio: "portrait" | "landscape"
  cameraStyle: string
  productPosition: string
  backgroundStyle: string
  language: string
  languageStyle: string
  tone: string
  sceneCount: AutoSceneSceneCount
  hook: string
  callToAction: string
}

type AutoSceneBlueprint = {
  id: string
  title: string
  direction: string
  narrativeRole: string
}

const AUTO_SCENE_BLUEPRINTS: readonly AutoSceneBlueprint[] = [
  {
    id: "scene-1",
    title: "Hero Product Reveal",
    direction:
      "Create a high-end hero shot where the product is the clear centerpiece, elevated, premium, glossy, and instantly desirable. Keep generous negative space for future marketing copy, dramatic studio lighting, polished reflections, and a luxury commercial mood.",
    narrativeRole:
      "Opening hook frame that must immediately stop the scroll and introduce the main product problem or key promise.",
  },
  {
    id: "scene-2",
    title: "Model Beauty Close-Up",
    direction:
      "Create a beauty-commercial close-up featuring the model interacting naturally with the product near the face, refined skin detail, confident expression, soft cinematic light, elegant hand placement, and an aspirational premium skincare or lifestyle ad feeling.",
    narrativeRole:
      "Trust-building scene that makes the audience imagine themselves using the product.",
  },
  {
    id: "scene-3",
    title: "Lifestyle Usage Moment",
    direction:
      "Create a stylish lifestyle scene showing the product being used in context, fashionable composition, believable motion energy, premium advertising photography, balanced framing between model and product, and a polished commercial set based on the provided background reference.",
    narrativeRole:
      "Usage demonstration scene showing the product in action within a relatable daily moment.",
  },
  {
    id: "scene-4",
    title: "Macro Detail Shot",
    direction:
      "Create a macro-inspired detail scene focused on texture, packaging detail, premium materials, product surface highlights, fine beauty-commercial lighting, clean editorial composition, and a tactile cinematic advertising look.",
    narrativeRole:
      "Detail scene highlighting ingredients, texture, quality cues, or packaging craftsmanship.",
  },
  {
    id: "scene-5",
    title: "Aspirational Brand Moment",
    direction:
      "Create an aspirational campaign scene where the model and product feel iconic, stylish, and emotionally elevated, with cinematic depth, premium color grading, strong fashion-commercial direction, and a result that feels ready for a luxury promo video storyboard.",
    narrativeRole:
      "Emotional payoff scene that elevates brand aspiration and audience desire.",
  },
  {
    id: "scene-6",
    title: "Premium Closing Frame",
    direction:
      "Create a final closing-frame composition for a product promo, with the product beautifully showcased, premium brand energy, cinematic lighting, sophisticated symmetry, clean background styling, and a strong end-card feel without any text overlay.",
    narrativeRole:
      "Closing frame that visually supports the final call to action while remaining text-free.",
  },
] as const

const SCENE_SELECTION_BY_COUNT: Record<AutoSceneSceneCount, string[]> = {
  3: ["scene-1", "scene-3", "scene-6"],
  4: ["scene-1", "scene-2", "scene-4", "scene-6"],
  5: ["scene-1", "scene-2", "scene-3", "scene-5", "scene-6"],
  6: AUTO_SCENE_BLUEPRINTS.map((scene) => scene.id),
}

function getSceneBlueprints(sceneCount: AutoSceneSceneCount) {
  const selectedIds = new Set(SCENE_SELECTION_BY_COUNT[sceneCount])
  return AUTO_SCENE_BLUEPRINTS.filter((scene) => selectedIds.has(scene.id))
}

function getHookVisualDirection(hook: string) {
  switch (hook) {
    case "Problem-Agitation (Masalah)":
      return "The opening scene must make the user's pain point obvious through expression, situation, or visual contrast, then position the product as the answer without using any text."
    case "Direct Benefit":
      return "The opening scene must instantly show the most desirable end benefit and make the product look like the direct cause of that result."
    case "Transformation / Before-After":
      return "The opening scene must suggest a transformation journey, showing a strong sense of change or improvement while avoiding split-screen layouts."
    case "Curiosity Hook":
      return "The opening scene must feel unusual, intriguing, and scroll-stopping, creating curiosity about what the product does."
    case "Social Proof Hook":
      return "The opening scene must feel trusted, trendy, and widely desired, implying strong market validation or social appeal."
    default:
      return "The opening scene must stop the scroll and introduce the product's main promise clearly through visuals only."
  }
}

function getClosingCtaDirection(callToAction: string) {
  switch (callToAction) {
    case "Click Link in Bio":
      return "The final frame should feel like a polished social-ad closing shot that naturally leads viewers to click the link in bio."
    case "Order Sekarang":
      return "The final frame should create urgency and buying intent, making the product feel ready to order immediately."
    case "DM untuk Konsultasi":
      return "The final frame should feel approachable, trusted, and premium, encouraging viewers to reach out for more information."
    case "Coba Sekarang":
      return "The final frame should feel inviting and low-friction, making the product look easy and exciting to try now."
    case "Checkout Hari Ini":
      return "The final frame should feel conversion-focused and commerce-ready, nudging viewers toward checkout today."
    default:
      return "The final frame should visually reinforce the desired action and leave a strong purchase-ready impression."
  }
}

function getAspectRatioDirection(aspectRatio: AutoSceneFormConfig["aspectRatio"]) {
  return aspectRatio === "portrait"
    ? "Compose for vertical short-form content with strong center framing, clear subject hierarchy, and safe negative space for possible top and bottom caption placement."
    : "Compose for wide-format content with cinematic horizontal balance, layered depth, and strong side-to-side visual storytelling."
}

function getProductPositionDirection(productPosition: string) {
  switch (productPosition) {
    case "Digunakan (Applied/Used)":
      return "Prioritize scenes where the product is visibly being used so the benefit feels demonstrated, not only displayed."
    case "Hero Packshot":
      return "Prioritize clean hero compositions where the product pack is dominant, elegant, and unmistakably premium."
    case "Dipegang Model":
      return "Prioritize hand-held product framing with natural but polished model interaction and clear brand visibility."
    case "Flat Lay Styling":
      return "Include editorial styling logic, arranged props, and top-down or semi-top-down composition cues where appropriate."
    case "Close-Up Texture":
      return "Prioritize tactile close-ups that emphasize formula, texture, material detail, or premium surface quality."
    default:
      return `Respect this product positioning preference: ${productPosition}.`
  }
}

function getBackgroundDirection(backgroundStyle: string) {
  return backgroundStyle === "Auto (Sesuai Konteks)"
    ? "Use the uploaded background reference as the main environmental anchor, but refine the set styling so it feels contextually accurate for the category, audience, and ad mood."
    : `Use the uploaded background reference and art-direct it toward this environment style: ${backgroundStyle}.`
}

function buildSceneSpecificPrompt(params: {
  scene: AutoSceneBlueprint
  index: number
  totalScenes: number
  hook: string
  callToAction: string
}) {
  const isOpeningScene = params.index === 0
  const isClosingScene = params.index === params.totalScenes - 1

  return [
    `This is scene ${params.index + 1} of ${params.totalScenes}.`,
    isOpeningScene ? getHookVisualDirection(params.hook) : "This scene should progress the marketing narrative naturally from the previous scene.",
    isClosingScene ? getClosingCtaDirection(params.callToAction) : "Do not make this scene feel like a final end card yet.",
    `Scene role: ${params.scene.narrativeRole}`,
    params.scene.direction,
  ].join(" ")
}

export function buildAutoScenePrompts(config: AutoSceneFormConfig): AutoScenePrompt[] {
  const productCategory = config.productCategory.trim()
  const targetAudience = config.targetAudience.trim()
  const productDetails = config.productDetails.trim()
  const backgroundStyle = config.backgroundStyle.trim()
  const selectedScenes = getSceneBlueprints(config.sceneCount)

  const campaignBrief = [
    `Create a premium storyboard for a ${productCategory} product promotion aimed at ${targetAudience}.`,
    `Translate the user's intent faithfully and do not invent a different product angle, audience, or mood than requested.`,
    `Use ${config.language} language sensibility with a ${config.languageStyle} advertising feel and a ${config.tone} emotional tone, but express it visually rather than through on-screen text.`,
    `Main hook strategy: ${config.hook}. Final call-to-action target: ${config.callToAction}.`,
    `Camera treatment must feel ${config.cameraStyle}.`,
    getAspectRatioDirection(config.aspectRatio),
    getProductPositionDirection(config.productPosition),
    getBackgroundDirection(backgroundStyle),
    `The most important product claims, differentiators, or selling points that must be visually reflected are: ${productDetails}.`,
  ].join(" ")

  const sharedConstraints = [
    "Keep the exact product design, shape, material, cap, label placement, and packaging identity from the reference product image.",
    "Keep the same model identity, face structure, skin tone, styling, and overall look from the reference model image.",
    "Use the uploaded background reference as the environment anchor and maintain consistent atmosphere, palette, spatial logic, and production design.",
    "Maintain realistic anatomy, realistic hands, clean luxury styling, premium commercial photography, and consistent brand aesthetics.",
    "Prioritize clear product readability, believable interaction, and a commercial result that matches the requested audience and market positioning.",
    "Make each scene feel intentionally different while still belonging to the same campaign world.",
    "No text, no watermark, no collage, no split-screen.",
  ].join(" ")

  return selectedScenes.map((scene, index) => ({
    id: scene.id,
    title: `Scene ${index + 1} - ${scene.title}`,
    prompt: `${campaignBrief} ${sharedConstraints} ${buildSceneSpecificPrompt({
      scene,
      index,
      totalScenes: selectedScenes.length,
      hook: config.hook,
      callToAction: config.callToAction,
    })}`,
  }))
}