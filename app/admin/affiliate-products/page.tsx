"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import {
    Plus,
    Search,
    Loader2,
    Pencil,
    Trash2,
    Star,
    ShoppingBag,
    Sparkles,
    Bot,
    CheckCircle2,
    XCircle,
    Save,
} from "lucide-react"
import { formatPrice } from "@/lib/format-price"
import {
    adminGetAllProducts,
    adminCreateProduct,
    adminUpdateProduct,
    adminDeleteProduct,
    getProductCategories,
    getProductPlatforms,
    type AffiliateProductItem,
} from "@/app/actions/affiliate-products"
import {
    aiDiscoverProducts,
    saveDiscoveredProducts,
} from "@/app/actions/ai-product-discovery"
import { toast } from "sonner"

interface ProductForm {
    name: string
    description: string
    price: string
    originalPrice: string
    category: string
    platform: string
    productUrl: string
    imageUrl: string
    sellingPoints: string
    targetAudience: string
    commission: string
    isFeatured: boolean
}

const emptyForm: ProductForm = {
    name: "",
    description: "",
    price: "",
    originalPrice: "",
    category: "Beauty & Skincare",
    platform: "tiktok",
    productUrl: "",
    imageUrl: "",
    sellingPoints: "",
    targetAudience: "",
    commission: "",
    isFeatured: false,
}

export default function AdminAffiliateProductsPage() {
    const [products, setProducts] = useState<AffiliateProductItem[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [categories, setCategories] = useState<string[]>([])
    const [platforms, setPlatforms] = useState<string[]>([])

    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [form, setForm] = useState<ProductForm>(emptyForm)
    const [saving, setSaving] = useState(false)

    const [deleteId, setDeleteId] = useState<string | null>(null)
    const [deleting, setDeleting] = useState(false)

    // AI Discovery state
    const [showAiDiscovery, setShowAiDiscovery] = useState(false)
    const [aiCategory, setAiCategory] = useState("all")
    const [aiPlatform, setAiPlatform] = useState("all")
    const [aiFocus, setAiFocus] = useState("")
    const [aiCount, setAiCount] = useState("5")
    const [aiDiscovering, setAiDiscovering] = useState(false)
    const [discoveredProducts, setDiscoveredProducts] = useState<Array<{
        name: string
        description: string
        price: number
        originalPrice: number | null
        category: string
        platform: string
        productUrl: string | null
        imageUrl: string | null
        sellingPoints: string
        targetAudience: string
        commission: string
        isFeatured: boolean
        selected: boolean
    }>>([])
    const [aiSaving, setAiSaving] = useState(false)

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        setLoading(true)
        try {
            const [result, cats, plats] = await Promise.all([
                adminGetAllProducts({ search: searchQuery || undefined }),
                getProductCategories(),
                getProductPlatforms(),
            ])
            if (result.success && result.products) {
                setProducts(result.products)
                setTotal(result.total || 0)
            }
            setCategories(cats)
            setPlatforms(plats)
        } catch (error) {
            console.error("Failed to load:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleSearch = async () => {
        setLoading(true)
        try {
            const result = await adminGetAllProducts({ search: searchQuery || undefined })
            if (result.success && result.products) {
                setProducts(result.products)
                setTotal(result.total || 0)
            }
        } catch (error) {
            console.error("Search failed:", error)
        } finally {
            setLoading(false)
        }
    }

    const openCreateForm = () => {
        setEditingId(null)
        setForm(emptyForm)
        setShowForm(true)
    }

    const openEditForm = (product: AffiliateProductItem) => {
        setEditingId(product.id)
        setForm({
            name: product.name,
            description: product.description,
            price: product.price.toString(),
            originalPrice: product.originalPrice?.toString() || "",
            category: product.category,
            platform: product.platform,
            productUrl: product.productUrl || "",
            imageUrl: product.imageUrl || "",
            sellingPoints: product.sellingPoints,
            targetAudience: product.targetAudience || "",
            commission: product.commission || "",
            isFeatured: product.isFeatured,
        })
        setShowForm(true)
    }

    const handleSave = async () => {
        if (!form.name.trim() || !form.description.trim() || !form.sellingPoints.trim()) {
            toast.error("Nama, deskripsi, dan selling points wajib diisi")
            return
        }
        const price = parseInt(form.price)
        if (isNaN(price) || price < 0) {
            toast.error("Harga tidak valid")
            return
        }

        setSaving(true)
        try {
            const data = {
                name: form.name,
                description: form.description,
                price,
                originalPrice: form.originalPrice ? parseInt(form.originalPrice) : null,
                category: form.category,
                platform: form.platform,
                productUrl: form.productUrl || null,
                imageUrl: form.imageUrl || null,
                sellingPoints: form.sellingPoints,
                targetAudience: form.targetAudience || null,
                commission: form.commission || null,
                isFeatured: form.isFeatured,
            }

            if (editingId) {
                const result = await adminUpdateProduct(editingId, data)
                if (result.success) {
                    toast.success("Produk berhasil diupdate")
                } else {
                    toast.error(result.error || "Gagal update produk")
                    return
                }
            } else {
                const result = await adminCreateProduct(data)
                if (result.success) {
                    toast.success("Produk berhasil ditambahkan")
                } else {
                    toast.error(result.error || "Gagal menambahkan produk")
                    return
                }
            }

            setShowForm(false)
            loadData()
        } catch (error) {
            toast.error("Terjadi kesalahan")
        } finally {
            setSaving(false)
        }
    }

    const handleToggleFeatured = async (id: string, currentValue: boolean) => {
        const result = await adminUpdateProduct(id, { isFeatured: !currentValue })
        if (result.success) {
            setProducts(prev => prev.map(p => p.id === id ? { ...p, isFeatured: !currentValue } : p))
            toast.success(!currentValue ? "Produk ditandai sebagai trending" : "Produk dihapus dari trending")
        }
    }

    const handleToggleActive = async (id: string, currentValue: boolean) => {
        const result = await adminUpdateProduct(id, { isActive: !currentValue })
        if (result.success) {
            setProducts(prev => prev.map(p => p.id === id ? { ...p, isActive: !currentValue } : p))
            toast.success(!currentValue ? "Produk diaktifkan" : "Produk dinonaktifkan")
        }
    }

    const handleDelete = async () => {
        if (!deleteId) return
        setDeleting(true)
        try {
            const result = await adminDeleteProduct(deleteId)
            if (result.success) {
                toast.success("Produk dihapus")
                setDeleteId(null)
                loadData()
            } else {
                toast.error(result.error || "Gagal menghapus")
            }
        } catch {
            toast.error("Terjadi kesalahan")
        } finally {
            setDeleting(false)
        }
    }

    const updateForm = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
        setForm(prev => ({ ...prev, [key]: value }))
    }

    const handleAiDiscover = async () => {
        setAiDiscovering(true)
        setDiscoveredProducts([])
        try {
            const result = await aiDiscoverProducts({
                category: aiCategory !== "all" ? aiCategory : undefined,
                platform: aiPlatform !== "all" ? aiPlatform : undefined,
                count: parseInt(aiCount) || 5,
                focus: aiFocus || undefined,
            })
            if (result.success && result.products) {
                setDiscoveredProducts(
                    result.products.map(p => ({ ...p, selected: true }))
                )
                toast.success(`${result.products.length} produk ditemukan oleh AI!`)
            } else {
                toast.error(result.error || "AI discovery gagal")
            }
        } catch (error) {
            toast.error("Terjadi kesalahan saat AI discovery")
            console.error(error)
        } finally {
            setAiDiscovering(false)
        }
    }

    const handleSaveDiscovered = async () => {
        const selected = discoveredProducts.filter(p => p.selected)
        if (selected.length === 0) {
            toast.error("Pilih minimal 1 produk untuk disimpan")
            return
        }
        setAiSaving(true)
        try {
            const result = await saveDiscoveredProducts(
                selected.map(({ selected: _, ...p }) => p)
            )
            if (result.success) {
                toast.success(`${result.savedCount} produk berhasil disimpan!`)
                setShowAiDiscovery(false)
                setDiscoveredProducts([])
                loadData()
            } else {
                toast.error(result.error || "Gagal menyimpan")
            }
        } catch {
            toast.error("Terjadi kesalahan")
        } finally {
            setAiSaving(false)
        }
    }

    const toggleDiscoveredProduct = (index: number) => {
        setDiscoveredProducts(prev =>
            prev.map((p, i) => i === index ? { ...p, selected: !p.selected } : p)
        )
    }

    return (
        <div className="container mx-auto py-6 px-4 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Affiliate Products</h1>
                    <p className="text-sm text-muted-foreground">
                        Kelola produk affiliate untuk Affiliator Machine ({total} produk)
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        onClick={() => setShowAiDiscovery(true)}
                        variant="outline"
                        className="border-violet-500/50 text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                    >
                        <Bot className="w-4 h-4 mr-2" />
                        AI Discover
                    </Button>
                    <Button onClick={openCreateForm} className="bg-emerald-600 hover:bg-emerald-700">
                        <Plus className="w-4 h-4 mr-2" />
                        Tambah Manual
                    </Button>
                </div>
            </div>

            {/* Search */}
            <div className="flex gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Cari produk..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        className="pl-10"
                    />
                </div>
                <Button variant="outline" onClick={handleSearch}>
                    <Search className="w-4 h-4" />
                </Button>
            </div>

            {/* Products Table */}
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                    ) : products.length === 0 ? (
                        <div className="text-center py-12">
                            <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                            <p className="text-muted-foreground">Belum ada produk</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Produk</TableHead>
                                    <TableHead>Harga</TableHead>
                                    <TableHead>Kategori</TableHead>
                                    <TableHead>Platform</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead>Featured</TableHead>
                                    <TableHead>Aktif</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {products.map((product) => (
                                    <TableRow key={product.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded bg-muted flex-shrink-0 overflow-hidden">
                                                    {product.imageUrl ? (
                                                        <img src={product.imageUrl} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <ShoppingBag className="w-4 h-4 text-muted-foreground/50" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-sm line-clamp-1">{product.name}</p>
                                                    <p className="text-xs text-muted-foreground line-clamp-1">{product.description}</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <p className="text-sm font-medium">{formatPrice(product.price)}</p>
                                                {product.originalPrice && product.originalPrice > product.price && (
                                                    <p className="text-xs text-muted-foreground line-through">{formatPrice(product.originalPrice)}</p>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="text-xs">{product.category}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={product.platform === "tiktok" ? "bg-pink-500" : "bg-orange-500"}>
                                                {product.platform}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className="text-xs">{product.source}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <button
                                                onClick={() => handleToggleFeatured(product.id, product.isFeatured)}
                                                className={`transition-colors ${product.isFeatured ? 'text-amber-500' : 'text-muted-foreground/30 hover:text-amber-400'}`}
                                            >
                                                <Star className={`w-5 h-5 ${product.isFeatured ? 'fill-current' : ''}`} />
                                            </button>
                                        </TableCell>
                                        <TableCell>
                                            <Switch
                                                checked={product.isActive}
                                                onCheckedChange={() => handleToggleActive(product.id, product.isActive)}
                                            />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex gap-1 justify-end">
                                                <Button variant="ghost" size="sm" onClick={() => openEditForm(product)}>
                                                    <Pencil className="w-4 h-4" />
                                                </Button>
                                                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(product.id)}>
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Create/Edit Dialog */}
            <Dialog open={showForm} onOpenChange={setShowForm}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingId ? "Edit Produk" : "Tambah Produk Baru"}</DialogTitle>
                        <DialogDescription>
                            {editingId ? "Update detail produk affiliate" : "Tambahkan produk baru ke katalog affiliate"}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="text-sm font-medium mb-1 block">Nama Produk *</label>
                                <Input value={form.name} onChange={e => updateForm("name", e.target.value)} placeholder="Serum Vitamin C..." />
                            </div>
                            <div className="col-span-2">
                                <label className="text-sm font-medium mb-1 block">Deskripsi *</label>
                                <Textarea value={form.description} onChange={e => updateForm("description", e.target.value)} placeholder="Deskripsi singkat produk..." rows={3} />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">Harga (Rp) *</label>
                                <Input type="number" value={form.price} onChange={e => updateForm("price", e.target.value)} placeholder="99000" />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">Harga Asli (Rp)</label>
                                <Input type="number" value={form.originalPrice} onChange={e => updateForm("originalPrice", e.target.value)} placeholder="150000" />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">Kategori *</label>
                                <Select value={form.category} onValueChange={v => updateForm("category", v)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {categories.map(cat => (
                                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">Platform *</label>
                                <Select value={form.platform} onValueChange={v => updateForm("platform", v)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {platforms.map(p => (
                                            <SelectItem key={p} value={p}>{p === "tiktok" ? "TikTok Shop" : "Shopee"}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">URL Produk</label>
                                <Input value={form.productUrl} onChange={e => updateForm("productUrl", e.target.value)} placeholder="https://..." />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">URL Gambar</label>
                                <Input value={form.imageUrl} onChange={e => updateForm("imageUrl", e.target.value)} placeholder="https://..." />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">Komisi</label>
                                <Input value={form.commission} onChange={e => updateForm("commission", e.target.value)} placeholder="10%" />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">Target Audience</label>
                                <Input value={form.targetAudience} onChange={e => updateForm("targetAudience", e.target.value)} placeholder="Wanita 20-35 tahun" />
                            </div>
                            <div className="col-span-2">
                                <label className="text-sm font-medium mb-1 block">Selling Points *</label>
                                <Textarea
                                    value={form.sellingPoints}
                                    onChange={e => updateForm("sellingPoints", e.target.value)}
                                    placeholder="Keunggulan utama produk, pisahkan dengan baris baru..."
                                    rows={4}
                                />
                            </div>
                            <div className="col-span-2 flex items-center gap-3">
                                <Switch checked={form.isFeatured} onCheckedChange={v => updateForm("isFeatured", v)} />
                                <label className="text-sm font-medium">Tandai sebagai Featured/Trending</label>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
                        <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            {editingId ? "Update" : "Simpan"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Hapus Produk</DialogTitle>
                        <DialogDescription>
                            Yakin ingin menghapus produk ini? Tindakan ini tidak bisa dibatalkan.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteId(null)}>Batal</Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                            {deleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            Hapus
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* AI Discovery Dialog */}
            <Dialog open={showAiDiscovery} onOpenChange={setShowAiDiscovery}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                                <Bot className="w-4 h-4 text-white" />
                            </div>
                            AI Product Discovery
                        </DialogTitle>
                        <DialogDescription>
                            Gemini AI akan mencari dan merekomendasikan produk affiliate trending berdasarkan tren pasar Indonesia terkini.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Discovery Controls */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                            <label className="text-xs font-medium mb-1 block text-muted-foreground">Kategori</label>
                            <Select value={aiCategory} onValueChange={setAiCategory}>
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Semua</SelectItem>
                                    {categories.map(cat => (
                                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1 block text-muted-foreground">Platform</label>
                            <Select value={aiPlatform} onValueChange={setAiPlatform}>
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Semua</SelectItem>
                                    <SelectItem value="tiktok">TikTok Shop</SelectItem>
                                    <SelectItem value="shopee">Shopee</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1 block text-muted-foreground">Jumlah</label>
                            <Select value={aiCount} onValueChange={setAiCount}>
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="3">3 produk</SelectItem>
                                    <SelectItem value="5">5 produk</SelectItem>
                                    <SelectItem value="8">8 produk</SelectItem>
                                    <SelectItem value="10">10 produk</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1 block text-muted-foreground">Fokus (opsional)</label>
                            <Input
                                placeholder="misal: viral minggu ini"
                                value={aiFocus}
                                onChange={e => setAiFocus(e.target.value)}
                                className="h-9"
                            />
                        </div>
                    </div>

                    <Button
                        onClick={handleAiDiscover}
                        disabled={aiDiscovering}
                        className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
                    >
                        {aiDiscovering ? (
                            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> AI sedang mencari produk trending...</>
                        ) : (
                            <><Sparkles className="w-4 h-4 mr-2" /> Discover Produk Trending</>
                        )}
                    </Button>

                    {/* Discovered Products */}
                    {discoveredProducts.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">
                                    {discoveredProducts.filter(p => p.selected).length} dari {discoveredProducts.length} produk dipilih
                                </p>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setDiscoveredProducts(prev => prev.map(p => ({ ...p, selected: true })))}
                                    >
                                        Pilih Semua
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setDiscoveredProducts(prev => prev.map(p => ({ ...p, selected: false })))}
                                    >
                                        Batal Semua
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                                {discoveredProducts.map((product, index) => (
                                    <Card
                                        key={index}
                                        className={`cursor-pointer transition-all ${
                                            product.selected
                                                ? "border-violet-500/50 bg-violet-50/50 dark:bg-violet-950/20"
                                                : "opacity-50"
                                        }`}
                                        onClick={() => toggleDiscoveredProduct(index)}
                                    >
                                        <CardContent className="p-3">
                                            <div className="flex items-start gap-3">
                                                <div className="mt-0.5">
                                                    {product.selected ? (
                                                        <CheckCircle2 className="w-5 h-5 text-violet-500" />
                                                    ) : (
                                                        <XCircle className="w-5 h-5 text-muted-foreground/30" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className="font-medium text-sm line-clamp-1">{product.name}</p>
                                                        <Badge className={product.platform === "tiktok" ? "bg-pink-500 text-white text-[10px]" : "bg-orange-500 text-white text-[10px]"}>
                                                            {product.platform === "tiktok" ? "TikTok" : "Shopee"}
                                                        </Badge>
                                                        <Badge variant="outline" className="text-[10px]">{product.category}</Badge>
                                                        {product.isFeatured && (
                                                            <Badge className="bg-amber-500 text-white text-[10px]">
                                                                <Star className="w-3 h-3 mr-0.5" /> Trending
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground line-clamp-2 mb-1">{product.description}</p>
                                                    <div className="flex items-center gap-3 text-xs">
                                                        <span className="font-semibold text-emerald-600">{formatPrice(product.price)}</span>
                                                        {product.originalPrice && (
                                                            <span className="text-muted-foreground line-through">{formatPrice(product.originalPrice)}</span>
                                                        )}
                                                        {product.commission && (
                                                            <span className="text-violet-600">Komisi: {product.commission}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>

                            <DialogFooter>
                                <Button variant="outline" onClick={() => setShowAiDiscovery(false)}>Batal</Button>
                                <Button
                                    onClick={handleSaveDiscovered}
                                    disabled={aiSaving || discoveredProducts.filter(p => p.selected).length === 0}
                                    className="bg-emerald-600 hover:bg-emerald-700"
                                >
                                    {aiSaving ? (
                                        <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Menyimpan...</>
                                    ) : (
                                        <><Save className="w-4 h-4 mr-2" /> Simpan {discoveredProducts.filter(p => p.selected).length} Produk</>
                                    )}
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
