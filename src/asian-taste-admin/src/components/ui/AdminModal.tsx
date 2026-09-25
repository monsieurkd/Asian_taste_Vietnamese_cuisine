import { useEffect, useRef } from 'react';

interface AdminModalProps {
  title: string;
  labelledBy: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * A dialog for the console.
 *
 * Deliberately not the storefront's `Modal`: that one is bound to the router (its
 * dismissal navigates back, and it falls back to `/menu`), which is right for a dish
 * page and wrong for a form that must return the operator to the screen they were on.
 *
 * What it keeps is the part that is not optional. A dialog that is only a div over
 * the page can be tabbed through, so a keyboard user ends up editing the table behind
 * it; and one that does not restore focus leaves the operator somewhere they did not
 * choose. So: focus moves in, Tab is trapped, Escape and a backdrop click dismiss,
 * the page behind is locked, and focus returns to whatever opened it.
 */
export function AdminModal({ title, labelledBy, onClose, children, footer }: AdminModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastFocus = useRef<Element | null>(null);

  // Kept in a ref so the mount-only listeners never close over a stale callback —
  // the parent recreates `onClose` on every render. Assigned in an effect, not during
  // render: writing a ref while rendering is a React violation (the linter caught
  // this, and it is the same pattern the storefront's Modal uses).
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    lastFocus.current = document.activeElement;
    document.body.classList.add('is-locked');
    panelRef.current?.focus();

    const focusableIn = (root: HTMLElement): HTMLElement[] =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = focusableIn(panel);
      if (focusable.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === panel)) {
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
      // Back to the control that opened this, not to the top of the document.
      (lastFocus.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  return (
    <>
      <button type="button" className="modal-scrim" aria-label="Close" onClick={onClose} />
      <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <div
          className="panel modal-panel"
          ref={panelRef}
          tabIndex={-1}
          aria-labelledby={labelledBy}
        >
          <div className="panel-head">
            <h3 id={labelledBy}>{title}</h3>
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="panel-body">{children}</div>
          {footer && <div className="panel-foot row-between">{footer}</div>}
        </div>
      </div>
    </>
  );
}
