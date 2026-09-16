interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** `lg` is the 48px detail-page control; `md` is the 42px inline one. */
  size?: 'md' | 'lg';
  label?: string;
}

/**
 * The quantity control.
 *
 * 42–48px targets, because this is the single most-tapped control on a phone
 * and it sits next to a Remove button. Values are clamped rather than disabled
 * silently, so holding the plus at the maximum does nothing surprising.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 20,
  size = 'lg',
  label = 'Quantity',
}: QuantityStepperProps) {
  const canDecrement = value > min;
  const canIncrement = value < max;

  return (
    <div className={size === 'lg' ? 'qty-lg' : 'qty'} role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={!canDecrement}
        aria-label="Reduce quantity"
      >
        −
      </button>
      <span className="qty-val" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={!canIncrement}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}
