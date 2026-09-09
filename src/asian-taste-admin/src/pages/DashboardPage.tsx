import { useQuery } from "@tanstack/react-query"
import { DollarSign, ShoppingBag, CheckCircle, TrendingUp, Wifi, WifiOff } from "lucide-react"
import { ordersApi } from "@/api/orders"
import { formatCurrency } from "@/lib/utils"
import { StatCard } from "@/components/dashboard/StatCard"
import { RecentOrdersTable } from "@/components/dashboard/RecentOrdersTable"
import { RevenueChart } from "@/components/dashboard/RevenueChart"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useOrderWebSocket } from "@/hooks/useOrderWebSocket"

/**
 * Dashboard page showing overview of restaurant operations.
 */
export function DashboardPage() {
  const { connectionState, isConnected } = useOrderWebSocket()

  const { data: summary, isLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => ordersApi.getDashboardSummary(),
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  const { data: dailyStats } = useQuery({
    queryKey: ["daily-stats"],
    queryFn: () => ordersApi.getDailyStats(),
    refetchInterval: 60000, // Refresh every minute
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const hourlyData = Object.entries(dailyStats?.hourlyDistribution || {}).map(
    ([hour, count]) => ({
      hour: Number(hour),
      orders: count as number,
    })
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-gray-500">
            Welcome back! Here's what's happening today.
          </p>
        </div>
        {/* Connection indicator */}
        <Badge
          variant={isConnected ? "success" : "warning"}
          className="flex items-center gap-1.5"
        >
          {isConnected ? (
            <>
              <Wifi className="w-3 h-3" />
              Live
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3" />
              Offline
            </>
          )}
        </Badge>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today's Revenue"
          value={formatCurrency(summary?.todayRevenue || 0)}
          icon={DollarSign}
          trend={
            summary?.revenueChangePercent !== undefined && summary?.revenueChangePercent !== null
              ? {
                  value: summary.revenueChangePercent,
                  isPositive: summary.revenueChangePercent >= 0,
                }
              : undefined
          }
        />
        <StatCard
          title="Active Orders"
          value={summary?.activeOrders || 0}
          icon={ShoppingBag}
          iconClassName="bg-warning/10 text-warning"
        />
        <StatCard
          title="Completed Orders"
          value={summary?.completedOrdersToday || 0}
          icon={CheckCircle}
          iconClassName="bg-success/10 text-success"
        />
        <StatCard
          title="Avg. Order Value"
          value={formatCurrency(summary?.averageOrderValue || 0)}
          icon={TrendingUp}
          iconClassName="bg-info/10 text-info"
        />
      </div>

      {/* Charts and Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <div className="lg:col-span-1">
          <RevenueChart data={hourlyData} />
        </div>

        {/* Recent Orders */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <RecentOrdersTable orders={summary?.recentOrders || []} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Order Status Breakdown */}
      {summary?.ordersByStatus && Object.keys(summary.ordersByStatus).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Order Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              {Object.entries(summary.ordersByStatus).map(([status, count]) => (
                <div key={status} className="text-center">
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-sm text-gray-500">{status}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
