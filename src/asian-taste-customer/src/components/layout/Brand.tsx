import { Link } from 'react-router-dom';

/** The brand mark, drawn rather than typed, so it inherits currentColor. */
export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 11h17a8.5 8.5 0 0 1-17 0Z" />
        <path d="M9 7.5c0-1.3 1.1-1.7 1.1-2.8M12.5 7.5c0-1.3 1.1-1.7 1.1-2.8" />
      </svg>
    </span>
  );
}

export function Brand({ tagline = 'Vietnamese kitchen' }: { tagline?: string }) {
  return (
    <Link to="/" className="brand" aria-label="Asian Taste — home">
      <BrandMark />
      <span className="brand-text">
        <span className="brand-name">Asian Taste</span>
        <span className="brand-tag">{tagline}</span>
      </span>
    </Link>
  );
}
