import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Search, Edit, Trash2, Power, PowerOff } from "lucide-react"
import { menuAdminApi } from "@/api/menuApi"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { formatCurrency } from "@/lib/utils"
import type { Category } from "@/api/menuApi"

interface MenuItemsTableProps {
  categories?: Category[]
}

/**
 * Menu items table for admin menu management.
 */
export function MenuItemsTable({ categories }: MenuItemsTableProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Fetch menu items
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["admin-menu-items", categoryFilter],
    queryFn: () => menuAdminApi.getMenuItems(
      categoryFilter === "all" ? undefined : Number(categoryFilter)
    ),
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  // Toggle availability mutation
  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      menuAdminApi.toggleAvailability(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-menu-items"] })
      toast({
        title: "Success",
        description: "Item availability updated",
      })
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update item availability",
        variant: "error",
      })
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => menuAdminApi.deleteMenuItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-menu-items"] })
      toast({
        title: "Success",
        description: "Menu item deleted",
      })
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete menu item",
        variant: "error",
      })
    },
  })

  // Filter items by search
  const filteredItems = items.filter((item) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      item.name.toLowerCase().includes(query) ||
      item.categoryName.toLowerCase().includes(query)
    )
  })

  const categoryOptions = [
    { value: "all", label: "All Categories" },
    ...(categories?.map((c) => ({ value: String(c.id), label: c.name })) || []),
  ]

  return (
    <div className="space-y-4">
      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search menu items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            {categoryOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              No menu items found. Try adjusting your search or filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Image</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="h-10 w-10 rounded-md bg-gray-100 flex items-center justify-center overflow-hidden">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-gray-400 text-xs">No img</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{item.name}</div>
                          {item.isSpicy && (
                            <Badge variant="error" className="mt-1">
                              🌶️ Spicy {item.spicyLevel}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{item.categoryName}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(item.price)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.isActive ? "success" : "secondary"}>
                          {item.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Toggle Availability */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className={item.isActive ? "text-success hover:bg-success/10" : "text-gray-500 hover:bg-gray-100"}
                            onClick={() => toggleMutation.mutate({ id: item.id, isActive: !item.isActive })}
                            disabled={toggleMutation.isPending}
                          >
                            {item.isActive ? (
                              <Power className="w-4 h-4" />
                            ) : (
                              <PowerOff className="w-4 h-4" />
                            )}
                          </Button>

                          {/* Edit */}
                          <Button variant="ghost" size="icon" asChild>
                            <a href={`/admin/menu/items/${item.id}/edit`}>
                              <Edit className="w-4 h-4" />
                            </a>
                          </Button>

                          {/* Delete */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-error hover:bg-error/10"
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
                                deleteMutation.mutate(item.id)
                              }
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Result count */}
      {!isLoading && (
        <p className="text-sm text-gray-500 text-center">
          Showing {filteredItems.length} item{filteredItems.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  )
}
