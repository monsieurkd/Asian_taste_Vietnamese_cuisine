import axios from "axios"

/**
 * Base API client for Asian Taste Admin Dashboard.
 * Includes interceptors for JWT authentication.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api"

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
