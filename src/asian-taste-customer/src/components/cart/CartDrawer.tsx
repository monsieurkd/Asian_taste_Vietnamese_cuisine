import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCartStore } from '@/stores/cartStore';
import { useServiceStore } from '@/stores/serviceStore';
import { SERVICES, money } from '@/lib/site';
import { SumRow } from '@/components/ui/Panel';
import { focusableIn } from '@/lib/focusable';

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function CartGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.9a1.5 1.5 0 0 0 1.5-1.2L20 8H6" />
      <circle cx="9.5" cy="20" r="1.3" />
      <circle cx="17.5" cy="20" r="1.3" />
    </svg>
  );
}

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The cart, as a drawer.
 *
 * Focus is moved into the panel on open and returned to whatever opened it on
 * close, Escape closes it, and the page behind is locked — without those three
 * a drawer is just a div that covers the screen while you tab through the menu
 * underneath it.
 */
export function CartDrawer({ open, onClose }: CartDrawerProps) {
  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const service = useServiceStore((s) => s.service);
  const navigate = useNavigate();

  const panelRef = useRef<HTMLElement | null>(null);
  const lastFocus = useRef<Element | null>(null);

  const meta = SERVICES[service];
  const subtotal = items.reduce((sum, i) => sum + i.basePrice * i.quantity, 0);

  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement;
    document.body.classList.add('is-locked');
    panelRef.current?.querySelector<HTMLElement>('[data-drawer-close]')?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      // Keep Tab inside the open drawer. Without this, tabbing past the last
      // control walks into the menu behind it — the drawer would be a visual
      // overlay while the keyboard was somewhere else entirely.
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = focusableIn(panel);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('is-locked');
      (lastFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  return (
    <>
      <button
        type="button"
        className={`overlay ${open ? 'is-open' : ''}`}
        aria-label="Close your order"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        className={`drawer ${open ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Your order"
        aria-hidden={!open}
        // `aria-hidden` keeps a closed drawer out of the accessibility tree but
        // NOT out of the tab order — its buttons stayed focusable while
        // translated off-screen. `inert` removes the subtree from both.
        inert={!open}
      >
        <div className="drawer-head">
          <div>
            <h2>Your order</h2>
            <p className="meta">
              {meta.label} · {meta.etaLabel}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} data-drawer-close aria-label="Close your order">
            <CloseIcon />
          </button>
        </div>

        <div className="drawer-body">
          {items.length === 0 ? (
            <div className="cart-empty">
              <CartGlyph />
              <p>Your order is empty.</p>
              <p className="meta">Add a few favourites from the menu.</p>
            </div>
          ) : (
            items.map((line) => (
              <div className="cart-item" key={line.id}>
                <div>
                  <h3>{line.name}</h3>
                  {line.modifiers.length > 0 && (
                    <div className="ci-note">{line.modifiers.map((m) => m.name).join(' · ')}</div>
                  )}
                  {line.specialInstructions && <div className="ci-note">Note: {line.specialInstructions}</div>}
                </div>
                <div className="ci-price num">{money(line.basePrice * line.quantity)}</div>
                <div className="cart-controls">
                  <div className="qty">
                    <button
                      type="button"
                      onClick={() => updateQuantity(line.id, line.quantity - 1)}
                      aria-label={`Remove one ${line.name}`}
                    >
                      −
                    </button>
                    <span className="qty-val">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(line.id, line.quantity + 1)}
                      aria-label={`Add one more ${line.name}`}
                    >
                      +
                    </button>
                  </div>
                  <button type="button" className="ci-remove" onClick={() => removeItem(line.id)}>
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
        <div className="drawer-foot">
          <SumRow label="Subtotal" value={money(subtotal)} />
          <SumRow label="GST" value="included" />
          <SumRow label="Total" value={money(subtotal)} total />

          <Link to="/checkout" className="btn btn-primary" onClick={onClose}>
            Proceed to checkout
          </Link>

          <p className="fulfil">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {service === 'delivery' ? (
                <>
                  <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
                  <circle cx="7" cy="18" r="1.6" />
                  <circle cx="17" cy="18" r="1.6" />
                </>
              ) : (
                <path d="M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2" />
              )}
            </svg>
            {meta.note}
          </p>

          <button
            type="button"
            className="btn btn-ghost btn-block"
            style={{ marginTop: 8 }}
            onClick={() => {
              onClose();
              navigate('/menu');
            }}
          >
            Keep browsing
          </button>
        </div>
        )}
      </aside>
    </>
  );
}
