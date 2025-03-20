"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Home, Users, MessageSquare, FileText } from "lucide-react"

export function MainNavigation() {
  const pathname = usePathname()

  const routes = [
    {
      href: "/follow-up",
      label: "Dashboard",
      icon: Home,
      active: pathname === "/follow-up",
    },
    {
      href: "/follow-up/campaigns",
      label: "Campanhas",
      icon: MessageSquare,
      active: pathname.includes("/follow-up/campaigns"),
    },
    {
      href: "/follow-up/kanban",
      label: "Kanban",
      icon: Users,
      active: pathname.includes("/follow-up/kanban"),
    },
    {
      href: "/follow-up/files",
      label: "Arquivos",
      icon: FileText,
      active: pathname.includes("/follow-up/files"),
    },
  ]

  return (
    <nav className="flex items-center space-x-4 lg:space-x-6">
      {routes.map((route) => (
        <Button key={route.href} asChild variant={route.active ? "default" : "ghost"} size="sm">
          <Link
            href={route.href}
            className={cn(
              "flex items-center text-sm font-medium transition-colors",
              route.active ? "text-primary-foreground" : "text-muted-foreground hover:text-primary",
            )}
          >
            <route.icon className="mr-2 h-4 w-4" />
            {route.label}
          </Link>
        </Button>
      ))}
    </nav>
  )
}

