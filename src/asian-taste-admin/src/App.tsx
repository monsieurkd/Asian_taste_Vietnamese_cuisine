import { useEffect } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { useAuthStore } from "@/stores/authStore"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { LoginPage } from "@/pages/LoginPage"
import { AdminLayout } from "@/layouts/AdminLayout"
import { DashboardPage } from "@/pages/DashboardPage"
import { OrdersPage } from "@/pages/OrdersPage"
import { OrderDetailPage } from "@/pages/OrderDetailPage"
import { MenuManagementPage } from "@/pages/MenuManagementPage"
import { ReportsPage } from "@/pages/ReportsPage"
import { SettingsPage } from "@/pages/SettingsPage"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function App() {
  const checkAuth = useAuthStore((state) => state.checkAuth)

  // Check auth on mount
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
            <Route path="menu" element={<MenuManagementPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Catch all - redirect to dashboard */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>

      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}

export default App
