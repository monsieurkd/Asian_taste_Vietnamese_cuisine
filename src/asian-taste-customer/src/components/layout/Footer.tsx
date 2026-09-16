import { Link } from 'react-router-dom';
import { BrandMark } from '@/components/layout/Brand';
import { HOURS, SITE } from '@/lib/site';

/**
 * The storefront footer.
 *
 * Every value here is one the shop publishes. This block used to carry an
 * invented street address, invented hours and a Sydney (02) number — for an
 * Adelaide shop, a wrong phone number and a wrong suburb are the two facts a
 * first-time customer actually checks, so a placeholder here is worse than
 * omitting the block.
 */
export function Footer() {
  return (
    <footer className="sitefoot on-dark" id="visit" data-od-id="footer">
      <div className="container-shell">
        <div className="sitefoot-grid">
          <div>
            <span className="brand">
              <BrandMark />
              <span className="brand-text">
                <span className="brand-name">{SITE.name}</span>
                <span className="brand-tag">{SITE.tagline}</span>
              </span>
            </span>
            <p className="brandline">Taste of happiness.</p>
            <p style={{ marginTop: 14, maxWidth: '34ch' }}>
              Fresh, family-style Vietnamese cooking in {SITE.suburb} — dine in, takeaway or
              delivery.
            </p>
          </div>

          <div>
            <h4>Find us</h4>
            <ul>
              <li>{SITE.street}</li>
              <li>
                {SITE.suburb}, {SITE.city} {SITE.state} {SITE.postcode}
              </li>
              <li>
                <a href={SITE.phoneHref}>{SITE.phone}</a>
              </li>
              <li>
                <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
              </li>
            </ul>
          </div>

          <div>
            <h4>Hours</h4>
            <ul>
              {HOURS.map((row) => (
                <li key={row.days}>
                  {row.days}
                  <br />
                  {row.hours}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Order</h4>
            <ul>
              <li>
                <Link to="/menu">Full menu</Link>
              </li>
              <li>
                <Link to="/menu#cat-deals">Super deals</Link>
              </li>
              <li>
                <Link to="/search">Search dishes</Link>
              </li>
              <li>
                <Link to="/confirmation">Track an order</Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="foot-bottom">
          <span>
            © {new Date().getFullYear()} {SITE.legalName} · {SITE.suburb}, {SITE.city}
          </span>
          <span>Gluten-free · Vegan options · Spice level 1–5</span>
        </div>
      </div>
    </footer>
  );
}
