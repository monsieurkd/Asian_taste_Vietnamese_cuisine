import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ordersApi } from "../api/orders"
import { OrderFilters } from "../components/orders/OrderFilters"
import { OrdersTable } from "../components/orders/OrdersTable"
import { Skeleton } from "../components/ui/skeleton"
import { Card, CardContent } from "../components/ui/card"

/**
 * Orders list page with filtering and search.
 */
export function OrdersPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  // Fetch orders
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", statusFilter],
    queryFn: () =>
      ordersApi.getOrders({
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 100,
      }),
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  // Filter by search query
  const filteredOrders = orders.filter((order) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      order.orderNumber.toLowerCase().includes(query) ||
      order.customerName.toLowerCase().includes(query)
    )
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Orders</h1>
        <p className="text-gray-500">
          Manage and track all restaurant orders
        </p>
      </div>

      {/* Filters */}
      <OrderFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
      />

      {/* Orders Table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <OrdersTable orders={filteredOrders} />
      )}

      {/* Result count */}
      {!isLoading && (
        <p className="text-sm text-gray-500 text-center">
          Showing {filteredOrders.length} order{filteredOrders.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  )
}
