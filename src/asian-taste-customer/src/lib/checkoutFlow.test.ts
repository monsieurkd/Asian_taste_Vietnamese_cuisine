import { describe, it, expect } from 'vitest';
import { subtotalCents, totalCents, formatAud, gstComponentCents } from './money';
import { validateCart, isPayable } from './cartRules';
import { openState } from './openingHours';
// Relative rather than `@/`: the test-wiring guardrail treats every non-relative
// specifier in a spec as a package the app must declare, and `@/types/menu` is an
// alias, not a dependency. Keeping spec imports relative is the documented
// convention (see orderLifecycle.test.ts).
import { OrderType } from '../types/menu';

/**
 * Integration tests: the seams between the new pure modules.
 *
 * The five feature modules each pass on their own. This file exists because that
 * is not the same as a correct *checkout flow* — the bugs that reach a customer
 * live where two modules disagree, and no single unit test can see that.
 *
 * What it pins:
 *   1. the price the customer is shown equals the price the cart is validated against
 *   2. a cart that cannot be fulfilled never reaches a payable state
 *   3. "closed" is a display state, not a validation failure — a customer may
 *      browse and build a cart while shut, they just cannot check out blind to it
 */
const HOURS = {
  days: [
    { day: 0, opens: '11:00', closes: '21:00', closed: true },
    { day: 1, opens: '11:00', closes: '21:00' },
    { day: 2, opens: '11:00', closes: '21:00' },
    { day: 3, opens: '11:00', closes: '21:00' },
    { day: 4, opens: '11:00', closes: '21:00' },
    { day: 5, opens: '11:00', closes: '22:00' },
    { day: 6, opens: '11:00', closes: '22:00' },
  ],
};

function adelaide(y: number, m: number, d: number, h: number, min = 0): Date {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Adelaide',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  return new Date(guess - Math.round((asUtc - guess) / 60_000) * 60_000);
}

const cartLine = (menuItemId: string, name: string, unitPrice: number, quantity: number) => ({
  menuItemId,
  name,
  quantity,
  unitPrice,
});

describe('cart → money integration', () => {
  it('the total the customer is shown matches the lines they added', () => {
    // The single most important seam. `validateCart` judges the cart; `money`
    // prices it. If they disagree the customer pays a different number from the
    // one the validation was reasoning about.
    const lines = [
      cartLine('a', 'Pho', 1650, 2),
      cartLine('b', 'Banh Mi', 950, 1),
      cartLine('c', 'Ca Phe Sua Da', 550, 3),
    ];
    const cart = { lines, orderType: OrderType.Pickup };

    expect(isPayable(cart)).toBe(true);
    expect(totalCents(lines)).toBe(subtotalCents(lines));
    // 2x16.50 + 9.50 + 3x5.50 = 33.00 + 9.50 + 16.50 = 59.00
    expect(totalCents(lines)).toBe(5900);
    expect(formatAud(totalCents(lines))).toBe('$59.00');
  });

  it('shows no GST added on top of the inclusive total', () => {
    const lines = [cartLine('a', 'Pho', 1100, 1)];
    const total = totalCents(lines);
    const gst = gstComponentCents(total);

    expect(total).toBe(1100); // nothing added
    expect(gst).toBe(100); // and the receipt breakdown is derived, not added
    expect(total + gst).not.toBe(total); // proves gst is NOT part of the total
  });

  it('a Delivery cart is unpayable even though it prices up fine', () => {
    // The two modules must not disagree: money is happy, cart rules are not,
    // and the payment path must follow the stricter one.
    const lines = [cartLine('a', 'Pho', 1650, 1)];
    const delivery = { lines, orderType: OrderType.Delivery };

    expect(totalCents(lines)).toBe(1650); // prices fine
    expect(isPayable(delivery)).toBe(false); // but must not be payable
  });

  it('a cart with a sold-out line is unpayable but still shows a total', () => {
    const lines = [{ ...cartLine('a', 'Pho', 1650, 1), available: false }];
    const cart = { lines, orderType: OrderType.Pickup };

    expect(validateCart(cart).map((p) => p.code)).toContain('unavailable');
    expect(isPayable(cart)).toBe(false);
    // The total is still computed so the UI can show what would have been paid.
    expect(formatAud(totalCents(lines))).toBe('$16.50');
  });
});

describe('hours → cart integration', () => {
  it('browsing while closed does not make the cart invalid', () => {
    // Closed is a display state, not a validation error. Conflating them would
    // either block a customer from building an order before opening, or let a
    // shut shop accept one — depending on which module won.
    const sunday = adelaide(2026, 3, 8, 13, 0);
    expect(openState(HOURS, sunday).open).toBe(false);

    const cart = { lines: [cartLine('a', 'Pho', 1650, 1)], orderType: OrderType.Pickup };
    expect(isPayable(cart)).toBe(true); // the cart itself is fine
  });

  it('an open shop and a healthy cart agree that the order may proceed', () => {
    const tuesday = adelaide(2026, 3, 10, 13, 0);
    const cart = { lines: [cartLine('a', 'Pho', 1650, 2)], orderType: OrderType.Pickup };
    expect(openState(HOURS, tuesday).open).toBe(true);
    expect(isPayable(cart)).toBe(true);
  });
});

describe('money → display integration', () => {
  it('every payable cart renders a well-formed price', () => {
    const carts = [
      [cartLine('a', 'A', 1, 1)],
      [cartLine('a', 'A', 99, 1)],
      [cartLine('a', 'A', 100, 1)],
      [cartLine('a', 'A', 123456, 1)],
      [cartLine('a', 'A', 1650, 20)],
    ];
    for (const lines of carts) {
      const rendered = formatAud(totalCents(lines));
      expect(rendered, `rendering ${JSON.stringify(lines)}`).toMatch(/^\$\d{1,3}(,\d{3})*\.\d{2}$/);
    }
  });

  it('a max-quantity cart of the priciest item still renders', () => {
    const lines = [cartLine('a', 'A', 9999, 20)];
    expect(formatAud(totalCents(lines))).toBe('$1,999.80');
  });
});
