import { Link } from 'react-router-dom';
import {
  FireIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { DishImage } from './DishImage';
import { useState } from 'react';
import { useCartStore } from '@/stores/cartStore';
import type { MenuItemSummaryDto } from '@/types/menu';

interface MenuItemCardProps {
  item: MenuItemSummaryDto;
}

export function MenuItemCard({ item }: MenuItemCardProps) {
  const [isAdding, setIsAdding] = useState(false);
  const cartQuantity = useCartStore((state) => state.getItemQuantity(item.id));
  const addItem = useCartStore((state) => state.addItem);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsAdding(true);
    addItem(item);
    setTimeout(() => setIsAdding(false), 300);
  };

  const getBadges = () => {
    const badges: React.ReactNode[] = [];

    // Right side badges (Popular, Spicy)
    if (item.isPopular) {
      badges.push(
        <span
          key="popular"
          className="badge-popular absolute right-2 top-2 flex h-6 items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg"
        >
          🏆 Popular
        </span>
      );
    }

    if (item.spicyLevel > 0) {
      badges.push(
        <span
          key="spicy"
          className={`badge-spicy absolute right-2 flex h-6 items-center gap-1 px-2 py-1 text-xs font-semibold rounded ${
            item.isPopular ? 'top-10' : 'top-2'
          }`}
        >
          <FireIcon className="h-3 w-3" />
          {'🌶️'.repeat(item.spicyLevel)}
        </span>
      );
    }

    // Left side badges (GF, Veg)
    if (item.isGlutenFree) {
      badges.push(
        <span
          key="gf"
          className="badge-gf absolute left-2 top-2 flex h-6 items-center px-2 py-1 text-xs font-semibold rounded"
        >
          GF
        </span>
      );
    }

    if (item.isVegetarian) {
      badges.push(
        <span
          key="veg"
          className={`absolute left-2 flex h-6 items-center gap-1 px-2 py-1 text-xs font-semibold rounded bg-green-600 text-white ${
            item.isGlutenFree ? 'top-10' : 'top-2'
          }`}
        >
          🥬 Veg
        </span>
      );
    }

    return badges;
  };

  return (
    <Link
      to={`/menu/item/${item.id}`}
      className="card card-hover flex h-full flex-col overflow-hidden group"
    >
      {/* Image Section — omitted entirely when the dish has no photo: the title
          sits directly below, so a placeholder would just repeat it.
          `w-full` is required: inside a flex column the aspect box would
          otherwise stretch to the row height instead of computing 16:9 from
          the card width. */}
      {item.imageUrl && (
        <div className="relative aspect-video w-full shrink-0">
          <DishImage
            src={item.imageUrl}
            name={item.name}
            className="absolute inset-0"
            imgClassName="transition-transform duration-300 group-hover:scale-105"
          />

          {/* Badges */}
          {getBadges()}
        </div>
      )}

      {/* Content Section */}
      <div className="p-4">
        {/* Badges also appear here when there is no image to overlay them on. */}
        {!item.imageUrl && getBadges()}

        {/* Title */}
        <h3 className="font-serif text-lg font-semibold text-secondary">
          {item.name}
        </h3>

        {/* Description */}
        {item.description && (
          <p className="mt-1 line-clamp-2 text-sm text-gray-600">
            {item.description}
          </p>
        )}

        {/* Price & Action */}
        <div className="mt-3 flex items-center justify-between">
          <span className="font-sans text-xl font-bold text-primary">
            ${item.basePrice.toFixed(2)}
          </span>

          <div className="flex items-center gap-2">
            {cartQuantity > 0 ? (
              <div className="flex items-center rounded-lg border-2 border-primary bg-cream">
                <span className="px-3 py-1 text-sm font-semibold text-primary">
                  {cartQuantity}
                </span>
              </div>
            ) : (
              <button
                onClick={handleAddToCart}
                disabled={isAdding || !item.isAvailable}
                className={`flex min-h-11 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                  isAdding
                    ? 'bg-success text-white'
                    : 'bg-primary text-white hover:bg-primary-dark'
                } ${!item.isAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isAdding ? (
                  <>
                    <ClockIcon className="h-4 w-4" />
                    Added
                  </>
                ) : (
                  'Add +'
                )}
              </button>
            )}
          </div>
        </div>

        {/* Modifier indicator */}
        {item.hasModifiers && (
          <p className="mt-2 text-xs text-gray-500">
            Customization options available
          </p>
        )}
      </div>
    </Link>
  );
}
