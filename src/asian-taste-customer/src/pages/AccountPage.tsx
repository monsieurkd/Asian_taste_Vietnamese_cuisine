import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  useCustomerAuthStore,
  selectIsAuthenticated,
  selectCustomer,
} from '@/stores/customerAuthStore';
import { useCartStore } from '@/stores/cartStore';
import { useCheckoutStore } from '@/stores/checkoutStore';
import { customerApi, type CustomerProfile } from '@/api/customerApi';
import { checkoutApi } from '@/api/checkoutApi';
import type { OrderDetailResponse } from '@/types/menu';
import { SITE, money } from '@/lib/site';
import { Panel, PanelBody, PanelFoot, PanelHead, Kv, KvRow, SumRow } from '@/components/ui/Panel';
import { StateBlock } from '@/components/ui/State';
import { StateIcons } from '@/components/ui/stateIcons';
import { StatusPill } from '@/components/ui/Badge';
import { showToast } from '@/stores/toastStore';

type Tab = 'overview' | 'orders' | 'settings' | 'payment';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'orders', label: 'Orders' },
  { id: 'settings', label: 'Settings' },
  { id: 'payment', label: 'Payment' },
];

/**
 * The customer's account.
 *
 * The mockup set does not draw this screen, so it is built from the same tokens
 * and primitives as everything else rather than inventing a look: the tab strip,
 * the panels and the summary rows are the components the rest of the app uses.
 */
export function AccountPage() {
  const navigate = useNavigate();
  const isAuthenticated = useCustomerAuthStore(selectIsAuthenticated);
  const customer = useCustomerAuthStore(selectCustomer);
  const clearAuth = useCustomerAuthStore((s) => s.clearAuth);
  const clearCart = useCartStore((s) => s.clearCart);
  const setCustomerInfo = useCheckoutStore((s) => s.setCustomerInfo);

  const [tab, setTab] = useState<Tab>('overview');
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [orders, setOrders] = useState<OrderDetailResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await customerApi.getProfile();
      setProfile(data);
      setFirstName(data.firstName ?? '');
      setLastName(data.lastName ?? '');
      setPhone(data.phone ?? '');
      if (customer?.email) setOrders(await checkoutApi.getCustomerOrders(customer.email));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not load your account.');
    } finally {
      setLoading(false);
    }
  }, [customer?.email]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/menu');
      return;
    }
    load();
  }, [isAuthenticated, navigate, load]);

  if (!isAuthenticated) return null;

  const displayName =
    profile?.firstName || customer?.email?.split('@')[0] || 'Your account';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await customerApi.updateProfile({
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        phone: phone || undefined,
      });
      setProfile(updated);
      showToast('Profile updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not save that.');
    } finally {
      setSaving(false);
    }
  };

  const handleReorder = (order: OrderDetailResponse) => {
    clearCart();
    setCustomerInfo(order.customerName, order.customerPhone, order.customerEmail);
    showToast('Your details are filled in — add the dishes you want');
    navigate('/menu');
  };

  return (
    <div className="container-shell section" data-od-id="account">
      <div className="head">
        <div className="head-copy">
          <p className="eyebrow eyebrow-gold">Your account</p>
          <h1>{displayName}</h1>
          <p className="lead">{customer?.email}</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            clearAuth();
            navigate('/menu');
          }}
        >
          Sign out
        </button>
      </div>

      <div className="tabs" role="tablist" aria-label="Account sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="field-error" role="alert" style={{ marginTop: 16 }}>
          {error}
        </p>
      )}

      <div style={{ marginTop: 28 }}>
        {loading ? (
          <Panel>
            <PanelBody>
              <div className="skeleton sk-line sk-title" />
              <div className="skeleton sk-line" style={{ marginTop: 12 }} />
              <div className="skeleton sk-line" style={{ marginTop: 12, width: '70%' }} />
            </PanelBody>
          </Panel>
        ) : tab === 'overview' ? (
          <div className="grid-3">
            <Panel>
              <PanelBody>
                <Kv>
                  <KvRow label="Orders" value={profile?.orderCount ?? orders.length} />
                  <KvRow
                    label="Last order"
                    value={
                      profile?.lastOrderAt
                        ? new Date(profile.lastOrderAt).toLocaleDateString('en-AU')
                        : 'None yet'
                    }
                  />
                  <KvRow label="Customer" value={profile?.customerNumber ?? '—'} />
                </Kv>
              </PanelBody>
            </Panel>

            <Panel className="col-span-2">
              <PanelHead>
                <h3>Recent orders</h3>
                {orders.length > 0 && (
                  <button type="button" className="btn btn-ghost" onClick={() => setTab('orders')}>
                    View all
                  </button>
                )}
              </PanelHead>
              <PanelBody>
                {orders.length === 0 ? (
                  <StateBlock
                    icon={StateIcons.cart}
                    title="No orders yet"
                    body="When you order, it will show up here so you can track it or order it again."
                    action={
                      <Link to="/menu" className="btn btn-primary">
                        Browse the menu
                      </Link>
                    }
                  />
                ) : (
                  orders.slice(0, 5).map((order) => (
                    <div className="rowline" key={order.orderId}>
                      <div className="rl-main">
                        <strong>
                          <Link to={`/confirmation/${order.orderNumber}`}>{order.orderNumber}</Link>
                        </strong>
                        <span>{new Date(order.createdAt).toLocaleDateString('en-AU')}</span>
                      </div>
                      <StatusPill status={order.status} />
                      <span className="num">{money(order.total)}</span>
                    </div>
                  ))
                )}
              </PanelBody>
            </Panel>
          </div>
        ) : tab === 'orders' ? (
          <Panel>
            <PanelHead>
              <h3>Order history</h3>
              <span className="pill">
                {orders.length} {orders.length === 1 ? 'order' : 'orders'}
              </span>
            </PanelHead>
            <PanelBody>
              {orders.length === 0 ? (
                <StateBlock
                  icon={StateIcons.cart}
                  title="Nothing here yet"
                  body="Your past orders will appear here."
                  action={
                    <Link to="/menu" className="btn btn-primary">
                      Start an order
                    </Link>
                  }
                />
              ) : (
                orders.map((order) => (
                  <div className="rowline" key={order.orderId}>
                    <div className="rl-main">
                      <strong>{order.orderNumber}</strong>
                      <span>{new Date(order.createdAt).toLocaleString('en-AU')}</span>
                    </div>
                    <StatusPill status={order.status} />
                    <span className="num">{money(order.total)}</span>
                    <button type="button" className="btn btn-ghost" onClick={() => handleReorder(order)}>
                      Order again
                    </button>
                  </div>
                ))
              )}
            </PanelBody>
          </Panel>
        ) : tab === 'settings' ? (
          <Panel>
            <PanelHead>
              <h3>Your details</h3>
            </PanelHead>
            <form onSubmit={handleSave}>
              <PanelBody>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="ac-first">First name</label>
                    <input
                      id="ac-first"
                      className="input"
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ac-last">Last name</label>
                    <input
                      id="ac-last"
                      className="input"
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="field" style={{ marginTop: '1.25rem' }}>
                  <label htmlFor="ac-phone">Mobile number</label>
                  <input
                    id="ac-phone"
                    className="input"
                    type="tel"
                    autoComplete="tel"
                    placeholder="04xx xxx xxx"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="field" style={{ marginTop: '1.25rem' }}>
                  <label htmlFor="ac-email">Email</label>
                  <input id="ac-email" className="input" value={customer?.email ?? ''} readOnly />
                  <p className="hint">
                    Contact us on <a href={SITE.phoneHref}>{SITE.phone}</a> to change your email —
                    it is the address your receipts go to.
                  </p>
                </div>
              </PanelBody>
              <PanelFoot>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </PanelFoot>
            </form>
          </Panel>
        ) : (
          <div className="flex flex-col gap-5">
            <Panel>
              <PanelBody>
                <p className="helpline">
                  Payments are processed by Stripe. Your full card number never reaches this site —
                  only a token that lets us charge the card you chose.
                </p>
                <div style={{ marginTop: 14 }}>
                  <SumRow label="Card brand" value="Visa · Mastercard · Apple Pay" />
                </div>
              </PanelBody>
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}
