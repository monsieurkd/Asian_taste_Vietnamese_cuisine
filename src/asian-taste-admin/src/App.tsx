import { useEffect } from "react"
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useAuthStore } from "@/stores/authStore"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { AdminLayout } from "@/components/AdminLayout"
import { LoginPage } from "@/pages/LoginPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { OrdersPage } from "@/pages/OrdersPage"
import { OrderDetailPage } from "@/pages/OrderDetailPage"
import { MenuManagementPage } from "@/pages/MenuManagementPage"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

/** The console chrome, wrapped around whichever page the route resolved. */
function ConsoleShell() {
  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  )
}

function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth)

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* The routing shape is unchanged from the pre-port app. */}
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            element={
              <ProtectedRoute>
                <ConsoleShell />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/menu" element={<MenuManagementPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
