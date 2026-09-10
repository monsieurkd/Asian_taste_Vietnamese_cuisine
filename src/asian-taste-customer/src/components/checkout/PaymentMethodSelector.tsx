import { CreditCardIcon, BanknotesIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useCheckoutStore } from '@/stores/checkoutStore';
import type { FC } from 'react';
import { useState } from 'react';
import type { PaymentMethod } from '@/types/menu';
import { StripeCardPaymentForm, type StripePaymentResult } from './StripeCardPaymentForm';
import { paymentApi } from '@/api/paymentApi';

interface PaymentMethodSelectorProps {
  orderTotal: number;
  onSubmit: () => void;
  onBack: () => void;
  isLoading?: boolean;
}

export const PaymentMethodSelector: FC<PaymentMethodSelectorProps> = ({
  orderTotal,
  onSubmit,
  onBack,
  isLoading = false,
}) => {
  const {
    paymentMethod,
    setPaymentMethod,
    customerEmail,
    setStripeClientSecret,
    stripeClientSecret,
  } = useCheckoutStore();

  const [showCardForm, setShowCardForm] = useState(false);
  const [cardProcessing, setCardProcessing] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  const initializeCardPayment = async () => {
    setCardProcessing(true);
    setCardError(null);
    try {
      const result = await paymentApi.createPaymentIntent({
        amount: orderTotal,
        currency: 'aud',
        customerEmail: customerEmail || undefined,
      });

      if (result.success && result.clientSecret && result.paymentIntentId) {
        setStripeClientSecret(result.clientSecret, result.paymentIntentId);
        setShowCardForm(true);
        return true;
      } else {
        setCardError(result.errorMessage || 'Failed to initialize payment. Please try again.');
        return false;
      }
    } catch {
      setCardError('Failed to connect to payment service. Please try again.');
      return false;
    } finally {
      setCardProcessing(false);
    }
  };

  const handleSelectPayment = async (method: PaymentMethod) => {
    setPaymentMethod(method);
    setCardError(null);

    if (method === 'Card') {
      // Create payment intent before showing card form
      await initializeCardPayment();
    } else {
      setShowCardForm(false);
    }
  };

  const handleStripePayment = async (result: StripePaymentResult) => {
    setCardProcessing(true);
    try {
      if (result.success) {
        // Payment succeeded - submit order
        onSubmit();
      } else {
        setCardError(result.error || 'Payment failed. Please try again.');
      }
    } finally {
      setCardProcessing(false);
    }
  };

  const handleBackFromCardForm = () => {
    setShowCardForm(false);
    setCardError(null);
  };

  const handleSubmitOrContinue = async () => {
    // For Card payment, we need to show the card form first
    if (paymentMethod === 'Card' && !showCardForm) {
      const success = await initializeCardPayment();
      if (success) {
        // Card form will show, user will complete payment there
        return;
      }
      // If initialization failed, error is already set
      return;
    }
    // For Cash payment or after card form is shown, proceed with submit
    onSubmit();
  };

  // If showing card form, render StripeCardPaymentForm
  if (showCardForm && stripeClientSecret) {
    return (
      <div className="space-y-6">
        {/* Header with back button */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackFromCardForm}
            disabled={isLoading || cardProcessing}
            className="p-2 rounded-lg hover:bg-cream disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <ArrowLeftIcon className="w-6 h-6 text-secondary" />
          </button>
          <h2 className="text-2xl font-bold text-secondary">Card Payment Details</h2>
        </div>

        {/* Error Message */}
        {cardError && (
          <div className="p-4 bg-error/10 border border-error rounded-lg">
            <p className="text-error">{cardError}</p>
          </div>
        )}

        {/* Stripe Card Payment Form */}
        <StripeCardPaymentForm
          clientSecret={stripeClientSecret}
          isLoading={isLoading || cardProcessing}
          onSubmit={handleStripePayment}
          orderAmount={orderTotal}
        />

        {/* Security Notice */}
        <div className="flex items-center gap-2 p-4 bg-cream/50 rounded-lg text-center justify-center">
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 0 0 0 2-2V6a2 2 0 0 0 0-2-2H6a2 2 0 0 0 0-2 2v12a2 2 0 0 0 0 2 2h12a2 2 0 0 0 0 2-2v-6a2 2 0 0 0 0-2-2z" />
          </svg>
          <p className="text-sm text-gray-600">
            Secured by Stripe. Your payment information is safe and PCI compliant.
          </p>
        </div>
      </div>
    );
  }

  // Default payment method selection view
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-secondary">Select Payment Method</h2>

      {/* Error Message */}
      {cardError && (
        <div className="p-4 bg-error/10 border border-error rounded-lg">
          <p className="text-error">{cardError}</p>
        </div>
      )}

      {/* Card Payment */}
      <button
        onClick={() => handleSelectPayment('Card')}
        disabled={isLoading || cardProcessing}
        className={`w-full p-4 rounded-lg border-2 text-left transition disabled:opacity-50 disabled:cursor-not-allowed ${
          paymentMethod === 'Card'
            ? 'border-primary bg-primary/5'
            : 'border-tan hover:border-gray-300'
        }`}
      >
        <div className="flex items-start">
          <CreditCardIcon className="w-6 h-6 mt-1 mr-3 text-primary" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-secondary">Pay Online (Card)</span>
              {paymentMethod === 'Card' && (
                <span className="text-sm text-success font-medium">SELECTED</span>
              )}
            </div>
            <ul className="mt-2 text-sm text-gray-600 space-y-1">
              <li>✓ Secure payment via Stripe</li>
              <li>✓ Immediate confirmation</li>
              <li>✓ Supports Apple Pay, Google Pay, and all major cards</li>
              <li>✓ Skip the line when picking up</li>
            </ul>
          </div>
        </div>
      </button>

      {/* Cash Payment */}
      <button
        onClick={() => handleSelectPayment('Cash')}
        disabled={isLoading || cardProcessing}
        className={`w-full p-4 rounded-lg border-2 text-left transition disabled:opacity-50 disabled:cursor-not-allowed ${
          paymentMethod === 'Cash'
            ? 'border-primary bg-primary/5'
            : 'border-tan hover:border-gray-300'
        }`}
      >
        <div className="flex items-start">
          <BanknotesIcon className="w-6 h-6 mt-1 mr-3 text-primary" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-secondary">Pay Cash at Restaurant</span>
              {paymentMethod === 'Cash' && (
                <span className="text-sm text-success font-medium">SELECTED</span>
              )}
            </div>
            <ul className="mt-2 text-sm text-gray-600 space-y-1">
              <li>✓ No payment information required</li>
              <li>✓ Pay when you pick up your order</li>
              <li>⚠ Cash only - please have change ready</li>
            </ul>
            <p className="mt-2 text-xs text-gray-500">
              Note: Your order will be prepared but requires payment on arrival
            </p>
          </div>
        </div>
      </button>

      {/* Order Summary */}
      <div className="card p-6">
        <h3 className="font-semibold text-secondary mb-4">Order Summary</h3>
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Total Amount</span>
          <span className="text-2xl font-bold text-primary">
            ${orderTotal.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          disabled={isLoading || cardProcessing}
          className="px-6 py-3 border border-tan rounded-lg hover:bg-cream disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          Back
        </button>
        <button
          onClick={handleSubmitOrContinue}
          disabled={isLoading || cardProcessing}
          className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {cardProcessing ? 'Processing...' : paymentMethod === 'Cash' ? `Place Order - $${orderTotal.toFixed(2)}` : 'Continue to Payment'}
        </button>
      </div>
    </div>
  );
};
