import { useCallback, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { XCircleIcon, ClockIcon, CreditCardIcon, BanknotesIcon } from '@heroicons/react/24/outline';
import { checkoutApi } from '@/api/checkoutApi';
import { useCheckoutStore } from '@/stores/checkoutStore';
import { useCartStore } from '@/stores/cartStore';
import { useCustomerAuthStore } from '@/stores/customerAuthStore';
import type { OrderDetailResponse } from '@/types/menu';
import type { PendingOrderData } from '@/stores/checkoutStore';
import { format, differenceInSeconds } from 'date-fns';
import { CreateAccountModal } from '@/components/checkout/CreateAccountModal';

type ConfirmationState = 'loading' | 'success' | 'error';

// Order status flow
const ORDER_STATUS_FLOW: OrderStatus[] = ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Completed'];
type OrderStatus = 'Pending' | 'Confirmed' | 'Preparing' | 'Ready' | 'Completed';

export function ConfirmationPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const navigate = useNavigate();
  const { pendingOrder, clearPendingOrder, setLastOrderNumber, stripePaymentIntentId, clearStripeInfo } = useCheckoutStore();
  const { clearCart } = useCartStore();
  const { isAuthenticated } = useCustomerAuthStore();

  const [state, setState] = useState<ConfirmationState>('loading');
  const [order, setOrder] = useState<OrderDetailResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0); // in seconds
  const [showAccountPromptCard, setShowAccountPromptCard] = useState(true);

  // Track if order submission has started to prevent double submission in StrictMode
  // Also track if we've successfully submitted to prevent redirect on re-renders
  const isSubmitting = useRef(false);
  const hasSubmittedSuccessfully = useRef(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch order function. useCallback keeps it referentially stable so the
  // effects that call it can list it as a dependency without re-running.
  const fetchOrder = useCallback(async (orderNum: string) => {
    try {
      const data = await checkoutApi.getOrderByNumber(orderNum);
      setOrder(data);
      setState('success');
    } catch (err) {
      console.error('Failed to fetch order:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Order not found');
      setState('error');
    }
  }, []);

  const submitOrder = useCallback(async (pendingData: PendingOrderData) => {
    try {
      console.log('Submitting order:', pendingData);

      const response = await checkoutApi.createOrder({
        customerName: pendingData.customerName,
        customerPhone: pendingData.customerPhone,
        customerEmail: pendingData.customerEmail,
        orderType: pendingData.orderType,
        pickupTime: {
          type: pendingData.pickupTime.type,
          scheduledTime: pendingData.pickupTime.scheduledTime?.toISOString(),
        },
        specialInstructions: pendingData.specialInstructions,
        items: pendingData.items.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          specialInstructions: item.specialInstructions,
          selectedModifierIds: item.selectedModifierIds,
        })),
        paymentMethod: pendingData.paymentMethod,
        // Include Stripe payment intent ID if available
        paymentToken: stripePaymentIntentId || undefined,
        paymentIntentId: stripePaymentIntentId || undefined,
        savePaymentMethod: pendingData.savePaymentMethod,
        createAccount: pendingData.createAccount,
        password: pendingData.password,
      });

      console.log('Order created - full response:', JSON.stringify(response));
      console.log('OrderNumber value:', response.orderNumber);
      console.log('OrderNumber type:', typeof response.orderNumber);

      // Check if orderNumber exists
      if (!response.orderNumber) {
        throw new Error('Order number is missing from response');
      }

      // Mark that we've successfully submitted - this prevents redirect on re-render
      hasSubmittedSuccessfully.current = true;

      // Clear the pending order, cart, and Stripe info
      clearPendingOrder();
      clearCart();
      clearStripeInfo();
      setLastOrderNumber(response.orderNumber);

      // Fetch the full order details
      const orderDetails = await checkoutApi.getOrderByNumber(response.orderNumber);
      console.log('Order details fetched:', orderDetails);
      setOrder(orderDetails);

      // Update URL with order number (for refresh/back button support)
      window.history.replaceState({}, '', `/confirmation/${response.orderNumber}`);

      setState('success');
    } catch (err: unknown) {
      console.error('Order creation failed:', err);
      const message = err instanceof Error ? err.message : 'Failed to place order. Please try again.';
      setErrorMessage(message);
      setState('error');
      // Reset submission flag on error so user can retry
      isSubmitting.current = false;
    }
  }, [stripePaymentIntentId, clearPendingOrder, clearCart, clearStripeInfo, setLastOrderNumber]);

  useEffect(() => {
    // If we have an orderNumber in URL, fetch the existing order
    if (orderNumber) {
      fetchOrder(orderNumber);
      return;
    }

    // Otherwise, check if we have a pending order to submit
    if (pendingOrder && !isSubmitting.current) {
      isSubmitting.current = true;
      submitOrder(pendingOrder);
      return;
    }

    // No order number and no pending order - redirect to menu
    // BUT don't redirect if we're in the middle of processing a submission
    if (!pendingOrder && !orderNumber && !isSubmitting.current && !hasSubmittedSuccessfully.current) {
      navigate('/menu');
    }
  }, [orderNumber, pendingOrder, navigate, fetchOrder, submitOrder]);

  // Poll for order status updates every 10 seconds.
  // Polling is active whenever there is an order number and the order has not
  // reached a terminal state — derived, not stored.
  const isPolling = !!orderNumber && order?.status !== 'Completed' && order?.status !== 'Cancelled';

  useEffect(() => {
    if (!orderNumber || !isPolling) return;

    pollIntervalRef.current = setInterval(() => {
      fetchOrder(orderNumber);
    }, 10000); // Poll every 10 seconds

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [orderNumber, isPolling, fetchOrder]);

  // Update countdown timer every second.
  // `isPolling` is DERIVED from the order status rather than held in state, so
  // this effect does not setState (which would cascade a render).
  useEffect(() => {
    if (!order) return;

    // Stop polling once the order reaches a terminal state.
    if (order.status === 'Completed' || order.status === 'Cancelled') {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    }

    // Update countdown
    const updateTimeRemaining = () => {
      const now = new Date();
      const readyTime = new Date(order.estimatedReadyTime);
      const secondsLeft = Math.max(0, differenceInSeconds(readyTime, now));
      setTimeRemaining(secondsLeft);
    };

    updateTimeRemaining();
    const timer = setInterval(updateTimeRemaining, 1000);

    return () => clearInterval(timer);
  }, [order]);


  // Format remaining time
  const formatTimeRemaining = (seconds: number): string => {
    if (seconds <= 0) return 'Ready soon!';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  // Get status color and icon
  const getStatusInfo = (status: OrderStatus) => {
    switch (status) {
      case 'Pending':
        return { color: 'text-yellow-600', bg: 'bg-yellow-100', icon: '⏳', label: 'Pending' };
      case 'Confirmed':
        return { color: 'text-blue-600', bg: 'bg-blue-100', icon: '✓', label: 'Confirmed' };
      case 'Preparing':
        return { color: 'text-orange-600', bg: 'bg-orange-100', icon: '👨‍🍳', label: 'Preparing' };
      case 'Ready':
        return { color: 'text-green-600', bg: 'bg-green-100', icon: '🔔', label: 'Ready!' };
      case 'Completed':
        return { color: 'text-gray-600', bg: 'bg-gray-100', icon: '✓', label: 'Completed' };
      default:
        return { color: 'text-gray-600', bg: 'bg-gray-100', icon: '?', label: status };
    }
  };


  const handleRetry = () => {
    isSubmitting.current = false;
    navigate('/checkout');
  };

  const handleBackToMenu = () => {
    navigate('/menu');
  };

  // Loading state
  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-cream">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-secondary">Placing Your Order...</h2>
          <p className="text-gray-600 mt-2">Please don't close this window</p>
        </div>
      </div>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-cream">
        <div className="max-w-md mx-auto px-4 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100 mb-4">
            <XCircleIcon className="w-12 h-12 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-secondary mb-2">Order Failed</h1>
          <p className="text-gray-600 mb-6">{errorMessage}</p>
          <div className="flex gap-3">
            <button
              onClick={handleRetry}
              className="flex-1 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition"
            >
              Try Again
            </button>
            <button
              onClick={handleBackToMenu}
              className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Back to Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (!order) {
    return null;
  }

  const estimatedReady = new Date(order.estimatedReadyTime);
  const statusInfo = getStatusInfo(order.status as OrderStatus);

  return (
    <div className="min-h-screen bg-cream pb-20">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Success Header - changes based on status */}
        <div className="text-center mb-8">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full ${statusInfo.bg} mb-4`}>
            <span className="text-4xl">{statusInfo.icon}</span>
          </div>
          <h1 className="text-3xl font-bold text-secondary">
            {order.status === 'Ready' ? 'Your Order is Ready!' : 'Order Confirmed!'}
          </h1>
          <p className="text-gray-600 mt-2">
            {order.status === 'Ready' ? 'Please come pick up your order' : 'Your order has been placed successfully'}
          </p>
        </div>

        {/* Order Number Card */}
        <div className="card p-6 mb-6 text-center">
          <p className="text-sm text-gray-600">Order Number</p>
          <p className="text-3xl font-bold text-primary">{order.orderNumber}</p>
        </div>

        {/* Live Order Status Tracker */}
        <div className="card p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-secondary">Order Status</h2>
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${statusInfo.bg} ${statusInfo.color}`}>
              <span>{statusInfo.icon}</span>
              <span className="font-medium">{statusInfo.label}</span>
            </div>
          </div>

          {/* Status Progress Bar */}
          <div className="relative">
            {/* Progress line background */}
            <div className="absolute top-1/2 left-0 right-0 h-1 bg-gray-200 -translate-y-1/2 rounded"></div>

            {/* Status steps */}
            <div className="relative flex justify-between">
              {ORDER_STATUS_FLOW.slice(0, 4).map((status, index) => {
                const isComplete = ORDER_STATUS_FLOW.indexOf(order.status as OrderStatus) >= index;
                const isCurrent = order.status === status;

                return (
                  <div key={status} className="flex flex-col items-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium z-10 transition-all duration-300 ${
                        isComplete
                          ? 'bg-primary text-white'
                          : isCurrent
                          ? 'bg-primary text-white ring-4 ring-primary/30'
                          : 'bg-white border-2 border-gray-300 text-gray-400'
                      }`}
                    >
                      {isComplete ? '✓' : index + 1}
                    </div>
                    <span
                      className={`text-xs mt-2 font-medium ${
                        isComplete || isCurrent ? 'text-secondary' : 'text-gray-400'
                      }`}
                    >
                      {status === 'Pending' && 'Pending'}
                      {status === 'Confirmed' && 'Confirmed'}
                      {status === 'Preparing' && 'Preparing'}
                      {status === 'Ready' && 'Ready'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Countdown Timer */}
          {order.status !== 'Ready' && order.status !== 'Completed' && (
            <div className="mt-6 p-4 bg-gradient-to-r from-primary/10 to-accent/10 rounded-lg">
              <div className="flex items-center justify-center gap-3">
                <ClockIcon className="w-6 h-6 text-primary" />
                <div className="text-center">
                  <p className="text-sm text-gray-600">Estimated time remaining</p>
                  <p className="text-2xl font-bold text-primary">{formatTimeRemaining(timeRemaining)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Ready message */}
          {order.status === 'Ready' && (
            <div className="mt-6 p-4 bg-green-50 rounded-lg text-center">
              <p className="text-lg font-semibold text-green-700">🎉 Your order is ready for pickup!</p>
              <p className="text-sm text-green-600 mt-1">Please come to the counter</p>
            </div>
          )}
        </div>

        {/* Estimated Ready Time (as backup info) */}
        <div className="card p-6 mb-6">
          <h2 className="font-semibold mb-2 text-secondary">Estimated Ready Time</h2>
          <p className="text-2xl font-semibold text-primary">
            {format(estimatedReady, 'h:mm a')}
          </p>
          <p className="text-gray-600 text-sm mt-1">
            {format(estimatedReady, 'EEEE, MMMM d')}
          </p>
        </div>

        {/* Order Details */}
        <div className="card p-6 mb-6">
          <h2 className="font-semibold mb-4 text-secondary">Order Details</h2>

          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Items</span>
              <span>{order.items.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Order Type</span>
              <span>{order.orderType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Total</span>
              <span className="font-semibold text-secondary">${order.total.toFixed(2)}</span>
            </div>
          </div>

          {/* Items List */}
          <div className="mt-4 pt-4 border-t border-tan">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm py-1">
                <span>{item.quantity}x {item.menuItemName}</span>
                <span>${(item.quantity * item.unitPrice).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Status Card */}
        <div className="card p-6 mb-6">
          <h2 className="font-semibold mb-4 text-secondary">Payment Status</h2>
          <div className={`flex items-center gap-3 p-4 rounded-lg ${
            order.paymentMethod === 'Card' && !order.paidAmount
              ? 'bg-blue-50'
              : order.paymentMethod === 'Card'
                ? 'bg-green-50'
                : 'bg-yellow-50'
          }`}>
            {order.paymentMethod === 'Card' ? (
              <CreditCardIcon className="w-8 h-8 text-primary" />
            ) : (
              <BanknotesIcon className="w-8 h-8 text-primary" />
            )}
            <div className="flex-1">
              <p className="font-medium text-secondary">
                {order.paymentMethod === 'Card' ? 'Card Payment' : 'Cash on Pickup'}
              </p>
              <p className="text-sm text-gray-600">
                {order.paymentMethod === 'Card'
                  ? order.paidAmount
                    ? `Paid $${order.paidAmount.toFixed(2)}`
                    : 'Processing payment...'
                  : `Pay $${order.total.toFixed(2)} when picking up`}
              </p>
            </div>
            {order.paymentMethod === 'Card' && order.paidAmount && (
              <span className="text-green-600 text-2xl">✓</span>
            )}
            {order.paymentMethod === 'Card' && !order.paidAmount && (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            )}
            {order.paymentMethod === 'Cash' && (
              <span className="text-yellow-600 text-2xl">💵</span>
            )}
          </div>
        </div>

        {/* Account Creation Prompt */}
        {showAccountPromptCard && !isAuthenticated && (
          <div className="bg-gradient-to-r from-primary/10 to-accent/10 border border-accent rounded-lg p-6 mb-6">
            <h3 className="font-semibold mb-2 text-secondary">Save Your Information</h3>
            <p className="text-sm text-gray-600 mb-4">
              Want to save your details for faster checkout next time?
            </p>

            <div className="bg-white rounded-lg p-4 mb-4">
              <p className="text-sm font-medium text-secondary">Your account will include:</p>
              <ul className="text-sm text-gray-600 mt-2 space-y-1">
                <li>• Email: {order.customerEmail}</li>
                <li>• Order history (starting with #{order.orderNumber})</li>
                <li>• Saved order preferences</li>
                <li>• Faster checkout next time</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowAccountPromptCard(false)}
                className="flex-1 px-4 py-2 border border-tan rounded-lg hover:bg-cream transition"
              >
                No thanks
              </button>
              <button
                type="button"
                onClick={() => setShowAccountModal(true)}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition font-medium"
              >
                Create Account
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleBackToMenu}
            className="flex-1 px-6 py-3 border border-tan rounded-lg hover:bg-cream text-center transition"
          >
            Order Again
          </button>
          <button
            onClick={handleBackToMenu}
            className="flex-1 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 text-center transition"
          >
            Back to Menu
          </button>
        </div>
      </div>

      {/* Account Creation Modal */}
      <CreateAccountModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        orderNumber={order.orderNumber}
        customerEmail={order.customerEmail}
        customerName={order.customerName}
      />
    </div>
  );
}
