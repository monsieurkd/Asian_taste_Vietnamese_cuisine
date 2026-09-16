import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '@/stores/cartStore';
import { useCheckoutStore } from '@/stores/checkoutStore';
import { isOrderable, useServiceStore } from '@/stores/serviceStore';
import { SERVICES, SITE, money } from '@/lib/site';
import type { PendingOrderData } from '@/stores/checkoutStore';
import { Panel, PanelBody, PanelFoot, PanelHead, RowLine, SumRow } from '@/components/ui/Panel';
import { StateBlock } from '@/components/ui/State';
import { StateIcons } from '@/components/ui/stateIcons';
import { PaymentSection } from '@/components/checkout/PaymentSection';
import { ServiceBar } from '@/components/layout/ServiceBar';

type Step = 'details' | 'payment';

function StepTick() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

interface DetailsForm {
  name: string;
  phone: string;
  email: string;
  notes: string;
  time: string;
}

const EMPTY: DetailsForm = { name: '', phone: '', email: '', notes: '', time: 'asap' };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Checkout — details, then payment, then hand off to the confirmation screen.
 *
 * The order is not created here. Details are collected, validated and snapshotted
 * into the checkout store; the confirmation screen submits it. That split exists
 * because the payment intent has to be created before the order, and moving it
 * later would recreate the bug where a wallet payment arrived with no customer
 * email attached.
 *
 * GST is included in the menu prices (Australian convention) and the API charges
 * the same figure: the total is the item subtotal, with nothing added on top.
 */
export function CheckoutPage() {
  const navigate = useNavigate();
  const items = useCartStore((s) => s.items);
  const service = useServiceStore((s) => s.service);
  const setService = useServiceStore((s) => s.setService);
  const orderType = useServiceStore((s) => s.orderType());
  const checkout = useCheckoutStore();

  const [step, setStep] = useState<Step>('details');
  const [details, setDetails] = useState<DetailsForm>(() => ({
    ...EMPTY,
    name: checkout.customerName ?? '',
    phone: checkout.customerPhone ?? '',
    email: checkout.customerEmail ?? '',
    notes: checkout.specialInstructions ?? '',
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof DetailsForm, string>>>({});

  const meta = SERVICES[service];
  // Only pickup completes a checkout in v1. Delivery is offered in the UI but
  // its fulfilment pipeline does not exist, so reaching a pay button with it
  // selected would take an order the shop cannot serve.
  const orderable = isOrderable(service);
  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.basePrice * i.quantity, 0),
    [items]
  );
  // The API derives an order's total from its item prices alone — there is no
  // delivery-fee field on CreateOrderRequestDto. So the amount charged here has
  // to equal what the order will record, or the customer pays more than their
  // receipt says. Keep these two equal until the API can carry a fee.
  const chargedTotal = subtotal;
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  if (items.length === 0) {
    return (
      <div className="container-shell section">
        <Panel>
          <StateBlock
            icon={StateIcons.cart}
            title="Your order is empty"
            body="There's nothing to check out yet. Add a dish or two and come back."
            action={
              <button type="button" className="btn btn-primary" onClick={() => navigate('/menu')}>
                Browse the menu
              </button>
            }
          />
        </Panel>
      </div>
    );
  }

  function validate(): boolean {
    const next: Partial<Record<keyof DetailsForm, string>> = {};
    if (details.name.trim().length < 2) next.name = 'Please tell us your name.';
    if (details.phone.replace(/\D/g, '').length < 8)
      next.phone = 'We need a number to confirm your order.';
    if (!EMAIL_RE.test(details.email.trim())) next.email = 'Please check this email address.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goToPayment() {
    if (!orderable) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!validate()) {
      document.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    checkout.setCustomerInfo(details.name.trim(), details.phone.trim(), details.email.trim());
    checkout.setOrderPreferences(
      orderType,
      details.time === 'asap'
        ? { type: 'ASAP' }
        : {
            type: 'SCHEDULED',
            scheduledTime: new Date(Date.now() + Number(details.time) * 60_000),
          },
      details.notes.trim() || undefined
    );
    setStep('payment');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Hand the snapshot to the confirmation screen, which creates the order. */
  function placeOrder(paymentIntentId?: string) {
    const pending: PendingOrderData = {
      customerName: details.name.trim(),
      customerPhone: details.phone.trim(),
      customerEmail: details.email.trim(),
      orderType,
      pickupTime: checkout.pickupTime,
      specialInstructions: details.notes.trim() || undefined,
      items: items.map((item) => ({
        menuItemId: item.menuItemId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.basePrice,
        totalPrice: item.basePrice * item.quantity,
        specialInstructions: item.specialInstructions,
        selectedModifierIds: item.modifiers.map((m) => m.id),
      })),
      orderTotal: chargedTotal,
      paymentMethod: checkout.paymentMethod,
      savePaymentMethod: checkout.savePaymentMethod,
      createAccount: false,
    };

    if (paymentIntentId) checkout.setStripeClientSecret('', paymentIntentId);
    checkout.setPendingOrder(pending);
    navigate('/confirmation');
  }

  const stepLabel = step === 'details' ? 'Step 2 of 3' : 'Step 3 of 3';

  return (
    <div className="container-shell section" data-od-id="checkout">
      <div className="head">
        <div className="head-copy">
          <p className="eyebrow eyebrow-gold">{stepLabel}</p>
          <h1>{step === 'details' ? 'Your details' : 'Payment'}</h1>
          <p className="lead">
            {step === 'details'
              ? `So we know who to cook for and where it's going — ${meta.label.toLowerCase()}.`
              : 'Last bit — how would you like to pay?'}
          </p>
        </div>
      </div>

      <div className="stepper" style={{ marginBottom: 28 }} aria-label="Checkout progress">
        <span className="step" data-state="done">
          <span className="step-num">
            <StepTick />
          </span>
          <span className="step-label">Your order</span>
        </span>
        <span className="step-sep" aria-hidden="true" />
        <span className="step" data-state={step === 'details' ? 'current' : 'done'}>
          <span className="step-num">{step === 'details' ? '2' : <StepTick />}</span>
          <span className="step-label">Your details</span>
        </span>
        <span className="step-sep" aria-hidden="true" />
        <span className="step" data-state={step === 'payment' ? 'current' : 'todo'}>
          <span className="step-num">3</span>
          <span className="step-label">Payment</span>
        </span>
      </div>

      <div className="split">
        <div className="flex flex-col gap-5">
          {/* Details stay entered but disabled once you move on, so the values
              are still visible while you pay rather than vanishing. */}
          <Panel data-od-id="checkout-details">
            <PanelHead>
              <h3>Contact</h3>
              <span className="pill">{meta.label}</span>
            </PanelHead>
            <PanelBody>
              <fieldset disabled={step === 'payment'} className="border-0 p-0 m-0 flex flex-col gap-4">
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="co-name">Full name</label>
                    <input
                      id="co-name"
                      className="input"
                      autoComplete="name"
                      value={details.name}
                      aria-invalid={!!errors.name}
                      onChange={(e) => setDetails({ ...details, name: e.target.value })}
                    />
                    {errors.name && <p className="field-error">{errors.name}</p>}
                  </div>
                  <div className="field">
                    <label htmlFor="co-phone">Mobile number</label>
                    <input
                      id="co-phone"
                      className="input"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="04xx xxx xxx"
                      value={details.phone}
                      aria-invalid={!!errors.phone}
                      onChange={(e) => setDetails({ ...details, phone: e.target.value })}
                    />
                    {errors.phone && <p className="field-error">{errors.phone}</p>}
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="co-email">Email</label>
                  <input
                    id="co-email"
                    className="input"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={details.email}
                    aria-invalid={!!errors.email}
                    onChange={(e) => setDetails({ ...details, email: e.target.value })}
                  />
                  {errors.email && <p className="field-error">{errors.email}</p>}
                  <p className="hint">We&rsquo;ll send your receipt and order updates here.</p>
                </div>

                <div className="field">
                  <label htmlFor="co-time">Preferred time</label>
                  <select
                    id="co-time"
                    className="select"
                    value={details.time}
                    onChange={(e) => setDetails({ ...details, time: e.target.value })}
                  >
                    <option value="asap">As soon as possible</option>
                    <option value="30">In 30 minutes</option>
                    <option value="60">In 1 hour</option>
                    <option value="120">In 2 hours</option>
                  </select>
                  <p className="hint">
                    {service === 'pickup'
                      ? `Ready in about ${meta.etaMinutes} minutes at 329 Henley Beach Rd.`
                      : `Delivered in about ${meta.etaLabel}.`}
                  </p>
                </div>

                <div className="field">
                  <label htmlFor="co-notes">
                    Anything we should know? <span className="muted font-medium">(optional)</span>
                  </label>
                  <input
                    id="co-notes"
                    className="input"
                    placeholder="Allergies, buzzer, leave at the front door…"
                    value={details.notes}
                    onChange={(e) => setDetails({ ...details, notes: e.target.value })}
                  />
                </div>
              </fieldset>
            </PanelBody>
          </Panel>

          {step === 'payment' &&
            (orderable ? (
              <Panel data-od-id="checkout-payment">
                <PanelHead>
                  <h3>Payment</h3>
                  <span className="pill pill-neutral">Card · Apple Pay · Google Pay</span>
                </PanelHead>
                <PanelBody>
                  <PaymentSection orderTotal={chargedTotal} onPaid={placeOrder} />
                </PanelBody>
              </Panel>
            ) : (
              <Panel data-od-id="checkout-unavailable">
                <PanelHead>
                  <h3>{meta.label} isn&rsquo;t available online yet</h3>
                  <span className="pill pill-neutral">Pickup only for now</span>
                </PanelHead>
                <PanelBody>
                  <p className="helpline" style={{ marginBottom: 12 }}>
                    {meta.note}. We&rsquo;re not taking {meta.label.toLowerCase()} orders on the
                    website yet, so nothing will be charged. Switch to pickup to finish this order,
                    or order {meta.label.toLowerCase()} through Uber Eats.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setService('pickup')}
                    >
                      Switch to pickup
                    </button>
                    <a
                      className="btn btn-secondary"
                      href={SITE.uberEatsUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Order on Uber Eats
                    </a>
                  </div>
                </PanelBody>
              </Panel>
            ))}

          <Panel data-od-id="checkout-service">
            <PanelHead>
              <h3>Service</h3>
            </PanelHead>
            <PanelBody>
              <ServiceBar tone="light" />
            </PanelBody>
          </Panel>
        </div>

        <aside className="summary-card panel" aria-label="Order summary" data-od-id="checkout-summary">
          <PanelHead>
            <h3>Order summary</h3>
            <button
              type="button"
              className="meta"
              style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--color-accent)' }}
              onClick={() => navigate('/cart')}
            >
              Edit
            </button>
          </PanelHead>
          <PanelBody>
            {/* No delivery fee line: the shop charges none online today, because
                the API cannot record one. See the note by chargedTotal. */}
            {items.map((line) => (
              <RowLine
                key={line.id}
                main={`${line.quantity} × ${line.name}`}
                sub={line.specialInstructions}
                value={money(line.basePrice * line.quantity)}
              />
            ))}
            <div style={{ marginTop: 12 }}>
              <SumRow label={`Items (${itemCount})`} value={money(subtotal)} />
              <SumRow label="GST" value="included" />
              <SumRow label="Total" value={money(chargedTotal)} total />
            </div>
          </PanelBody>
          <PanelFoot>
            {step === 'details' ? (
              <button type="button" className="btn btn-primary btn-block" onClick={goToPayment}>
                Continue to payment
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={() => setStep('details')}
              >
                Back to details
              </button>
            )}
            <p className="meta" style={{ margin: '14px 0 0', textAlign: 'center' }}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }}>
                <rect x="4" y="10" width="16" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              Secure, encrypted checkout
            </p>
          </PanelFoot>
        </aside>
      </div>
    </div>
  );
}
