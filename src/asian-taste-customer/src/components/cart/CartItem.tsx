import { Link } from 'react-router-dom';
import {
  TrashIcon,
  MinusIcon,
  PlusIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';
import { useCartStore } from '@/stores/cartStore';
import type { CartItem as CartItemType } from '@/types/menu';

interface CartItemProps {
  item: CartItemType;
}

export function CartItem({ item }: CartItemProps) {
  const { updateQuantity, removeItem } = useCartStore();

  const handleQuantityChange = (newQuantity: number) => {
    updateQuantity(item.id, newQuantity);
  };

  const handleRemove = () => {
    removeItem(item.id);
  };

  const itemTotal = item.basePrice * item.quantity;

  return (
    <div className="card flex gap-4 p-4">
      {/* Item Image */}
      <Link
        to={`/cart/edit/${item.id}`}
        className="relative shrink-0"
      >
        <div className="h-24 w-24 overflow-hidden rounded-lg bg-tan">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              <svg
                className="h-10 w-10"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
          )}
        </div>
      </Link>

      {/* Item Details */}
      <div className="flex flex-1 flex-col">
        {/* Header: Name and Edit button */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <Link
              to={`/cart/edit/${item.id}`}
              className="text-lg font-semibold text-secondary hover:text-primary transition-colors"
            >
              {item.name}
            </Link>
            {item.quantity > 1 && (
              <span className="ml-2 text-sm text-gray-500">× {item.quantity}</span>
            )}
          </div>
          <Link
            to={`/cart/edit/${item.id}`}
            className="shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-cream hover:text-primary transition-colors"
            aria-label="Edit item"
          >
            <PencilIcon className="h-4 w-4" />
          </Link>
        </div>

        {/* Modifiers */}
        {item.modifiers && item.modifiers.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {item.modifiers.map((modifier) => (
              <span
                key={modifier.id}
                className="inline-flex items-center gap-1 rounded-full bg-cream px-2 py-0.5 text-xs text-gray-600"
              >
                {modifier.name}
                {modifier.priceAdjustment > 0 && (
                  <span className="text-gray-500">
                    +${modifier.priceAdjustment.toFixed(2)}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Special Instructions */}
        {item.specialInstructions && (
          <p className="mt-2 text-sm text-gray-500 italic">
            "{item.specialInstructions}"
          </p>
        )}

        {/* Footer: Quantity, Price, Remove */}
        <div className="mt-auto flex items-center justify-between pt-2">
          {/* Quantity Selector */}
          <div className="flex items-center rounded-lg border-2 border-tan bg-white">
            <button
              onClick={() => handleQuantityChange(item.quantity - 1)}
              className="rounded-l-lg p-2 text-gray-600 hover:bg-cream hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Decrease quantity"
              disabled={item.quantity <= 1}
            >
              <MinusIcon className="h-4 w-4" />
            </button>
            <span className="w-10 text-center font-semibold text-secondary">
              {item.quantity}
            </span>
            <button
              onClick={() => handleQuantityChange(item.quantity + 1)}
              className="rounded-r-lg p-2 text-gray-600 hover:bg-cream hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Increase quantity"
              disabled={item.quantity >= 10}
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Price */}
          <div className="text-right">
            <p className="text-lg font-bold text-primary">
              ${itemTotal.toFixed(2)}
            </p>
            {item.quantity > 1 && (
              <p className="text-xs text-gray-500">
                ${item.basePrice.toFixed(2)} each
              </p>
            )}
          </div>

          {/* Remove Button */}
          <button
            onClick={handleRemove}
            className="shrink-0 rounded-full p-2 text-gray-400 hover:bg-red-50 hover:text-error transition-colors"
            aria-label="Remove item"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
