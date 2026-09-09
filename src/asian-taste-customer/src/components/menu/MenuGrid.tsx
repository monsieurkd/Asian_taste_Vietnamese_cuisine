import type { MenuItemSummaryDto, CategoryWithItemsDto } from '@/types/menu';
import { MenuItemCard } from './MenuItemCard';

interface MenuGridProps {
  items: MenuItemSummaryDto[];
  title?: string;
  description?: string;
  isLoading?: boolean;
}

// Skeleton loader for menu item cards
function MenuItemCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="aspectvideo animate-shimmer" />
      <div className="p-4">
        <div className="mb-2 h-6 w-3/4 animate-shimmer rounded" />
        <div className="mb-1 h-4 w-full animate-shimmer rounded" />
        <div className="mb-3 h-4 w-1/2 animate-shimmer rounded" />
        <div className="flex items-center justify-between">
          <div className="h-6 w-16 animate-shimmer rounded" />
          <div className="h-9 w-20 animate-shimmer rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function MenuGrid({ items, title, description, isLoading }: MenuGridProps) {
  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {title && (
          <div className="mb-8 text-center">
            <div className="mb-2 h-10 w-48 animate-shimmer rounded mx-auto" />
            {description && <div className="h-6 w-96 animate-shimmer rounded mx-auto mt-2" />}
          </div>
        )}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <MenuItemCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <div className="mx-auto max-w-md">
          <svg
            className="mx-auto h-24 w-24 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
          <h3 className="mt-4 text-xl font-semibold text-secondary">No items found</h3>
          <p className="mt-2 text-gray-600">
            Try selecting a different category or check back later.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Section Header */}
      {title && (
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-secondary md:text-4xl">{title}</h2>
          {description && (
            <p className="mt-2 text-lg text-gray-600">{description}</p>
          )}
          <div className="mx-auto mt-4 h-0.5 w-48 bg-accent" />
        </div>
      )}

      {/* Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="animate-fade-in-up"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <MenuItemCard item={item} />
          </div>
        ))}
      </div>
    </section>
  );
}

interface MenuByCategoryProps {
  categoriesWithItems: CategoryWithItemsDto[];
  isLoading?: boolean;
}

export function MenuByCategory({ categoriesWithItems, isLoading }: MenuByCategoryProps) {
  if (isLoading) {
    return (
      <div className="space-y-12">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <div className="mb-2 h-10 w-64 animate-shimmer rounded" />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <MenuItemCardSkeleton key={j} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {categoriesWithItems.map((categoryWithItems) => (
        <section key={categoryWithItems.id} className="scroll-mt-32" id={`category-${categoryWithItems.id}`}>
          <MenuGrid
            items={categoryWithItems.items}
            title={categoryWithItems.name}
            description={categoryWithItems.description || undefined}
          />
        </section>
      ))}
    </div>
  );
}
