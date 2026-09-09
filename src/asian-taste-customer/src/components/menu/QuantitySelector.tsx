import { MinusIcon, PlusIcon } from '@heroicons/react/24/outline';

interface QuantitySelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

const sizeStyles = {
  sm: {
    container: 'h-8',
    button: 'h-8 w-8',
    text: 'text-sm',
  },
  md: {
    container: 'h-10',
    button: 'h-10 w-10',
    text: 'text-base',
  },
  lg: {
    container: 'h-12',
    button: 'h-12 w-12',
    text: 'text-lg',
  },
};

export function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = 10,
  size = 'md',
  disabled = false,
}: QuantitySelectorProps) {
  const canDecrement = value > min;
  const canIncrement = value < max;

  const handleDecrement = () => {
    if (canDecrement && !disabled) {
      onChange(value - 1);
    }
  };

  const handleIncrement = () => {
    if (canIncrement && !disabled) {
      onChange(value + 1);
    }
  };

  const handleDirectInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value, 10);
    if (!isNaN(newValue)) {
      onChange(Math.max(min, Math.min(max, newValue)));
    }
  };

  const styles = sizeStyles[size];

  return (
    <div
      className={`flex items-center border-2 border-primary rounded-lg overflow-hidden ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      {/* Decrement Button */}
      <button
        type="button"
        onClick={handleDecrement}
        disabled={!canDecrement || disabled}
        className={`${styles.button} flex items-center justify-center bg-tan text-primary transition-colors ${
          canDecrement && !disabled ? 'hover:bg-primary hover:text-white' : 'opacity-30 cursor-not-allowed'
        }`}
        aria-label="Decrease quantity"
      >
        <MinusIcon className="h-4 w-4" />
      </button>

      {/* Quantity Display/Input */}
      <div className={`flex items-center justify-center ${styles.container} px-4 bg-white`}>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={handleDirectInput}
          disabled={disabled}
          className={`${styles.text} font-semibold text-primary w-12 text-center bg-transparent border-0 p-0 focus:ring-0 focus:outline-none`}
          aria-label="Quantity"
        />
      </div>

      {/* Increment Button */}
      <button
        type="button"
        onClick={handleIncrement}
        disabled={!canIncrement || disabled}
        className={`${styles.button} flex items-center justify-center bg-tan text-primary transition-colors ${
          canIncrement && !disabled ? 'hover:bg-primary hover:text-white' : 'opacity-30 cursor-not-allowed'
        }`}
        aria-label="Increase quantity"
      >
        <PlusIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
