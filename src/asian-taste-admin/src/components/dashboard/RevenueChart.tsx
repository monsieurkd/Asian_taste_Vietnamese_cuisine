import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface RevenueChartProps {
  data: Array<{
    hour: number
    orders: number
  }>
}

export function RevenueChart({ data }: RevenueChartProps) {
  // Generate hours from 10 AM to 9 PM (restaurant hours)
  const chartData = Array.from({ length: 12 }, (_, i) => {
    const hour = i + 10
    const hourLabel = hour > 12 ? `${hour - 12} PM` : hour === 12 ? "12 PM" : `${hour} AM`
    return {
      hour: hourLabel,
      orders: data.find((d) => d.hour === hour)?.orders || 0,
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order Distribution Today</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 12 }}
              stroke="#9CA3AF"
            />
            <YAxis tick={{ fontSize: 12 }} stroke="#9CA3AF" />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1C1C1E",
                border: "none",
                borderRadius: "8px",
                color: "#fff",
              }}
            />
            <Bar dataKey="orders" fill="#8B3A3A" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
