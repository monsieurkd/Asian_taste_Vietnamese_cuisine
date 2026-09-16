import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { focusableIn } from '@/lib/focusable';

interface ModalProps {
  /** Where to go when dismissed — usually the parent list. */
  onClose?: () => void;
  title: string;
  children: React.ReactNode;
  labelledBy?: string;
}

/**
 * The dish-detail modal shell.
 *
 * Focus moves into the panel, Tab is trapped inside it, Escape and a backdrop
 * click dismiss, the page behind is locked, and focus returns to the trigger on
 * close. Without all of those the "modal" is a div over the screen that you can
 * still tab through — which is how a keyboard user ends up selecting dishes in
 * the catalog behind the dialog they are looking at.
 */
export function Modal({ onClose, title, children, labelledBy }: ModalProps) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastFocus = useRef<Element | null>(null);
  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);

  // Kept in a ref so the mount-only key handler below never closes over a stale
  // `onClose` — the parent re-creates that function on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    if (onCloseRef.current) {
      onCloseRef.current();
      return;
    }
    // `navigate(-1)` leaves the app on a direct deep-link (there is no in-app
    // history to go back to), so fall back to the catalog when nothing is
    // behind us in this session.
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/menu', { replace: true });
  };

  useEffect(() => {
    lastFocus.current = document.activeElement;
    document.body.classList.add('is-locked');
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
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
      (lastFocus.current as HTMLElement | null)?.focus?.();
    };
    // Intentionally mount-only: re-running would steal focus on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once dismissed, render nothing. The route change unmounts this anyway; this
  // makes sure the backdrop cannot outlive the dismissal and swallow a click.
  if (closing) return null;

  return (
    <>
      <button type="button" className="overlay is-open" aria-label="Close" onClick={close} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : title}
        tabIndex={-1}
        className="fixed inset-0 z-[61] overflow-y-auto p-4 sm:p-8"
      >
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-3 flex justify-end">
            <button type="button" className="icon-btn bg-surface" onClick={close} aria-label="Close">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="panel p-5 sm:p-7">{children}</div>
        </div>
      </div>
    </>
  );
}
