import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminManageableSubscriptionPlans } from "@/app/actions/admin"

import { AdminPackagesClient } from "./packages-client"

export default async function AdminPackagesPage() {
    const result = await getAdminManageableSubscriptionPlans()

    if (!result.success || !result.plans) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Package Configuration</CardTitle>
                    <CardDescription>
                        Gagal memuat subscription plan dari database
                    </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-destructive">
                    {result.error || "Unknown error"}
                </CardContent>
            </Card>
        )
    }

    return <AdminPackagesClient initialPlans={result.plans} />
}
