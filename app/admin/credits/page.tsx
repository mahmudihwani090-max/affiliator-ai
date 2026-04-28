"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import {
    getCreditHistoryAdmin,
} from "@/app/actions/admin"
import { formatPrice } from "@/lib/format-price"

function formatDate(date: Date) {
    return new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(date))
}

function getTypeColor(type: string) {
    switch (type) {
        case "success":
            return "bg-green-500/10 text-green-500 border-green-500/20"
        case "pending":
            return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
        case "failed":
            return "bg-red-500/10 text-red-500 border-red-500/20"
        default:
            return "bg-gray-500/10 text-gray-500 border-gray-500/20"
    }
}

interface CreditHistoryItem {
    id: string
    amount: number
    type: string
    description: string
    balanceAfter: number
    createdAt: Date
    user: {
        id: string
        name: string | null
        email: string
    }
}

export default function AdminCreditsPage() {
    const [history, setHistory] = useState<CreditHistoryItem[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(true)
    const limit = 20

    async function fetchHistory() {
        setLoading(true)
        const result = await getCreditHistoryAdmin(page, limit)
        if (result.success && result.history) {
            setHistory(result.history)
            setTotal(result.total || 0)
        } else {
            toast.error(result.error || "Failed to fetch subscription history")
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchHistory()
    }, [page])

    const totalPages = Math.ceil(total / limit)

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Subscription Log</h1>
                    <p className="text-muted-foreground">
                        Pantau histori pembelian subscription dari semua user
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Subscription Purchase History</CardTitle>
                            <CardDescription>
                                Total {total} transaksi subscription
                            </CardDescription>
                        </div>
                        <Button variant="outline" size="icon" onClick={fetchHistory}>
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-8 text-muted-foreground">
                            Loading...
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No subscription history found
                        </div>
                    ) : (
                        <>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Plan</TableHead>
                                        <TableHead>Date</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {history.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <div>
                                                    <p className="font-medium text-sm">
                                                        {item.user.name || "-"}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {item.user.email}
                                                    </p>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className={getTypeColor(item.type)}
                                                >
                                                    {item.type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {formatPrice(item.amount)}
                                            </TableCell>
                                            <TableCell>
                                                {item.description}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {formatDate(item.createdAt)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between mt-4">
                                    <p className="text-sm text-muted-foreground">
                                        Showing {(page - 1) * limit + 1} - {Math.min(page * limit, total)} of {total}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={() => setPage(page - 1)}
                                            disabled={page === 1}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <span className="text-sm">
                                            Page {page} of {totalPages}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={() => setPage(page + 1)}
                                            disabled={page === totalPages}
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
