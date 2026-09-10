import { useNavigate } from "react-router-dom"
import { getStatusVariant } from "@/lib/orderStatus"
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
import { formatDate, formatCurrency } from "@/lib/utils"
import type { Order } from "@/types"

interface OrdersTableProps {
  orders: Order[]
}

export function OrdersTable({ orders }: OrdersTableProps) {
  const navigate = useNavigate()

  if (orders.length === 0) {
    return (
      <div className="text-center py-12 border border-border rounded-xl">
        <p className="text-gray-500">No orders found</p>
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
            <TableHead>Date & Time</TableHead>
            <TableHead className="text-right">Actions</TableHead>
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
              <TableCell>
                <div>
                  <p className="font-medium">{order.customerName}</p>
                  <p className="text-xs text-gray-500">{order.customerPhone}</p>
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm text-gray-500">
                  {order.orderType === "Pickup" ? "Pickup" : "Dine-in"}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant={getStatusVariant(order.status)}>
                  {order.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrency(order.total)}
              </TableCell>
              <TableCell>
                <div>
                  <p className="text-sm">{formatDate(order.createdAt, "short")}</p>
                  <p className="text-xs text-gray-500">
                    {formatDate(order.createdAt, "time")}
                  </p>
                </div>
              </TableCell>
              <TableCell className="text-right">
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
