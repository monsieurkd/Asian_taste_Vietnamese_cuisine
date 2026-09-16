import { SERVICES, type ServiceId } from '@/lib/site';
import { useServiceStore } from '@/stores/serviceStore';

const ICONS: Record<ServiceId, React.ReactNode> = {
  delivery: (
    <>
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17" cy="18" r="1.6" />
    </>
  ),
  pickup: <path d="M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2" />,
};

const ORDER: ServiceId[] = ['delivery', 'pickup'];

interface ServiceBarProps {
  /** `dark` is the full-width band under the hero; `light` sits inside a panel. */
  tone?: 'dark' | 'light';
  /** Show the ETA note beside the control (the band variant does). */
  showNote?: boolean;
}

/**
 * The service-type control.
 *
 * Two services, because the API's OrderType is Delivery|Pickup and those are
 * the two the shop fulfils. The design set draws a third ("Dine in") that the
 * API has no value for — see docs/DESIGN/mockups/HANDOFF.md §10 item 3, which
 * asks the owner to confirm before copy is wired. Adding a button that cannot
 * reach an order type would fail at checkout.
 */
export function ServiceBar({ tone = 'dark', showNote = true }: ServiceBarProps) {
  const service = useServiceStore((s) => s.service);
  const setService = useServiceStore((s) => s.setService);
  const meta = SERVICES[service];

  const control = (
    <div className={`seg ${tone === 'light' ? 'on-light' : ''}`} role="group" aria-label="Choose delivery or pickup">
      {ORDER.map((id) => (
        <button
          key={id}
          type="button"
          className="seg-btn"
          aria-pressed={service === id}
          onClick={() => setService(id)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ICONS[id]}
          </svg>
          {SERVICES[id].label}
        </button>
      ))}
    </div>
  );

  if (tone === 'light') {
    return (
      <div className="stack-sm">
        {control}
        <p className="meta" style={{ margin: '14px 0 0' }} aria-live="polite">
          <strong style={{ color: 'var(--color-fg)' }}>{meta.label}</strong> · {meta.note}
        </p>
      </div>
    );
  }

  return (
    <section className="orderbar" data-od-id="order-bar">
      <div className="container-shell orderbar-inner">
        <div>
          <p className="orderbar-label">How would you like it?</p>
          {control}
        </div>
        {showNote && (
          <p className="orderbar-note" aria-live="polite">
            <strong>{meta.etaLabel}</strong> · {meta.note}
          </p>
        )}
      </div>
    </section>
  );
}
