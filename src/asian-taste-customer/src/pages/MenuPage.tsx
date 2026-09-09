import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { CategoryNav } from '@/components/layout/CategoryNav';
import { MenuGrid } from '@/components/menu/MenuGrid';
import { MenuByCategory } from '@/components/menu/MenuGrid';
import { menuApi } from '@/api/menuApi';

export function MenuPage() {
  const [searchParams] = useSearchParams();
  const categoryId = searchParams.get('category');
  const showPopular = searchParams.get('popular') === 'true';

  // Fetch categories for navigation
  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => menuApi.getCategories(),
  });

  // Fetch full menu or filtered by category
  const { data: fullMenu, isLoading: menuLoading } = useQuery({
    queryKey: ['menu'],
    queryFn: () => menuApi.getFullMenu(),
    enabled: !categoryId && !showPopular,
  });

  const { data: categoryItems, isLoading: categoryItemsLoading } = useQuery({
    queryKey: ['category-items', categoryId],
    queryFn: () => menuApi.getItemsByCategory(parseInt(categoryId!)),
    enabled: !!categoryId,
  });

  const { data: popularItems, isLoading: popularLoading } = useQuery({
    queryKey: ['popular-items'],
    queryFn: () => menuApi.getPopularItems(),
    enabled: showPopular,
  });

  // Determine what to display
  const isLoading = categoriesLoading || menuLoading || categoryItemsLoading || popularLoading;

  // Get current category name
  const currentCategory = categories?.find((c) => c.id === parseInt(categoryId || '0'));

  // Render content based on current view
  const renderContent = () => {
    if (showPopular) {
      return (
        <MenuGrid
          items={popularItems ?? []}
          title="Popular Items"
          description="Our customer favorites"
          isLoading={popularLoading}
        />
      );
    }

    if (categoryId && currentCategory) {
      return (
        <MenuGrid
          items={categoryItems ?? []}
          title={currentCategory.name}
          description={currentCategory.description || undefined}
          isLoading={categoryItemsLoading}
        />
      );
    }

    if (!categoryId && !showPopular && fullMenu) {
      // Show all menu items by category
      return <MenuByCategory categoriesWithItems={fullMenu.categories} isLoading={isLoading} />;
    }

    return <MenuGrid items={[]} isLoading={isLoading} />;
  };

  return (
    <div className="min-h-screen bg-cream pb-16">
      {categories && <CategoryNav categories={categories} />}
      {renderContent()}
    </div>
  );
}
