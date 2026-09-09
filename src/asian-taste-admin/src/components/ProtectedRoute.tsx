import { Navigate } from "react-router-dom"
import { useAuthStore } from "@/stores/authStore"

/**
 * Protected route component that redirects to login if not authenticated.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, checkAuth } = useAuthStore()

  // Check auth on mount
  if (!isAuthenticated) {
    checkAuth()
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
