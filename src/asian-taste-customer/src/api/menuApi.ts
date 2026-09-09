import apiClient from './client';
import type {
  MenuResponseDto,
  CategoryDto,
  MenuItemSummaryDto,
  MenuItemDetailDto,
  SearchSearchParams,
} from '@/types/menu';

/**
 * Menu API endpoints
 */
export const menuApi = {
  /**
   * Get the full menu with all categories and items
   */
  getFullMenu: async (): Promise<MenuResponseDto> => {
    const response = await apiClient.get<MenuResponseDto>('/menu');
    return response.data;
  },

  /**
   * Get all active categories
   */
  getCategories: async (): Promise<CategoryDto[]> => {
    const response = await apiClient.get<CategoryDto[]>('/menu/categories');
    return response.data;
  },

  /**
   * Get menu items for a specific category
   */
  getItemsByCategory: async (categoryId: number): Promise<MenuItemSummaryDto[]> => {
    const response = await apiClient.get<MenuItemSummaryDto[]>(
      `/menu/categories/${categoryId}/items`
    );
    return response.data;
  },

  /**
   * Get a single menu item with full details including modifiers
   */
  getItemById: async (id: number): Promise<MenuItemDetailDto> => {
    const response = await apiClient.get<MenuItemDetailDto>(`/menu/items/${id}`);
    return response.data;
  },

  /**
   * Search menu items by name or description
   */
  searchItems: async (query: string): Promise<MenuItemSummaryDto[]> => {
    const response = await apiClient.get<MenuItemSummaryDto[]>('/menu/search', {
      params: { q: query },
    });
    return response.data;
  },

  /**
   * Advanced search with filters and sorting options
   */
  searchItemsAdvanced: async (params: SearchSearchParams): Promise<MenuItemSummaryDto[]> => {
    // Build query params, filtering out undefined values
    const queryParams: Record<string, string | number | boolean> = {};

    if (params.q !== undefined) queryParams.q = params.q;
    if (params.sortBy !== undefined) queryParams.sortBy = params.sortBy;
    if (params.sortOrder !== undefined) queryParams.sortOrder = params.sortOrder;
    if (params.dietary !== undefined) queryParams.dietary = params.dietary;
    if (params.minPrice !== undefined) queryParams.minPrice = params.minPrice;
    if (params.maxPrice !== undefined) queryParams.maxPrice = params.maxPrice;
    if (params.minSpicyLevel !== undefined) queryParams.minSpicyLevel = params.minSpicyLevel;
    if (params.maxSpicyLevel !== undefined) queryParams.maxSpicyLevel = params.maxSpicyLevel;
    if (params.categoryId !== undefined) queryParams.categoryId = params.categoryId;
    if (params.onlyPopular !== undefined) queryParams.onlyPopular = params.onlyPopular;
    if (params.includeModifiers !== undefined) queryParams.includeModifiers = params.includeModifiers;

    const response = await apiClient.get<MenuItemSummaryDto[]>('/menu/search/advanced', {
      params: queryParams,
    });
    return response.data;
  },

  /**
   * Get popular items across all categories
   */
  getPopularItems: async (): Promise<MenuItemSummaryDto[]> => {
    const response = await apiClient.get<MenuItemSummaryDto[]>('/menu/popular');
    return response.data;
  },
};

export default apiClient;
