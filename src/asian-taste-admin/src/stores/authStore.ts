import { create } from "zustand"
import { persist } from "zustand/middleware"
import { type AdminUser, type LoginRequest } from "@/types"
import { authApi } from "@/api/auth"

/**
 * Authentication store using Zustand.
 * Manages user authentication state and JWT token.
 */

interface AuthState {
  user: AdminUser | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Actions
  login: (credentials: LoginRequest) => Promise<void>
  logout: () => void
  clearError: () => void
  checkAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (credentials: LoginRequest) => {
        set({ isLoading: true, error: null })
        try {
          const response = await authApi.login(credentials)
          set({
            user: response.user,
            token: response.token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          })
          // Also persist to localStorage for axios interceptor
          localStorage.setItem("admin_token", response.token)
          localStorage.setItem("admin_user", JSON.stringify(response.user))
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "Login failed"
          set({ error: message, isLoading: false })
          throw error
        }
      },

      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
        })
        localStorage.removeItem("admin_token")
        localStorage.removeItem("admin_user")
      },

      clearError: () => set({ error: null }),

      checkAuth: () => {
        const token = localStorage.getItem("admin_token")
        const userStr = localStorage.getItem("admin_user")
        if (token && userStr) {
          try {
            const user = JSON.parse(userStr) as AdminUser
            set({
              user,
              token,
              isAuthenticated: true,
            })
          } catch {
            // Invalid stored data, clear it
            localStorage.removeItem("admin_token")
            localStorage.removeItem("admin_user")
          }
        }
      },
    }),
    {
      name: "admin-auth",
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
