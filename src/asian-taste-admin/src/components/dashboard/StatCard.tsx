import { type LucideIcon, TrendingUp, TrendingDown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn, formatCurrency } from "@/lib/utils"

interface StatCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  trend?: {
    value: number
    isPositive: boolean
  }
  iconClassName?: string
}

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  iconClassName,
}: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-gray-500 font-medium">{title}</p>
            <p className="text-2xl font-bold mt-2">{value}</p>

            {trend && (
              <div
                className={cn(
                  "flex items-center gap-1 mt-2 text-sm font-medium",
                  trend.isPositive ? "text-success" : "text-error"
                )}
              >
                {trend.isPositive ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                <span>
                  {trend.isPositive ? "+" : ""}
                  {trend.value.toFixed(1)}%
                </span>
                <span className="text-gray-500 font-normal">from yesterday</span>
              </div>
            )}
          </div>

          <div
            className={cn(
              "p-3 rounded-xl",
              iconClassName || "bg-primary/10 text-primary"
            )}
          >
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
