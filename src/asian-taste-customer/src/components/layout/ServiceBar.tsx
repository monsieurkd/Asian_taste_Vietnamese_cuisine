import { SERVICES, SERVICE_ORDER, type ServiceId } from '@/lib/services';
import { useServiceStore } from '@/stores/serviceStore';

const ICONS: Record<ServiceId, React.ReactNode> = {
  pickup: <path d="M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2" />,
};

interface ServiceBarProps {
  /** `dark` is the full-width band under the hero; `light` sits inside a panel. */
  tone?: 'dark' | 'light';
  /** Show the ETA line beside the control (the band variant does). */
  showNote?: boolean;
}

/**
 * How the customer gets their food.
 *
 * Pickup only, and it is stated rather than offered: this used to be a three-way
 * toggle whose other two options could not complete a checkout. Delivery was shown
 * "subject to availability" and then refused at the payment step; Uber Eats sat
 * beside Pickup as though it were another way to order from here, when it is a
 * different shop. A control with one working answer and two dead ends is worse than
 * a sentence, so this is a sentence with the estimate on it.
 *
 * Uber Eats is still linked, from the footer, where leaving this site is expected.
 */
export function ServiceBar({ tone = 'dark', showNote = true }: ServiceBarProps) {
  const service = useServiceStore((s) => s.service);
  const meta = SERVICES[service];

  const control = (
    <div
      className={`seg ${tone === 'light' ? 'on-light' : ''}`}
      role="group"
      aria-label="Service"
      style={{ flexWrap: 'wrap' }}
    >
      {SERVICE_ORDER.map((id) => {
        const item = SERVICES[id];
        return (
          <span key={id} className="seg-btn" data-static="true" aria-current="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {ICONS[id]}
            </svg>
            {item.label}
          </span>
        );
      })}
    </div>
  );

  const note = (
    <span aria-live="polite">
      <strong>{meta.etaLabel}</strong> · {meta.note}
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
