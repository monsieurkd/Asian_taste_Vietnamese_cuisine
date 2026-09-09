import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Plus, Utensils, Tag, List } from "lucide-react"
import { menuAdminApi } from "@/api/menuApi"
import { MenuItemsTable } from "@/components/menu/MenuItemsTable"
import { CategoryManager } from "@/components/menu/CategoryManager"
import { ModifierGroupManager } from "@/components/menu/ModifierGroupManager"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import type { Category } from "@/api/menuApi"

type MenuTab = "items" | "categories" | "modifiers"

/**
 * Menu Management page with tabs for items, categories, and modifiers.
 */
export function MenuManagementPage() {
  const [activeTab, setActiveTab] = useState<MenuTab>("items")

  // Fetch categories for count badge
  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => menuAdminApi.getCategories(),
  })

  const categoriesCount = categories?.length ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Menu Management</h1>
          <p className="text-gray-500">
            Manage menu items, categories, and modifiers
          </p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Add New Item
        </Button>
      </div>

      {/* Tabs with badges */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as MenuTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="items" className="gap-2">
            <Utensils className="w-4 h-4" />
            Menu Items
          </TabsTrigger>
          <TabsTrigger value="categories" className="gap-2 relative">
            <Tag className="w-4 h-4" />
            Categories
            {categoriesCount > 0 && (
              <span className="ml-auto bg-primary text-white text-xs rounded-full px-2 py-0.5">
                {categoriesCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="modifiers" className="gap-2">
            <List className="w-4 h-4" />
            Modifiers
          </TabsTrigger>
        </TabsList>

        {/* Menu Items Tab */}
        <TabsContent value="items" className="mt-6">
          <MenuItemsTable />
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="mt-6">
          {categoriesLoading ? (
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <CategoryManager categories={categories ?? []} />
          )}
        </TabsContent>

        {/* Modifiers Tab */}
        <TabsContent value="modifiers" className="mt-6">
          <ModifierGroupManager />
        </TabsContent>
      </Tabs>
    </div>
  )
}
