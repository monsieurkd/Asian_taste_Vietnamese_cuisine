import { useNavigate, useParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Phone, Mail, Clock, DollarSign } from "lucide-react"
import { ordersApi } from "@/api/orders"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import type { OrderStatus } from "@/types"

const statusFlow: Record<string, OrderStatus[]> = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Preparing", "Cancelled"],
  Preparing: ["Ready", "Cancelled"],
  Ready: ["Completed"],
  Completed: [],
  Cancelled: [],
}

const statusLabels: Record<string, string> = {
  Pending: "Pending",
  Confirmed: "Confirmed",
  Preparing: "Preparing",
  Ready: "Ready for Pickup",
  Completed: "Completed",
  Cancelled: "Cancelled",
}

/**
 * Order detail page with status management.
 */
export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Fetch order details
  const { data: order, isLoading } = useQuery({
    queryKey: ["order-detail", id],
    queryFn: () => ordersApi.getOrderDetail(Number(id)),
    enabled: !!id,
  })

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ status, reason }: { status: OrderStatus; reason?: string }) =>
      ordersApi.updateOrderStatus(Number(id), { status, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-detail", id] })
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
      toast({
        title: "Status updated",
        description: "Order status has been updated successfully.",
        variant: "success",
      })
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update order status. Please try again.",
        variant: "error",
      })
    },
  })

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === "Cancelled") {
      // For cancellation, we might want to show a dialog for reason
      const reason = prompt("Please enter a reason for cancellation:")
      if (reason) {
        updateStatusMutation.mutate({ status: newStatus as OrderStatus, reason })
      }
    } else {
      updateStatusMutation.mutate({ status: newStatus as OrderStatus })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Order not found</p>
        <Button onClick={() => navigate("/orders")} className="mt-4">
          Back to Orders
        </Button>
      </div>
    )
  }

  const availableStatuses = statusFlow[order.status] || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/orders")}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{order.orderNumber}</h1>
          <p className="text-gray-500">
            Placed on {formatDate(order.createdAt, "long")}
          </p>
        </div>
        <Badge
          variant={order.status.toLowerCase() as any}
          className="ml-auto"
        >
          {statusLabels[order.status] || order.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Items */}
          <Card>
            <CardHeader>
              <CardTitle>Order Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between pb-4 border-b border-border last:border-0 last:pb-0"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.menuItemName}</span>
                        <span className="text-gray-500">×{item.quantity}</span>
                      </div>
                      {item.specialInstructions && (
                        <p className="text-sm text-gray-500 mt-1">
                          Note: {item.specialInstructions}
                        </p>
                      )}
                      {item.modifiers.length > 0 && (
                        <ul className="text-sm text-gray-500 mt-1 ml-4">
                          {item.modifiers.map((mod) => (
                            <li key={mod.id}>
                              + {mod.modifierName}
                              {mod.priceAdjustment > 0 && (
                                <span className="text-gray-400">
                                  {" "}
                                  (+${mod.priceAdjustment.toFixed(2)})
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <span className="font-medium">
                      {formatCurrency(item.totalPrice)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Customer Notes */}
          {order.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Customer Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700">{order.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Update */}
          {availableStatuses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Update Status</CardTitle>
              </CardHeader>
              <CardContent>
                <Select
                  onValueChange={handleStatusChange}
                  disabled={updateStatusMutation.isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Change status..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {statusLabels[status] || status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          {/* Order Info */}
          <Card>
            <CardHeader>
              <CardTitle>Order Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Customer */}
              <div>
                <p className="text-sm text-gray-500 mb-1">Customer</p>
                <p className="font-medium">{order.customerName}</p>
              </div>

              {/* Phone */}
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-gray-400" />
                <a
                  href={`tel:${order.customerPhone}`}
                  className="text-sm text-gray-700 hover:text-primary"
                >
                  {order.customerPhone}
                </a>
              </div>

              {/* Email */}
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-gray-400" />
                <a
                  href={`mailto:${order.customerEmail}`}
                  className="text-sm text-gray-700 hover:text-primary"
                >
                  {order.customerEmail}
                </a>
              </div>

              {/* Order Type */}
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-sm">
                  {order.orderType === "Pickup" ? "Pickup Order" : "Dine-in"}
                </span>
              </div>

              {/* Payment Method */}
              {order.paymentMethod && (
                <div className="flex items-center gap-3">
                  <DollarSign className="w-4 h-4 text-gray-400" />
                  <span className="text-sm">
                    {order.paymentMethod === "Card" ? "Paid by Card" : "Cash on Pickup"}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order Totals */}
          <Card>
            <CardHeader>
              <CardTitle>Order Totals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span>{formatCurrency(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tax</span>
                <span>{formatCurrency(order.tax)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-3 border-t border-border">
                <span>Total</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
