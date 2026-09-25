import apiClient from './client';
import type { MenuResponseDto } from '@/types/menu';

/**
 * Menu API endpoints.
 *
 * One method, because one is reachable: the menu page loads the whole published
 * menu and derives categories, items and search from it locally (`useMenuIndex`),
 * which is what makes filtering instant. The per-category, per-item, search and
 * popular endpoints were all defined here and called from nowhere — and the
 * per-item ones could not even return a dish, because the API has no such route.
 */
export const menuApi = {
  /**
   * Get the full menu with all categories and items
   */
  getFullMenu: async (): Promise<MenuResponseDto> => {
    const response = await apiClient.get<MenuResponseDto>('/menu');
    return response.data;
  },
};

export default apiClient;
