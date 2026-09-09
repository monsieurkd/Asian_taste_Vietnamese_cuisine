import { Outlet } from 'react-router-dom';
import { CartPage } from './CartPage';

/**
 * CartLayout renders the CartPage along with an Outlet for modal routes.
 * This allows the item detail modal to appear as an overlay when editing from cart.
 *
 * Route structure:
 * - /cart -> shows cart
 * - /cart/edit/:itemId -> shows cart + modal overlay for editing
 *
 * Note: ItemDetailModal handles its own backdrop, so no additional backdrop needed here.
 */
export function CartLayout() {
  return (
    <>
      <CartPage />
      {/* Outlet renders the ItemDetailModal when on a modal route */}
      <Outlet />
    </>
  );
}
