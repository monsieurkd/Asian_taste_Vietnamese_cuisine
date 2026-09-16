import { useState } from 'react';
import { paymentApi } from '@/api/paymentApi';
import { useCheckoutStore } from '@/stores/checkoutStore';
import { StripeCardPaymentForm, type StripePaymentResult } from './StripeCardPaymentForm';

interface PaymentSectionProps {
  orderTotal: number;
  /** Called with the confirmed PaymentIntent id once Stripe accepts the charge. */
  onPaid: (paymentIntentId: string) => void;
}

/**
 * Creates the PaymentIntent, then mounts the Stripe form against its client secret.
 *
 * Two ordering rules here, both load-bearing:
 *
 * 1. The customer email is attached to the intent **before** it is created. It
 *    used to be set afterwards, so a wallet payment arrived with no email and no
 *    order confirmation.
 * 2. The intent is created at the moment the customer reaches payment, not at
 *    the first render of the step — an intent created on every keystroke in the
 *    details form is an intent per keystroke.
 */
export function PaymentSection({ orderTotal, onPaid }: PaymentSectionProps) {
  const customerEmail = useCheckoutStore((s) => s.customerEmail);
  const clientSecret = useCheckoutStore((s) => s.stripeClientSecret);
  const setStripeClientSecret = useCheckoutStore((s) => s.setStripeClientSecret);

  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setStarting(true);
    setError(null);

    const result = await paymentApi.createPaymentIntent({
      amount: orderTotal,
      currency: 'aud',
      customerEmail: customerEmail ?? undefined,
    });

    if (result.success && result.clientSecret && result.paymentIntentId) {
      setStripeClientSecret(result.clientSecret, result.paymentIntentId);
    } else {
      setError(result.errorMessage ?? 'We could not start the payment. Please try again.');
    }
    setStarting(false);
  };

  const handleResult = async (result: StripePaymentResult) => {
    if (result.success && result.paymentIntentId) {
      onPaid(result.paymentIntentId);
    } else if (result.error) {
      setError(result.error);
    }
  };

  if (error && !clientSecret) {
    return (
      <div className="flex flex-col gap-4">
        <p className="field-error" role="alert">
          {error}
        </p>
        <button type="button" className="btn btn-primary" onClick={start} disabled={starting}>
          {starting ? 'Starting…' : 'Try again'}
        </button>
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="flex flex-col gap-4">
        <p className="helpline">
          We&rsquo;ll open a secure Stripe form to take payment for {orderTotal.toFixed(2)} AUD.
          Nothing is charged until you confirm in there.
        </p>
        <button type="button" className="btn btn-primary btn-block" onClick={start} disabled={starting}>
          {starting ? 'Opening secure payment…' : 'Open secure payment'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <StripeCardPaymentForm clientSecret={clientSecret} onSubmit={handleResult} orderAmount={orderTotal} />
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
