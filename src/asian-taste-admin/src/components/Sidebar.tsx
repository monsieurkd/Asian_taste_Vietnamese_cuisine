import { NavLink, useLocation } from "react-router-dom"
import {
  LayoutDashboard,
  ShoppingBag,
  Settings,
  Utensils,
  BarChart3,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface NavItem {
  title: string
  href: string
  icon: React.ElementType
}

const navItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Orders", href: "/orders", icon: ShoppingBag },
  { title: "Menu", href: "/menu", icon: Utensils },
  { title: "Reports", href: "/reports", icon: BarChart3 },
  { title: "Settings", href: "/settings", icon: Settings },
]

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation()

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-64 bg-sidebar text-white transition-transform duration-300 ease-in-out lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">AT</span>
            </div>
            <span className="font-semibold text-lg">Asian Taste</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg hover:bg-sidebar-hover"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.href

            return (
              <NavLink
                key={item.href}
                to={item.href}
                onClick={() => {
                  // Close sidebar on mobile after navigation
                  if (window.innerWidth < 1024) {
                    onClose()
                  }
                }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                  isActive
                    ? "bg-primary text-white"
                    : "text-gray-400 hover:bg-sidebar-hover hover:text-white"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.title}</span>
              </NavLink>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
          <p className="text-xs text-gray-500">© 2025 Asian Taste</p>
          <p className="text-xs text-gray-600">Admin Dashboard v1.0</p>
        </div>
      </aside>
    </>
  )
}
