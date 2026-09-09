import { useSearchParams } from 'react-router-dom';
import { useSearchStore } from '@/stores/searchStore';
import {
  FunnelIcon,
  ChevronUpDownIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

interface SearchFiltersProps {
  onSearch: () => void;
  resultCount?: number;
}

export function SearchFilters({ onSearch, resultCount }: SearchFiltersProps) {
  const [, setSearchParams] = useSearchParams();

  const {
    sortBy,
    sortOrder,
    dietary,
    minPrice,
    maxPrice,
    minSpicyLevel,
    maxSpicyLevel,
    onlyPopular,
    setSortBy,
    setSortOrder,
    setDietary,
    setMinPrice,
    setMaxPrice,
    setMinSpicyLevel,
    setMaxSpicyLevel,
    setOnlyPopular,
    resetFilters,
    getSearchParams,
  } = useSearchStore();

  const updateUrlParams = () => {
    const params = getSearchParams();
    const newParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        newParams.set(key, String(value));
      }
    });

    setSearchParams(newParams);
  };

  const handleSortByChange = (value: typeof sortBy) => {
    setSortBy(value);
    updateUrlParams();
    setTimeout(() => onSearch(), 0);
  };

  const handleSortOrderChange = () => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    updateUrlParams();
    setTimeout(() => onSearch(), 0);
  };

  const handleDietaryChange = (value: typeof dietary) => {
    setDietary(value);
    updateUrlParams();
    setTimeout(() => onSearch(), 0);
  };

  const handlePriceChange = (min: string, max: string) => {
    setMinPrice(min ? Number(min) : null);
    setMaxPrice(max ? Number(max) : null);
  };

  const handlePriceBlur = () => {
    updateUrlParams();
    onSearch();
  };

  const handleSpicyMinChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value === '' ? null : Number(e.target.value);
    setMinSpicyLevel(val);
    updateUrlParams();
    setTimeout(() => onSearch(), 0);
  };

  const handleSpicyMaxChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value === '' ? null : Number(e.target.value);
    setMaxSpicyLevel(val);
    updateUrlParams();
    setTimeout(() => onSearch(), 0);
  };

  const handleOnlyPopularToggle = () => {
    setOnlyPopular(!onlyPopular);
    updateUrlParams();
    setTimeout(() => onSearch(), 0);
  };

  const handleResetFilters = () => {
    resetFilters();
    setSearchParams({});
    setTimeout(() => onSearch(), 0);
  };

  const hasActiveFilters =
    dietary ||
    minPrice !== null ||
    maxPrice !== null ||
    minSpicyLevel !== null ||
    maxSpicyLevel !== null ||
    onlyPopular;

  const sortOptions = [
    { value: 'relevance', label: 'Relevance' },
    { value: 'name', label: 'Name' },
    { value: 'price', label: 'Price' },
    { value: 'popularity', label: 'Popularity' },
    { value: 'spicy', label: 'Spicy Level' },
  ] as const;

  const dietaryOptions = [
    { value: '', label: 'All Items' },
    { value: 'vegetarian', label: '🥬 Vegetarian' },
    { value: 'vegan', label: '🌱 Vegan' },
    { value: 'glutenFree', label: '🌾 Gluten Free' },
  ] as const;

  return (
    <div className="space-y-4 rounded-lg border border-tan bg-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FunnelIcon className="h-5 w-5 text-gray-500" />
          <h3 className="font-semibold text-secondary">Filters</h3>
          {resultCount !== undefined && (
            <span className="text-sm text-gray-500">({resultCount} results)</span>
          )}
        </div>
        {hasActiveFilters && (
          <button
            onClick={handleResetFilters}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Reset
          </button>
        )}
      </div>

      {/* Sort By */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Sort By
        </label>
        <div className="flex gap-2">
          <select
            value={sortBy}
            onChange={(e) => handleSortByChange(e.target.value as typeof sortBy)}
            className="input flex-1"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {sortBy !== 'relevance' && (
            <button
              onClick={handleSortOrderChange}
              className="flex items-center gap-1 rounded-lg border border-tan bg-cream px-3 py-2 text-sm hover:bg-tan"
              title={`Sort ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
            >
              <ChevronUpDownIcon className="h-4 w-4" />
              <span className="uppercase">{sortOrder === 'asc' ? 'A-Z' : 'Z-A'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Dietary Filter */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Dietary
        </label>
        <select
          value={dietary}
          onChange={(e) => handleDietaryChange(e.target.value as typeof dietary)}
          className="input w-full"
        >
          {dietaryOptions.map((option) => (
            <option key={option.value || 'all'} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Price Range */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Price Range ($)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min"
            min="0"
            step="0.5"
            value={minPrice ?? ''}
            onChange={(e) => handlePriceChange(e.target.value, String(maxPrice ?? ''))}
            onBlur={handlePriceBlur}
            className="input w-24"
          />
          <span className="text-gray-400">—</span>
          <input
            type="number"
            placeholder="Max"
            min="0"
            step="0.5"
            value={maxPrice ?? ''}
            onChange={(e) => handlePriceChange(String(minPrice ?? ''), e.target.value)}
            onBlur={handlePriceBlur}
            className="input w-24"
          />
        </div>
      </div>

      {/* Spicy Level */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Spicy Level (🌶️)
        </label>
        <div className="flex items-center gap-2">
          <select
            value={minSpicyLevel ?? ''}
            onChange={handleSpicyMinChange}
            className="input w-20"
          >
            <option value="">Any</option>
            <option value="0">0</option>
            <option value="1">1+</option>
            <option value="2">2+</option>
            <option value="3">3</option>
          </select>
          <span className="text-gray-400">to</span>
          <select
            value={maxSpicyLevel ?? ''}
            onChange={handleSpicyMaxChange}
            className="input w-20"
          >
            <option value="">Any</option>
            <option value="0">0</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3+</option>
          </select>
        </div>
      </div>

      {/* Popular Items Toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={onlyPopular}
          onChange={handleOnlyPopularToggle}
          className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <span className="text-sm font-medium text-gray-700">
          🏆 Popular Items Only
        </span>
      </label>
    </div>
  );
}
