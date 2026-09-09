import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { TrendingUp, TrendingDown, Calendar } from "lucide-react"
import { ordersApi } from "@/api/orders"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCurrency } from "@/lib/utils"
import type { DashboardSummary, DailyStats } from "@/types"

type DateRange = "7d" | "30d" | "90d" | "custom"

/**
 * Reports page with sales analytics and popular items.
 */
export function ReportsPage() {
  const [dateRange, setDateRange] = useState<DateRange>("30d")
  const [customStartDate, setCustomStartDate] = useState<string>("")
  const [customEndDate, setCustomEndDate] = useState<string>("")

  // Fetch dashboard summary for overview
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => ordersApi.getDashboardSummary(),
    refetchInterval: 60000, // Refresh every minute
  })

  // Fetch daily stats for trends
  const { data: dailyStats, isLoading: statsLoading } = useQuery({
    queryKey: ["daily-stats"],
    queryFn: () => ordersApi.getDailyStats(),
    refetchInterval: 60000,
  })

  // Calculate date range for display
  const getDateRangeLabel = () => {
    switch (dateRange) {
      case "7d":
        return "Last 7 Days"
      case "30d":
        return "Last 30 Days"
      case "90d":
        return "Last 90 Days"
      case "custom":
        return "Custom Range"
    }
  }

  // Calculate mock trend percentages
  const calculateTrend = (current: number, previous: number) => {
    if (!previous || previous === 0) return 0
    return ((current - previous) / previous) * 100
  }

  const revenueTrend = summary && summary.todayRevenue
    ? calculateTrend(summary.todayRevenue, summary.todayRevenue * 0.9) // Mock calculation
    : 0

  const ordersTrend = summary && summary.completedOrdersToday
    ? calculateTrend(summary.completedOrdersToday, summary.completedOrdersToday * 0.85) // Mock calculation
    : 0

  // Generate hourly chart data
  const hourlyData = dailyStats?.hourlyDistribution
    ? Object.entries(dailyStats.hourlyDistribution).map(([hour, count]) => ({
        hour: Number(hour),
        orders: count as number,
      }))
    : []

  // Mock popular items data (TODO: Connect to real API)
  const popularItems = [
    { name: "Pho Bo", category: "Main Courses", orders: 156, revenue: 2340, rating: 4.8 },
    { name: "Banh Mi", category: "Main Courses", orders: 143, revenue: 2145, rating: 4.6 },
    { name: "Fresh Spring Rolls", category: "Appetizers", orders: 98, revenue: 980, rating: 4.9 },
    { name: "Vietnamese Iced Coffee", category: "Drinks", orders: 87, revenue: 435, rating: 4.7 },
    { name: "Grilled Pork Chop", category: "Main Courses", orders: 76, revenue: 1900, rating: 4.5 },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Reports & Analytics</h1>
        <p className="text-gray-500">
          Track sales performance, popular items, and business insights
        </p>
      </div>

      {/* Date Range Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <Label htmlFor="date-range">Date Range:</Label>
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
              <SelectTrigger id="date-range" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="90d">Last 90 Days</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>

            {dateRange === "custom" && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-[140px]"
                />
                <span>to</span>
                <Input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-[140px]"
                />
                <Button>Apply</Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryLoading ? (
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-32" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-gray-500 mb-1">Total Revenue</p>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-bold">{formatCurrency(summary?.todayRevenue || 0)}</p>
                  {revenueTrend !== 0 && (
                    <Badge variant={revenueTrend > 0 ? "success" : "error"} className="gap-1">
                      {revenueTrend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(revenueTrend).toFixed(1)}%
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-gray-500 mb-1">Total Orders</p>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-bold">{summary?.completedOrdersToday || 0}</p>
                  {ordersTrend !== 0 && (
                    <Badge variant={ordersTrend > 0 ? "success" : "error"} className="gap-1">
                      {ordersTrend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(ordersTrend).toFixed(1)}%
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-gray-500 mb-1">Avg. Order Value</p>
                <p className="text-2xl font-bold">{formatCurrency(summary?.averageOrderValue || 0)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-gray-500 mb-1">Active Orders</p>
                <p className="text-2xl font-bold">{summary?.activeOrders || 0}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Charts and Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hourly Distribution Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Orders by Hour
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="space-y-2">
                {hourlyData.map((data) => {
                  const maxOrders = Math.max(...hourlyData.map(d => d.orders))
                  const heightPercentage = maxOrders > 0 ? (data.orders / maxOrders) * 100 : 0

                  return (
                    <div key={data.hour} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-8">{String(data.hour).padStart(2, '0')}</span>
                      <div className="flex-1 h-8 bg-gray-100 rounded overflow-hidden">
                        <div
                          className="h-full bg-primary rounded transition-all"
                          style={{ width: `${heightPercentage}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium w-8">{data.orders}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Popular Items Table */}
        <Card>
          <CardHeader>
            <CardTitle>Popular Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-gray-500">
                    <th className="pb-2">Item Name</th>
                    <th className="pb-2">Category</th>
                    <th className="pb-2 text-right">Orders</th>
                    <th className="pb-2 text-right">Revenue</th>
                    <th className="pb-2 text-right">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {popularItems.map((item, index) => (
                    <tr key={index} className="border-b last:border-b-0">
                      <td className="py-3">
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-gray-500">{item.category}</div>
                      </td>
                      <td className="py-3 text-gray-500">{item.category}</td>
                      <td className="py-3 text-right font-medium">{item.orders}</td>
                      <td className="py-3 text-right">{formatCurrency(item.revenue)}</td>
                      <td className="py-3 text-right">
                        <Badge variant="secondary">⭐ {item.rating}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
