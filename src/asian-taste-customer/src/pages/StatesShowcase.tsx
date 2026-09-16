import { Link } from 'react-router-dom';
import { Panel, PanelBody, PanelHead } from '@/components/ui/Panel';
import { SkeletonCard, StateBlock } from '@/components/ui/State';
import { StateIcons } from '@/components/ui/stateIcons';

/**
 * The shared state set, on one page.
 *
 * Ported from `states.html` in the design set so the four states a screen can be
 * in — empty, loading, error, unavailable — are all reachable and reviewable
 * after the port, rather than only appearing when something goes wrong in
 * production. It is linked from the footer for anyone who wants to check them.
 */
export function StatesShowcase() {
  return (
    <div className="container-shell section" data-od-id="states">
      <div className="pagehead">
        <p className="eyebrow eyebrow-gold">Component set</p>
        <h1>System states</h1>
        <p className="lead">
          Every screen in the flow can be empty, loading, broken or sold out. These are the shared
          blocks that handle all four, so no corner of the product is a dead end.
        </p>
      </div>

      <section style={{ marginTop: 48 }} data-od-id="states-empty">
        <p className="eyebrow eyebrow-gold">01</p>
        <h2 style={{ marginBottom: 20 }}>Empty states</h2>
        <div className="grid-3">
          <Panel>
            <PanelHead>
              <h3>Empty order</h3>
            </PanelHead>
            <StateBlock
              icon={StateIcons.cart}
              title="Nothing here yet"
              body="Your order is empty. Browse the menu and add a few favourites."
              action={<Link to="/menu" className="btn btn-primary">Browse the menu</Link>}
            />
          </Panel>
          <Panel>
            <PanelHead>
              <h3>No search results</h3>
            </PanelHead>
            <StateBlock
              icon={StateIcons.search}
              title="No dishes found"
              body="Try a shorter word, or clear the filters."
              action={<Link to="/search" className="btn btn-secondary">Search again</Link>}
            />
          </Panel>
          <Panel>
            <PanelHead>
              <h3>Nothing saved</h3>
            </PanelHead>
            <StateBlock
              icon={StateIcons.pin}
              title="No address yet"
              body="Add a delivery address and we'll remember it for next time."
              action={<Link to="/account" className="btn btn-secondary">Add an address</Link>}
            />
          </Panel>
        </div>
      </section>

      <section style={{ marginTop: 56 }} data-od-id="states-loading">
        <p className="eyebrow eyebrow-gold">02</p>
        <h2 style={{ marginBottom: 20 }}>Loading states</h2>
        <Panel>
          <PanelHead>
            <h3>Menu loading</h3>
            <span className="pill pill-neutral">Shimmer</span>
          </PanelHead>
          <PanelBody>
            <div className="menu-grid">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
            <p className="meta center" style={{ margin: '20px 0 0' }} role="status">
              Checking today&rsquo;s availability…
            </p>
          </PanelBody>
        </Panel>
      </section>

      <section style={{ marginTop: 56 }} data-od-id="states-error">
        <p className="eyebrow eyebrow-gold">03</p>
        <h2 style={{ marginBottom: 20 }}>Error states</h2>
        <div className="grid-3">
          <Panel>
            <PanelHead>
              <h3>Couldn&rsquo;t load the menu</h3>
            </PanelHead>
            <StateBlock
              error
              icon={StateIcons.warning}
              title="Connection lost"
              body="We couldn't reach the kitchen. Check your internet and try again — your order is still saved."
              action={<button type="button" className="btn btn-primary">Try again</button>}
            />
          </Panel>
          <Panel>
            <PanelHead>
              <h3>Payment declined</h3>
            </PanelHead>
            <StateBlock
              error
              icon={StateIcons.card}
              title="That card didn't go through"
              body="Nothing has been charged. Try another card, or pay at the counter on pickup."
              action={<button type="button" className="btn btn-secondary">Try another card</button>}
            />
          </Panel>
          <Panel>
            <PanelHead>
              <h3>Unavailable</h3>
            </PanelHead>
            <StateBlock
              error
              icon={StateIcons.clock}
              title="Not available right now"
              body="This section opens again shortly. In the meantime, the rice bowls and wok dishes are in full swing."
              action={<Link to="/menu" className="btn btn-secondary">See what's cooking</Link>}
            />
          </Panel>
        </div>
      </section>

      <section style={{ marginTop: 56 }} data-od-id="states-soldout">
        <p className="eyebrow eyebrow-gold">04</p>
        <h2 style={{ marginBottom: 20 }}>Sold out</h2>
        <Panel>
          <PanelBody>
            <p className="helpline">
              A sold-out dish keeps its place on the menu — it is still part of the menu — and is
              made honestly unorderable rather than hidden.
            </p>
            <div style={{ marginTop: 20, maxWidth: 380 }}>
              <article className="dish-card is-soldout">
                <div className="dish-media is-flat ph">
                  <span className="ph-mono" aria-hidden="true">
                    SC
                  </span>
                  <span className="stamp">Sold out</span>
                </div>
                <h3 className="dish-name">Sweet Corn Soup</h3>
                <p className="dish-desc">Silky, gently sweet soup. Back tomorrow morning.</p>
                <div className="dish-foot">
                  <span className="price" style={{ color: 'var(--color-muted)' }}>
                    $7.80
                  </span>
                  <button type="button" className="add-btn" disabled aria-disabled="true">
                    Sold out
                  </button>
                </div>
              </article>
            </div>
          </PanelBody>
        </Panel>
      </section>
    </div>
  );
}
