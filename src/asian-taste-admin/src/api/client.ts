import axios from "axios"

/**
 * Base API client for Asian Taste Admin Dashboard.
 * Includes interceptors for JWT authentication.
 */

// API base URL.
//
// Defaults to the relative "/api" path, which goes through the Vite dev proxy
// (see vite.config.ts). When deploying, set VITE_API_URL to the full API origin
// INCLUDING the /api segment, e.g. https://asian-taste-api.fly.dev/api.
//
// Guard: a value of just an origin silently drops the /api prefix, so every
// request 404s while the app still renders — the failure looks like "no orders"
// rather than a bad config. This exact bug cost real time on the customer app, so
// the value is normalised here rather than trusted. Exported for tests.
export function resolveApiBaseUrl(raw?: string): string {
  if (!raw) return "/api"

  const trimmed = raw.replace(/\/+$/, "")
  if (trimmed.endsWith("/api")) return trimmed

  // Looks like a bare origin (or a path that forgot /api) — append it.
  if (/^https?:\/\/[^/]+$/.test(trimmed)) {
    console.warn(
      `VITE_API_URL is "${raw}" but is missing the "/api" segment; using "${trimmed}/api". ` +
        `Requests would otherwise 404.`,
    )
    return `${trimmed}/api`
  }

  return trimmed
}

const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL)

// Create axios instance
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
})

// Request interceptor - Add JWT token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("admin_token")
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor - Handle 401 unauthorized
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem("admin_token")
      localStorage.removeItem("admin_user")
      window.location.href = "/login"
    }
    return Promise.reject(error)
  }
)

export default apiClient
