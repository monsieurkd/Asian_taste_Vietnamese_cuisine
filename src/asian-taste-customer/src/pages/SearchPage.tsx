import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMenuIndex } from '@/hooks/useMenuIndex';
import { useCartStore } from '@/stores/cartStore';
import { DishRow } from '@/components/menu/DishRow';
import { Panel, PanelBody } from '@/components/ui/Panel';
import { SkeletonRow, StateBlock } from '@/components/ui/State';
import { StateIcons } from '@/components/ui/stateIcons';
import { showToast } from '@/stores/toastStore';
import type { Dish } from '@/types/menu';

type SortBy = 'relevance' | 'name' | 'price' | 'popularity';

const SORTS: Array<{ id: SortBy; label: string }> = [
  { id: 'relevance', label: 'Best match' },
  { id: 'popularity', label: 'Most liked' },
  { id: 'price', label: 'Price' },
  { id: 'name', label: 'Name' },
];

const DIETS = [
  { id: 'all', label: 'Everything' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'gf', label: 'Gluten free' },
] as const;

/**
 * Search and filter.
 *
 * Filtering runs over the already-loaded catalog rather than a request per
 * keystroke. At 82 dishes that is instant, works offline after the first load,
 * and removes a whole class of "the results are stale because a request is in
 * flight" bugs. If the menu ever grows past a few hundred dishes, this is the
 * first thing to move back to the API's advanced search.
 */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const { index, isLoading } = useMenuIndex();
  const addConfigured = useCartStore((s) => s.addConfigured);

  const query = params.get('q') ?? '';
  const sort = (params.get('sort') as SortBy) ?? 'relevance';
  const diet = params.get('diet') ?? 'all';
  const maxPrice = params.get('max') ? Number(params.get('max')) : null;

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();

    let list = index.dishes.filter((dish) => {
      if (q && !(dish.name.toLowerCase().includes(q) || dish.desc.toLowerCase().includes(q))) {
        return false;
      }
      if (diet !== 'all' && !dish.tags.includes(diet as Dish['tags'][number])) return false;
      if (maxPrice != null && dish.price > maxPrice) return false;
      return true;
    });

    list = [...list];
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'price') list.sort((a, b) => a.price - b.price);
    else if (sort === 'popularity') {
      list.sort((a, b) => Number(b.tags.includes('popular')) - Number(a.tags.includes('popular')));
    }

    return list;
  }, [index.dishes, query, sort, diet, maxPrice]);

  const hasFilters = !!query || diet !== 'all' || maxPrice != null || sort !== 'relevance';

  const clearAll = () => setParams(new URLSearchParams(), { replace: true });

  const quickAdd = (dish: Dish) => {
    addConfigured(dish, { selections: {} });
    showToast(`${dish.name} added to your order`);
  };

  return (
    <div className="container-shell section" data-od-id="search">
      <div className="pagehead">
        <p className="eyebrow eyebrow-gold">Find a dish</p>
        <h1>{query ? `Results for “${query}”` : 'Search the menu'}</h1>
        <p className="lead">
          {query
            ? `${results.length} dish${results.length === 1 ? '' : 'es'} matched.`
            : 'Type a name, or narrow the menu with the filters below.'}
        </p>
      </div>

      <form
        className="catalog-tools"
        style={{ marginTop: 24 }}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const value = (e.currentTarget.elements.namedItem('q') as HTMLInputElement).value.trim();
          update('q', value);
        }}
      >
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4 4" />
          </svg>
          <label className="sr-only" htmlFor="search-q">
            Search dishes
          </label>
          <input
            className="input"
            id="search-q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search for a dish…"
            autoComplete="off"
          />
        </div>
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>

      <Panel className="mt-6">
        <PanelBody>
          <div className="filterbar">
            <div className="seg-sm" role="group" aria-label="Sort by">
              {SORTS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={sort === option.id}
                  onClick={() => update('sort', option.id === 'relevance' ? '' : option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="seg-sm" role="group" aria-label="Dietary">
              {DIETS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={diet === option.id}
                  onClick={() => update('diet', option.id === 'all' ? '' : option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="field" style={{ maxWidth: 190 }}>
              <label htmlFor="search-max">Up to $</label>
              <input
                id="search-max"
                className="input"
                type="number"
                min={0}
                step={1}
                placeholder="Any price"
                defaultValue={maxPrice ?? ''}
                onBlur={(e) => update('max', e.target.value.trim())}
              />
            </div>

            {hasFilters && (
              <button type="button" className="btn btn-ghost" onClick={clearAll}>
                Clear filters
              </button>
            )}
          </div>
        </PanelBody>
      </Panel>

      <div style={{ marginTop: 32 }}>
        {isLoading ? (
          <div className="item-list">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : results.length === 0 ? (
          <Panel>
            <StateBlock
              icon={StateIcons.search}
              title="No dishes found"
              body={
                query
                  ? `We couldn't match “${query}”. Try a shorter word, or clear the filters.`
                  : 'Nothing matches those filters. Try widening the price or clearing the diet.'
              }
              action={
                <button type="button" className="btn btn-secondary" onClick={clearAll}>
                  Clear filters
                </button>
              }
            />
          </Panel>
        ) : (
          <div className="item-list">
            {results.map((dish) => (
              <DishRow key={dish.slug} dish={dish} onQuickAdd={quickAdd} />
            ))}
          </div>
        )}
      </div>

      <p className="helpline" style={{ marginTop: 28 }}>
        Can&rsquo;t find something? <Link to="/menu">Browse all fourteen sections</Link>.
      </p>
    </div>
  );
}
