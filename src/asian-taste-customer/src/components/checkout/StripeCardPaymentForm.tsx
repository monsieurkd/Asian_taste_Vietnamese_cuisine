import { useState, useEffect } from 'react';
import type { FC } from 'react';
import {
  PaymentElement,
  LinkAuthenticationElement,
  useStripe,
  useElements,
  Elements,
} from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { LockClosedIcon } from '@heroicons/react/24/outline';

// Load Stripe outside of component to avoid recreating on every render
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_51T1mTlIIFhqfQ0ckyojjFBxoScpRXLU7tfb1rYNRIPGnVPXeHBt2RWzKG2ddF5xHd62oBqvewwObubYbBckZfmSi005STXaYNA');

export interface StripePaymentResult {
  success: boolean;
  paymentIntentId?: string;
  error?: string;
}

interface StripeCardPaymentFormProps {
  clientSecret: string;
  isLoading?: boolean;
  onSubmit: (result: StripePaymentResult) => void | Promise<void>;
  orderAmount: number;
}

/**
 * Inner form component that uses Stripe hooks
 * Must be rendered inside Elements provider
 */
const CheckoutForm: FC<
  Omit<StripeCardPaymentFormProps, 'clientSecret'>
> = ({ isLoading: externalLoading = false, onSubmit, orderAmount }) => {
  const stripe = useStripe();
  const elements = useElements();

  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Retrieve email from localStorage
  useEffect(() => {
    const storedEmail = localStorage.getItem('asian-taste-customer-email');
    if (storedEmail) {
      setEmail(storedEmail);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      // Stripe.js hasn't yet loaded
      setMessage('Payment system is still loading. Please wait...');
      return;
    }

    setIsProcessing(true);
    setMessage('');

    // Confirm the payment using Stripe.js
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // Make sure to change this to your payment completion page
        return_url: `${window.location.origin}/confirmation`,
        receipt_email: email || undefined,
      },
      redirect: 'if_required', // Handle redirect manually
    });

    if (error) {
      // Payment failed
      setMessage(error.message || 'An unexpected error occurred.');
      setIsProcessing(false);
      await onSubmit({
        success: false,
        error: error.message,
      });
    } else if (paymentIntent) {
      // Payment succeeded
      setIsProcessing(false);
      await onSubmit({
        success: true,
        paymentIntentId: paymentIntent.id,
      });
    }
  };

  const paymentElementOptions = {
    layout: 'tabs' as const,
  };

  return (
    <form id="payment-form" onSubmit={handleSubmit} className="space-y-6">
      {/* Email Link Authentication */}
      <LinkAuthenticationElement
        id="link-authentication-element"
        onChange={(e) => setEmail(e.value.email)}
        options={{
          defaultValues: {
            email: email,
          },
        }}
      />

      {/* Payment Element - includes card details, digital wallets, etc. */}
      <PaymentElement id="payment-element" options={paymentElementOptions} />

      {/* Error Message */}
      {message && (
        <div
          className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"
          id="payment-message"
        >
          {message}
        </div>
      )}

      {/* Submit Button */}
      <div className="pt-4">
        <button
          disabled={isProcessing || externalLoading || !stripe || !elements}
          id="submit"
          className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:bg-gray-400 disabled:cursor-not-allowed transition font-semibold text-lg"
        >
          <LockClosedIcon className="w-5 h-5" />
          {isProcessing ? 'Processing...' : `Pay $${orderAmount.toFixed(2)}`}
        </button>
      </div>

      {/* Security Notice */}
      <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span>Secured by Stripe. Your payment information is encrypted and secure.</span>
      </div>

      {/* Display Stripe security badge */}
      <div className="flex items-center justify-center gap-4 pt-2">
        <svg className="h-8" viewBox="0 0 60 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path fill="#635BFF" d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a10.3 10.3 0 0 1-4.56.97c-4.31 0-6.94-2.54-6.94-6.98 0-3.92 2.38-6.96 6.34-6.96 3.77 0 6.04 2.8 6.04 6.86 0 .38-.03.95-.07 1.19zm-5.93-5.8c-1.45 0-2.45.95-2.79 2.41h5.42c-.07-1.49-1.08-2.41-2.63-2.41zm-35.64 8.88V9.25c0-.94-.27-1.58-1.06-1.58-1.1 0-2.13 1.44-2.13 3.87v5.82h-4.1V9.25c0-.94-.27-1.58-1.06-1.58-1.1 0-2.13 1.44-2.13 3.87v5.82H3.5V4.65h3.96v.74c.7-.58 1.64-.9 2.82-.9 1.56 0 2.76.67 3.42 1.85.84-.74 2.06-1.85 4.02-1.85 2.42 0 3.86 1.4 3.86 4.13v8.48h-4.06zm21.75 0h-3.93v-.74c-.87.67-2.06 1-3.52 1-3.35 0-5.7-2.84-5.7-6.98 0-3.92 2.38-6.96 6.1-6.96 1.32 0 2.45.33 3.35.87V4.65h4.06v12.7h-.36zm-4.06-5.5c0-1.69-1.13-2.91-2.55-2.91-1.73 0-2.89 1.52-2.89 3.57 0 2.08 1.16 3.6 2.89 3.6 1.42 0 2.55-1.22 2.55-2.9v-1.36zm10.37-7.2h-4.06v12.7h4.06V4.66zm-2.03-2.6c-1.3 0-2.35-.97-2.35-2.17s1.05-2.17 2.35-2.17c1.3 0 2.35.97 2.35 2.17s-1.05 2.17-2.35 2.17z"/>
        </svg>
      </div>
    </form>
  );
};

/**
 * Main Stripe Card Payment Form Component
 * Wraps the checkout form in a new Elements provider with the specific client secret
 */
export const StripeCardPaymentForm: FC<StripeCardPaymentFormProps> = ({
  clientSecret,
  isLoading,
  onSubmit,
  orderAmount,
}) => {
  const [stripe, setStripe] = useState<typeof import('@stripe/stripe-js').Stripe | null>(null);

  useEffect(() => {
    stripePromise.then((stripeInstance) => {
      setStripe(stripeInstance);
    });
  }, []);

  if (!clientSecret) {
    return (
      <div className="p-6 bg-red-50 rounded-lg">
        <p className="text-red-600">Payment initialization failed. Please go back and try again.</p>
      </div>
    );
  }

  const options = {
    clientSecret,
    appearance: {
      theme: 'stripe' as const,
      variables: {
        colorPrimary: '#4A3728',
        colorBackground: '#ffffff',
        colorText: '#2D2D2D',
      },
    },
  };

  // Show loading while Stripe loads
  if (!stripe) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-3 text-gray-600">Loading secure payment form...</span>
      </div>
    );
  }

  return (
    <Elements stripe={stripe} options={options}>
      <CheckoutForm
        isLoading={isLoading}
        onSubmit={onSubmit}
        orderAmount={orderAmount}
      />
    </Elements>
  );
};
