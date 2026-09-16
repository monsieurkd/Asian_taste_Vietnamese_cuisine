/**
 * The focusable-element selector shared by the overlays.
 *
 * Kept in one place because a trap built from a subtly different query in two
 * components is how one of them silently stops containing focus.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The currently visible focusable elements inside `root`. */
export function focusableIn(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null
  );
}
