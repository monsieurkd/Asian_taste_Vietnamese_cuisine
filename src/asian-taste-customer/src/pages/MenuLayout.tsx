import { Outlet } from 'react-router-dom';
import { MenuPage } from './MenuPage';

/**
 * MenuLayout renders the MenuPage along with an Outlet for modal routes.
 * This allows the modal to appear as an overlay without unmounting the menu page.
 *
 * Route structure:
 * - /menu -> shows menu (index)
 * - /menu/item/:itemId -> shows menu + modal overlay
 *
 * Note: ItemDetailModal handles its own backdrop, so no additional backdrop needed here.
 */
export function MenuLayout() {
  return (
    <>
      <MenuPage />
      {/* Outlet renders the ItemDetailModal when on a modal route */}
      <Outlet />
    </>
  );
}
