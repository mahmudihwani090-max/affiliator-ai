import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { ModeToggle } from "@/components/mode-toggle"
import { GenerationQueueHeaderNotice } from "@/components/generation-queue-header-notice"
import { Toaster } from "sonner"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getGenerationQueueSummaryByUserId } from "@/lib/useapi/google-flow-generation-queue"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  // Fetch user role from database
  let userRole: string | null = null
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    })
    userRole = user?.role || null
  }

  const userWithRole = session?.user ? {
    ...session.user,
    role: userRole,
  } : null

  const initialQueueSummary = session?.user?.id
    ? await getGenerationQueueSummaryByUserId(session.user.id)
    : {
        totalPending: 0,
        activeCount: 0,
        queuedCount: 0,
        limit: 10,
        items: [],
      }

  return (
    <SidebarProvider>
      <AppSidebar user={userWithRole} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">
                    Dashboard
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Overview</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex items-center gap-2">
            <GenerationQueueHeaderNotice initialSummary={initialQueueSummary} />
            <ModeToggle />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {children}
        </div>
      </SidebarInset>
      <Toaster position="top-right" richColors />
    </SidebarProvider>
  )
}

