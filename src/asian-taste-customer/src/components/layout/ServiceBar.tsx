import { SERVICES, SERVICE_ORDER, type ServiceId } from '@/lib/site';
import { useServiceStore } from '@/stores/serviceStore';

const ICONS: Record<ServiceId, React.ReactNode> = {
  pickup: <path d="M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2" />,
  delivery: (
    <>
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17" cy="18" r="1.6" />
    </>
  ),
  ubereats: (
    <>
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M8 18h8M4 7h3l1.5 6M12 7h6l-2 6" />
    </>
  ),
};

interface ServiceBarProps {
  /** `dark` is the full-width band under the hero; `light` sits inside a panel. */
  tone?: 'dark' | 'light';
  /** Show the ETA/caveat line beside the control (the band variant does). */
  showNote?: boolean;
}

/**
 * How the customer wants their food.
 *
 * Three options, but only one of them orders here. Pickup is first and the
 * default because it is the only service v1 can fulfil; delivery is shown with
 * its caveat and cannot complete a checkout (the fulfilment pipeline does not
 * exist yet); Uber Eats hands the customer to the restaurant's own listing
 * rather than pretending to be an order path.
 *
 * Presenting Uber Eats as a button beside the other two — rather than hiding it
 * in the footer — is the honest version: a customer who would rather use the
 * marketplace gets there in one tap, and does not start an order here that they
 * were never going to finish.
 */
export function ServiceBar({ tone = 'dark', showNote = true }: ServiceBarProps) {
  const service = useServiceStore((s) => s.service);
  const setService = useServiceStore((s) => s.setService);
  const meta = SERVICES[service];

  const control = (
    <div
      className={`seg ${tone === 'light' ? 'on-light' : ''}`}
      role="group"
      aria-label="Choose pickup, delivery or Uber Eats"
      style={{ flexWrap: 'wrap' }}
    >
      {SERVICE_ORDER.map((id) => {
        const item = SERVICES[id];
        const external = item.external;

        const inner = (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {ICONS[id]}
            </svg>
            {item.label}
          </>
        );

        // An external service leaves the app, so it is a link, not a toggle —
        // pressing it cannot become "the selected service".
        if (external) {
          return (
            <a
              key={id}
              className="seg-btn"
              href={external}
              target="_blank"
              rel="noreferrer"
              aria-label={`${item.label} — opens the restaurant's Uber Eats page in a new tab`}
            >
              {inner}
            </a>
          );
        }

        return (
          <button
            key={id}
            type="button"
            className="seg-btn"
            aria-pressed={service === id}
            onClick={() => setService(id)}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );

  const note = (
    <span aria-live="polite">
      <strong>{meta.etaLabel}</strong> · {meta.note}
      {meta.caveat ? ` · ${meta.caveat}` : ''}
    </span>
  );

  if (tone === 'light') {
    return (
      <div>
        {control}
        <p className="meta" style={{ margin: '14px 0 0' }}>
          {note}
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
        {showNote && <p className="orderbar-note">{note}</p>}
      </div>
    </section>
  );
}
