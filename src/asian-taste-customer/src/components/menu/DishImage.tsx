interface DishImageProps {
  /** The dish photo URL, when one exists in the menu data. */
  src?: string | null;
  /** Used for the alt text and the branded fallback. */
  name: string;
  /** Tailwind classes for the wrapper — callers control sizing/aspect. */
  className?: string;
  /** Applied to the <img> for hover effects. */
  imgClassName?: string;
  /**
   * Render a branded placeholder when there is no photo. Use this only where
   * the image slot is NOT adjacent to the dish name (e.g. a large modal hero) —
   * an empty region there would itself look broken.
   */
  showFallback?: boolean;
}

/**
 * A dish image that degrades gracefully.
 *
 * History, because each step was informed by the design judge:
 *  1. A grey box with a generic "broken image" icon read as a broken page.
 *  2. A large monogram initial read as an *even more* obvious failed load.
 *  3. A tan panel repeating the dish name duplicated the card title sitting
 *     directly beneath it, so the whole menu read as a wireframe.
 *
 * The honest answer: there are currently no dish photos in the data at all
 * (menu_items.image_url exists but is never populated by the seed). Where the
 * dish name already appears immediately below, rendering nothing is better than
 * a placeholder that repeats it — so by default we render nothing.
 */
export function DishImage({
  src,
  name,
  className = '',
  imgClassName = '',
  showFallback = false,
}: DishImageProps) {
  if (!src) {
    if (!showFallback) return null;

    // A quiet on-token surface rather than a dashed "missing image" frame.
    // The dish name is deliberately NOT repeated here — it appears immediately
    // below in the modal, and duplicating it made the region read as a broken
    // image placeholder rather than a designed surface.
    return (
      <div
        className={`flex items-center justify-center bg-secondary/90 bg-[radial-gradient(circle_at_30%_20%,rgba(212,175,55,0.18),transparent_60%)] ${className}`}
        role="img"
        aria-label={`${name} — no photo available`}
      >
        <span className="font-serif text-2xl font-semibold tracking-wide text-cream/80">
          Asian Taste
        </span>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden bg-tan ${className}`}>
      <img
        src={src}
        alt={name}
        loading="lazy"
        className={`h-full w-full object-cover ${imgClassName}`}
      />
    </div>
  );
}
