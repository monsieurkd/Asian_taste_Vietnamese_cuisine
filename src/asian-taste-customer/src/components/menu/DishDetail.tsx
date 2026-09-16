import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Dish, DishSelections } from '@/types/menu';
import { money } from '@/lib/site';
import {
  defaultSelections,
  describeSelections,
  missingRequired,
  priceOf,
} from '@/lib/menuModel';
import { DishMedia } from './DishMedia';
import { DishTags } from './DishCard';
import { OptionGroup } from './OptionGroup';
import { QuantityStepper } from './QuantityStepper';
import { Badge } from '@/components/ui/Badge';
import { Fact, Facts, Panel, PanelBody, PanelFoot, PanelHead, SumRow } from '@/components/ui/Panel';

export interface DishSelection {
  selections: DishSelections;
  quantity: number;
  note: string;
  unitPrice: number;
}

interface DishDetailProps {
  dish: Dish;
  /** Pre-selects a configuration, when editing a cart line. */
  initial?: DishSelections;
  initialQuantity?: number;
  initialNote?: string;
  onAdd: (selection: DishSelection) => void;
  addLabel?: string;
  secondaryAction?: React.ReactNode;
}

/**
 * The dish detail screen.
 *
 * Layout follows the design set's `dish-detail.html`: media, then the name and
 * copy, then a facts strip, then the option groups, with the live-priced
 * selection pinned alongside. The price is recomputed from the selections on
 * every change — the customer must never see a total that differs from what
 * gets added.
 */
export function DishDetail({
  dish,
  initial,
  initialQuantity = 1,
  initialNote = '',
  onAdd,
  addLabel = 'Add to your order',
  secondaryAction,
}: DishDetailProps) {
  const [selections, setSelections] = useState<DishSelections>(
    () => initial ?? defaultSelections(dish)
  );
  const [quantity, setQuantity] = useState(initialQuantity);
  const [note, setNote] = useState(initialNote);
  const [showErrors, setShowErrors] = useState(false);

  const unitPrice = useMemo(() => priceOf(dish, selections), [dish, selections]);
  const summary = useMemo(() => describeSelections(dish, selections), [dish, selections]);
  const missing = missingRequired(dish, selections);
  const configurable = dish.options.some((g) => g.type === 'radio' || g.type === 'checkbox');

  const setGroup = (id: string, next: string | string[] | number) =>
    setSelections((prev) => ({ ...prev, [id]: next }));

  const handleAdd = () => {
    if (missing.length) {
      setShowErrors(true);
      return;
    }
    onAdd({ selections, quantity, note, unitPrice });
  };

  return (
    <div className="split" data-od-id="dish-detail">
      <div className="flex flex-col gap-5">
        <DishMedia
          src={dish.image}
          name={dish.name}
          variant="detail"
          priority
          overlay={
            !dish.isAvailable ? (
              <span className="stamp">Sold out</span>
            ) : dish.tags.includes('popular') ? (
              <span className="media-badge">
                <Badge kind="popular">Popular</Badge>
              </span>
            ) : undefined
          }
        />

        <div>
          {dish.note && <Badge kind="deal">{dish.note}</Badge>}
          <h1 style={{ margin: '12px 0 10px', fontSize: 'clamp(28px, 4vw, 40px)' }}>{dish.name}</h1>
          {dish.desc && (
            <p className="lead" style={{ marginBottom: 16 }}>
              {dish.desc}
            </p>
          )}
          <DishTags dish={dish} />
        </div>

        <Facts label="Good to know">
          <Fact label="Cooked" value="Fresh to order" />
          <Fact label="Heat scale" value="1 – 5, your choice" />
          <Fact label="Vegan" value="Available on request" />
        </Facts>

        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd();
          }}
        >
          {configurable ? (
            dish.options.map((group) => (
              <Panel key={group.id}>
                <PanelBody>
                  <OptionGroup
                    group={group}
                    value={selections[group.id]}
                    onChange={(next) => setGroup(group.id, next)}
                    error={
                      showErrors && group.required && missing.some((g) => g.id === group.id)
                        ? `Please choose ${group.label.toLowerCase()}.`
                        : undefined
                    }
                  />
                </PanelBody>
              </Panel>
            ))
          ) : (
            <Panel>
              <PanelBody>
                <strong>No choices needed.</strong>
                <p className="meta" style={{ margin: '6px 0 0' }}>
                  This one comes exactly as described — just set your quantity.
                </p>
              </PanelBody>
            </Panel>
          )}

          <div className="field">
            <label htmlFor="dish-note">
              Special instructions <span className="muted font-medium">(optional)</span>
            </label>
            <textarea
              id="dish-note"
              className="textarea"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="No coriander, sauce on the side, allergies…"
            />
            <p className="hint">We&rsquo;ll pass this straight to the kitchen.</p>
          </div>
        </form>
      </div>

      <aside className="summary-card panel" aria-label="Your selection">
        <PanelHead>
          <h3>Your selection</h3>
          <span className="pill">
            {quantity} {quantity === 1 ? 'item' : 'items'}
          </span>
        </PanelHead>

        <PanelBody>
          <div className="flex flex-col gap-1.5">
            {summary.length ? (
              summary.map((line) => (
                <p className="meta" key={line} style={{ margin: 0 }}>
                  {line}
                </p>
              ))
            ) : (
              <p className="meta" style={{ margin: 0 }}>
                Made just as described.
              </p>
            )}
          </div>

          {showErrors && missing.length > 0 && (
            <p className="field-error" role="alert" style={{ marginTop: 12 }}>
              Please choose: {missing.map((g) => g.label).join(', ')}.
            </p>
          )}

          <div style={{ marginTop: 16 }}>
            <QuantityStepper value={quantity} onChange={setQuantity} label="Quantity" />
          </div>

          <div style={{ marginTop: 12 }}>
            <SumRow label="Item price" value={money(unitPrice)} />
            <SumRow label="Quantity" value={`× ${quantity}`} />
            <SumRow label="Add to order" value={money(unitPrice * quantity)} total />
          </div>
        </PanelBody>

        <PanelFoot>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={handleAdd}
            disabled={!dish.isAvailable}
          >
            {dish.isAvailable ? addLabel : 'Sold out today'}
          </button>
          {secondaryAction ?? (
            <Link to="/menu" className="btn btn-ghost btn-block" style={{ marginTop: 8 }}>
              Keep browsing the menu
            </Link>
          )}
        </PanelFoot>
      </aside>
    </div>
  );
}
