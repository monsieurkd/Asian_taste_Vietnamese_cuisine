import { useCallback, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { MobileBar } from '@/components/layout/MobileBar';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { ToastHost } from '@/components/ui/Toast';
import { HomePage } from '@/pages/HomePage';
import { MenuLayout } from '@/pages/MenuLayout';
import { CartLayout } from '@/pages/CartLayout';
import { SearchPage } from '@/pages/SearchPage';
import { ItemDetail } from '@/pages/ItemDetail';
import { CheckoutPage } from '@/pages/CheckoutPage';
import { ConfirmationPage } from '@/pages/ConfirmationPage';
import { AccountPage } from '@/pages/AccountPage';
import { NotBuiltYet } from '@/pages/NotBuiltYet';
import { StatesShowcase } from '@/pages/StatesShowcase';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Shell() {
  const [cartOpen, setCartOpen] = useState(false);
  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);

  return (
    <div className="flex min-h-screen flex-col">
      <Header onOpenCart={openCart} />

      <main className="flex-1">
        {/* The routing shape is unchanged from the pre-port app: modal segments
            stay nested under their parent so the list behind them is not
            unmounted on navigation. */}
        <Routes>
          <Route path="/" element={<HomePage />} />

          <Route path="/menu/*" element={<MenuLayout />}>
            <Route path="item/:slug" element={<ItemDetail />} />
          </Route>

          <Route path="/search" element={<SearchPage />} />

          <Route path="/cart/*" element={<CartLayout />}>
            <Route path="edit/:lineId" element={<ItemDetail />} />
          </Route>

          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/confirmation" element={<ConfirmationPage />} />
          <Route path="/confirmation/:orderNumber" element={<ConfirmationPage />} />
          <Route path="/account" element={<AccountPage />} />

          {/* A designed "not yet" beats a "Coming Soon" that looks broken. */}
          <Route path="/about" element={<NotBuiltYet title="Our story" />} />
          <Route path="/contact" element={<NotBuiltYet title="Contact" />} />
          <Route path="/states" element={<StatesShowcase />} />
          <Route path="/order" element={<Navigate to="/menu" replace />} />

          <Route
            path="*"
            element={
              <NotBuiltYet
                title="That page isn't here"
                body="The link may be out of date. The menu is one click away."
              />
            }
          />
        </Routes>
      </main>

      <Footer />
      <MobileBar onOpenCart={openCart} />
      <CartDrawer open={cartOpen} onClose={closeCart} />
      <ToastHost />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
