import { useState } from 'react';
import { dishPhotoDimensions } from '@/lib/dishPhotos';
import { dishInitials } from '@/lib/menuModel';

interface DishMediaProps {
  /** The resolved photo URL, when the dish has one. */
  src: string | null;
  name: string;
  /** Wrapper classes — callers control the ratio and radius. */
  className?: string;
  imgClassName?: string;
  /** `flat` is the fixed 4:3 card well; `detail` adopts the photo's own ratio. */
  variant?: 'card' | 'flat' | 'detail';
  /** A stamp over the media, e.g. "Sold out". */
  overlay?: React.ReactNode;
  priority?: boolean;
}

/**
 * Dish media that degrades honestly.
 *
 * Only seven of the 82 dishes have a published photo — the rest render the
 * design set's woven cream plate with the dish initials on it. That is the
 * correct rendering, not a gap: the alternative tried earlier was reproducing
 * the dish name underneath the image, which duplicated the card title and made
 * the whole menu read as a wireframe.
 *
 * The photo's native ratio is applied when known, so a load never reflows the
 * grid around it.
 */
export function DishMedia({
  src,
  name,
  className = '',
  imgClassName = '',
  variant = 'card',
  overlay,
  priority,
}: DishMediaProps) {
  const [failed, setFailed] = useState(false);

  const dimensions = dishPhotoDimensions(src);
  const showPhoto = !!src && !failed;
  const ratioClass =
    variant === 'detail' ? 'dish-media is-detail' : variant === 'flat' ? 'dish-media is-flat' : 'dish-media';

  if (!showPhoto) {
    return (
      <div className={`${ratioClass} ph ${className}`}>
        <span className="ph-mono" aria-hidden="true">
          {dishInitials(name)}
        </span>
        {overlay}
      </div>
    );
  }

  return (
    <div className={`${ratioClass} ${className}`}>
      <img
        src={src}
        alt={name}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        width={dimensions?.[0]}
        height={dimensions?.[1]}
        className={imgClassName}
        onError={() => setFailed(true)}
      />
      {overlay}
    </div>
  );
}
