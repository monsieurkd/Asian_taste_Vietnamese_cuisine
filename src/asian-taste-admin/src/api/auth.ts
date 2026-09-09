import { type AuthResponse, type LoginRequest } from "@/types"
import apiClient from "./client"

/**
 * Authentication API calls.
 */

export const authApi = {
  /**
   * Login with username and password.
   */
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>("/auth/login", credentials)
    return response.data
  },

  /**
   * Validate JWT token.
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      const response = await apiClient.post("/auth/validate", { token })
      return response.status === 200
    } catch {
      return false
    }
  },
}
