import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import {
  XMarkIcon,
  FireIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { useCartStore } from '@/stores/cartStore';
import { menuApi } from '@/api/menuApi';
import { useItemSelection } from '@/hooks/useItemSelection';
import { ModifierGroupSection } from './ModifierGroupSection';
import { QuantitySelector } from './QuantitySelector';
import { SpecialInstructions } from './SpecialInstructions';
import type { CartItemModifier } from '@/types/menu';

// Quick-select configuration for items with simple options
interface QuickSelectOption {
  id: number;
  name: string;
  priceAdjustment: number;
}

interface QuickSelectConfig {
  [key: string]: QuickSelectOption[];
}

const QUICK_SELECT_OPTIONS: QuickSelectConfig = {
  'homemade wonton': [
    { id: 1001, name: 'Steamed', priceAdjustment: 0 },
    { id: 1002, name: 'Fried', priceAdjustment: 0 },
    { id: 1003, name: 'Soup', priceAdjustment: 0 },
  ],
  'homemade dimsim': [
    { id: 1011, name: 'Steamed', priceAdjustment: 0 },
    { id: 1012, name: 'Fried', priceAdjustment: 0 },
  ],
  'satay skewers': [
    { id: 1021, name: 'Chicken', priceAdjustment: 0 },
    { id: 1022, name: 'Beef', priceAdjustment: 0 },
  ],
  'spring roll': [
    { id: 1031, name: 'Chicken', priceAdjustment: 0 },
    { id: 1032, name: 'Vegetarian', priceAdjustment: 0 },
  ],
  'prawn spring roll': [
    { id: 1041, name: 'Prawn', priceAdjustment: 0 },
  ],
  'cold rolls': [
    { id: 1051, name: 'Chicken', priceAdjustment: 0 },
    { id: 1052, name: 'Prawn', priceAdjustment: 0 },
    { id: 1053, name: 'Tofu', priceAdjustment: 0 },
    { id: 1054, name: 'Pork', priceAdjustment: 0 },
  ],
  'laksa soup': [
    { id: 1061, name: 'Chicken', priceAdjustment: 0 },
    { id: 1062, name: 'Vegetarian', priceAdjustment: 0 },
  ],
  'sweet corn soup': [
    { id: 1071, name: 'Chicken', priceAdjustment: 0 },
    { id: 1072, name: 'Vegetarian', priceAdjustment: 0 },
  ],
};

// Super deal configuration
const SUPER_DEAL_PRICE = 5.20;
const SUPER_DEAL_MODIFIER: CartItemModifier = {
  id: 9999,
  name: 'Snack Super Deal (2 spring rolls + drink)',
  priceAdjustment: SUPER_DEAL_PRICE,
};

export function ItemDetailModal() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const addItem = useCartStore((state) => state.addItem);
  const updateItem = useCartStore((state) => state.updateItem);
  const getItem = useCartStore((state) => state.getItem);
  const [selectedQuickOption, setSelectedQuickOption] = useState<number | null>(null);
  const [includeSuperDeal, setIncludeSuperDeal] = useState(false);

  // Check if we're on the cart route (for editing items from cart)
  const isFromCart = location.pathname.startsWith('/cart/edit/');

  // When editing, itemId is the cartItemId; get the existing cart item
  const existingCartItem = isFromCart && itemId ? getItem(itemId) : undefined;

  // Build the return path based on where we came from
  const returnPath = isFromCart
    ? '/cart'
    : searchParams.toString()
      ? `/menu?${searchParams.toString()}`
      : '/menu';

  const handleClose = () => {
    navigate(returnPath);
  };

  const {
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
  } = useItemSelection();

  // Fetch item details - use menuItemId from cart item when editing
  const menuItemId = existingCartItem?.menuItemId ?? (itemId ? parseInt(itemId, 10) : undefined);
  const { data: item, isLoading, error } = useQuery({
    queryKey: ['item', menuItemId],
    queryFn: () => menuApi.getItemById(menuItemId ?? 0),
    enabled: !!menuItemId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  // Get quick-select options for this item
  const getQuickSelectOptions = (): QuickSelectOption[] | null => {
    if (!item) return null;
    const itemNameLower = item.name.toLowerCase();
    for (const [key, options] of Object.entries(QUICK_SELECT_OPTIONS)) {
      if (itemNameLower.includes(key)) {
        return options;
      }
    }
    return null;
  };

  const quickSelectOptions = item ? getQuickSelectOptions() : null;

  // Reset selections when item changes, and load existing selections when editing
  useEffect(() => {
    if (item) {
      reset();

      if (existingCartItem) {
        // Load existing selections when editing
        setQuantity(existingCartItem.quantity);
        if (existingCartItem.specialInstructions) {
          setSpecialInstructions(existingCartItem.specialInstructions);
        }

        // Restore modifier selections
        if (item.modifierGroups.length > 0 && existingCartItem.modifiers.length > 0) {
          // Create a map of modifier IDs from cart item for quick lookup
          const cartModifierIds = new Set(existingCartItem.modifiers.map(m => m.id));

          // For each modifier group, select the matching modifiers
          item.modifierGroups.forEach(group => {
            group.modifiers.forEach(modifier => {
              if (cartModifierIds.has(modifier.id)) {
                if (group.maxSelect === 1 || group.isRequired) {
                  setModifier(group.id, modifier.id, group.isRequired, group.maxSelect);
                } else {
                  toggleModifier(group.id, modifier.id, group.maxSelect);
                }
              }
            });
          });

          // Handle quick-select option matching
          quickSelectOptions?.forEach(option => {
            if (existingCartItem.modifiers.some(m => m.id === option.id && m.name === option.name)) {
              setSelectedQuickOption(option.id);
            }
          });

          // Check for super deal (if the super deal modifier is in the cart item)
          if (existingCartItem.modifiers.some(m => m.id === SUPER_DEAL_MODIFIER.id)) {
            setIncludeSuperDeal(true);
          }
        }
      } else {
        // Clear selections when adding new item
        setSelectedQuickOption(null);
        setIncludeSuperDeal(false);
      }
    }
  }, [item?.id, existingCartItem, reset, setQuantity, setSpecialInstructions, setModifier, toggleModifier, quickSelectOptions]);

  // Check if super deal is available (price >= $7.80)
  const isSuperDealAvailable = item ? item.basePrice >= 7.80 : false;

  // Calculate total with super deal
  const getSuperDealAdjustment = () => {
    return includeSuperDeal && isSuperDealAvailable ? SUPER_DEAL_PRICE : 0;
  };

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleAddToCart = () => {
    if (!item || !isValid(item?.modifierGroups ?? [])) return;

    let selectedModifiersDetails = getSelectedModifiersDetails(item.modifierGroups);

    // Add quick-select option if chosen
    if (selectedQuickOption && quickSelectOptions) {
      const selectedOption = quickSelectOptions.find(opt => opt.id === selectedQuickOption);
      if (selectedOption) {
        selectedModifiersDetails = [...selectedModifiersDetails, selectedOption];
      }
    }

    // Add super deal if selected
    if (includeSuperDeal && isSuperDealAvailable) {
      selectedModifiersDetails = [...selectedModifiersDetails, SUPER_DEAL_MODIFIER];
    }

    // Update existing item if editing, otherwise add new
    if (existingCartItem && itemId) {
      updateItem(itemId, item, selectedModifiersDetails, specialInstructions || undefined, quantity);
    } else {
      // Add the item quantity times when adding new
      for (let i = 0; i < quantity; i++) {
        addItem(item, selectedModifiersDetails, specialInstructions || undefined);
      }
    }
    handleClose();
  };

  const validationErrors = item ? getValidationErrors(item.modifierGroups) : [];

  // Loading state
  if (isLoading) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={handleOverlayClick}
      >
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
          <div className="space-y-4 animate-pulse">
            <div className="aspect-video w-full rounded-lg bg-gray-200" />
            <div className="h-8 w-3/4 rounded bg-gray-200" />
            <div className="h-4 w-1/2 rounded bg-gray-200" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !item) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={handleOverlayClick}
      >
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
          <div className="text-center">
            <InformationCircleIcon className="mx-auto h-12 w-12 text-error" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">
              Item Not Found
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              The menu item you're looking for doesn't exist or is unavailable.
            </p>
            <button
              onClick={handleClose}
              className="mt-4 rounded-lg bg-primary px-6 py-2 text-white hover:bg-primary-dark"
            >
              Back to Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totalPrice = calculateTotal(item.basePrice, item.modifierGroups) + getSuperDealAdjustment();
  const canAddToCart = item.isAvailable && isValid(item.modifierGroups);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50"
      onClick={handleOverlayClick}
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <button
            onClick={handleClose}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-gray-600 shadow-md transition-colors hover:bg-gray-100 hover:text-gray-900"
            aria-label="Close"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>

          {/* Scrollable Content */}
          <div className="max-h-[85vh] overflow-y-auto">
            {/* Image Section */}
            <div className="relative aspect-[16/9] overflow-hidden rounded-t-2xl bg-tan">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-400">
                  <svg
                    className="h-24 w-24"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              )}

              {/* Badges Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
                {item.isPopular && (
                  <span className="rounded-lg bg-yellow-500 px-3 py-1 text-sm font-semibold text-white">
                    🏆 Popular
                  </span>
                )}
                {item.isGlutenFree && (
                  <span className="rounded-lg bg-blue-600 px-3 py-1 text-sm font-semibold text-white">
                    GF
                  </span>
                )}
                {item.isVegetarian && (
                  <span className="rounded-lg bg-green-600 px-3 py-1 text-sm font-semibold text-white">
                    🥬 Vegetarian
                  </span>
                )}
                {item.isVegan && (
                  <span className="rounded-lg bg-green-700 px-3 py-1 text-sm font-semibold text-white">
                    🌱 Vegan
                  </span>
                )}
                {item.spicyLevel > 0 && (
                  <span className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1 text-sm font-semibold text-white">
                    <FireIcon className="h-4 w-4" />
                    {'🌶️'.repeat(item.spicyLevel)}
                  </span>
                )}
              </div>
            </div>

            {/* Content Section */}
            <div className="p-6">
              {/* Name, Category, Price */}
              <div className="mb-4">
                <p className="text-sm text-gray-500">{item.categoryName}</p>
                <h2 className="text-2xl font-bold text-secondary">{item.name}</h2>
                <p className="mt-1 text-2xl font-bold text-primary">
                  ${item.basePrice.toFixed(2)}
                </p>
              </div>

              {/* Description */}
              {item.description && (
                <p className="mb-6 text-gray-600">{item.description}</p>
              )}

              {/* Quick Select Options */}
              {quickSelectOptions && (
                <div className="mb-6 rounded-xl border-2 border-gray-200 bg-gray-50 p-4">
                  <h3 className="mb-3 text-sm font-semibold text-gray-700">Choose option:</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {quickSelectOptions.map((option) => (
                      <label
                        key={option.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 px-4 py-3 transition-colors ${
                          selectedQuickOption === option.id
                            ? 'border-primary bg-primary/10 text-primary font-semibold'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`quick-option-${item.id}`}
                          value={option.id}
                          checked={selectedQuickOption === option.id}
                          onChange={() => setSelectedQuickOption(option.id)}
                          className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
                        />
                        <span>{option.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Super Deal Option */}
              {isSuperDealAvailable && (
                <label className="mb-6 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-4 transition-colors hover:border-amber-300">
                  <input
                    type="checkbox"
                    checked={includeSuperDeal}
                    onChange={(e) => setIncludeSuperDeal(e.target.checked)}
                    className="h-5 w-5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-amber-900">🎁 Snack Super Deal</p>
                    <p className="text-sm text-amber-700">Add 2 spring rolls + 1 drink</p>
                  </div>
                  <span className="text-lg font-bold text-amber-900">+${SUPER_DEAL_PRICE.toFixed(2)}</span>
                </label>
              )}

              {/* Modifier Groups */}
              {item.modifierGroups.length > 0 && (
                <div className="mb-6">
                  {item.modifierGroups.map((group) => {
                    const selectedForGroup = selectedModifiers.get(group.id) || new Set();
                    const error = validationErrors.find((e) => e.includes(group.name));

                    return (
                      <ModifierGroupSection
                        key={group.id}
                        group={group}
                        selectedModifiers={selectedForGroup}
                        onModifierChange={(modifierId) => {
                          if (group.maxSelect === 1 || group.isRequired) {
                            setModifier(group.id, modifierId, group.isRequired, group.maxSelect);
                          } else {
                            toggleModifier(group.id, modifierId, group.maxSelect);
                          }
                        }}
                        disabled={!item.isAvailable}
                        error={error}
                      />
                    );
                  })}
                </div>
              )}

              {/* Special Instructions */}
              <div className="mb-6">
                <SpecialInstructions
                  value={specialInstructions}
                  onChange={setSpecialInstructions}
                  disabled={!item.isAvailable}
                />
              </div>

              {/* Quantity Selector */}
              <div className="mb-6">
                <label className="mb-2 block font-medium text-secondary">
                  Quantity
                </label>
                <QuantitySelector
                  value={quantity}
                  onChange={setQuantity}
                  min={1}
                  max={10}
                  disabled={!item.isAvailable}
                />
              </div>
            </div>
          </div>

          {/* Sticky Footer */}
          <div className="sticky bottom-0 border-t border-gray-200 bg-white p-4 rounded-b-2xl">
            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="mb-3 rounded-lg bg-red-50 p-3">
                <p className="text-sm font-semibold text-error">Please complete required selections:</p>
                <ul className="mt-1 ml-4 list-disc text-sm text-error">
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Unavailable Message */}
            {!item.isAvailable && (
              <div className="mb-3 rounded-lg bg-gray-100 p-3 text-center text-sm font-semibold text-gray-600">
                Currently unavailable
              </div>
            )}

            {/* Add to Cart / Update Cart Button */}
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={!canAddToCart}
              className={`w-full rounded-xl py-4 text-lg font-semibold transition-all ${
                canAddToCart
                  ? 'bg-primary text-white hover:bg-primary-dark active:scale-[0.98]'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {!item.isAvailable
                ? 'Currently Unavailable'
                : isFromCart
                  ? `Update Cart - $${totalPrice.toFixed(2)}`
                  : `Add to Cart - $${totalPrice.toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
