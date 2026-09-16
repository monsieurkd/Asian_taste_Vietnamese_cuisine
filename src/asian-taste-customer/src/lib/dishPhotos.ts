/**
 * Where the seven real dish photos live.
 *
 * The API's `menu_items.image_url` is NULL for all 82 dishes — migration
 * `10_clear_unverified_dish_images.sql` cleared it after the design judge found
 * the four files wired at the time were photographs of a printed menu board, not
 * food. So the menu legitimately renders without photography, and these seven
 * are the only photos the shop has published.
 *
 * Keyed by dish slug. Provenance, native pixel sizes and the Uber item names the
 * pairings were inferred from are in
 * `docs/DESIGN/mockups/src/assets/dishes/SOURCES.md`. Three of those seven
 * (pad-thai, the two noodle-bowl salads) are inferred from item names and have
 * **not** been confirmed by eye — they are a data edit, not a code change, once
 * someone looks.
 */
const DISH_PHOTOS: Record<string, string> = {
  'pho-beef-noodle-soup-1-choice': '/dishes/pho-beef-noodle-soup.jpg',
  'pho-beef-noodle-soup-combo': '/dishes/pho-beef-noodle-soup.jpg',
  'cold-rolls-serve-of-4': '/dishes/rice-paper-rolls.jpg',
  'homemade-dimsim-serve-of-3': '/dishes/dimsim-3.jpg',
  'spring-roll-serve-of-3': '/dishes/spring-rolls.jpg',
  'pad-thai': '/dishes/pad-thai.jpg',
  'combination-noodle-bowl-salad': '/dishes/combination-noodle-bowl-salad.jpg',
  'crispy-pork-noodle-bowl-salad': '/dishes/crispy-roasted-pork-noodle-bowl-salad.jpg',
};

/**
 * The API's own URL when it has one, otherwise the local published photo.
 * Never a remote hotlink — the mockup set hotlinked `tb-static.uber.com`, and
 * that is someone else's CDN and a URL that will rot.
 */
export function dishPhoto(slug: string, apiUrl?: string | null): string | null {
  if (apiUrl) return apiUrl;
  return DISH_PHOTOS[slug] ?? null;
}

/** Native pixel size per bundled photo, so `<img>` can reserve its box. */
export const DISH_PHOTO_DIMENSIONS: Record<string, [number, number]> = {
  '/dishes/pho-beef-noodle-soup.jpg': [550, 440],
  '/dishes/rice-paper-rolls.jpg': [550, 768],
  '/dishes/dimsim-3.jpg': [550, 699],
  '/dishes/spring-rolls.jpg': [550, 440],
  '/dishes/pad-thai.jpg': [550, 440],
  '/dishes/combination-noodle-bowl-salad.jpg': [550, 440],
  '/dishes/crispy-roasted-pork-noodle-bowl-salad.jpg': [550, 453],
};

export function dishPhotoDimensions(src: string | null): [number, number] | null {
  if (!src) return null;
  return DISH_PHOTO_DIMENSIONS[src] ?? null;
}
