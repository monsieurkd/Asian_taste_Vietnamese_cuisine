import { Link } from 'react-router-dom';
import { useMenuIndex } from '@/hooks/useMenuIndex';
import { money, SITE } from '@/lib/site';
import { SUPER_DEAL } from '@/lib/menuModel';
import { DishCard } from '@/components/menu/DishCard';
import { ServiceBar } from '@/components/layout/ServiceBar';
import { Panel } from '@/components/ui/Panel';
import { StateBlock } from '@/components/ui/State';
import { StateIcons } from '@/components/ui/stateIcons';

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function StoryMark() {
  return (
    <span className="mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 13l4 4L19 7" />
      </svg>
    </span>
  );
}

/**
 * The storefront home.
 *
 * `menu` answers "what do you sell?"; this answers "should I order, and how
 * fast?". It deliberately does not render the whole catalog — it curates: an
 * appetite hook, the service decision, the three dishes the neighbourhood
 * actually orders, a way into each section, the deal, the family, and one
 * closing action.
 *
 * The three picks are the dishes the API flags `isPopular`, in its order. There
 * is no fabricated rating: the platform publishes none for the rest, so those
 * cards carry a line about the dish instead.
 */
export function HomePage() {
  const { index, isLoading, error, refetch } = useMenuIndex();

  const picks = index.dishes.filter((d) => d.tags.includes('popular')).slice(0, 3);

  return (
    <>
      <section className="hero" data-od-id="home-hero">
        <div className="container-shell hero-inner">
          <div className="hero-copy">
            <p className="eyebrow eyebrow-gold">
              {SITE.suburb} · {SITE.city} · Open 7 days
            </p>
            <h1>{SITE.promise}</h1>
            <p className="lead">
              Pho simmered every morning, banh mi built to order — {index.dishes.length || 80}+
              dishes from our family kitchen. Pick up in about 15 minutes, or dine in.
            </p>
            <div className="hero-cta">
              <Link className="btn btn-primary" to="/menu" data-od-id="home-hero-cta">
                Start your order
              </Link>
              <a className="btn btn-secondary btn-arrow" href="#deals">
                See this week&rsquo;s deals
              </a>
            </div>
            <div className="hero-trust">
              <span>
                <i className="dot" />
                {index.dishes.length || 82} dishes · {index.categories.length || 14} sections
              </span>
              <span>
                <i className="dot" />
                Gluten-free &amp; vegan options
              </span>
              <span>
                <i className="dot" />
                Spice level 1–5
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <img
              src="/hero.jpg"
              width={1600}
              height={1200}
              alt="A spread of fresh Vietnamese dishes from the Asian Taste kitchen"
            />
            <div className="hero-stamp">
              <strong>
                {SITE.rating.score} from {SITE.rating.count} Google reviews
              </strong>
              <span>{SITE.suburb}, {SITE.city}</span>
            </div>
          </div>
        </div>
      </section>

      <ServiceBar />

      <section className="section" data-od-id="home-picks">
        <div className="container-shell">
          <div className="head">
            <div className="head-copy">
              <p className="eyebrow eyebrow-gold">Most liked</p>
              <h2>The dishes everyone orders</h2>
              <p className="lead">
                Ranked by how often the neighbourhood orders them — not by what we&rsquo;d like to
                sell you.
              </p>
            </div>
            <Link className="linkrow" to="/menu">
              The full menu
              <ChevronIcon />
            </Link>
          </div>

          {error ? (
            <Panel>
              <StateBlock
                error
                icon={StateIcons.warning}
                title="We couldn't reach the kitchen"
                body="Check your internet and try again."
                action={
                  <button type="button" className="btn btn-primary" onClick={() => refetch()}>
                    Try again
                  </button>
                }
              />
            </Panel>
          ) : isLoading ? (
            <div className="menu-grid">
              {Array.from({ length: 3 }).map((_, i) => (
                <div className="dish-card" key={i} aria-hidden="true">
                  <div className="skeleton sk-img" />
                  <div className="skeleton sk-line sk-title" />
                  <div className="skeleton sk-line" />
                  <div className="skeleton sk-line w-4/5" />
                </div>
              ))}
            </div>
          ) : picks.length === 0 ? (
            <Panel>
              <StateBlock
                icon={StateIcons.search}
                title="The menu is being updated"
                body="Nothing is marked popular right now — the full menu is still one click away."
                action={
                  <Link to="/menu" className="btn btn-primary">
                    Browse the menu
                  </Link>
                }
              />
            </Panel>
          ) : (
            <div className="menu-grid">
              {picks.map((dish, i) => (
                <DishCard key={dish.slug} dish={dish} rank={i + 1} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="band band-surface" data-od-id="home-browse">
        <div className="container-shell">
          <div className="head">
            <div className="head-copy">
              <p className="eyebrow eyebrow-gold">Browse the kitchen</p>
              <h2>Fourteen sections, one happy table</h2>
              <p className="lead">Pick a section to open the full menu right where you need it.</p>
            </div>
          </div>
          <nav className="cat-index" aria-label="Browse the menu by section">
            {index.categories.map((category) => (
              <Link key={category.id} to={`/menu#cat-${category.id}`}>
                <span className="ci-text">
                  <strong>{category.label}</strong>
                  <small>{category.desc}</small>
                </span>
                <span className="ci-go">
                  {category.count} item{category.count === 1 ? '' : 's'}
                  <ChevronIcon />
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <section className="deal-band" id="deals" data-od-id="home-deals">
        <div className="container-shell deal-inner">
          <div>
            <p className="eyebrow eyebrow-gold">Super deals</p>
            <h2>Lunch-sized prices, dinner-sized plates.</h2>
            <p className="lead">
              Our snack super deal pairs two spring rolls with a drink — from just{' '}
              {money(SUPER_DEAL.price)} on orders over {money(SUPER_DEAL.minOrder)}.
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
            <Link className="btn btn-primary btn-block" to="/menu#cat-deals">
              Build this deal
            </Link>
          </div>
        </div>
      </section>

      <section className="section" id="story" data-od-id="home-story">
        <div className="container-shell grid-2-1">
          <div className="story-copy">
            <p className="eyebrow eyebrow-gold">Our story</p>
            <h2>Run by one family, cooked for yours.</h2>
            <p className="lead">
              Asian Taste is a small {SITE.suburb} kitchen on Henley Beach Road. The recipes are the
              ones we cook at home — generous, fresh, and adjusted to your taste at the table.
            </p>
            <ul className="story-list">
              <li>
                <StoryMark />
                <div>
                  <strong>Broth from scratch</strong>
                  <p>Simmered each morning for hours — never a powder.</p>
                </div>
              </li>
              <li>
                <StoryMark />
                <div>
                  <strong>Your spice, your call</strong>
                  <p>Choose a heat level from 1 to 5 on any dish.</p>
                </div>
              </li>
              <li>
                <StoryMark />
                <div>
                  <strong>Vegan on request</strong>
                  <p>Most plates can be made with plant-based protein.</p>
                </div>
              </li>
            </ul>
          </div>
          <div className="story-media">
            <img
              src="/family.jpg"
              width={1200}
              height={1500}
              alt="The Asian Taste family preparing dishes in the kitchen"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      <section className="cta-strip section" data-od-id="home-close">
        <div className="container-shell">
          <p className="eyebrow eyebrow-gold">Ready when you are</p>
          <h2>Hungry? We&rsquo;re already cooking.</h2>
          <p className="lead">
            Order online for pickup across {SITE.suburb} and the west, or call past the shop on
            Henley Beach Road — open seven days.
          </p>
          <div className="hero-cta">
            <Link className="btn btn-primary btn-arrow" to="/menu">
              Start your order
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
