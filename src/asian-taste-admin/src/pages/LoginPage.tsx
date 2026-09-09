import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "@/stores/authStore"
import { LogIn } from "lucide-react"

/**
 * Login page for admin authentication.
 */
export function LoginPage() {
  const navigate = useNavigate()
  const { login, isLoading, error, clearError } = useAuthStore()

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()

    try {
      await login({ username, password })
      // Redirect to dashboard on success
      navigate("/dashboard")
    } catch {
      // Error is handled by the store
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Asian Taste</h1>
          <p className="text-gray-500">Restaurant Management Dashboard</p>
        </div>

        {/* Login Card */}
        <div className="bg-card rounded-xl shadow-sm border border-border p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/10 rounded-lg">
              <LogIn className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Admin Login</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium mb-1.5">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Enter your username"
                autoComplete="username"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-error/10 text-error text-sm rounded-lg">
                {error}
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Default credentials hint (development only) */}
          {import.meta.env.DEV && (
            <div className="mt-6 p-3 bg-gray-100 rounded-lg text-sm text-gray-600">
              <p className="font-medium mb-1">Demo Credentials:</p>
              <p>Username: <code>admin</code></p>
              <p>Password: <code>Admin123!</code></p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 mt-6">
          © 2025 Asian Taste Vietnamese Cuisine
        </p>
      </div>
    </div>
  )
}
