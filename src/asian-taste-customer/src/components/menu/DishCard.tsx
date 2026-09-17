import { Link } from 'react-router-dom';
import type { Dish } from '@/types/menu';
import { money } from '@/lib/site';
import { DishMedia } from './DishMedia';
import { Badge, DishTag } from '@/components/ui/Badge';
import { TAG_LABEL } from '@/lib/menuModel';

/** The hint shown when a dish cannot be added without a choice. */
function requiredHint(dish: Dish): string {
  const group = dish.options.find((g) => g.required && g.type === 'radio');
  return group ? group.label : '';
}

function isConfigurable(dish: Dish): boolean {
  return dish.options.some((g) => g.type === 'radio' || g.type === 'checkbox');
}

const TAG_ORDER = ['gf', 'vegan', 'spicy'] as const;

export function DishTags({ dish }: { dish: Dish }) {
  const tags = TAG_ORDER.filter((t) => dish.tags.includes(t));
  if (!tags.length) return null;
  return (
    <div className="dish-tags">
      {tags.map((tag) => (
        <DishTag key={tag} tag={tag} label={TAG_LABEL[tag]} />
      ))}
    </div>
  );
}

/**
 * The catalog card — one dish, with its photo or woven placeholder.
 *
 * Cards stretch to equal height via the grid's `align-items: stretch` and
 * `.dish-foot { margin-top: auto }`, not by fixing a pixel height: a dish with a
 * two-line name and one with a five-line description have to line up, and a
 * fixed height only works until the copy changes.
 *
 * The whole card is clickable, and it is an <a> rather than a <div> with an
 * onClick: the card has to be reachable by keyboard and openable in a new tab
 * like any other link, and only a real anchor gets both for free. The foot is a
 * sibling of the link, not a child of it, because an interactive element nested
 * inside another interactive element is not valid and breaks keyboard use.
 */
export function DishCard({ dish, rank }: { dish: Dish; rank?: number }) {
  const hint = requiredHint(dish);
  const configurable = isConfigurable(dish);
  const href = `/menu/item/${dish.slug}`;
  const actionLabel = configurable ? `Choose options for ${dish.name}` : `Add ${dish.name} to your order`;

  return (
    <article className="dish-card">
      <Link className="dish-card-link" to={href} aria-label={`View ${dish.name}`}>
        <DishMedia
          src={dish.image}
          name={dish.name}
          overlay={
            rank ? (
              <span className="media-badge">
                <Badge kind="liked">
                  <b style={{ color: 'var(--color-gold)' }}>No. {rank}</b> most liked
                </Badge>
              </span>
            ) : dish.tags.includes('popular') ? (
              <span className="media-badge">
                <Badge kind="popular">Popular</Badge>
              </span>
            ) : undefined
          }
        />

        <h3 className="dish-name">{dish.name}</h3>
        {hint && <p className="dish-note">{hint}</p>}
        <p className="dish-desc">{dish.desc}</p>
        <DishTags dish={dish} />
      </Link>

      <div className="dish-foot">
        <span className="price">{money(dish.price)}</span>
        {dish.isAvailable ? (
          <Link to={href} className="add-btn" aria-label={actionLabel}>
            {configurable ? 'Choose options' : 'Add'}
          </Link>
        ) : (
          <button type="button" className="add-btn" disabled aria-disabled="true">
            Sold out
          </button>
        )}
      </div>
    </article>
  );
}
