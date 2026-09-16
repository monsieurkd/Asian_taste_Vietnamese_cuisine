import { Outlet } from 'react-router-dom';
import { CartPage } from './CartPage';

/** The cart, plus a slot for the edit-options modal. */
export function CartLayout() {
  return (
    <>
      <CartPage />
      <Outlet />
    </>
  );
}
