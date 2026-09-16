import { Link, useLocation } from 'react-router-dom';
import { useHeadHeight, useScrolled } from '@/hooks/useHeadHeight';
import { BrandMark } from '@/components/layout/Brand';
import { useCartStore } from '@/stores/cartStore';
import { SITE } from '@/lib/site';

const NAV = [
  { to: '/menu', label: 'Menu' },
  { to: '/menu#cat-deals', label: 'Deals', hash: '#cat-deals' },
  { to: '/menu#story', label: 'Our story', hash: '#story' },
  { to: '/search', label: 'Search' },
];

function IconCart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.9a1.5 1.5 0 0 0 1.5-1.2L20 8H6" />
      <circle cx="9.5" cy="20" r="1.3" />
      <circle cx="17.5" cy="20" r="1.3" />
    </svg>
  );
}

interface HeaderProps {
  onOpenCart: () => void;
}

/**
 * The shared storefront header.
 *
 * Its nav disappears from 980px down, and the bottom bar switches on at the
 * same breakpoint — if those two disagree, portrait tablets (768px) get a
 * navigation dead zone, which is a bug this set has already fixed once.
 */
export function Header({ onOpenCart }: HeaderProps) {
  const headRef = useHeadHeight<HTMLElement>();
  const scrolled = useScrolled();
  const { pathname } = useLocation();
  const count = useCartStore((s) => s.getItemCount());

  return (
    <header
      ref={headRef}
      className={`sitehead ${scrolled ? 'is-scrolled' : ''}`}
      data-od-id="sitehead"
    >
      <div className="container-shell sitehead-inner">
        <Link to="/" className="brand" aria-label={`${SITE.name} — home`}>
          <BrandMark />
          <span className="brand-text">
            <span className="brand-name">{SITE.name}</span>
            <span className="brand-tag">{SITE.tagline}</span>
          </span>
        </Link>

        <nav aria-label="Primary">
          {NAV.map((item) => {
            const current = pathname === item.to.split('#')[0] && !item.hash;
            return (
              <Link
                key={item.label}
                to={item.to}
                aria-current={current ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sitehead-actions">
          <Link to="/menu" className="btn btn-secondary head-order" data-od-id="header-order">
            Order online
          </Link>
          <button
            type="button"
            onClick={onOpenCart}
            className="icon-btn cart-btn"
            data-od-id="header-cart"
            aria-label={`Open your order${count ? ` (${count} item${count === 1 ? '' : 's'})` : ''}`}
          >
            <IconCart />
            {count > 0 && (
              <span key={count} className="cart-count bump">
                {count}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
