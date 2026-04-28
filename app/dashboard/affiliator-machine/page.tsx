"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Search as SearchIcon,
    Sparkles,
    Star,
    Loader2,
    ExternalLink,
    Play,
    ShoppingBag,
    TrendingUp,
    Send,
    X,
    Download,
    Tag,
} from "lucide-react"
import { formatPrice } from "@/lib/format-price"
import {
    getFeaturedProducts,
    searchProducts,
    buildVideoPromptFromProduct,
    getProductCategories,
    type AffiliateProductItem,
} from "@/app/actions/affiliate-products"
import { submitTextToVideo, checkVideoJobStatus } from "@/lib/client/generation-api"
import { toUserFacingGenerationError } from "@/lib/generation-errors"
import { getGenerationQueueNotice } from "@/lib/generation-queue-notice"
import { toast } from "sonner"

type AspectRatio = "landscape" | "portrait"

interface GeneratedVideo {
    id: string
    prompt: string
    videoUrl: string
    aspectRatio: AspectRatio
    productName: string
    createdAt: Date
    mediaGenerationId?: string
}

export default function AffiliatorMachinePage() {
    const [activeTab, setActiveTab] = useState("recommended")
    const [featuredProducts, setFeaturedProducts] = useState<AffiliateProductItem[]>([])
    const [searchResults, setSearchResults] = useState<AffiliateProductItem[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [searchCategory, setSearchCategory] = useState("all")
    const [searchPlatform, setSearchPlatform] = useState("all")
    const [categories, setCategories] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [searching, setSearching] = useState(false)
    const [searchTotal, setSearchTotal] = useState(0)

    // Video generation state
    const [selectedProduct, setSelectedProduct] = useState<AffiliateProductItem | null>(null)
    const [videoPrompt, setVideoPrompt] = useState("")
    const [isGenerating, setIsGenerating] = useState(false)
    const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([])
    const [previewVideo, setPreviewVideo] = useState<string | null>(null)
    const [showProductDetail, setShowProductDetail] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        loadInitialData()
    }, [])

    const loadInitialData = async () => {
        setLoading(true)
        try {
            const [featuredResult, cats] = await Promise.all([
                getFeaturedProducts(),
                getProductCategories(),
            ])
            if (featuredResult.success && featuredResult.products) {
                setFeaturedProducts(featuredResult.products)
            }
            setCategories(cats)
        } catch (error) {
            console.error("Failed to load:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleSearch = async () => {
        setSearching(true)
        try {
            const result = await searchProducts({
                query: searchQuery,
                category: searchCategory,
                platform: searchPlatform,
            })
            if (result.success && result.products) {
                setSearchResults(result.products)
                setSearchTotal(result.total || 0)
            }
        } catch (error) {
            console.error("Search failed:", error)
        } finally {
            setSearching(false)
        }
    }

    const handleSelectProduct = async (product: AffiliateProductItem) => {
        setSelectedProduct(product)
        setShowProductDetail(true)

        const result = await buildVideoPromptFromProduct(product)
        if (result.success && result.prompt) {
            setVideoPrompt(result.prompt)
        }
    }

    const handleGenerateVideo = async () => {
        if (!selectedProduct || !videoPrompt.trim()) return

        setIsGenerating(true)
        setShowProductDetail(false)

        try {
            const result = await submitTextToVideo({
                prompt: videoPrompt,
                model: "veo-3.1-fast-relaxed",
                aspectRatio: "portrait",
            })

            if (!result.success) {
                throw new Error(result.message || "Generate gagal")
            }

            if (result.jobId) {
                const queueNotice = getGenerationQueueNotice(result, "T2V")
                toast.info(queueNotice?.message || "🎬 Generating video promo... (1-3 menit)")

                const pollResult = await pollJobStatus(result.jobId)
                if (pollResult?.videoUrl) {
                    const newVideo: GeneratedVideo = {
                        id: Date.now().toString(),
                        prompt: videoPrompt,
                        videoUrl: pollResult.videoUrl,
                        aspectRatio: "portrait",
                        productName: selectedProduct.name,
                        createdAt: new Date(),
                        mediaGenerationId: pollResult.mediaGenerationId,
                    }
                    setGeneratedVideos(prev => [newVideo, ...prev])
                    toast.success("Video promo berhasil dibuat! 🎬")
                } else {
                    throw new Error("Tidak ada video URL")
                }
            }
        } catch (error) {
            console.error("Generation failed:", error)
            toast.error(toUserFacingGenerationError(error instanceof Error ? error.message : undefined, "video"))
        } finally {
            setIsGenerating(false)
        }
    }

    const pollJobStatus = async (
        jobId: string,
        maxAttempts = 120
    ): Promise<{ videoUrl: string; mediaGenerationId?: string } | null> => {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 5000))
            const statusResult = await checkVideoJobStatus(jobId, "textToVideo")

            if (statusResult.status === "completed" && statusResult.videoUrls?.length) {
                return {
                    videoUrl: statusResult.videoUrls[0],
                    mediaGenerationId: statusResult.mediaGenerationId,
                }
            }
            if (statusResult.status === "failed") {
                throw new Error(toUserFacingGenerationError(statusResult.error, "video"))
            }
            if (attempt > 0 && attempt % 6 === 0) {
                toast.info(`Masih memproses... (${Math.round((attempt * 5) / 60)} menit)`)
            }
        }
        throw new Error(toUserFacingGenerationError("Job timed out", "video"))
    }

    const getProxiedVideoUrl = (url: string) => `/api/image-proxy?url=${encodeURIComponent(url)}`

    const downloadVideo = async (videoUrl: string, filename: string) => {
        try {
            const proxiedUrl = getProxiedVideoUrl(videoUrl)
            const response = await fetch(proxiedUrl)
            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = filename
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            window.URL.revokeObjectURL(url)
            toast.success("Video didownload!")
        } catch {
            toast.error("Gagal mendownload video")
        }
    }

    const platformBadge = (platform: string) => {
        if (platform === "tiktok") {
            return <Badge className="bg-gradient-to-r from-pink-500 to-rose-500 text-white text-[10px]">TikTok</Badge>
        }
        return <Badge className="bg-gradient-to-r from-orange-500 to-red-500 text-white text-[10px]">Shopee</Badge>
    }

    const ProductCard = ({ product }: { product: AffiliateProductItem }) => (
        <Card
            className="group cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:border-emerald-500/50"
            onClick={() => handleSelectProduct(product)}
        >
            <div className="aspect-video relative bg-gradient-to-br from-muted to-muted/50 overflow-hidden">
                {product.imageUrl ? (
                    <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <ShoppingBag className="w-12 h-12 text-muted-foreground/30" />
                    </div>
                )}
                {product.isFeatured && (
                    <div className="absolute top-2 left-2">
                        <Badge className="bg-amber-500 text-white text-[10px]">
                            <Star className="w-3 h-3 mr-1" />
                            Trending
                        </Badge>
                    </div>
                )}
                <div className="absolute top-2 right-2">
                    {platformBadge(product.platform)}
                </div>
                {product.commission && (
                    <div className="absolute bottom-2 right-2">
                        <Badge variant="secondary" className="text-[10px] bg-emerald-500/90 text-white">
                            Komisi {product.commission}
                        </Badge>
                    </div>
                )}
            </div>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm line-clamp-2 group-hover:text-emerald-500 transition-colors">{product.name}</CardTitle>
                <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatPrice(product.price)}</span>
                    {product.originalPrice && product.originalPrice > product.price && (
                        <span className="text-xs text-muted-foreground line-through">{formatPrice(product.originalPrice)}</span>
                    )}
                </div>
            </CardHeader>
            <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground line-clamp-2">{product.description}</p>
                <div className="flex items-center gap-1 mt-2">
                    <Badge variant="outline" className="text-[10px]">
                        <Tag className="w-3 h-3 mr-1" />
                        {product.category}
                    </Badge>
                </div>
            </CardContent>
        </Card>
    )

    return (
        <div className="container mx-auto py-6 px-4 space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">Affiliator Machine</h1>
                        <p className="text-sm text-muted-foreground">
                            Pilih produk trending, langsung generate video promo dengan AI
                        </p>
                    </div>
                </div>
            </div>

            {/* Generated Videos Section */}
            {generatedVideos.length > 0 && (
                <div className="space-y-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Play className="w-5 h-5 text-emerald-500" />
                        Video yang Dihasilkan
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {generatedVideos.map((video) => (
                            <Card key={video.id} className="overflow-hidden">
                                <div className="aspect-[9/16] max-h-[320px] relative overflow-hidden bg-black">
                                    <video
                                        src={getProxiedVideoUrl(video.videoUrl)}
                                        controls
                                        playsInline
                                        preload="metadata"
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                                <CardContent className="p-3 space-y-2">
                                    <p className="text-sm font-medium line-clamp-1">{video.productName}</p>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="flex-1"
                                            onClick={() => setPreviewVideo(getProxiedVideoUrl(video.videoUrl))}
                                        >
                                            <Play className="w-3 h-3 mr-1" /> Preview
                                        </Button>
                                        <Button
                                            variant="default"
                                            size="sm"
                                            className="flex-1"
                                            onClick={() => downloadVideo(video.videoUrl, `affiliator-${video.id}.mp4`)}
                                        >
                                            <Download className="w-3 h-3 mr-1" /> Download
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* Generating State */}
            {isGenerating && (
                <Card className="p-6">
                    <div className="flex items-center gap-3">
                        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                        <div>
                            <p className="font-medium">Generating video promo...</p>
                            <p className="text-sm text-muted-foreground">
                                {selectedProduct?.name} — estimasi 1-3 menit
                            </p>
                        </div>
                    </div>
                </Card>
            )}

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 lg:w-[360px]">
                    <TabsTrigger value="recommended" className="gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Rekomendasi
                    </TabsTrigger>
                    <TabsTrigger value="search" className="gap-2">
                        <SearchIcon className="w-4 h-4" />
                        Cari Produk
                    </TabsTrigger>
                </TabsList>

                {/* Recommended Tab */}
                <TabsContent value="recommended" className="mt-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : featuredProducts.length === 0 ? (
                        <Card className="p-12">
                            <div className="text-center">
                                <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                                <h3 className="text-lg font-medium mb-2">Belum ada produk rekomendasi</h3>
                                <p className="text-muted-foreground text-sm">
                                    Admin belum menambahkan produk trending. Coba search manual atau hubungi admin.
                                </p>
                            </div>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {featuredProducts.map((product) => (
                                <ProductCard key={product.id} product={product} />
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* Search Tab */}
                <TabsContent value="search" className="mt-6 space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Cari produk..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                                className="pl-10"
                            />
                        </div>
                        <Select value={searchCategory} onValueChange={setSearchCategory}>
                            <SelectTrigger className="w-full sm:w-[180px]">
                                <SelectValue placeholder="Kategori" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Semua Kategori</SelectItem>
                                {categories.map((cat) => (
                                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={searchPlatform} onValueChange={setSearchPlatform}>
                            <SelectTrigger className="w-full sm:w-[140px]">
                                <SelectValue placeholder="Platform" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Semua</SelectItem>
                                <SelectItem value="tiktok">TikTok</SelectItem>
                                <SelectItem value="shopee">Shopee</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button onClick={handleSearch} disabled={searching} className="bg-emerald-600 hover:bg-emerald-700">
                            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <SearchIcon className="w-4 h-4" />}
                            <span className="ml-2">Cari</span>
                        </Button>
                    </div>

                    {searching ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : searchResults.length > 0 ? (
                        <>
                            <p className="text-sm text-muted-foreground">{searchTotal} produk ditemukan</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {searchResults.map((product) => (
                                    <ProductCard key={product.id} product={product} />
                                ))}
                            </div>
                        </>
                    ) : searchQuery ? (
                        <Card className="p-12">
                            <div className="text-center">
                                <SearchIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                                <h3 className="text-lg font-medium mb-2">Tidak ada hasil</h3>
                                <p className="text-muted-foreground text-sm">
                                    Coba kata kunci atau filter yang berbeda
                                </p>
                            </div>
                        </Card>
                    ) : (
                        <Card className="p-12">
                            <div className="text-center">
                                <SearchIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                                <h3 className="text-lg font-medium mb-2">Cari produk affiliate</h3>
                                <p className="text-muted-foreground text-sm">
                                    Ketik nama produk atau pilih kategori untuk mulai mencari
                                </p>
                            </div>
                        </Card>
                    )}
                </TabsContent>
            </Tabs>

            {/* Product Detail Dialog */}
            <Dialog open={showProductDetail} onOpenChange={setShowProductDetail}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    {selectedProduct && (
                        <>
                            <DialogHeader>
                                <div className="flex items-center gap-2 mb-2">
                                    {platformBadge(selectedProduct.platform)}
                                    <Badge variant="outline" className="text-[10px]">{selectedProduct.category}</Badge>
                                    {selectedProduct.isFeatured && (
                                        <Badge className="bg-amber-500 text-white text-[10px]">
                                            <Star className="w-3 h-3 mr-1" /> Trending
                                        </Badge>
                                    )}
                                </div>
                                <DialogTitle className="text-xl">{selectedProduct.name}</DialogTitle>
                                <DialogDescription>{selectedProduct.description}</DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4 mt-4">
                                <div className="flex items-baseline gap-3">
                                    <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                        {formatPrice(selectedProduct.price)}
                                    </span>
                                    {selectedProduct.originalPrice && selectedProduct.originalPrice > selectedProduct.price && (
                                        <span className="text-base text-muted-foreground line-through">
                                            {formatPrice(selectedProduct.originalPrice)}
                                        </span>
                                    )}
                                    {selectedProduct.commission && (
                                        <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                                            Komisi {selectedProduct.commission}
                                        </Badge>
                                    )}
                                </div>

                                <div className="p-3 rounded-lg bg-muted/50">
                                    <p className="text-sm font-medium mb-1">Selling Points:</p>
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedProduct.sellingPoints}</p>
                                </div>

                                {selectedProduct.targetAudience && (
                                    <div className="p-3 rounded-lg bg-muted/50">
                                        <p className="text-sm font-medium mb-1">Target Audience:</p>
                                        <p className="text-sm text-muted-foreground">{selectedProduct.targetAudience}</p>
                                    </div>
                                )}

                                {selectedProduct.productUrl && (
                                    <a
                                        href={selectedProduct.productUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 text-sm text-emerald-600 hover:underline"
                                    >
                                        <ExternalLink className="w-4 h-4" /> Lihat produk di {selectedProduct.platform === "tiktok" ? "TikTok Shop" : "Shopee"}
                                    </a>
                                )}

                                <div className="border-t pt-4 space-y-3">
                                    <p className="text-sm font-medium">🎬 Video Prompt (bisa diedit):</p>
                                    <Textarea
                                        value={videoPrompt}
                                        onChange={(e) => setVideoPrompt(e.target.value)}
                                        rows={6}
                                        className="text-sm"
                                    />
                                    <Button
                                        onClick={handleGenerateVideo}
                                        disabled={isGenerating || !videoPrompt.trim()}
                                        className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                                        size="lg"
                                    >
                                        {isGenerating ? (
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        ) : (
                                            <Send className="w-4 h-4 mr-2" />
                                        )}
                                        Generate Video Promo
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Video Preview Modal */}
            {previewVideo && (
                <div
                    className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
                    onClick={() => setPreviewVideo(null)}
                >
                    <div className="relative max-w-[400px] max-h-[95vh]">
                        <button
                            onClick={() => setPreviewVideo(null)}
                            className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors z-10"
                        >
                            <X className="w-8 h-8" />
                        </button>
                        <video
                            src={previewVideo}
                            controls
                            autoPlay
                            playsInline
                            preload="auto"
                            className="h-[85vh] w-auto max-w-full rounded-lg shadow-2xl"
                            style={{ objectFit: "contain" }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}

            <div ref={messagesEndRef} />
        </div>
    )
}
