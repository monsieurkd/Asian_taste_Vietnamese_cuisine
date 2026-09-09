import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import type { ModifierGroupDto, ModifierDto } from '@/types/menu';

interface ModifierGroupSectionProps {
  group: ModifierGroupDto;
  selectedModifiers: Set<number>;
  onModifierChange: (modifierId: number) => void;
  disabled?: boolean;
  error?: string;
}

interface ModifierOptionProps {
  modifier: ModifierDto;
  isSelected: boolean;
  isRadio: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

function ModifierOption({ modifier, isSelected, isRadio, onSelect, disabled }: ModifierOptionProps) {
  return (
    <label
      className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-all ${
        disabled
          ? 'opacity-50 cursor-not-allowed bg-gray-100 border-gray-200'
          : isSelected
            ? 'border-primary bg-cream'
            : 'border-gray-200 bg-white hover:border-primary'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Selection Indicator */}
        <div
          className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
            isSelected
              ? 'border-primary bg-primary'
              : 'border-gray-300'
          }`}
        >
          {isSelected && (
            <CheckIcon className="h-3 w-3 text-white" />
          )}
        </div>

        {/* Modifier Name */}
        <span className="font-medium text-gray-800">{modifier.name}</span>
      </div>

      {/* Price Adjustment */}
      {modifier.priceAdjustment !== 0 && (
        <span
          className={`text-sm font-semibold ${
            modifier.priceAdjustment > 0 ? 'text-success' : 'text-warning'
          }`}
        >
          {modifier.priceAdjustment > 0 ? '+' : ''}${modifier.priceAdjustment.toFixed(2)}
        </span>
      )}

      {/* Hidden Input */}
      <input
        type={isRadio ? 'radio' : 'checkbox'}
        checked={isSelected}
        onChange={onSelect}
        disabled={disabled || !modifier.isAvailable}
        className="sr-only"
      />
    </label>
  );
}

export function ModifierGroupSection({
  group,
  selectedModifiers,
  onModifierChange,
  disabled = false,
  error,
}: ModifierGroupSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isRadio = group.maxSelect === 1;
  const selectionHint = getSelectionHint(group);

  const handleModifierClick = (modifierId: number) => {
    if (!disabled) {
      onModifierChange(modifierId);
    }
  };

  // Filter out unavailable modifiers unless all are unavailable
  const availableModifiers = group.modifiers.filter((m) => m.isAvailable);
  const showUnavailable = availableModifiers.length === 0;

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
      {/* Header */}
      <div
        className="flex items-center justify-between mb-3"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <h4 className="font-semibold text-secondary">{group.name}</h4>

          {/* Required Badge */}
          {group.isRequired && (
            <span className="rounded bg-error px-2 py-0.5 text-xs font-semibold text-white">
              Required
            </span>
          )}

          {/* Selection Hint */}
          {!isCollapsed && (
            <span className="text-xs text-gray-500">{selectionHint}</span>
          )}
        </div>

        {/* Collapse Toggle */}
        {group.modifiers.length > 4 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }}
            className="text-gray-400 hover:text-gray-600"
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? (
              <ChevronDownIcon className="h-5 w-5" />
            ) : (
              <ChevronUpIcon className="h-5 w-5" />
            )}
          </button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <p className="mb-3 text-sm text-error flex items-center gap-1">
          <span>⚠️</span>
          {error}
        </p>
      )}

      {/* Modifiers List */}
      {!isCollapsed && (
        <div className="space-y-2">
          {(showUnavailable ? group.modifiers : availableModifiers).map((modifier) => (
            <ModifierOption
              key={modifier.id}
              modifier={modifier}
              isSelected={selectedModifiers.has(modifier.id)}
              isRadio={isRadio}
              onSelect={() => handleModifierClick(modifier.id)}
              disabled={disabled || !modifier.isAvailable}
            />
          ))}

          {/* All unavailable message */}
          {!showUnavailable && availableModifiers.length === 0 && (
            <p className="text-sm text-gray-500 italic">
              No options currently available
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function getSelectionHint(group: ModifierGroupDto): string {
  if (group.isRequired) {
    if (group.minSelect === group.maxSelect) {
      return `Select ${group.minSelect}`;
    }
    return `Select ${group.minSelect}-${group.maxSelect}`;
  }

  if (group.maxSelect > 1) {
    return `Select up to ${group.maxSelect}`;
  }

  return 'Optional';
}
