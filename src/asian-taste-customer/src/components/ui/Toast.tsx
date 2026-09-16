import { useEffect, useState } from 'react';
import { useToastStore } from '@/stores/toastStore';

const VISIBLE_MS = 2400;

export function ToastHost() {
  const message = useToastStore((s) => s.message);
  const token = useToastStore((s) => s.token);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;
    // Derived from the incrementing token rather than set in the effect body:
    // starting a timer IS the external subscription here, and the class flip
    // rides on the timer's own callback.
    const show = window.setTimeout(() => setVisible(token > 0), 0);
    const hide = window.setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [message, token]);

  return (
    <div className={`toast ${visible ? 'is-open' : ''}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
