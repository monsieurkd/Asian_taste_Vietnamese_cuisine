import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { HomePage } from '@/pages/HomePage';
import { MenuLayout } from '@/pages/MenuLayout';
import { CartLayout } from '@/pages/CartLayout';
import { SearchPage } from '@/pages/SearchPage';
import { ItemDetailModal } from '@/components/menu/ItemDetailModal';
import { CheckoutPage } from '@/pages/CheckoutPage';
import { ConfirmationPage } from '@/pages/ConfirmationPage';
import { AccountPage } from '@/pages/AccountPage';

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<HomePage />} />
              {/* Menu with modal - wildcard catches /menu, /menu/category/:id, /menu/popular, and /menu/item/:id */}
              <Route path="/menu/*" element={<MenuLayout />}>
                <Route path="item/:itemId" element={<ItemDetailModal />} />
              </Route>
              {/* Search routes */}
              <Route path="/search" element={<SearchPage />} />
              {/* Cart with modal for editing items */}
              <Route path="/cart/*" element={<CartLayout />}>
                <Route path="edit/:itemId" element={<ItemDetailModal />} />
              </Route>
              {/* Checkout and confirmation */}
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/confirmation" element={<ConfirmationPage />} />
              <Route path="/confirmation/:orderNumber" element={<ConfirmationPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/order" element={<div className="p-8 text-center">Order Page - Coming Soon</div>} />
              <Route path="/about" element={<div className="p-8 text-center">About Page - Coming Soon</div>} />
              <Route path="/contact" element={<div className="p-8 text-center">Contact Page - Coming Soon</div>} />
            </Routes>
          </main>

          {/* Footer */}
          <footer className="bg-secondary text-white">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
                {/* Brand */}
                <div className="md:col-span-1">
                  <h3 className="text-xl font-bold">
                    <span className="text-accent">Asian</span> Taste
                  </h3>
                  <p className="mt-2 text-sm text-gray-300">
                    Taste of Happiness
                  </p>
                </div>

                {/* Location */}
                <div>
                  <h4 className="font-semibold text-accent">Location</h4>
                  <p className="mt-2 text-sm text-gray-300">
                    123 Main Street<br />
                    Suburb, State 1234
                  </p>
                </div>

                {/* Hours */}
                <div>
                  <h4 className="font-semibold text-accent">Hours</h4>
                  <p className="mt-2 text-sm text-gray-300">
                    Mon-Fri: 11am - 9pm<br />
                    Sat-Sun: 10am - 9pm
                  </p>
                </div>

                {/* Contact */}
                <div>
                  <h4 className="font-semibold text-accent">Contact</h4>
                  <p className="mt-2 text-sm text-gray-300">
                    Phone: (02) 1234 5678<br />
                    Email: info@asiantaste.com
                  </p>
                </div>
              </div>

              <div className="mt-8 border-t border-gray-700 pt-8 text-center text-sm text-gray-400">
                <p>© 2026 Asian Taste. All rights reserved.</p>
                <p className="mt-2">
                  <a href="/privacy" className="hover:text-accent">Privacy</a>
                  {' · '}
                  <a href="/terms" className="hover:text-accent">Terms</a>
                  {' · '}
                  <a href="/accessibility" className="hover:text-accent">Accessibility</a>
                </p>
              </div>
            </div>
          </footer>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
