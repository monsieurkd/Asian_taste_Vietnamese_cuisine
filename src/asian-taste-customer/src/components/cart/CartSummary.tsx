import { Link } from 'react-router-dom';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { useCartStore } from '@/stores/cartStore';

interface CartSummaryProps {
  className?: string;
  showCheckoutButton?: boolean;
}

const GST_RATE = 0.1; // 10% GST for Australia

export function CartSummary({
  className = '',
  showCheckoutButton = true,
}: CartSummaryProps) {
  const { items, getSubtotal } = useCartStore();
  const subtotal = getSubtotal();
  const gst = subtotal * GST_RATE;
  const total = subtotal + gst;
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className={`card ${className}`}>
      <h2 className="text-lg font-semibold text-secondary">Order Summary</h2>

      {/* Items Count */}
      <div className="mt-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
          <span className="font-medium text-secondary">${subtotal.toFixed(2)}</span>
        </div>

        {/* Subtotal */}
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Subtotal</span>
          <span className="font-medium text-secondary">${subtotal.toFixed(2)}</span>
        </div>

        {/* GST */}
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">GST (10%)</span>
          <span className="font-medium text-secondary">${gst.toFixed(2)}</span>
        </div>

        {/* Divider */}
        <div className="border-t border-tan my-2" />

        {/* Total */}
        <div className="flex justify-between">
          <span className="font-semibold text-secondary">Total</span>
          <span className="text-xl font-bold text-primary">${total.toFixed(2)}</span>
        </div>
      </div>

      {/* Checkout Button */}
      {showCheckoutButton && itemCount > 0 && (
        <Link
          to="/checkout"
          className="btn-primary mt-6 flex w-full items-center justify-center gap-2 text-center"
        >
          Proceed to Checkout
          <ChevronRightIcon className="h-5 w-5" />
        </Link>
      )}

      {/* Continue Shopping Link */}
      {itemCount === 0 && (
        <Link
          to="/menu"
          className="btn-secondary mt-4 block w-full text-center"
        >
          Continue Shopping
        </Link>
      )}

      {/* Security Notice */}
      {itemCount > 0 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500">
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <span>Secure checkout powered by Lightspeed</span>
        </div>
      )}
    </div>
  );
}
