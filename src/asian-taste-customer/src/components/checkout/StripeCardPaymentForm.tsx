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
import type { Stripe } from '@stripe/stripe-js';
import { money } from '@/lib/site';

// Load Stripe outside of component to avoid recreating on every render
const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

if (!stripePublishableKey) {
  console.warn(
    'VITE_STRIPE_PUBLISHABLE_KEY is not set. Copy .env.example to .env.development and add your Stripe publishable key.'
  );
}

const stripePromise = loadStripe(stripePublishableKey ?? '');

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

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/**
 * The Stripe payment form.
 *
 * The Payment Element is the whole point: it renders whatever the Stripe
 * dashboard has enabled — card, Apple Pay, Google Pay — with no code change, and
 * `automatic_payment_methods` on the PaymentIntent is what lets it. A card-only
 * allow-list on the intent is what silently hides the wallets, so neither this
 * component nor the API restricts the method list.
 */
const CheckoutForm: FC<Omit<StripeCardPaymentFormProps, 'clientSecret'>> = ({
  isLoading: externalLoading = false,
  onSubmit,
  orderAmount,
}) => {
  const stripe = useStripe();
  const elements = useElements();

  // Read the stored email once, as the state's initial value — no effect needed.
  const [email, setEmail] = useState(
    () => (typeof window !== 'undefined' ? localStorage.getItem('asian-taste-customer-email') ?? '' : '')
  );
  const [message, setMessage] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      setMessage('Payment system is still loading. Please wait…');
      return;
    }

    setIsProcessing(true);
    setMessage('');

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/confirmation`,
        receipt_email: email || undefined,
      },
      redirect: 'if_required',
    });

    if (error) {
      setMessage(error.message || 'An unexpected error occurred.');
      setIsProcessing(false);
      await onSubmit({ success: false, error: error.message });
    } else if (paymentIntent) {
      setIsProcessing(false);
      await onSubmit({ success: true, paymentIntentId: paymentIntent.id });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="stack">
      <LinkAuthenticationElement
        onChange={(e) => setEmail(e.value.email)}
        options={{ defaultValues: { email } }}
      />

      <PaymentElement options={{ layout: 'tabs' }} />

      {message && (
        <p className="field-error" role="alert" id="payment-message">
          {message}
        </p>
      )}

      <button
        type="submit"
        className="btn btn-primary btn-block"
        disabled={isProcessing || externalLoading || !stripe || !elements}
      >
        <LockIcon />
        {isProcessing ? 'Processing…' : `Pay ${money(orderAmount)}`}
      </button>

      <p className="helpline" style={{ textAlign: 'center' }}>
        Secured by Stripe. Your card details never touch this site.
      </p>
    </form>
  );
};

/**
 * Stripe's `appearance` API takes literal colour strings — it cannot read a CSS
 * variable or a `color-mix()`. Rather than hardcode the palette a second time
 * (and let it drift from brand-spec), the three values are read back off the
 * document at mount, so this stays bound to the token block like everything
 * else.
 */
function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export const StripeCardPaymentForm: FC<StripeCardPaymentFormProps> = ({
  clientSecret,
  isLoading,
  onSubmit,
  orderAmount,
}) => {
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [failed, setFailed] = useState(false);

  // Resolve Stripe.js. The setState happens inside the promise callback, with a
  // cancellation guard so a late resolution after unmount cannot update state.
  useEffect(() => {
    let cancelled = false;
    stripePromise
      .then((instance) => {
        if (!cancelled) setStripe(instance);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!clientSecret || failed) {
    return (
      <div className="state-block error">
        <p>
          We couldn&rsquo;t start the payment form. Nothing has been charged — go back and try
          again.
        </p>
      </div>
    );
  }

  if (!stripe) {
    return (
      <div className="skeleton sk-line" style={{ height: 140 }} aria-label="Loading secure payment form" />
    );
  }

  return (
    <Elements
      stripe={stripe}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: readToken('--color-accent', '#8b3a3a'),
            colorBackground: readToken('--color-surface', '#ffffff'),
            colorText: readToken('--color-fg', '#3c2a21'),
            fontFamily: 'Manrope, system-ui, sans-serif',
          },
        },
      }}
    >
      <CheckoutForm isLoading={isLoading} onSubmit={onSubmit} orderAmount={orderAmount} />
    </Elements>
  );
};
