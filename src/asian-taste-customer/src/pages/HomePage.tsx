import { useQuery } from '@tanstack/react-query';
import { Hero } from '@/components/layout/Hero';
import { CategoryNav } from '@/components/layout/CategoryNav';
import { MenuGrid } from '@/components/menu/MenuGrid';
import { menuApi } from '@/api/menuApi';

export function HomePage() {
  // Fetch categories for navigation
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => menuApi.getCategories(),
  });

  // Fetch popular items for featured section
  const { data: popularItems, isLoading: popularLoading } = useQuery({
    queryKey: ['popular-items'],
    queryFn: () => menuApi.getPopularItems(),
  });

  return (
    <div className="min-h-screen bg-cream">
      <Hero />

      {/* Order Type Selector */}
      <div className="border-b border-tan bg-white py-4">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex justify-center gap-2 sm:gap-4">
            <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white sm:px-6">
              <span>🚗</span>
              <span>Delivery</span>
            </button>
            <button className="flex items-center gap-2 rounded-lg bg-cream px-4 py-2 text-sm font-semibold text-secondary hover:bg-tan sm:px-6">
              <span>🏪</span>
              <span>Pickup</span>
            </button>
            <button className="hidden sm:flex items-center gap-2 rounded-lg bg-cream px-4 py-2 text-sm font-semibold text-secondary hover:bg-tan sm:px-6">
              <span>🍽️</span>
              <span>Dine In</span>
            </button>
          </div>
        </div>
      </div>

      {/* Category Navigation */}
      {categories && <CategoryNav categories={categories} />}

      {/* Popular Items Section */}
      <div className="border-b border-tan bg-white">
        <MenuGrid
          items={popularItems ?? []}
          title="Customer Favorites"
          description="Our most loved dishes, prepared fresh daily"
          isLoading={popularLoading}
        />
      </div>

      {/* Promotions Section */}
      <section className="bg-secondary py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-accent-red to-primary p-8 text-center text-white shadow-xl">
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl">🔥</span>
              <span className="text-xl font-bold">SUPER DEAL</span>
              <span className="text-2xl">🔥</span>
            </div>
            <h3 className="mt-4 text-2xl font-bold">2 Spring Rolls + 1 Drink</h3>
            <p className="mt-2 text-3xl font-bold">Only $5.20</p>
            <p className="mt-1 text-white/80">Limited time offer!</p>
            <button className="mt-6 rounded-full bg-white px-8 py-3 font-bold text-primary hover:bg-cream transition-colors">
              Add to Order
            </button>
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="bg-cream py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-secondary md:text-4xl">
            Ready to Order?
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Explore our full menu with authentic Vietnamese dishes
          </p>
          <a
            href="/menu"
            className="mt-8 inline-block btn-primary"
          >
            View Full Menu
          </a>
        </div>
      </section>
    </div>
  );
}
