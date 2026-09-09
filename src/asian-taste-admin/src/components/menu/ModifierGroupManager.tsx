import { useState } from "react"
import { Plus, Edit, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

/**
 * Modifier group manager for admin menu management.
 */
export function ModifierGroupManager() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const { toast } = useToast()

  // Mock modifier groups data - TODO: Connect to API
  const [modifierGroups] = useState([
    {
      id: 1,
      name: "Choose Drink",
      minRequired: 1,
      maxAllowed: 1,
      isActive: true,
      displayOrder: 1,
      modifiers: [
        { id: 1, name: "Thai Tea", priceAdjustment: 0, displayOrder: 1, isDefault: true, isActive: true },
        { id: 2, name: "Lemonade", priceAdjustment: 1.5, displayOrder: 2, isDefault: false, isActive: true },
      ],
    },
    {
      id: 2,
      name: "Extra Spicy",
      minRequired: 0,
      maxAllowed: 3,
      isActive: true,
      displayOrder: 2,
      modifiers: [
        { id: 3, name: "Jalapeños", priceAdjustment: 0.5, displayOrder: 1, isDefault: false, isActive: true },
        { id: 4, name: "Sriracha", priceAdjustment: 0.5, displayOrder: 2, isDefault: false, isActive: true },
      ],
    },
  ])

  return (
    <div className="space-y-4">
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Modifier Groups</h2>
          <p className="text-gray-500 text-sm">
            Manage option groups for menu items (e.g., drinks, sides, extras)
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Modifier Group
        </Button>
      </div>

      {/* Modifier Groups Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {modifierGroups.map((group) => (
          <Card key={group.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle>{group.name}</CardTitle>
                <div className="flex gap-2">
                  <Badge variant={group.isActive ? "success" : "secondary"}>
                    {group.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <Button variant="ghost" size="icon">
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-error hover:bg-error/10">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Min Required:</span>
                <span className="font-medium">{group.minRequired}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Max Allowed:</span>
                <span className="font-medium">{group.maxAllowed}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Display Order:</span>
                <span className="font-medium">{group.displayOrder}</span>
              </div>

              {/* Modifiers List */}
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 mb-2">Modifiers ({group.modifiers.length})</p>
                <div className="space-y-2">
                  {group.modifiers.map((modifier) => (
                    <div key={modifier.id} className="flex items-center justify-between text-sm py-2 px-3 bg-gray-50 rounded">
                      <div>
                        <span className="font-medium">{modifier.name}</span>
                        {modifier.isDefault && (
                          <Badge variant="secondary" className="ml-2">Default</Badge>
                        )}
                      </div>
                      <span className="text-gray-500">
                        {modifier.priceAdjustment > 0 ? `+$${modifier.priceAdjustment.toFixed(2)}` :
                          modifier.priceAdjustment < 0 ? `-$${Math.abs(modifier.priceAdjustment).toFixed(2)}` :
                          "No charge"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add Modifier Group Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Modifier Group</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              // TODO: Implement create mutation
              toast({
                title: "Coming Soon",
                description: "Modifier group creation will be available soon",
                variant: "default",
              })
              setIsAddDialogOpen(false)
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="mod-group-name">Group Name *</Label>
              <Input
                id="mod-group-name"
                name="name"
                placeholder="e.g., Choose Drink, Extra Spicy"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="min-req">Min Required</Label>
                <Input
                  id="min-req"
                  name="minRequired"
                  type="number"
                  min="0"
                  max="10"
                  defaultValue="0"
                />
              </div>
              <div>
                <Label htmlFor="max-allowed">Max Allowed</Label>
                <Input
                  id="max-allowed"
                  name="maxAllowed"
                  type="number"
                  min="1"
                  max="10"
                  defaultValue="1"
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="display-order">Display Order</Label>
              <Input
                id="display-order"
                name="displayOrder"
                type="number"
                min="1"
                defaultValue="1"
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
              <Button type="submit">Create Modifier Group</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
