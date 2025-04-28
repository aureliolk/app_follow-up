import type { MetadataRoute } from 'next'
import { prisma } from '../lib/db'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'
  const routes: MetadataRoute.Sitemap = []

  // Static routes
  routes.push(
    { url: `${baseUrl}/`, lastModified: new Date() },
    { url: `${baseUrl}/auth/login`, lastModified: new Date() },
    { url: `${baseUrl}/workspaces`, lastModified: new Date() }
  )

  // Dynamic workspace routes
  const workspaces = await prisma.workspace.findMany({ select: { id: true, updatedAt: true } })
  for (const ws of workspaces) {
    const updated = ws.updatedAt ?? new Date()
    const prefix = `${baseUrl}/workspace/${ws.id}`
    routes.push(
      { url: prefix, lastModified: updated },
      { url: `${prefix}/clients`, lastModified: updated },
      { url: `${prefix}/conversations`, lastModified: updated },
      { url: `${prefix}/ia`, lastModified: updated },
      { url: `${prefix}/integrations`, lastModified: updated },
      { url: `${prefix}/integrations/whatsapp`, lastModified: updated },
      { url: `${prefix}/mass-trigger`, lastModified: updated },
      { url: `${prefix}/members`, lastModified: updated },
      { url: `${prefix}/settings`, lastModified: updated }
    )
  }

  return routes
}