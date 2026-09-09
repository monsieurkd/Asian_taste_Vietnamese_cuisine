import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon, ShoppingCartIcon, Bars3Icon, XMarkIcon, UserIcon } from '@heroicons/react/24/outline';
import { useCartStore } from '../../stores/cartStore';
import { useCustomerAuthStore, selectIsAuthenticated } from '../../stores/customerAuthStore';
import { LoginModal } from '../auth/LoginModal';

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const itemCount = useCartStore((state) => state.getItemCount());
  const isAuthenticated = useCustomerAuthStore(selectIsAuthenticated);
  const customer = useCustomerAuthStore((state) => state.customer);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Focus search input when opened
  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  // Check if we're on the search page
  const isSearchPage = location.pathname === '/search';

  // Initialize search query from URL
  useEffect(() => {
    if (isSearchPage) {
      const urlParams = new URLSearchParams(location.search);
      const query = urlParams.get('q') || '';
      setSearchQuery(query);
      setIsSearchOpen(true);
    }
  }, [location, isSearchPage]);

  const handleSearchClick = () => {
    if (isSearchPage) {
      searchInputRef.current?.focus();
    } else {
      setIsSearchOpen(!isSearchOpen);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/search');
    }
  };

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const navLinks = [
    { name: 'Home', href: '/' },
    { name: 'Menu', href: '/menu' },
    { name: 'About', href: '/about' },
    { name: 'Contact', href: '/contact' },
  ];

  return (
    <header
      className={`sticky top-0 z-50 bg-white transition-shadow duration-200 ${
        isScrolled ? 'shadow-md' : 'border-b border-tan'
      }`}
    >
      {/* Desktop Header */}
      <div className="hidden md:block">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative flex h-18 items-center justify-center">
            {/* Logo - Absolute Left */}
            <Link to="/" className="absolute left-0 flex items-center">
              <div className="text-xl font-bold text-secondary">
                <span className="text-primary">Asian</span> Taste
              </div>
            </Link>

            {/* Navigation - Truly Centered */}
            <nav className="flex items-center space-x-8">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  to={link.href}
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    location.pathname === link.href
                      ? 'text-primary'
                      : 'text-gray-600'
                  }`}
                >
                  {link.name}
                </Link>
              ))}
            </nav>

            {/* Actions - Absolute Right */}
            <div className="absolute right-0 flex items-center space-x-4">
              <button
                onClick={handleSearchClick}
                className={`rounded-full p-2 transition-colors ${
                  isSearchOpen || isSearchPage
                    ? 'bg-cream text-primary'
                    : 'text-gray-600 hover:bg-cream hover:text-primary'
                }`}
                aria-label="Search"
              >
                <MagnifyingGlassIcon className="h-6 w-6" />
              </button>

              <Link
                to="/cart"
                className="relative rounded-full p-2 text-gray-600 hover:bg-cream hover:text-primary transition-colors"
                aria-label="Cart"
              >
                <ShoppingCartIcon className="h-6 w-6" />
                {itemCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                    {itemCount > 9 ? '9+' : itemCount}
                  </span>
                )}
              </Link>

              {isAuthenticated ? (
                <Link
                  to="/account"
                  className="rounded-full p-2 text-gray-600 hover:bg-cream hover:text-primary transition-colors"
                  aria-label="Account"
                  title={`Signed in as ${customer?.firstName || customer?.email?.split('@')[0]}`}
                >
                  <UserIcon className="h-6 w-6" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsLoginModalOpen(true)}
                  className="btn-primary text-sm"
                >
                  Login
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Search Bar */}
        {isSearchOpen && (
          <div className="border-t border-tan bg-cream py-4 animate-fade-in-up">
            <form onSubmit={handleSearchSubmit} className="mx-auto max-w-2xl px-4">
              <div className="relative">
                <input
                  ref={searchInputRef}
                  type="search"
                  placeholder="Search for dishes by name, ingredient..."
                  value={searchQuery}
                  onChange={handleSearchInputChange}
                  className="input pr-12"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-primary p-2 text-white hover:bg-primary-dark"
                  aria-label="Search"
                >
                  <MagnifyingGlassIcon className="h-5 w-5" />
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Mobile Header */}
      <div className="md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="rounded-md p-2 text-gray-600 hover:bg-cream"
            aria-label="Open menu"
          >
            {isMobileMenuOpen ? (
              <XMarkIcon className="h-6 w-6" />
            ) : (
              <Bars3Icon className="h-6 w-6" />
            )}
          </button>

          {/* Logo */}
          <Link to="/" className="flex items-center">
            <div className="text-lg font-bold text-secondary">
              <span className="text-primary">Asian</span> Taste
            </div>
          </Link>

          {/* Cart & Search Icons */}
          <div className="flex items-center gap-1">
            <Link
              to="/search"
              className={`relative rounded-full p-2 ${
                isSearchPage ? 'bg-cream text-primary' : 'text-gray-600'
              }`}
              aria-label="Search"
            >
              <MagnifyingGlassIcon className="h-6 w-6" />
            </Link>
            <Link
              to="/cart"
              className="relative rounded-full p-2 text-gray-600"
              aria-label="Cart"
            >
              <ShoppingCartIcon className="h-6 w-6" />
              {itemCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                  {itemCount > 9 ? '9+' : itemCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="border-t border-tan bg-white animate-fade-in-up">
            {/* Mobile Search Bar */}
            <div className="border-b border-tan bg-cream p-4">
              <form onSubmit={handleSearchSubmit}>
                <div className="relative">
                  <input
                    type="search"
                    placeholder="Search for dishes..."
                    value={searchQuery}
                    onChange={handleSearchInputChange}
                    className="input pr-12"
                  />
                  <button
                    type="submit"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-primary p-2 text-white hover:bg-primary-dark"
                    aria-label="Search"
                  >
                    <MagnifyingGlassIcon className="h-5 w-5" />
                  </button>
                </div>
              </form>
            </div>
            <nav className="space-y-1 px-4 py-2">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  to={link.href}
                  className={`block rounded-md px-4 py-3 text-sm font-medium transition-colors ${
                    location.pathname === link.href
                      ? 'bg-cream text-primary'
                      : 'text-gray-600 hover:bg-cream'
                  }`}
                >
                  {link.name}
                </Link>
              ))}
              {isAuthenticated && (
                <Link
                  to="/account"
                  className={`block rounded-md px-4 py-3 text-sm font-medium transition-colors ${
                    location.pathname === '/account'
                      ? 'bg-cream text-primary'
                      : 'text-gray-600 hover:bg-cream'
                  }`}
                >
                  My Account
                </Link>
              )}
              {!isAuthenticated && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsLoginModalOpen(true);
                  }}
                  className="block w-full rounded-md bg-primary px-4 py-3 text-center text-sm font-semibold text-white"
                >
                  Login
                </button>
              )}
            </nav>
          </div>
        )}
      </div>

      {/* Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />
    </header>
  );
}
