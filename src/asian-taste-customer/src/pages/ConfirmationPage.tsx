import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { differenceInSeconds } from 'date-fns';
import { checkoutApi } from '@/api/checkoutApi';
import { useCheckoutStore } from '@/stores/checkoutStore';
import { useCartStore } from '@/stores/cartStore';
import { useServiceStore } from '@/stores/serviceStore';
import { SERVICES, SITE, money } from '@/lib/site';
import type { OrderDetailResponse } from '@/types/menu';
import { isCancelled, STAGES, stageIndex } from '@/lib/orderLifecycle';
import { Panel, PanelBody, PanelHead, RowLine, SumRow, Fact, Facts } from '@/components/ui/Panel';
import { StateBlock } from '@/components/ui/State';
import { StateIcons } from '@/components/ui/stateIcons';
import { StatusPill } from '@/components/ui/Badge';

function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

/**
 * The order confirmation and live tracking.
 *
 * There is one job to do here and it is not to be pretty: the customer needs to
 * know the kitchen has the order, what number it is, and where it has got to.
 *
 * Three stages, not the design set's six: v1 is pickup, the kitchen treats
 * confirmed and preparing as one moment, and the customer's journey ends at
 * Ready. The console has since gained a fourth stage (`Collected`) for the
 * handover — the customer has no equivalent and does not need one, so an order
 * the shop has marked collected still reads as Ready here. See
 * lib/orderLifecycle.ts for why, and how older API values fold in.
 */
export function ConfirmationPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const navigate = useNavigate();
  const {
    pendingOrder,
    clearPendingOrder,
    setLastOrderNumber,
    stripePaymentIntentId,
    clearStripeInfo,
  } = useCheckoutStore();
  const clearCart = useCartStore((s) => s.clearCart);
  const service = useServiceStore((s) => s.service);

  const [order, setOrder] = useState<OrderDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const submitted = useRef(false);
  const settled = useRef(false);

  const fetchOrder = useCallback(async (number: string) => {
    try {
      const data = await checkoutApi.getOrderByNumber(number);
      setOrder(data);
      setError(null);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not load that order.');
      return null;
    }
  }, []);

  const submitOrder = useCallback(async () => {
    if (!pendingOrder) return;

    try {
      const response = await checkoutApi.createOrder({
        customerName: pendingOrder.customerName,
        customerPhone: pendingOrder.customerPhone,
        customerEmail: pendingOrder.customerEmail,
        orderType: pendingOrder.orderType,
        pickupTime: {
          type: pendingOrder.pickupTime.type,
          scheduledTime: pendingOrder.pickupTime.scheduledTime?.toISOString(),
        },
        specialInstructions: pendingOrder.specialInstructions,
        items: pendingOrder.items.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          specialInstructions: item.specialInstructions,
          selectedModifierIds: item.selectedModifierIds,
        })),
        paymentMethod: pendingOrder.paymentMethod,
        paymentToken: stripePaymentIntentId || undefined,
        paymentIntentId: stripePaymentIntentId || undefined,
        createAccount: pendingOrder.createAccount,
        password: pendingOrder.password,
      });

      if (!response.orderNumber) throw new Error('The order was created without a number.');

      settled.current = true;
      clearPendingOrder();
      clearCart();
      clearStripeInfo();
      setLastOrderNumber(response.orderNumber);

      await fetchOrder(response.orderNumber);
      // `replace` so the refresh/back-button path works without leaving a
      // half-submitted checkout entry in history. `window.history.replaceState`
      // bypassed the router, so `useParams` kept returning the old value.
      navigate(`/confirmation/${response.orderNumber}`, { replace: true });
    } catch (err) {
      // Allow a retry: without this the guard below blocks the second attempt.
      submitted.current = false;
      setError(err instanceof Error ? err.message : 'We could not place the order.');
    }
  }, [pendingOrder, stripePaymentIntentId, clearPendingOrder, clearCart, clearStripeInfo, setLastOrderNumber, fetchOrder, navigate]);

  useEffect(() => {
    if (orderNumber) {
      fetchOrder(orderNumber);
      return;
    }
    if (pendingOrder && !submitted.current) {
      submitted.current = true;
      submitOrder();
      return;
    }
    if (!pendingOrder && !orderNumber && !submitted.current && !settled.current) {
      navigate('/menu');
    }
  }, [orderNumber, pendingOrder, navigate, fetchOrder, submitOrder]);

  // Poll while the order is still moving. Derived from the status, not stored.
  const inProgress =
    !!orderNumber && order?.status !== 'Completed' && order?.status !== 'Cancelled';

  useEffect(() => {
    if (!orderNumber || !inProgress) return;
    const id = window.setInterval(() => fetchOrder(orderNumber), 10_000);
    return () => window.clearInterval(id);
  }, [orderNumber, inProgress, fetchOrder]);

  useEffect(() => {
    if (!order) return;
    const tick = () => {
      setSecondsLeft(
        Math.max(0, differenceInSeconds(new Date(order.estimatedReadyTime), new Date()))
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [order]);

  const countdown =
    secondsLeft <= 0
      ? 'Any minute now'
      : secondsLeft >= 60
        ? `${Math.floor(secondsLeft / 60)} min`
        : `${secondsLeft} sec`;

  if (error && !order) {
    return (
      <div className="container-shell section">
        <Panel>
          <StateBlock
            error
            icon={StateIcons.warning}
            title="We couldn't place your order"
            body={error}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link to="/checkout" className="btn btn-primary">
                  Try again
                </Link>
                <a href={SITE.phoneHref} className="btn btn-secondary">
                  Call the shop
                </a>
              </div>
            }
          />
        </Panel>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container-shell section" role="status" aria-live="polite">
        <div className="processing">
          <div>
            <div className="spin" aria-hidden="true" />
            <h2 style={{ marginBottom: 8 }}>Confirming your order…</h2>
            <p className="lead" style={{ margin: '0 auto' }}>
              Talking to the kitchen. Please don&rsquo;t close this window.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const meta = SERVICES[service];
  const current = stageIndex(order.status);
  const cancelled = isCancelled(order.status);
  const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <>
      <section className="band band-surface" data-od-id="confirm-hero">
        <div className="container-shell center">
          <span className="big-check" aria-hidden="true">
            <CheckMark />
          </span>
          <p className="eyebrow eyebrow-gold" style={{ marginTop: 20 }}>
            {cancelled ? 'Order cancelled' : 'Order confirmed'}
          </p>
          <h1 style={{ margin: '8px auto 12px', maxWidth: '30ch' }}>
            Thank you, {order.customerName.split(' ')[0]} — the kitchen has it.
          </h1>
          <p className="lead" style={{ margin: '0 auto 26px', maxWidth: '52ch' }}>
            We&rsquo;ve sent your receipt to {order.customerEmail}. You can follow every step
            below.
          </p>
          <Facts style={{ maxWidth: 760, margin: '0 auto' }} label="Order summary">
            <Fact label="Order number" value={order.orderNumber} />
            <Fact label="Service" value={meta.label} />
            <Fact label="Ready" value={countdown} />
            <Fact label="Total paid" value={money(order.total)} />
          </Facts>
        </div>
      </section>

      <section className="band" data-od-id="confirm-track">
        <div className="container-shell split">
          <div className="flex flex-col gap-5">
            <Panel>
              <PanelHead>
                <div>
                  <h3>Live order status</h3>
                  <p className="meta">
                    {inProgress ? 'Updating automatically' : 'No longer changing'}
                  </p>
                </div>
                <StatusPill status={order.status} />
              </PanelHead>
              <PanelBody>
                <div className="scale" aria-hidden="true">
                  {STAGES.map((stage, i) => (
                    <div
                      className="scale-step"
                      key={stage.key}
                      data-done={i < current}
                      data-current={i === current && !cancelled}
                    >
                      <span className="scale-bar" />
                      <span className="scale-label">{stage.label}</span>
                    </div>
                  ))}
                </div>

                <ol className="timeline" style={{ marginTop: 30 }}>
                  {STAGES.map((stage, i) => (
                    <li key={stage.key} data-done={i < current} data-current={i === current && !cancelled}>
                      <span className="tl-mark">
                        {i < current ? (
                          <CheckMark />
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                            <circle cx="12" cy="12" r={i === current ? 4 : 3.5} fill={i === current ? 'currentColor' : 'none'} />
                          </svg>
                        )}
                      </span>
                      <div className="tl-body">
                        <strong>{stage.label}</strong>
                        <p>{i <= current ? stage.description : 'Not yet.'}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHead>
                <h3>Your items</h3>
                <span className="pill">
                  {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </span>
              </PanelHead>
              <PanelBody>
                {order.items.map((item) => (
                  <RowLine
                    key={item.id}
                    main={`${item.quantity} × ${item.menuItemName}`}
                    sub={item.specialInstructions}
                    value={money(item.totalPrice)}
                  />
                ))}
                <div style={{ marginTop: 10 }}>
                  <SumRow label="Paid" value={money(order.total)} total />
                </div>
              </PanelBody>
            </Panel>
          </div>

          <aside className="flex flex-col gap-5">
            <Panel>
              <PanelBody>
                <p className="factline">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" />
                    <circle cx="12" cy="10" r="2.6" />
                  </svg>
                  <span className="factline-k">
                    {service === 'delivery' ? 'Delivering to' : 'Pickup from'}
                  </span>
                  <span className="factline-v">
                    {service === 'delivery' ? 'Your saved address' : SITE.addressLine}
                  </span>
                </p>
                <p className="factline" style={{ marginTop: 10 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="8" r="3.4" />
                    <path d="M5 20a7 7 0 0 1 14 0" />
                  </svg>
                  <span className="factline-k">Contact</span>
                  <span className="factline-v">
                    {order.customerName} · {order.customerPhone}
                  </span>
                </p>
                <div style={{ marginTop: 14 }}>
                  <Link to="/menu" className="linkrow">
                    Order something else
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h13M12 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </PanelBody>
            </Panel>

            <p className="helpline">
              Something not right with {order.orderNumber}?{' '}
              <a href={SITE.phoneHref}>Call the kitchen</a> and quote your order number.
            </p>
          </aside>
        </div>
      </section>
    </>
  );
}
