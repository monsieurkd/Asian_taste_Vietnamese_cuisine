import apiClient from "./client"

/**
 * Menu API types for admin operations.
 */

export interface Category {
  id: number
  name: string
  description?: string
  displayOrder: number
  isActive: boolean
}

export interface MenuItemSummary {
  id: number
  name: string
  price: number
  categoryName: string
  isActive: boolean
  imageUrl?: string
  isSpicy: boolean
  spicyLevel: number
}

/**
 * A dish as `GET /admin/menu/items` actually returns it.
 *
 * THESE TYPES ARE THE WIRE, NOT AN ASPIRATION, and that distinction is the bug this
 * comment exists to stop recurring. The interface used to declare `isActive` and
 * `isSpicy` — neither of which the endpoint has ever sent — so TypeScript accepted
 * every read of them and reported `undefined` at runtime. A filter on
 * `d.isActive` therefore removed EVERY dish, which is why the counter's grid was
 * empty while the screen itself rendered.
 *
 * The API is the source of truth: it sends `isAvailable` (not `isActive`),
 * `basePrice` and a `price` copy, `categoryName`, and `spicyLevel` with no
 * `isSpicy` flag. Anything read here must appear in a response. When you add a
 * field, add it to the DTO in `Models/DTOs` first and check it against a real
 * response — `npm run build` cannot catch a field that was never there.
 */
export interface MenuItemDetail {
  id: number
  name: string
  description?: string
  /** What to charge. The server sends this alongside `basePrice`; they are equal today. */
  price: number
  basePrice: number
  categoryId: number
  /** Joined from `categories` — absent from the summary shape, which is why it was null. */
  categoryName: string
  imageUrl?: string
  /**
   * Whether the shop has run out. This is the availability flag.
   *
   * `isActive` is a SECOND, separate flag that the API derives as constantly true for
   * anything it returns, because the query already filters to available dishes. It is
   * kept so the menu screen's on/off switch reads one field name, but `isAvailable` is
   * the truth about stock.
   */
  isActive: boolean
  isAvailable: boolean
  isPopular: boolean
  spicyLevel: number
  isVegetarian: boolean
  isVegan: boolean
  isGlutenFree: boolean
  modifierGroups: ModifierGroup[]
}

export interface ModifierGroup {
  id: number
  name: string
  /** Minimum choices that must be picked. 0 means the group is optional. */
  minRequired: number
  maxAllowed: number
  minSelect: number
  maxSelect: number
  /**
   * Whether a choice is REQUIRED. Not a validity flag.
   *
   * There is no `isActive` on a group: the server never sends one, and the counter used
   * to skip groups whose `isActive` was undefined — silently dropping every option from
   * every dish, so "Add to order" refused with "Choose a required option" for a group it
   * could not render.
   */
  isRequired: boolean
  displayOrder: number
  modifiers: Modifier[]
}

export interface Modifier {
  id: number
  modifierGroupId: number
  name: string
  priceAdjustment: number
  displayOrder: number
  isDefault: boolean
}

// Request DTOs
export interface CreateCategoryRequest {
  name: string
  description?: string
  displayOrder?: number
}

export interface UpdateCategoryRequest {
  name?: string
  description?: string
  displayOrder?: number
  isActive?: boolean
}

export interface CreateMenuItemRequest {
  name: string
  description?: string
  price: number
  categoryId: number
  imageUrl?: string
  isActive?: boolean
  isSpicy?: boolean
  spicyLevel?: number
  isVegetarian?: boolean
  isVegan?: boolean
  isGlutenFree?: boolean
}

export interface UpdateMenuItemRequest {
  name?: string
  description?: string
  price?: number
  categoryId?: number
  imageUrl?: string
  isActive?: boolean
  isSpicy?: boolean
  spicyLevel?: number
  isVegetarian?: boolean
  isVegan?: boolean
  isGlutenFree?: boolean
}

export interface CreateModifierGroupRequest {
  name: string
  minRequired?: number
  maxAllowed?: number
  displayOrder?: number
}

export interface UpdateModifierGroupRequest {
  name?: string
  minRequired?: number
  maxAllowed?: number
  displayOrder?: number
  isActive?: boolean
}

export interface ToggleAvailabilityRequest {
  isActive: boolean
}

/**
 * Menu Admin API calls.
 */
export const menuAdminApi = {
  // ==================== CATEGORIES ====================

  /**
   * Get all categories.
   */
  async getCategories(): Promise<Category[]> {
    const response = await apiClient.get<Category[]>("/admin/menu/categories")
    return response.data
  },

  /**
   * Create a new category.
   */
  async createCategory(data: CreateCategoryRequest): Promise<Category> {
    const response = await apiClient.post<Category>("/admin/menu/categories", data)
    return response.data
  },

  /**
   * Update a category.
   */
  async updateCategory(id: number, data: UpdateCategoryRequest): Promise<void> {
    await apiClient.put(`/admin/menu/categories/${id}`, data)
  },

  /**
   * Delete a category.
   */
  async deleteCategory(id: number): Promise<void> {
    await apiClient.delete(`/admin/menu/categories/${id}`)
  },

  // ==================== MENU ITEMS ====================

  /**
   * Get all menu items.
   */
  async getMenuItems(categoryId?: number): Promise<MenuItemDetail[]> {
    const params = categoryId ? { categoryId } : {}
    const response = await apiClient.get<MenuItemDetail[]>("/admin/menu/items", { params })
    return response.data
  },

  /**
   * Get a single menu item by ID.
   */
  async getMenuItem(id: number): Promise<MenuItemDetail> {
    const response = await apiClient.get<MenuItemDetail>(`/admin/menu/items/${id}`)
    return response.data
  },

  /**
   * Create a new menu item.
   */
  async createMenuItem(data: CreateMenuItemRequest): Promise<MenuItemDetail> {
    const response = await apiClient.post<MenuItemDetail>("/admin/menu/items", data)
    return response.data
  },

  /**
   * Update a menu item.
   *
   * Returns the STORED dish rather than nothing, so the screen can show what the
   * database holds instead of echoing what it sent. That distinction is what made the
   * old silent no-op invisible: a caller given no response body cannot tell a save
   * from a save that never happened.
   */
  async updateMenuItem(id: number, data: UpdateMenuItemRequest): Promise<MenuItemDetail> {
    const response = await apiClient.put<MenuItemDetail>(`/admin/menu/items/${id}`, data)
    return response.data
  },

  /**
   * Delete a menu item.
   */
  async deleteMenuItem(id: number): Promise<void> {
    await apiClient.delete(`/admin/menu/items/${id}`)
  },

  /**
   * Toggle item availability.
   */
  async toggleAvailability(id: number, isActive: boolean): Promise<void> {
    await apiClient.post(`/admin/menu/items/${id}/toggle-availability`, { isActive })
  },

  // ==================== MODIFIER GROUPS ====================

  /**
   * Get all modifier groups.
   */
  async getModifierGroups(): Promise<ModifierGroup[]> {
    const response = await apiClient.get<ModifierGroup[]>("/admin/menu/modifier-groups")
    return response.data
  },

  /**
   * Create a new modifier group.
   */
  async createModifierGroup(data: CreateModifierGroupRequest): Promise<ModifierGroup> {
    const response = await apiClient.post<ModifierGroup>("/admin/menu/modifier-groups", data)
    return response.data
  },

  /**
   * Update a modifier group.
   */
  async updateModifierGroup(id: number, data: UpdateModifierGroupRequest): Promise<void> {
    await apiClient.put(`/admin/menu/modifier-groups/${id}`, data)
  },

  /**
   * Delete a modifier group.
   */
  async deleteModifierGroup(id: number): Promise<void> {
    await apiClient.delete(`/admin/menu/modifier-groups/${id}`)
  },
}
