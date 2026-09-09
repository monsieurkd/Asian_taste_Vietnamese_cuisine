import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MenuGrid } from '@/components/menu/MenuGrid';
import { SearchFilters } from '@/components/search/SearchFilters';
import { menuApi } from '@/api/menuApi';
import { useSearchStore } from '@/stores/searchStore';

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const {
    setQuery,
    setResults,
    setHasSearched,
  } = useSearchStore();

  // Build search params from URL (source of truth)
  const searchApiParams = useMemo(() => {
    const params: Record<string, string | number | boolean> = {};
    const q = searchParams.get('q');
    const sortBy = searchParams.get('sortBy');
    const sortOrder = searchParams.get('sortOrder');
    const dietary = searchParams.get('dietary');
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const minSpicyLevel = searchParams.get('minSpicyLevel');
    const maxSpicyLevel = searchParams.get('maxSpicyLevel');
    const categoryId = searchParams.get('categoryId');
    const onlyPopular = searchParams.get('onlyPopular');
    const includeModifiers = searchParams.get('includeModifiers');

    if (q) params.q = q;
    if (sortBy) params.sortBy = sortBy;
    if (sortOrder) params.sortOrder = sortOrder;
    if (dietary) params.dietary = dietary;
    if (minPrice) params.minPrice = Number(minPrice);
    if (maxPrice) params.maxPrice = Number(maxPrice);
    if (minSpicyLevel) params.minSpicyLevel = Number(minSpicyLevel);
    if (maxSpicyLevel) params.maxSpicyLevel = Number(maxSpicyLevel);
    if (categoryId) params.categoryId = Number(categoryId);
    if (onlyPopular === 'true') params.onlyPopular = true;
    if (includeModifiers === 'false') params.includeModifiers = false;

    return params;
  }, [searchParams]);

  // Sync query to store for display purposes
  useEffect(() => {
    const urlQuery = searchParams.get('q') || '';
    setQuery(urlQuery);
    setHasSearched(urlQuery.length > 0 || searchParams.toString().length > 0);
  }, [searchParams, setQuery, setHasSearched]);

  // Check if we have any search criteria
  const hasSearchCriteria = Object.keys(searchApiParams).length > 0;

  // Use React Query to fetch search results
  const searchKey = ['search', Object.fromEntries(searchParams)];
  const { data: results, isLoading } = useQuery({
    queryKey: searchKey,
    queryFn: () => menuApi.searchItemsAdvanced(searchApiParams),
    enabled: hasSearchCriteria,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Update store with results for filter component
  useEffect(() => {
    if (results !== undefined) {
      setResults(results);
    }
  }, [results, setResults]);

  // Get query for display
  const query = searchParams.get('q') || '';
  const displayResults = results ?? [];
  const displayHasSearched = hasSearchCriteria;

  const handleSearch = () => {
    // Search is triggered by URL param changes, React Query handles the rest
  };

  return (
    <div className="min-h-screen bg-cream pb-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="py-8">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="font-sans text-3xl font-bold text-secondary">
              {query ? `Search: "${query}"` : 'Search Menu'}
            </h1>
            {!query && (
              <p className="mt-2 text-gray-600">
                Use the search bar in the header to find dishes, or apply filters below.
              </p>
            )}
          </div>

          {/* Main Content */}
          <div className="gap-8 lg:grid lg:grid-cols-[280px_1fr]">
            {/* Sidebar - Filters */}
            <aside className="lg:sticky lg:top-24 lg:h-fit">
              <SearchFilters
                onSearch={handleSearch}
                resultCount={displayResults.length}
              />
            </aside>

            {/* Results Grid */}
            <div>
              {displayHasSearched ? (
                <>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="text-center">
                        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-tan border-t-primary"></div>
                        <p className="text-gray-600">Searching...</p>
                      </div>
                    </div>
                  ) : displayResults.length > 0 ? (
                    <>
                      <div className="mb-4 flex items-center justify-between">
                        <p className="text-gray-600">
                          Found {displayResults.length} result{displayResults.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <MenuGrid items={displayResults} title="" isLoading={false} />
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-tan bg-white py-16">
                      <svg
                        className="mb-4 h-16 w-16 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                      <h3 className="font-sans text-xl font-semibold text-secondary">
                        No results found
                      </h3>
                      <p className="mt-2 text-center text-gray-600">
                        Try adjusting your search terms or filters
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-tan bg-white py-16">
                  <svg
                    className="mb-4 h-16 w-16 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <h3 className="font-sans text-xl font-semibold text-secondary">
                    Search Our Menu
                  </h3>
                  <p className="mt-2 text-center text-gray-600">
                    Use the search bar in the header to find dishes by name,<br />
                    or use the filters to browse by dietary preferences, price, and more.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
