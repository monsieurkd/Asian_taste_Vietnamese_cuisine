import { useQuery } from '@tanstack/react-query';
import { menuApi } from '@/api/menuApi';
import { buildMenuIndex } from '@/lib/menuModel';
import { dishPhoto } from '@/lib/dishPhotos';
import type { Dish, MenuCategory } from '@/types/menu';

export interface MenuIndex {
  dishes: Dish[];
  categories: MenuCategory[];
  /** Slug → dish, for the detail route and cart lines. */
  bySlug: Map<string, Dish>;
}

const EMPTY: MenuIndex = { dishes: [], categories: [], bySlug: new Map() };

/**
 * One query for the whole catalog.
 *
 * The API returns every category with its items (`GET /api/menu`), so the
 * sectioned catalog needs exactly one request — the per-category endpoint would
 * fetch the same rows 14 times. Everything downstream reads `Dish`, never the
 * wire DTO; `buildMenuIndex` is the adapter.
 */
export function useMenuIndex() {
  const query = useQuery({
    queryKey: ['menu'],
    queryFn: () => menuApi.getFullMenu(),
    staleTime: 5 * 60 * 1000,
  });

  const index = (() => {
    if (!query.data) return EMPTY;
    const built = buildMenuIndex(query.data.categories);
    const dishes = built.dishes.map((dish) => ({
      ...dish,
      image: dishPhoto(dish.slug, dish.image),
    }));
    return {
      dishes,
      categories: built.categories,
      bySlug: new Map(dishes.map((d) => [d.slug, d])),
    };
  })();

  return { ...query, index };
}
