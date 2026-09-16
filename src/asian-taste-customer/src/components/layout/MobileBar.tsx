import { Link, useLocation } from 'react-router-dom';

const ICON = {
  book: (
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM11 4h7.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H11" />
  ),
  tag: <path d="M4 11V5a1 1 0 0 1 1-1h6l9 9-7 7z" />,
  cart: (
    <>
      <path d="M3 5h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.9a1.5 1.5 0 0 0 1.5-1.2L20 8H6" />
      <circle cx="9.5" cy="20" r="1.3" />
      <circle cx="17.5" cy="20" r="1.3" />
    </>
  ),
  track: (
    <>
      <path d="M12 3a9 9 0 0 0-9 9v7h5v-6H5" />
      <path d="M21 19v-7a9 9 0 0 0-9-9" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
};

function Icon({ paths }: { paths: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths}
    </svg>
  );
}

/**
 * Quick links on a phone.
 *
 * Switches on at the same 980px the header nav switches off at — if those two
 * breakpoints disagree, portrait tablets (761–979px) end up with no navigation
 * at all, which is a bug this design set has already had to fix once. Four
 * items only; a fifth crowds a 390px bar.
 */
export function MobileBar({ onOpenCart }: { onOpenCart: () => void }) {
  const { pathname } = useLocation();
  const is = (p: string) => (pathname === p ? 'page' : undefined);

  return (
    <nav className="mobilebar" aria-label="Quick links">
      <Link to="/menu" aria-current={is('/menu')}>
        <Icon paths={ICON.book} />
        Menu
      </Link>
      <Link to="/menu#cat-deals">
        <Icon paths={ICON.tag} />
        Deals
      </Link>
      <button type="button" onClick={onOpenCart}>
        <Icon paths={ICON.cart} />
        Your order
      </button>
      <Link to="/confirmation" aria-current={is('/confirmation')}>
        <Icon paths={ICON.track} />
        Track
      </Link>
    </nav>
  );
}
