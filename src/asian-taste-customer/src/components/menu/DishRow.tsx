import { Link } from 'react-router-dom';
import type { Dish } from '@/types/menu';
import { money } from '@/lib/site';
import { DishMedia } from './DishMedia';
import { Badge } from '@/components/ui/Badge';
import { DishTags } from './DishCard';

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function OptionsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
    </svg>
  );
}

function SoldOutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M7 7l10 10" />
    </svg>
  );
}

/**
 * The catalog's dense row — text left, thumb and the quick action right.
 *
 * A dish that needs a choice sends you to the detail screen rather than adding
 * itself: a required option cannot be defaulted on the customer's behalf, and
 * silently picking one is how the wrong protein reaches the kitchen.
 *
 * The whole cell opens the dish, same as the home-page card: the name link
 * covers the row, the thumb keeps its own link, and the quick-action button is
 * a sibling of both rather than a child — an interactive element nested inside
 * another is invalid and breaks keyboard use.
 */
export function DishRow({ dish, onQuickAdd }: { dish: Dish; onQuickAdd: (dish: Dish) => void }) {
  const configurable = dish.options.some((g) => g.type === 'radio' || g.type === 'checkbox');
  const hint = dish.options.find((g) => g.required && g.type === 'radio')?.label;
  const href = `/menu/item/${dish.slug}`;

  const action = !dish.isAvailable ? (
    <button type="button" className="quick-add" disabled aria-disabled="true" aria-label={`${dish.name} is sold out`}>
      <SoldOutIcon />
    </button>
  ) : configurable ? (
    <Link to={href} className="quick-add is-config" aria-label={`Choose options for ${dish.name}`}>
      <OptionsIcon />
    </Link>
  ) : (
    <button
      type="button"
      className="quick-add"
      onClick={() => onQuickAdd(dish)}
      aria-label={`Add ${dish.name} to your order`}
    >
      <PlusIcon />
    </button>
  );

  return (
    <article className={`item-row ${dish.isAvailable ? '' : 'is-soldout'}`}>
      <div className="item-main">
        <Link to={href} className="item-open" aria-label={`View ${dish.name}`} />
        <div className="item-content">
          {dish.tags.includes('popular') && <Badge kind="liked">Popular</Badge>}
          <h3 className="item-name">{dish.name}</h3>
          <p className="item-desc">{dish.desc}</p>
          <DishTags dish={dish} />
          {!dish.isAvailable ? (
            <p className="item-choice">Sold out today</p>
          ) : hint ? (
            <p className="item-choice">{hint}</p>
          ) : null}
          <div className="item-foot">
            <span className="price">{money(dish.price)}</span>
            {dish.spicyLevel > 0 && <span className="item-like">Heat {dish.spicyLevel}/5</span>}
          </div>
        </div>
      </div>

      <div className="item-thumb">
        {/* The thumb is its own link rather than part of the stretched overlay,
            so it stays clickable while sitting above it. */}
        <Link to={href} className="item-thumb-link" aria-label={`View ${dish.name}`} tabIndex={-1}>
          <DishMedia src={dish.image} name={dish.name} variant="flat" className="h-full w-full" />
        </Link>
        {action}
      </div>
    </article>
  );
}
