import { Outlet } from 'react-router-dom';
import { MenuPage } from './MenuPage';

/**
 * The menu, plus a slot for the dish-detail modal.
 *
 * The modal is a nested route rather than a piece of page state, so
 * `/menu/item/pho` is linkable, the back button closes it, and the catalog
 * behind it keeps its scroll position instead of remounting.
 */
export function MenuLayout() {
  return (
    <>
      <MenuPage />
      <Outlet />
    </>
  );
}
