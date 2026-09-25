import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMenuIndex } from '@/hooks/useMenuIndex';
import { useCartStore } from '@/stores/cartStore';
import { useServiceStore } from '@/stores/serviceStore';
import { money, openState, prettyTime, SITE } from '@/lib/site';
import { SUPER_DEAL } from '@/lib/menuModel';
import { DishRow } from '@/components/menu/DishRow';
import { ServiceBar } from '@/components/layout/ServiceBar';
import { Panel } from '@/components/ui/Panel';
import { SkeletonRow, StateBlock } from '@/components/ui/State';
import { StateIcons } from '@/components/ui/stateIcons';
import { showToast } from '@/stores/toastStore';
import type { Dish } from '@/types/menu';

function Star() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.8L12 16.9l-5.2 2.75 1-5.8-4.2-4.1 5.8-.85z" />
    </svg>
  );
}

/** The store header: who this is, where, when it is open. */
function StoreHead() {
  const now = openState();
  return (
    <section className="store-head" data-od-id="store-head">
      <div className="container-shell store-head-inner">
        <div>
          <p className="eyebrow eyebrow-gold">
            {SITE.suburb} · {SITE.city}
          </p>
          <h1>{SITE.name}</h1>
          <p className="store-rating">
            <span className="store-stars" aria-hidden="true">
              <Star />
              <Star />
              <Star />
              <Star />
              <Star />
            </span>
            <strong>{SITE.rating.score}</strong>
            <span className="of">
              · {SITE.rating.count} Google reviews
            </span>
          </p>
          <p className="store-tags">Vietnamese · Asian · Family kitchen</p>
          <div className="store-meta">
            <span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              {SITE.addressLine}
            </span>
            <span className={now.open ? 'store-open' : 'store-closed'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5V12l3 1.8" />
              </svg>
              {now.open
                ? now.closesAt
                  ? `Open now · until ${prettyTime(now.closesAt)}`
                  : 'Open now'
                : now.opensAt
                  ? `Closed · opens ${prettyTime(now.opensAt)}`
                  : 'Closed today'}
            </span>
            <span>
              <a href={SITE.phoneHref}>{SITE.phone}</a>
            </span>
          </div>
        </div>
        <div className="store-hero">
          <img src="/hero.jpg" width={1600} height={1200} alt="A spread of fresh Vietnamese dishes from the Asian Taste kitchen" />
        </div>
      </div>
    </section>
  );
}

/**
 * The catalog.
 *
 * Fourteen sections, one request, a persistent section rail on desktop that
 * becomes a horizontal chip strip on smaller screens. The rail highlights the
 * section you are actually looking at — a section list that never moves is
 * decoration, and this is the only orientation cue on an 82-dish page.
 */
export function MenuPage() {
  const { index, isLoading, error, refetch } = useMenuIndex();
  const addConfigured = useCartStore((s) => s.addConfigured);
  const service = useServiceStore((s) => s.service);

  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<number | null>(null);

  const categories = index.categories;
  const dishes = index.dishes;

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories
      .map((category) => ({
        category,
        items: dishes.filter(
          (d) =>
            d.categoryIds.includes(category.id) &&
            (!q || d.name.toLowerCase().includes(q) || d.desc.toLowerCase().includes(q))
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [categories, dishes, query]);

  const shown = grouped.reduce((sum, g) => sum + g.items.length, 0);

  /**
   * Identity of the rendered section set. `useMenuIndex` rebuilds `index` every
   * render, so `grouped` is a fresh array each time and cannot be a dependency —
   * the effect would tear down and rebuild on every keystroke and, worse, reset
   * the click intent it exists to protect. This string changes only when the set
   * or order of sections actually changes.
   */
  const sectionKey = grouped.map((g) => g.category.id).join(',');

  /**
   * Which section the rail highlights. Two writers feed one state: a rail click
   * is the reader's explicit intent, and the scroll position is ambient. A click
   * wins until the reader scrolls the page themselves — because the page cannot
   * always honour the click. The last sections are shorter than the viewport, so
   * they can never be scrolled up to the reading line; a position-only spy would
   * leave the section above the clicked one lit. That is the "one slower than I
   * press" bug, and it only shows on the way down.
   *
   * The intent outlives the click: native smooth scrolling fires `scroll` for as
   * long as it runs, so the spy must stay out of the way until a real gesture
   * (wheel, touch drag, key scroll) proves the reader took over again.
   */
  const intentRef = useRef<number | null>(null);

  const selectSection = (id: number) => {
    intentRef.current = id;
    setActiveCat(id);
  };

  // Highlight the section you are looking at.
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('.cat-section'));
    if (!sections.length) return;
    intentRef.current = null;

    // The y where a section counts as "at the top": the exact offset the browser
    // lands an anchor on, which is the section's own `scroll-margin-top`. Reading
    // it live keeps the rail, the chip bar and the spy aligned across the 1080px
    // breakpoint and every header re-measure.
    const readingLine = () => parseFloat(getComputedStyle(sections[0]).scrollMarginTop) || 0;

    const sync = () => {
      if (intentRef.current !== null) return;
      const line = readingLine() + 4;
      let id = sections[0].dataset.cat;
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= line) id = section.dataset.cat;
        else break;
      }
      if (id) setActiveCat(Number(id));
    };

    // A deliberate scroll gesture hands the rail back to the position spy.
    const release = () => {
      if (intentRef.current === null) return;
      intentRef.current = null;
      sync();
    };

    // Pointer presses outside the section nav (scrollbar drag, clicking into the
    // list) are the reader driving the page, so they release the intent too.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.cat-rail, .cat-bar')) return;
      release();
    };

    sync();
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    window.addEventListener('wheel', release, { passive: true });
    window.addEventListener('touchmove', release, { passive: true });
    window.addEventListener('keydown', release);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('wheel', release);
      window.removeEventListener('touchmove', release);
      window.removeEventListener('keydown', release);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [sectionKey]);

  const quickAdd = (dish: Dish) => {
    addConfigured(dish, { selections: {} });
    showToast(`${dish.name} added to your order`);
  };

  return (
    <>
      <StoreHead />
      <ServiceBar />

      <section className="section" id="menu" data-od-id="menu">
        <div className="container-shell">
          <div className="catalog-layout">
            <nav className="cat-rail" aria-label="Menu sections">
              <span className="cat-rail-label">Menu sections</span>
              {categories.map((category) => (
                <a
                  key={category.id}
                  href={`#cat-${category.id}`}
                  aria-current={activeCat === category.id ? 'true' : undefined}
                  onClick={() => selectSection(category.id)}
                >
                  {category.label}
                  <span className="rail-count">{category.count}</span>
                </a>
              ))}
            </nav>

            <div className="catalog-main">
              <div className="catalog-tools">
                <div className="head-copy">
                  <p className="eyebrow eyebrow-gold">The full menu</p>
                  <h2 style={{ marginBottom: 0 }}>Fourteen sections, one happy table</h2>
                </div>
                <div className="search">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="6.5" />
                    <path d="M16 16l4 4" />
                  </svg>
                  <label className="sr-only" htmlFor="dish-search">
                    Search dishes
                  </label>
                  <input
                    className="input"
                    id="dish-search"
                    type="search"
                    placeholder="Search dishes…"
                    autoComplete="off"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>

              <nav className="cat-bar" aria-label="Menu sections">
                {categories.map((category) => (
                  <a
                    key={category.id}
                    href={`#cat-${category.id}`}
                    aria-current={activeCat === category.id ? 'true' : undefined}
                    onClick={() => selectSection(category.id)}
                  >
                    {category.label}
                    <span className="rail-count">{category.count}</span>
                  </a>
                ))}
              </nav>

              <p className="menu-count" aria-live="polite">
                {isLoading
                  ? 'Loading the menu…'
                  : query
                    ? `Showing ${shown} of ${dishes.length} dishes for “${query.trim()}”`
                    : `Showing all ${dishes.length} dishes across ${categories.length} sections`}
              </p>

              {error ? (
                <Panel>
                  <StateBlock
                    error
                    icon={StateIcons.warning}
                    title="We couldn't reach the kitchen"
                    body="Check your internet and try again — nothing in your order has been lost."
                    action={
                      <button type="button" className="btn btn-primary" onClick={() => refetch()}>
                        Try again
                      </button>
                    }
                  />
                </Panel>
              ) : isLoading ? (
                <div className="item-list">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonRow key={i} />
                  ))}
                </div>
              ) : grouped.length === 0 ? (
                <Panel>
                  <StateBlock
                    icon={StateIcons.search}
                    title="No dishes found"
                    body={`We couldn't match “${query.trim()}”. Try a shorter word, or clear the search.`}
                    action={
                      <button type="button" className="btn btn-secondary" onClick={() => setQuery('')}>
                        Clear search
                      </button>
                    }
                  />
                </Panel>
              ) : (
                grouped.map(({ category, items }) => (
                  <section
                    className="cat-section"
                    id={`cat-${category.id}`}
                    data-cat={category.id}
                    data-od-id={`cat-${category.id}`}
                    key={category.id}
                  >
                    <div className="cat-head">
                      <div>
                        <h2>{category.label}</h2>
                        {category.desc && <p>{category.desc}</p>}
                      </div>
                      <span className="cat-count">
                        {items.length} item{items.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="item-list">
                      {items.map((dish) => (
                        <DishRow key={dish.slug} dish={dish} onQuickAdd={quickAdd} />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="deal-band" id="deals" data-od-id="deals">
        <div className="container-shell deal-inner">
          <div>
            <p className="eyebrow eyebrow-gold">Super deals</p>
            <h2>Lunch-sized prices, dinner-sized plates.</h2>
            <p className="lead">
              Our snack super deal pairs two spring rolls with a drink — from just{' '}
              {money(SUPER_DEAL.price)} on orders over {money(SUPER_DEAL.minOrder)}. Ask in store
              about today&rsquo;s family bundle.
            </p>
            <div className="hero-cta">
              <Link className="btn btn-gold" to="/menu#cat-deals">
                Browse deals
              </Link>
            </div>
          </div>
          <div className="deal-card">
            <span className="pill">Save</span>
            <h3>{SUPER_DEAL.name}</h3>
            <p className="deal-price">{money(SUPER_DEAL.price)}</p>
            <p>
              {SUPER_DEAL.description}. Available on orders from {money(SUPER_DEAL.minOrder)}.
            </p>
            <Link className="btn btn-primary btn-block" to="/menu/item/snack-super-deal">
              Build this deal
            </Link>
          </div>
        </div>
      </section>

      <section className="section" id="story" data-od-id="story">
        <div className="container-shell grid-2-1">
          <div className="story-copy">
            <p className="eyebrow eyebrow-gold">Our story</p>
            <h2>Run by one family, cooked for yours.</h2>
            <p className="lead">
              Asian Taste is a small {SITE.suburb} kitchen. The recipes are the ones we cook at
              home — generous, fresh, and adjusted to your taste at the table.
            </p>
            <ul className="story-list">
              <li>
                <span className="mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <div>
                  <strong>Broth from scratch</strong>
                  <p>Simmered each morning for hours — never a powder.</p>
                </div>
              </li>
              <li>
                <span className="mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <div>
                  <strong>Your spice, your call</strong>
                  <p>Choose a heat level from 1 to 5 on any dish.</p>
                </div>
              </li>
              <li>
                <span className="mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <div>
                  <strong>Vegan on request</strong>
                  <p>Most plates can be made with plant-based protein.</p>
                </div>
              </li>
            </ul>
            <p className="helpline" style={{ marginTop: 24 }} data-service={service}>
              Collection only for now, and it follows you through checkout.
            </p>
          </div>
          <div className="story-media">
            <img src="/family.jpg" width={1200} height={1500} alt="The Asian Taste family preparing dishes in the kitchen" loading="lazy" />
          </div>
        </div>
      </section>

    </>
  );
}
