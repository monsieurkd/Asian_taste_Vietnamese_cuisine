import { Link } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ShoppingBagIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useCartStore } from '@/stores/cartStore';
import { CartItem } from '@/components/cart/CartItem';
import { CartSummary } from '@/components/cart/CartSummary';

export function CartPage() {
  const { items, clearCart } = useCartStore();
  const isEmpty = items.length === 0;

  const handleClearCart = () => {
    if (window.confirm('Are you sure you want to clear your cart?')) {
      clearCart();
    }
  };

  return (
    <div className="min-h-screen bg-cream">
      {/* Page Header */}
      <div className="bg-white border-b border-tan">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link
              to="/menu"
              className="rounded-full p-2 text-gray-600 hover:bg-cream hover:text-primary transition-colors"
            >
              <ArrowLeftIcon className="h-6 w-6" />
            </Link>
            <h1 className="text-2xl font-bold text-secondary">
              Your Cart
            </h1>
            {items.length > 0 && (
              <span className="ml-2 rounded-full bg-primary px-3 py-1 text-sm font-semibold text-white">
                {items.reduce((sum, item) => sum + item.quantity, 0)} items
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {isEmpty ? (
          /* Empty Cart State */
          <div className="mx-auto max-w-md py-16 text-center">
            <div className="mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-full bg-cream">
              <ShoppingBagIcon className="h-16 w-16 text-gray-400" />
            </div>
            <h2 className="text-2xl font-bold text-secondary">
              Your cart is empty
            </h2>
            <p className="mt-2 text-gray-600">
              Looks like you haven't added any items yet.
            </p>
            <Link
              to="/menu"
              className="btn-primary mt-6 inline-flex items-center gap-2"
            >
              Browse Our Menu
              <ArrowLeftIcon className="h-5 w-5 rotate-180" />
            </Link>
          </div>
        ) : (
          /* Cart with Items */
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Cart Items */}
            <div className="lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Review your items before checkout
                </p>
                {items.length > 1 && (
                  <button
                    onClick={handleClearCart}
                    className="flex items-center gap-1 text-sm font-medium text-error hover:text-red-700 transition-colors"
                  >
                    <XMarkIcon className="h-4 w-4" />
                    Clear Cart
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {items.map((item) => (
                  <CartItem key={item.id} item={item} />
                ))}
              </div>

              {/* Recommended Items - could be added later */}
              <div className="mt-8 rounded-lg border-2 border-dashed border-tan bg-cream p-6 text-center">
                <h3 className="font-semibold text-secondary">
                  Want to add more?
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  Check out our popular items or browse our full menu.
                </p>
                <Link
                  to="/menu?popular=true"
                  className="btn-secondary mt-4 inline-block"
                >
                  View Popular Items
                </Link>
              </div>
            </div>

            {/* Cart Summary - Sticky on Desktop */}
            <div className="lg:col-span-1">
              <div className="lg:sticky lg:top-24">
                <CartSummary />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Floating Cart Summary - Only when items exist */}
      {!isEmpty && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-tan bg-white p-4 shadow-lg md:hidden lg:hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total</p>
              <p className="text-xl font-bold text-primary">
                ${(items.reduce((sum, item) => sum + item.basePrice * item.quantity, 0) * 1.1).toFixed(2)}
              </p>
            </div>
            <Link
              to="/checkout"
              className="btn-primary flex items-center gap-2"
            >
              Checkout
              <ArrowLeftIcon className="h-5 w-5 rotate-180" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
