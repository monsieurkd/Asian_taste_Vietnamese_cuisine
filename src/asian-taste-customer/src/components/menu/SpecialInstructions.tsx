interface SpecialInstructionsProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
  placeholder?: string;
}

const DEFAULT_PLACEHOLDER = "e.g., No coriander, mild spicy, extra sauce...";
const DEFAULT_MAX_LENGTH = 200;

export function SpecialInstructions({
  value,
  onChange,
  maxLength = DEFAULT_MAX_LENGTH,
  disabled = false,
  placeholder = DEFAULT_PLACEHOLDER,
}: SpecialInstructionsProps) {
  const remainingChars = maxLength - value.length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <label
        htmlFor="special-instructions"
        className="mb-2 block font-medium text-secondary"
      >
        Special Instructions
      </label>
      <textarea
        id="special-instructions"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={3}
        className={`w-full rounded-lg border-2 border-gray-200 bg-cream p-3 text-sm text-gray-800 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-0 transition-colors ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        aria-describedby="char-count"
      />
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Requests may be accommodated subject to availability
        </p>
        <span
          id="char-count"
          className={`text-xs ${
            remainingChars < 20 ? 'text-warning' : 'text-gray-400'
          }`}
        >
          {remainingChars} characters remaining
        </span>
      </div>
    </div>
  );
}
