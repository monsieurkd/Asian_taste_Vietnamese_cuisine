import { Link, useSearchParams } from 'react-router-dom';
import type { CategoryDto } from '@/types/menu';

interface CategoryNavProps {
  categories: CategoryDto[];
  popularCount?: number;
}

const categoryIcons: Record<string, string> = {
  'Most Popular': '🏆',
  'Popular': '🏆',
  'Noodle': '🍜',
  'Noodle Soup': '🍜',
  'Pho': '🍜',
  'Rice': '🍚',
  'Rice Bowl': '🍚',
  'Banh Mi': '🥖',
  'Starters': '🥢',
  'Appetizer': '🥢',
  'Drinks': '🥤',
  'Beverage': '🥤',
  'Dessert': '🍨',
};

function getCategoryIcon(name: string): string {
  // Check for exact match first
  if (categoryIcons[name]) {
    return categoryIcons[name];
  }

  // Check for partial match
  for (const [key, icon] of Object.entries(categoryIcons)) {
    if (name.toLowerCase().includes(key.toLowerCase())) {
      return icon;
    }
  }

  return '🍽️';
}

export function CategoryNav({ categories, popularCount = 0 }: CategoryNavProps) {
  const [searchParams] = useSearchParams();
  const activeCategory = searchParams.get('category');
  const activePopular = searchParams.get('popular') === 'true';

  const navItems = [
    { id: 'popular', name: 'Popular', icon: '🏆', count: popularCount },
    ...categories.map((c) => ({
      id: c.id,
      name: c.name,
      icon: getCategoryIcon(c.name),
      count: c.itemCount,
    })),
  ];

  const isActive = (id: string | number) => {
    if (id === 'popular') return activePopular;
    return activeCategory === String(id);
  };

  return (
    <nav className="sticky top-14 z-40 bg-cream border-b border-tan md:top-18">
      <div className="mx-auto max-w-7xl">
        {/* Desktop - Horizontal scroll */}
        <div className="hidden md:flex items-center gap-1 overflow-x-auto pl-6 pr-4 scrollbar-hide scroll-smooth snap-x snap-mandatory">
          <Link
            to="/menu"
            className={`snap-start flex items-center gap-2 px-5 py-4 text-sm font-medium transition-all border-b-3 whitespace-nowrap ${
              !activeCategory && !activePopular
                ? 'text-primary border-primary'
                : 'text-gray-600 border-transparent hover:text-primary hover:bg-tan'
            }`}
          >
            <span>All</span>
          </Link>
          {navItems.map((item) => (
            <Link
              key={item.id}
              to={item.id === 'popular' ? '/menu?popular=true' : `/menu?category=${item.id}`}
              className={`snap-start flex items-center gap-2 px-5 py-4 text-sm font-medium transition-all border-b-3 whitespace-nowrap ${
                isActive(item.id)
                  ? 'text-primary border-primary'
                  : 'text-gray-600 border-transparent hover:text-primary hover:bg-tan'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.name}</span>
              {item.count > 0 && (
                <span className="ml-1 rounded-full bg-tan px-2 py-0.5 text-xs">
                  {item.count}
                </span>
              )}
            </Link>
          ))}
        </div>

        {/* Mobile - Horizontal scroll */}
        <div className="md:hidden">
          <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-hide">
            <Link
              to="/menu"
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full whitespace-nowrap transition-colors ${
                !activeCategory && !activePopular
                  ? 'bg-primary text-white'
                  : 'bg-white text-gray-600'
              }`}
            >
              <span>All</span>
            </Link>
            {navItems.map((item) => (
              <Link
                key={item.id}
                to={item.id === 'popular' ? '/menu?popular=true' : `/menu?category=${item.id}`}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full whitespace-nowrap transition-colors ${
                  isActive(item.id)
                    ? 'bg-primary text-white'
                    : 'bg-white text-gray-600'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .border-b-3 {
          border-bottom-width: 3px;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </nav>
  );
}
