import { useState } from "react"
import { Outlet } from "react-router-dom"
import { Sidebar } from "@/components/Sidebar"
import { TopBar } from "@/components/TopBar"
import { Toaster } from "@/components/ui/toaster"

/**
 * Main layout for admin dashboard pages.
 * Includes sidebar, top bar, and content area.
 */
export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:pl-64">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />

        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      <Toaster />
    </div>
  )
}
