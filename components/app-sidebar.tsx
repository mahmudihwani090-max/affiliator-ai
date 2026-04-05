"use client"

import * as React from "react"
import Image from "next/image"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { CreditDisplay } from "@/components/credit-display"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"

import {
  LayoutDashboard,
  ImageIcon,
  Video,
  Coins,
  Shield,
  FolderOpen,
} from "lucide-react"

// Navigation items
const baseNavItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Projects",
    url: "/dashboard/projects",
    icon: FolderOpen,
  },
  {
    title: "Image Tools",
    url: "#",
    icon: ImageIcon,
    items: [
      {
        title: "Image Generator",
        url: "/dashboard/image-generator",
      },
      {
        title: "Model Studio",
        url: "/dashboard/model-studio",
      },
      {
        title: "Product Studio",
        url: "/dashboard/product-studio",
      },
      {
        title: "Thumbnail Generator",
        url: "/dashboard/thumbnail-generator",
      },
    ],
  },
  {
    title: "Video Tools",
    url: "#",
    icon: Video,
    items: [
      {
        title: "Video Generator",
        url: "/dashboard/video-generator",
      },
      {
        title: "Frame-to-Frame",
        url: "/dashboard/frame-to-frame",
      },
      {
        title: "Auto Scene",
        url: "/dashboard/auto-scene",
      },
      {
        title: "UGC Affiliate",
        url: "/dashboard/ugc-affiliate",
      },
      {
        title: "Motion Control",
        url: "/dashboard/motion-control",
      }
    ],
  },
  {
    title: "Subscription",
    url: "/dashboard/credits",
    icon: Coins,
  },
  // {
  //   title: "API Docs",
  //   url: "/dashboard/api-docs",
  //   icon: BookKeyIcon,
  // },
]

const adminNavItem = {
  title: "Admin",
  url: "/admin",
  icon: Shield,
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: {
    name?: string | null
    email?: string | null
    image?: string | null
    role?: string | null
  } | null
}

export function AppSidebar({ user, ...props }: AppSidebarProps) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Add admin nav item if user is admin
  const navItems = React.useMemo(() => {
    if (user?.role === "admin") {
      return [...baseNavItems, adminNavItem]
    }
    return baseNavItems
  }, [user?.role])

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 py-2">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
            <Image src="/affiliator.png" alt="Logo" width={32} height={32} className="size-8 object-contain" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-semibold">Alpha Studio</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {mounted ? (
          <NavMain items={navItems} />
        ) : (
          <div className="space-y-2 px-2 py-1">
            {navItems.map((item) => (
              <div
                key={item.title}
                className="h-8 rounded-md bg-sidebar-accent/60"
              />
            ))}
          </div>
        )}
      </SidebarContent>
      <SidebarFooter>
        {mounted ? (
          <>
            <CreditDisplay compact className="mb-2" />
            <NavUser user={user || { name: "User", email: "user@example.com", image: null }} />
          </>
        ) : (
          <div className="space-y-2">
            <div className="h-12 rounded-lg bg-sidebar-accent/60" />
            <div className="h-12 rounded-lg bg-sidebar-accent/60" />
          </div>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
