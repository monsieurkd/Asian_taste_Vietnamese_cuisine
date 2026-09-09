import { useState, useCallback } from 'react';
import type { ModifierGroupDto, CartItemModifier } from '../types/menu';

export interface ItemSelectionState {
  selectedModifiers: Map<number, Set<number>>; // groupId -> modifierIds
  quantity: number;
  specialInstructions: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface UseItemSelectionReturn {
  // State
  selectedModifiers: Map<number, Set<number>>;
  quantity: number;
  specialInstructions: string;

  // Actions
  setModifier: (groupId: number, modifierId: number, isRequired: boolean, maxSelect: number) => void;
  toggleModifier: (groupId: number, modifierId: number, maxSelect: number) => void;
  setQuantity: (qty: number) => void;
  setSpecialInstructions: (text: string) => void;
  reset: () => void;

  // Calculations
  calculateTotal: (basePrice: number, modifierGroups: ModifierGroupDto[]) => number;
  getSelectedModifiersDetails: (modifierGroups: ModifierGroupDto[]) => CartItemModifier[];
  isValid: (modifierGroups: ModifierGroupDto[]) => boolean;
  getValidationErrors: (modifierGroups: ModifierGroupDto[]) => string[];
}

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 10;

export function useItemSelection(initialQuantity: number = 1): UseItemSelectionReturn {
  const [selectedModifiers, setSelectedModifiers] = useState<Map<number, Set<number>>>(new Map());
  const [quantity, setQuantityState] = useState(initialQuantity);
  const [specialInstructions, setSpecialInstructions] = useState('');

  /**
   * Set a single modifier for a group (radio button behavior)
   * Clears previous selection for this group
   */
  const setModifier = useCallback((
    groupId: number,
    modifierId: number,
    _isRequired: boolean,
    maxSelect: number
  ) => {
    setSelectedModifiers((prev) => {
      const newMap = new Map(prev);

      if (maxSelect === 1) {
        // Radio button behavior: replace existing selection
        const newSet = new Set<number>();
        newSet.add(modifierId);
        newMap.set(groupId, newSet);
      } else {
        // For maxSelect > 1, use toggle behavior
        const existingSet = newMap.get(groupId) || new Set<number>();
        const newSet = new Set(existingSet);

        if (newSet.has(modifierId)) {
          newSet.delete(modifierId);
        } else {
          if (newSet.size < maxSelect) {
            newSet.add(modifierId);
          }
        }

        if (newSet.size > 0) {
          newMap.set(groupId, newSet);
        } else {
          newMap.delete(groupId);
        }
      }

      return newMap;
    });
  }, []);

  /**
   * Toggle a modifier for a group (checkbox behavior)
   * Enforces maxSelect limit
   */
  const toggleModifier = useCallback((
    groupId: number,
    modifierId: number,
    maxSelect: number
  ) => {
    setSelectedModifiers((prev) => {
      const newMap = new Map(prev);
      const existingSet = newMap.get(groupId) || new Set<number>();
      const newSet = new Set(existingSet);

      if (newSet.has(modifierId)) {
        newSet.delete(modifierId);
      } else {
        if (newSet.size < maxSelect) {
          newSet.add(modifierId);
        }
      }

      if (newSet.size > 0) {
        newMap.set(groupId, newSet);
      } else {
        newMap.delete(groupId);
      }

      return newMap;
    });
  }, []);

  /**
   * Set quantity with validation
   */
  const setQuantity = useCallback((qty: number) => {
    const clampedQty = Math.max(MIN_QUANTITY, Math.min(MAX_QUANTITY, qty));
    setQuantityState(clampedQty);
  }, []);

  /**
   * Reset all selections
   */
  const reset = useCallback(() => {
    setSelectedModifiers(new Map());
    setQuantityState(1);
    setSpecialInstructions('');
  }, []);

  /**
   * Calculate total price including modifiers
   */
  const calculateTotal = useCallback((
    basePrice: number,
    modifierGroups: ModifierGroupDto[]
  ): number => {
    let modifierTotal = 0;

    for (const [groupId, modifierIds] of selectedModifiers.entries()) {
      const group = modifierGroups.find((g) => g.id === groupId);
      if (!group) continue;

      for (const modifierId of modifierIds) {
        const modifier = group.modifiers.find((m) => m.id === modifierId);
        if (modifier) {
          modifierTotal += modifier.priceAdjustment;
        }
      }
    }

    return (basePrice + modifierTotal) * quantity;
  }, [selectedModifiers, quantity]);

  /**
   * Get selected modifiers as CartItemModifier array
   */
  const getSelectedModifiersDetails = useCallback((
    modifierGroups: ModifierGroupDto[]
  ): CartItemModifier[] => {
    const result: CartItemModifier[] = [];

    for (const [groupId, modifierIds] of selectedModifiers.entries()) {
      const group = modifierGroups.find((g) => g.id === groupId);
      if (!group) continue;

      for (const modifierId of modifierIds) {
        const modifier = group.modifiers.find((m) => m.id === modifierId);
        if (modifier) {
          result.push({
            id: modifier.id,
            name: modifier.name,
            priceAdjustment: modifier.priceAdjustment,
          });
        }
      }
    }

    return result;
  }, [selectedModifiers]);

  /**
   * Validate selections against modifier group requirements
   */
  const getValidationErrors = useCallback((
    modifierGroups: ModifierGroupDto[]
  ): string[] => {
    const errors: string[] = [];

    for (const group of modifierGroups) {
      const selectedCount = selectedModifiers.get(group.id)?.size ?? 0;

      if (group.isRequired && selectedCount < group.minSelect) {
        errors.push(`${group.name}: Please select at least ${group.minSelect} option${group.minSelect > 1 ? 's' : ''}`);
      }

      if (selectedCount > group.maxSelect) {
        errors.push(`${group.name}: Please select at most ${group.maxSelect} option${group.maxSelect > 1 ? 's' : ''}`);
      }
    }

    return errors;
  }, [selectedModifiers]);

  /**
   * Check if current selection is valid
   */
  const isValid = useCallback((modifierGroups: ModifierGroupDto[]): boolean => {
    return getValidationErrors(modifierGroups).length === 0;
  }, [getValidationErrors]);

  return {
    selectedModifiers,
    quantity,
    specialInstructions,
    setModifier,
    toggleModifier,
    setQuantity,
    setSpecialInstructions,
    reset,
    calculateTotal,
    getSelectedModifiersDetails,
    isValid,
    getValidationErrors,
  };
}
