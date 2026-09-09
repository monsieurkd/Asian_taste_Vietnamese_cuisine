import { useCartStore } from '@/stores/cartStore';
import type { FC } from 'react';

const GST_RATE = 0.1; // 10% GST for Australia

export const CheckoutOrderSummary: FC = () => {
  const { items } = useCartStore();

  const subtotal = items.reduce((sum, item) => sum + item.basePrice * item.quantity, 0);
  const gst = subtotal * GST_RATE;
  const total = subtotal + gst;

  return (
    <div className="card p-6 sticky top-24">
      <h3 className="text-lg font-semibold mb-4 text-secondary">Order Summary</h3>

      {/* Items */}
      <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
        {items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm">
            <div className="flex-1">
              <span className="font-medium text-secondary">{item.quantity}x</span>
              <span className="ml-2 text-gray-700">{item.name}</span>
              {item.modifiers.length > 0 && (
                <div className="text-xs text-gray-500 ml-4">
                  {item.modifiers.map((m) => m.name).join(', ')}
                </div>
              )}
              {item.specialInstructions && (
                <div className="text-xs text-gray-500 ml-4 italic">
                  "{item.specialInstructions}"
                </div>
              )}
            </div>
            <span className="text-gray-700">${(item.basePrice * item.quantity).toFixed(2)}</span>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="border-t border-tan pt-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Subtotal</span>
          <span className="text-secondary">${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">GST (10%)</span>
          <span className="text-secondary">${gst.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-semibold text-lg pt-2 border-t border-tan">
          <span className="text-secondary">Total</span>
          <span className="text-primary">${total.toFixed(2)}</span>
        </div>
      </div>

      {/* Security Notice */}
      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500 pt-4 border-t border-tan">
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
    </div>
  );
};
