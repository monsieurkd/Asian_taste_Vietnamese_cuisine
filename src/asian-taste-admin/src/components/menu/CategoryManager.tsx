import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Edit, Trash2, GripVertical } from "lucide-react"
import { menuAdminApi, type Category } from "@/api/menuApi"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { Label } from "@/components/ui/label"

interface CategoryManagerProps {
  categories: Category[]
}

/**
 * Category manager for admin menu management.
 */
export function CategoryManager({ categories }: CategoryManagerProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      menuAdminApi.createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] })
      setIsAddDialogOpen(false)
      toast({
        title: "Success",
        description: "Category created successfully",
      })
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create category",
        variant: "error",
      })
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; description?: string } }) =>
      menuAdminApi.updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] })
      setEditingCategory(null)
      toast({
        title: "Success",
        description: "Category updated successfully",
      })
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update category",
        variant: "error",
      })
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => menuAdminApi.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] })
      toast({
        title: "Success",
        description: "Category deleted successfully",
      })
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete category",
        variant: "error",
      })
    },
  })

  return (
    <div className="space-y-4">
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Categories</h2>
          <p className="text-gray-500 text-sm">
            Manage menu categories for organization
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Category
        </Button>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((category) => (
          <Card key={category.id} className="group">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{category.name}</h3>
                  {category.description && (
                    <p className="text-gray-500 text-sm mt-1">{category.description}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant={category.isActive ? "success" : "secondary"}>
                      {category.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <span className="text-gray-400 text-xs">
                      Order: {category.displayOrder}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingCategory(category)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-error hover:bg-error/10"
                    onClick={() => {
                      if (confirm(`Delete category "${category.name}"?`)) {
                        deleteMutation.mutate(category.id)
                      }
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <GripVertical className="w-4 h-4 text-gray-300 cursor-move" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add Category Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Category</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              createMutation.mutate({
                name: formData.get("name") as string,
                description: formData.get("description") as string | undefined,
              })
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="new-cat-name">Category Name *</Label>
              <Input
                id="new-cat-name"
                name="name"
                placeholder="e.g., Appetizers, Main Courses"
                required
              />
            </div>
            <div>
              <Label htmlFor="new-cat-desc">Description</Label>
              <Input
                id="new-cat-desc"
                name="description"
                placeholder="Brief description of this category"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsAddDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Category"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Category Dialog */}
      {editingCategory && (
        <Dialog open={!!editingCategory} onOpenChange={() => setEditingCategory(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Category</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const formData = new FormData(e.currentTarget)
                updateMutation.mutate({
                  id: editingCategory.id,
                  data: {
                    name: formData.get("name") as string | undefined,
                    description: formData.get("description") as string | undefined,
                  },
                })
              }}
              className="space-y-4"
            >
              <div>
                <Label htmlFor="edit-cat-name">Category Name *</Label>
                <Input
                  id="edit-cat-name"
                  name="name"
                  defaultValue={editingCategory.name}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-cat-desc">Description</Label>
                <Input
                  id="edit-cat-desc"
                  name="description"
                  defaultValue={editingCategory.description || ""}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditingCategory(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Updating..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
