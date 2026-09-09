import { useNavigate } from "react-router-dom"
import { Eye } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDate, getStatusColor } from "@/lib/utils"
import type { RecentOrder } from "@/types"

interface RecentOrdersTableProps {
  orders: RecentOrder[]
}

export function RecentOrdersTable({ orders }: RecentOrdersTableProps) {
  const navigate = useNavigate()

  if (orders.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No orders yet today</p>
      </div>
    )
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order #</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Time</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow
              key={order.id}
              className="cursor-pointer"
              onClick={() => navigate(`/orders/${order.id}`)}
            >
              <TableCell className="font-medium">
                {order.orderNumber}
              </TableCell>
              <TableCell>{order.customerName}</TableCell>
              <TableCell>
                <span className="text-sm text-gray-500">
                  {order.orderType === "Pickup" ? "Pickup" : "Dine-in"}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant={order.status.toLowerCase() as any}>
                  {order.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-medium">
                ${order.total.toFixed(2)}
              </TableCell>
              <TableCell className="text-gray-500">
                {formatDate(order.createdAt, "time")}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/orders/${order.id}`)
                  }}
                >
                  <Eye className="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
