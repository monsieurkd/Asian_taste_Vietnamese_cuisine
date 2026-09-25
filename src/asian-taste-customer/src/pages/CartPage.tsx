import { Link } from 'react-router-dom';
import { useCartStore } from '@/stores/cartStore';
import { money } from '@/lib/site';
import { Panel, PanelBody, PanelFoot, PanelHead, SumRow } from '@/components/ui/Panel';
import { StateBlock } from '@/components/ui/State';
import { StateIcons } from '@/components/ui/stateIcons';
import { ServiceBar } from '@/components/layout/ServiceBar';
import { CartStepper } from '@/components/cart/CartStepper';
import { DishMedia } from '@/components/menu/DishMedia';
import { useMenuIndex } from '@/hooks/useMenuIndex';

/**
 * `/cart` — review and adjust before checkout.
 *
 * This is the third step of the three-stage progress bar, so it links back to
 * the menu rather than presenting the checkout as the only way forward.
 */
export function CartPage() {
  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clearCart);
  const { index } = useMenuIndex();

  const subtotal = items.reduce((sum, i) => sum + i.basePrice * i.quantity, 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const suggestions = index.dishes.filter((d) => d.isAvailable).slice(0, 3);

  return (
    <div className="container-shell section" data-od-id="cart">
      <div className="head">
        <div className="head-copy">
          <p className="eyebrow eyebrow-gold">Step 1 of 3</p>
          <h1>Your order</h1>
          <p className="lead">Check everything looks right, then tell us how you&rsquo;d like it.</p>
        </div>
        {items.length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={clearCart}>
            Empty the order
          </button>
        )}
      </div>

      <div className="stepper" style={{ marginBottom: 28 }} aria-label="Checkout progress">
        <span className="step" data-state="current">
          <span className="step-num">1</span>
          <span className="step-label">Your order</span>
        </span>
        <span className="step-sep" aria-hidden="true" />
        <span className="step" data-state="todo">
          <span className="step-num">2</span>
          <span className="step-label">Your details</span>
        </span>
        <span className="step-sep" aria-hidden="true" />
        <span className="step" data-state="todo">
          <span className="step-num">3</span>
          <span className="step-label">Payment</span>
        </span>
      </div>

      <div className="split">
        <div className="flex flex-col gap-5">
          <Panel data-od-id="cart-mode">
            <PanelHead>
              <h3>How would you like it?</h3>
            </PanelHead>
            <PanelBody>
              <ServiceBar tone="light" />
            </PanelBody>
          </Panel>

          <Panel data-od-id="cart-items">
            <PanelHead>
              <h3>Items</h3>
              <span className="pill">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </span>
            </PanelHead>
            <PanelBody>
              {items.length === 0 ? (
                <StateBlock
                  icon={StateIcons.cart}
                  title="Nothing here yet"
                  body="Your order is empty. Browse the menu and add a few favourites — we'll keep them here."
                  action={
                    <Link to="/menu" className="btn btn-primary">
                      Browse the menu
                    </Link>
                  }
                />
              ) : (
                items.map((line) => (
                  <div className="cart-item" key={line.id}>
                    <div className="flex items-start gap-3.5">
                      <div style={{ width: 56, height: 56, borderRadius: 'var(--radius-sm)', overflow: 'hidden', flex: 'none' }}>
                        <DishMedia src={line.imageUrl} name={line.name} variant="flat" className="h-full w-full" />
                      </div>
                      <div>
                        <h3>{line.name}</h3>
                        {line.modifiers.length > 0 && (
                          <div className="ci-note">{line.modifiers.map((m) => m.name).join(' · ')}</div>
                        )}
                        {!line.modifiers.length && line.choicesSummary && (
                          <div className="ci-choices">{line.choicesSummary}</div>
                        )}
                        {line.note && (
                          <div className="ci-note">Note: {line.note}</div>
                        )}
                        <Link
                          to={`/cart/edit/${line.id}`}
                          className="ci-remove"
                          style={{ display: 'inline-block', marginTop: 6 }}
                        >
                          Edit options
                        </Link>
                      </div>
                    </div>
                    <div className="ci-price num">{money(line.basePrice * line.quantity)}</div>
                    <div className="cart-controls">
                      <CartStepper
                        quantity={line.quantity}
                        onChange={(q) => updateQuantity(line.id, q)}
                        label={line.name}
                      />
                      <button type="button" className="ci-remove" onClick={() => removeItem(line.id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </PanelBody>
          </Panel>

          {suggestions.length > 0 && (
            <Panel data-od-id="cart-upsell">
              <PanelHead>
                <h3>You might also like</h3>
              </PanelHead>
              <PanelBody>
                <div className="grid-3">
                  {suggestions.map((dish) => (
                    <div className="rowline" key={dish.slug} style={{ border: 0, padding: 0 }}>
                      <div className="rl-main">
                        <strong>{dish.name}</strong>
                        <span>{money(dish.price)}</span>
                      </div>
                      <Link to={`/menu/item/${dish.slug}`} className="add-btn">
                        Add
                      </Link>
                    </div>
                  ))}
                </div>
              </PanelBody>
            </Panel>
          )}
        </div>

        <aside className="summary-card panel" aria-label="Order summary" data-od-id="cart-summary">
          <PanelHead>
            <h3>Summary</h3>
          </PanelHead>
          <PanelBody>
            <SumRow label="Subtotal" value={money(subtotal)} />
            <SumRow label="GST" value="included" />
            <SumRow label="Total" value={money(subtotal)} total />
          </PanelBody>
          <PanelFoot>
            <Link
              to="/checkout"
              className={`btn btn-primary btn-block ${items.length === 0 ? 'pointer-events-none opacity-50' : ''}`}
              aria-disabled={items.length === 0}
            >
              Go to checkout
            </Link>
            <Link to="/menu" className="btn btn-ghost btn-block" style={{ marginTop: 8 }}>
              Add more dishes
            </Link>
          </PanelFoot>
        </aside>
      </div>
    </div>
  );
}
