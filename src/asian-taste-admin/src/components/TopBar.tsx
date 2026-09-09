import { Menu, Bell, LogOut } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuthStore } from "@/stores/authStore"

interface TopBarProps {
  onMenuClick: () => void
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  const userInitials = user?.username
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  const handleLogout = () => {
    logout()
    navigate("/login")
  }

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
      {/* Left side */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </Button>

        <h1 className="text-lg font-semibold hidden sm:block">
          Admin Dashboard
        </h1>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full" />
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-white text-xs">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:inline text-sm font-medium">
                {user?.username}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.username}</p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile Settings</DropdownMenuItem>
            <DropdownMenuItem>Restaurant Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-error focus:text-error"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Log Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
