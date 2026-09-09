import { create } from 'zustand';
import type { SearchSearchParams, MenuItemSummaryDto } from '@/types/menu';

interface SearchState {
  // Search state
  query: string;
  results: MenuItemSummaryDto[];
  isSearching: boolean;
  hasSearched: boolean;

  // Filter state
  sortBy: 'relevance' | 'name' | 'price' | 'popularity' | 'spicy';
  sortOrder: 'asc' | 'desc';
  dietary: '' | 'vegetarian' | 'vegan' | 'glutenFree';
  minPrice: number | null;
  maxPrice: number | null;
  minSpicyLevel: number | null;
  maxSpicyLevel: number | null;
  categoryId: number | null;
  onlyPopular: boolean;
  includeModifiers: boolean;

  // Computed
  hasActiveFilters: boolean;

  // Actions
  setQuery: (query: string) => void;
  setResults: (results: MenuItemSummaryDto[]) => void;
  setSearching: (isSearching: boolean) => void;
  setHasSearched: (hasSearched: boolean) => void;

  // Filter actions
  setSortBy: (sortBy: SearchState['sortBy']) => void;
  setSortOrder: (sortOrder: SearchState['sortOrder']) => void;
  setDietary: (dietary: SearchState['dietary']) => void;
  setMinPrice: (price: number | null) => void;
  setMaxPrice: (price: number | null) => void;
  setMinSpicyLevel: (level: number | null) => void;
  setMaxSpicyLevel: (level: number | null) => void;
  setCategoryId: (categoryId: number | null) => void;
  setOnlyPopular: (onlyPopular: boolean) => void;
  setIncludeModifiers: (includeModifiers: boolean) => void;

  // Helper to get all search params
  getSearchParams: () => SearchSearchParams;

  // Reset filters
  resetFilters: () => void;
  resetAll: () => void;
}

const INITIAL_STATE = {
  query: '',
  results: [],
  isSearching: false,
  hasSearched: false,
  sortBy: 'relevance' as const,
  sortOrder: 'asc' as const,
  dietary: '' as const,
  minPrice: null,
  maxPrice: null,
  minSpicyLevel: null,
  maxSpicyLevel: null,
  categoryId: null,
  onlyPopular: false,
  includeModifiers: true,
};

export const useSearchStore = create<SearchState>((set, get) => ({
  ...INITIAL_STATE,

  hasActiveFilters: false,

  setQuery: (query) => set({ query }),

  setResults: (results) => set({ results }),

  setSearching: (isSearching) => set({ isSearching }),

  setHasSearched: (hasSearched) => set({ hasSearched }),

  setSortBy: (sortBy) => set({ sortBy }),

  setSortOrder: (sortOrder) => set({ sortOrder }),

  setDietary: (dietary) => set({ dietary }),

  setMinPrice: (minPrice) => set({ minPrice }),

  setMaxPrice: (maxPrice) => set({ maxPrice }),

  setMinSpicyLevel: (minSpicyLevel) => set({ minSpicyLevel }),

  setMaxSpicyLevel: (maxSpicyLevel) => set({ maxSpicyLevel }),

  setCategoryId: (categoryId) => set({ categoryId }),

  setOnlyPopular: (onlyPopular) => set({ onlyPopular }),

  setIncludeModifiers: (includeModifiers) => set({ includeModifiers }),

  getSearchParams: () => {
    const state = get();
    const params: SearchSearchParams = {};

    if (state.query) params.q = state.query;
    if (state.sortBy !== 'relevance') params.sortBy = state.sortBy;
    if (state.sortOrder !== 'asc') params.sortOrder = state.sortOrder;
    if (state.dietary) params.dietary = state.dietary;
    if (state.minPrice !== null) params.minPrice = state.minPrice;
    if (state.maxPrice !== null) params.maxPrice = state.maxPrice;
    if (state.minSpicyLevel !== null) params.minSpicyLevel = state.minSpicyLevel;
    if (state.maxSpicyLevel !== null) params.maxSpicyLevel = state.maxSpicyLevel;
    if (state.categoryId !== null) params.categoryId = state.categoryId;
    if (state.onlyPopular) params.onlyPopular = true;
    if (!state.includeModifiers) params.includeModifiers = false;

    return params;
  },

  resetFilters: () => set({
    sortBy: 'relevance',
    sortOrder: 'asc',
    dietary: '',
    minPrice: null,
    maxPrice: null,
    minSpicyLevel: null,
    maxSpicyLevel: null,
    categoryId: null,
    onlyPopular: false,
    includeModifiers: true,
  }),

  resetAll: () => set({
    ...INITIAL_STATE,
    hasActiveFilters: false,
  }),
}));

// Selector to check if there are active filters
export const useHasActiveFilters = () => {
  const dietary = useSearchStore((s) => s.dietary);
  const minPrice = useSearchStore((s) => s.minPrice);
  const maxPrice = useSearchStore((s) => s.maxPrice);
  const minSpicyLevel = useSearchStore((s) => s.minSpicyLevel);
  const maxSpicyLevel = useSearchStore((s) => s.maxSpicyLevel);
  const categoryId = useSearchStore((s) => s.categoryId);
  const onlyPopular = useSearchStore((s) => s.onlyPopular);

  return !!(
    dietary ||
    minPrice !== null ||
    maxPrice !== null ||
    minSpicyLevel !== null ||
    maxSpicyLevel !== null ||
    categoryId !== null ||
    onlyPopular
  );
};
