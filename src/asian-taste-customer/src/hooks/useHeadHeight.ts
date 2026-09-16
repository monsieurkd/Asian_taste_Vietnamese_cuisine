import { useEffect, useRef, useState } from 'react';

/**
 * Publishes the real header height as `--head-h` on the document root.
 *
 * Every sticky offset in the design set reads that variable rather than a
 * literal. The header wraps at some widths, so a hardcoded 72px puts the
 * category rail and section bars in the wrong place the moment it does — which
 * is exactly the bug this replaces.
 */
export function useHeadHeight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const sync = () => {
      document.documentElement.style.setProperty('--head-h', `${Math.round(node.offsetHeight)}px`);
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    window.addEventListener('resize', sync);
    // Web fonts land after first paint and change the height; re-measure then.
    document.fonts?.ready.then(sync).catch(() => {});

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, []);

  return ref;
}

/** Tracks whether the page has scrolled, for the header's shadow. */
export function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return scrolled;
}
