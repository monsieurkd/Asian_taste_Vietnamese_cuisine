import { statusPresentation, type StatusLens } from '../lib/orderStatus';

export type { StatusLens } from '../lib/orderStatus';

export interface StatusPillProps {
  status: string;
  /**
   * Who is reading the status. Required, not defaulted: the storefront and the
   * console call the same stage different things (`Collected` vs `Delivered`),
   * and an omitted lens would silently print the wrong audience's word.
   */
  lens: StatusLens;
  label?: string;
  className?: string;
}

/**
 * A status as a pill.
 *
 * Rendering always goes through `statusPresentation`, never by lowercasing the
 * API string at the call site — a typo there used to produce an unstyled badge
 * that looked like missing data rather than a bug. The pill is one shell; only
 * the word and the class come from the lens.
 */
export function StatusPill({ status, lens, label, className }: StatusPillProps) {
  const { label: auto, cls } = statusPresentation(status, lens);
  return (
    <span className={`status-pill ${cls} ${className ?? ''}`}>
      <span className="sdot" aria-hidden="true" />
      {label ?? auto}
    </span>
  );
}
