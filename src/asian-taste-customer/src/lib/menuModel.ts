import type {
  Dish,
  DishChoice,
  DishOptionGroup,
  DishSelections,
  DishTag,
  MenuCategory,
  MenuItemDetailDto,
  MenuItemSummaryDto,
  CategoryWithItemsDto,
} from '@/types/menu';

/* ==========================================================================
   The menu model.
   Ported from docs/DESIGN/mockups/src/scripts/menu-data.js so the contract
   matches the ratified design set: a dish knows its option groups, its tags
   and how to price a set of selections. Everything below is pure — the API
   stays the source of truth and `mapDish` is the only ADAPTER between the two.
   ========================================================================== */

/**
 * The printed option groups.
 *
 * The API's `modifier_groups` endpoint is a stub that returns an empty list
 * (AdminMenuController has `// TODO: Add IMenuRepository.GetAllModifierGroupsAsync`),
 * and the seed carries no modifier rows, so `hasModifiers` is false on all 82
 * dishes. These are the choices the paper menu actually prints — protein,
 * cooking method, rice type and the 1–5 heat scale — transcribed from
 * docs/DESIGN/source/Menu.md and matched by dish name. They are the data the
 * design set was drawn against; when the modifier tables are seeded, mapDish
 * prefers the API's groups and this table stops being consulted.
 */

const SPICE: DishOptionGroup = {
  id: 'spice',
  label: 'Spice level',
  type: 'range',
  min: 1,
  max: 5,
  value: 3,
  hint: 'Mild 1 → very spicy 5. Default 3.',
};

const VEGAN: DishOptionGroup = {
  id: 'vegan',
  label: 'Make it vegan / vegetarian',
  type: 'checkbox',
  choices: [
    {
      id: 'plant',
      label: 'Use plant-based protein and sauce',
      note: 'Available on any dish on request',
    },
  ],
};

function radio(id: string, label: string, choices: Array<[string, string] | [string, string, number]>): DishOptionGroup {
  return {
    id,
    label,
    type: 'radio',
    required: true,
    choices: choices.map(([cid, clabel, delta]) => ({
      id: cid,
      label: clabel,
      ...(delta ? { delta } : {}),
    })),
  };
}

const PROTEIN_CHICKEN_PRAWN_VEG = radio('protein', 'Choose your protein', [
  ['chicken', 'Chicken'],
  ['prawn', 'Prawn'],
  ['veg', 'Vegetable'],
]);

const PROTEIN_CHICKEN_VEG = radio('protein', 'Choose your protein', [
  ['chicken', 'Chicken'],
  ['veg', 'Vegetable'],
]);

const PROTEIN_CHICKEN_BEEF = radio('protein', 'Choose your protein', [
  ['chicken', 'Chicken'],
  ['beef', 'Beef'],
]);

const FILLING_CHICKEN_VEG = radio('fill', 'Choose your filling', [
  ['chicken', 'Chicken'],
  ['veg', 'Vegetable'],
]);

const FILLING_CHICKEN_PORK = radio('fill', 'Choose your filling', [
  ['chicken', 'Chicken'],
  ['pork', 'Pork'],
]);

const METHOD_STEAMED_FRIED = radio('method', 'Choose your style', [
  ['steamed', 'Steamed'],
  ['fried', 'Fried'],
]);

const RICE_CHOICE = radio('rice', 'Choose your rice', [
  ['steamed', 'Steamed rice', 0],
  ['fried', 'Fried rice', 1.5],
  ['basil', 'Spicy basil fried rice', 1.8],
  ['japanese', 'Japanese fried rice', 1.8],
]);

const PHO_BEEF = radio('cut', 'Choose your beef', [
  ['rare', 'Rare beef'],
  ['brisket', 'Brisket'],
  ['ball', 'Beef balls'],
  ['combo', 'Combination (all three)', 1],
]);

/** Option groups by exact dish name, as printed on the menu. */
const OPTIONS_BY_NAME: Record<string, DishOptionGroup[]> = {
  'Cold rolls (serve of 4)': [
    radio('protein', 'Choose your filling', [
      ['chicken', 'Chicken'],
      ['prawn', 'Prawn'],
      ['tofu', 'Tofu'],
      ['pork', 'Pork'],
    ]),
    SPICE,
    VEGAN,
  ],
  'Homemade Dimsim (serve of 3)': [METHOD_STEAMED_FRIED, FILLING_CHICKEN_PORK],
  'Satay skewers (serve of 3)': [radio('protein', 'Choose your skewer', [['chicken', 'Chicken'], ['beef', 'Beef']]), SPICE],
  'Spring roll (serve of 3)': [FILLING_CHICKEN_VEG, SPICE],
  'Prawn Spring roll (serve of 3)': [SPICE],
  'Homemade wonton': [
    radio('serve', 'How would you like them?', [
      ['steamed', 'Steamed'],
      ['fried', 'Fried'],
      ['soup', 'In soup'],
    ]),
  ],
  'Laksa soup': [PROTEIN_CHICKEN_VEG, SPICE, VEGAN],
  'Sweet corn soup': [PROTEIN_CHICKEN_VEG],

  'Pho - Beef noodle soup (1 choice)': [PHO_BEEF, SPICE],
  'Pho - Beef noodle soup (Combo)': [PHO_BEEF, SPICE],
  'Chicken noodle soup': [
    radio('cut', 'Choose your chicken', [
      ['grilled', 'Grilled chicken'],
      ['steamed', 'Steamed chicken'],
    ]),
    SPICE,
  ],
  'Laksa noodle soup - Vegan': [SPICE],
  'Pad Thai': [PROTEIN_CHICKEN_PRAWN_VEG, SPICE],
  'Singapore noodle': [PROTEIN_CHICKEN_PRAWN_VEG, SPICE],
  Mongolian: [PROTEIN_CHICKEN_BEEF, SPICE],
  'Korean Glass Noodle (Low carb)': [
    radio('protein', 'Choose your protein', [
      ['veg', 'Vegetable'],
      ['beef', 'Beef'],
      ['prawn', 'Prawn'],
    ]),
    SPICE,
  ],

  'Tofu Noodle Bowl Salad': [
    radio('style', 'Crispy or lemongrass?', [
      ['crispy', 'Crispy'],
      ['lemongrass', 'Lemongrass'],
    ]),
    SPICE,
  ],
  'Spring rolls Noodle Bowl Salad': [FILLING_CHICKEN_VEG, SPICE],
  'Chicken Noodle Bowl Salad': [
    radio('style', 'How would you like the chicken?', [
      ['grilled', 'Grilled'],
      ['lemongrass', 'Lemongrass'],
      ['spicy', 'Spicy'],
    ]),
    SPICE,
  ],
  'Beef Noodle Bowl Salad': [
    radio('style', 'How would you like the beef?', [
      ['lemongrass', 'Lemongrass'],
      ['soy-pepper', 'Soy-pepper'],
    ]),
    SPICE,
  ],

  'Rice Bowl - Curry (Green/Yellow)': [
    radio('protein', 'Choose your protein', [
      ['chicken', 'Chicken'],
      ['beef', 'Beef'],
      ['veg', 'Vegetable'],
    ]),
    RICE_CHOICE,
    SPICE,
  ],
};

/** Every Rice Bowl topping is served on a rice of your choosing. */
const RICE_BOWL_DEFAULT = [RICE_CHOICE, SPICE];

/** Wok dishes that come on rice and can be made plant-based. */
const WOK_WITH_RICE = [RICE_CHOICE, SPICE, VEGAN];

const WOK_NAMES = new Set([
  'Mix veg cashew nut (Chicken)',
  'Mix veg in creamy satay sauce (Chicken)',
  'Mix veg in Malaysian curry (Chicken)',
  'Mix veg with spicy chilli basil (Chicken)',
  'Mix veg in Thai green curry (Chicken)',
  'Vietnamese crispy pork',
  'Sweet & Sour pork',
  'Mix veg in cashew nut (Beef)',
  'Mix veg in black bean sauce (Beef)',
  'Mix veg in Mongolian sauce (Beef)',
  'Mix veg with spicy chilli basil (Beef)',
  'Mix veg with black pepper (Beef)',
]);

/* ─── tags ────────────────────────────────────────────────────────────────── */

export const TAG_LABEL: Record<DishTag, string> = {
  popular: 'Popular',
  gf: 'GF',
  vegan: 'Vegan',
  spicy: 'Spicy',
};

export const TAG_DOT: Record<DishTag, string> = {
  popular: 'dot-popular',
  gf: 'dot-gf',
  vegan: 'dot-vegan',
  spicy: 'dot-spicy',
};

/**
 * The store's standing offer, as printed: the snack deal applies to orders of
 * $7.80 or more. Kept next to the price model because it is a pricing rule.
 */
export const SUPER_DEAL = {
  name: 'Snack Super Deal',
  price: 5.2,
  minOrder: 7.8,
  description: '2 spring rolls + 1 drink',
} as const;

/* ─── adapters ────────────────────────────────────────────────────────────── */

/** A URL-safe key for a dish, used in option-group lookup and cart lines. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function tagsFor(item: MenuItemSummaryDto, categoryNames: string[]): DishTag[] {
  const tags: DishTag[] = [];
  if (item.isPopular) tags.push('popular');
  if (item.isGlutenFree) tags.push('gf');
  if (item.isVegan) tags.push('vegan');
  else if (item.isVegetarian) tags.push('vegan');
  if (item.spicyLevel > 0 || categoryNames.some((n) => slugify(n).startsWith('laksa'))) tags.push('spicy');
  return tags;
}

function optionsFor(item: MenuItemSummaryDto | MenuItemDetailDto): DishOptionGroup[] {
  const detail = item as MenuItemDetailDto;

  // Prefer real API modifiers the moment they exist; they are the only shape
  // that can be priced by the checkout.
  if (detail.modifierGroups && detail.modifierGroups.length > 0) {
    return detail.modifierGroups.map((group) => ({
      id: String(group.id),
      label: group.name,
      type: group.maxSelect === 1 ? 'radio' : 'checkbox',
      required: group.isRequired,
      min: group.minSelect,
      max: group.maxSelect,
      choices: group.modifiers
        .filter((m) => m.isAvailable)
        .map<DishChoice>((m) => ({
          id: String(m.id),
          label: m.name,
          ...(m.priceAdjustment ? { delta: m.priceAdjustment } : {}),
        })),
    }));
  }

  const printed = OPTIONS_BY_NAME[item.name];
  if (printed) return printed;
  if (WOK_NAMES.has(item.name)) return WOK_WITH_RICE;
  if (slugify(item.name).startsWith('rice-bowl')) return RICE_BOWL_DEFAULT;
  if (item.spicyLevel > 0 || item.hasModifiers) return [SPICE];
  return [];
}

export function mapDish(item: MenuItemSummaryDto, categoryNames: string[] = []): Dish {
  return {
    id: item.id,
    slug: slugify(item.name),
    name: item.name,
    desc: item.description ?? '',
    price: item.basePrice,
    categoryIds: [item.categoryId],
    tags: tagsFor(item, categoryNames),
    options: optionsFor(item),
    image: item.imageUrl,
    isAvailable: item.isAvailable,
    spicyLevel: item.spicyLevel,
  };
}

/**
 * Flattens the API's categories-with-items payload into one dish list plus a
 * category index. Components then work from `Dish`, not from the wire shape —
 * the design set's catalog is keyed by section, and one dish can appear in
 * several.
 */
export function buildMenuIndex(payload: CategoryWithItemsDto[]): {
  dishes: Dish[];
  categories: MenuCategory[];
} {
  const bySlug = new Map<string, Dish>();
  const categories: MenuCategory[] = [];

  for (const category of payload) {
    categories.push({
      id: category.id,
      label: category.name,
      desc: category.description ?? '',
      count: category.items.length,
    });

    for (const item of category.items) {
      const slug = slugify(item.name);
      const existing = bySlug.get(slug);
      if (existing) {
        // Same dish listed twice (the menu carries a "(1 choice)" and a
        // "(Combo)" pho) — keep the cheaper card and let the option group carry
        // the upgrade, which is how the printed menu reads.
        if (!existing.categoryIds.includes(category.id)) {
          existing.categoryIds.push(category.id);
        }
        continue;
      }
      bySlug.set(slug, mapDish(item, [category.name]));
    }
  }

  return { dishes: [...bySlug.values()], categories };
}

/** Dishes belonging to a section, in menu order (as the API returned them). */
export function dishesInCategory(dishes: Dish[], categoryId: number): Dish[] {
  return dishes.filter((d) => d.categoryIds.includes(categoryId));
}

/** The two-letter monogram used by the woven placeholder for photo-less dishes. */
export function dishInitials(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}

/* ─── the pricing contract ────────────────────────────────────────────────── */

/**
 * Unit price for a dish with the given selections, before quantity.
 * Ported verbatim from menu-data.js `priceOf`: the base price plus every
 * selected choice's delta. Range groups (the spice scale) are free.
 */
export function priceOf(dish: Dish, selections: DishSelections = {}): number {
  let total = dish.price;

  for (const group of dish.options) {
    if (group.type === 'range') continue;
    const picked = selections[group.id];
    const ids = Array.isArray(picked) ? picked : picked != null ? [String(picked)] : [];
    for (const id of ids) {
      const choice = group.choices?.find((c) => c.id === id);
      if (choice?.delta) total += choice.delta;
    }
  }

  return total;
}

/** The selections implied by a dish's defaults — first radio choice, spice value. */
export function defaultSelections(dish: Dish): DishSelections {
  const selections: DishSelections = {};
  for (const group of dish.options) {
    if (group.type === 'range') {
      selections[group.id] = group.value ?? group.min ?? 3;
    } else if (group.type === 'radio' && group.choices?.length) {
      selections[group.id] = group.choices[0].id;
    }
  }
  return selections;
}

/**
 * `[label]: [choice labels]` for one line per group — the summary the cart and
 * the kitchen ticket show. Ported from the design set's `summaryText`.
 */
export function describeSelections(dish: Dish, selections: DishSelections): string[] {
  const out: string[] = [];

  for (const group of dish.options) {
    if (group.type === 'range') {
      const value = selections[group.id] ?? group.value;
      if (value != null) out.push(`${group.label}: ${value}`);
      continue;
    }

    const picked = selections[group.id];
    if (picked == null) continue;
    const ids = Array.isArray(picked) ? picked : [String(picked)];
    if (!ids.length) continue;

    const labels = ids.map((id) => group.choices?.find((c) => c.id === id)?.label ?? id);
    out.push(`${group.label}: ${labels.join(', ')}`);
  }

  return out;
}

/** Required groups the customer has not answered yet. */
export function missingRequired(dish: Dish, selections: DishSelections): DishOptionGroup[] {
  return dish.options.filter(
    (group) => group.required && group.type !== 'range' && selections[group.id] == null
  );
}
