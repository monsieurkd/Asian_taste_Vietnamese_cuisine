interface CartStepperProps {
  quantity: number;
  onChange: (quantity: number) => void;
  label: string;
}

/**
 * The inline cart stepper.
 *
 * Zero is a real value here — decrementing the last one removes the line, which
 * is what people expect from a minus button next to a 1. The Remove link stays
 * alongside it for anyone who would rather be explicit.
 */
export function CartStepper({ quantity, onChange, label }: CartStepperProps) {
  return (
    <div className="qty" role="group" aria-label={`Quantity for ${label}`}>
      <button type="button" onClick={() => onChange(quantity - 1)} aria-label={`Remove one ${label}`}>
        −
      </button>
      <span className="qty-val">{quantity}</span>
      <button type="button" onClick={() => onChange(quantity + 1)} aria-label={`Add one more ${label}`}>
        +
      </button>
    </div>
  );
}
