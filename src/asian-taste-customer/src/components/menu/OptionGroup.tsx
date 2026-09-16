import type { DishChoice, DishOptionGroup } from '@/types/menu';
import { money } from '@/lib/site';

interface OptionGroupProps {
  group: DishOptionGroup;
  /** Selected choice ids for radio/checkbox groups, or the number for `range`. */
  value: string | string[] | number | undefined;
  onChange: (next: string | string[] | number) => void;
  error?: string;
}

/**
 * One customisation group.
 *
 * Real `<input type="radio|checkbox">` inside a `<label>`, so the whole row is
 * the target and keyboard/screen-reader behaviour is the browser's, not a
 * re-implementation on a div with an onClick.
 */
export function OptionGroup({ group, value, onChange, error }: OptionGroupProps) {
  if (group.type === 'range') {
    const min = group.min ?? 1;
    const max = group.max ?? 5;
    const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    const current = typeof value === 'number' ? value : (group.value ?? min);

    return (
      <fieldset className="border-0 p-0 m-0">
        <legend className="field-label mb-1.5 block">{group.label}</legend>
        {group.hint && (
          <p className="hint mb-2.5" style={{ margin: '0 0 10px' }}>
            {group.hint}
          </p>
        )}
        {/* The 1–5 scale stays horizontal on a phone: a five-row stack destroys
            the sense of a scale. */}
        <div className="seg seg-num on-light" role="group" aria-label={group.label}>
          {values.map((n) => (
            <button
              key={n}
              type="button"
              className="seg-btn justify-center"
              style={{ minWidth: 54 }}
              aria-pressed={current === n}
              aria-label={`Spice level ${n}`}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }

  const multiple = group.type === 'checkbox';
  const selected: string[] = Array.isArray(value) ? value : value != null ? [String(value)] : [];
  const atMax = multiple && group.max != null && selected.length >= group.max;

  const toggle = (choice: DishChoice) => {
    if (!multiple) {
      onChange(choice.id);
      return;
    }
    const next = selected.includes(choice.id)
      ? selected.filter((id) => id !== choice.id)
      : [...selected, choice.id];
    onChange(next);
  };

  return (
    <fieldset className="border-0 p-0 m-0">
      <legend className="field-label mb-2.5 block">
        {group.label}
        {group.required ? <span className="muted font-medium"> · required</span> : null}
      </legend>
      <div className="choice-list">
        {group.choices?.map((choice) => {
          const checked = selected.includes(choice.id);
          const blocked = multiple && !checked && atMax;
          return (
            <label className="choice" key={choice.id} data-disabled={blocked ? 'true' : undefined}>
              <input
                type={multiple ? 'checkbox' : 'radio'}
                name={group.id}
                value={choice.id}
                checked={checked}
                disabled={blocked}
                onChange={() => toggle(choice)}
              />
              <span className="choice-main">
                <span>
                  <strong>{choice.label}</strong>
                  {choice.note && <p className="choice-note">{choice.note}</p>}
                </span>
                {choice.delta ? <span className="choice-price">{money(choice.delta)}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
      {error && <p className="field-error mt-2.5">{error}</p>}
    </fieldset>
  );
}
