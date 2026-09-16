import { Link } from 'react-router-dom';
import { SITE } from '@/lib/site';
import { StateBlock } from '@/components/ui/State';
import { StateIcons } from '@/components/ui/stateIcons';

/**
 * A route that exists but has no screen yet.
 *
 * The app used to render "About Page - Coming Soon" in a bare div — an
 * unstyled string is indistinguishable from a broken deploy. This states the
 * situation plainly and offers the one thing the visitor actually wanted.
 */
export function NotBuiltYet({
  title,
  body = 'This part of the site is still being built. Everything you can order is on the menu.',
}: {
  title: string;
  body?: string;
}) {
  return (
    <div className="container-shell section">
      <div className="panel" style={{ maxWidth: 640, margin: '0 auto' }}>
        <StateBlock
          icon={StateIcons.pin}
          title={title}
          body={body}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/menu" className="btn btn-primary">
                Browse the menu
              </Link>
              <a href={SITE.phoneHref} className="btn btn-secondary">
                Call the shop
              </a>
            </div>
          }
        />
      </div>
    </div>
  );
}
