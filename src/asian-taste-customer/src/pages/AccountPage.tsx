import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserIcon,
  ShoppingBagIcon,
  ClockIcon,
  EnvelopeIcon,
  PhoneIcon,
  ArrowRightOnRectangleIcon,
  ArrowPathIcon,
  CreditCardIcon,
} from '@heroicons/react/24/outline';
import { useCustomerAuthStore, selectIsAuthenticated, selectCustomer } from '@/stores/customerAuthStore';
import { useCartStore } from '@/stores/cartStore';
import { useCheckoutStore } from '@/stores/checkoutStore';
import { customerApi, type CustomerProfile } from '@/api/customerApi';
import { checkoutApi } from '@/api/checkoutApi';
import type { OrderDetailResponse } from '@/types/menu';

type TabType = 'overview' | 'orders' | 'settings' | 'payment';

export function AccountPage() {
  const navigate = useNavigate();
  const isAuthenticated = useCustomerAuthStore(selectIsAuthenticated);
  const customer = useCustomerAuthStore(selectCustomer);
  const clearAuth = useCustomerAuthStore((state) => state.clearAuth);
  const addItem = useCartStore((state) => state.addItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const { setCustomerInfo } = useCheckoutStore();

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [orders, setOrders] = useState<OrderDetailResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [reorderId, setReorderId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Settings form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/menu');
      return;
    }

    loadAccountData();
  }, [isAuthenticated]);

  const loadAccountData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Load profile
      const profileData = await customerApi.getProfile();
      setProfile(profileData);
      setFirstName(profileData.firstName || '');
      setLastName(profileData.lastName || '');
      setPhone(profileData.phone || '');

      // Load order history
      if (customer?.email) {
        const ordersData = await checkoutApi.getCustomerOrders(customer.email);
        setOrders(ordersData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load account data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updatedProfile = await customerApi.updateProfile({
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        phone: phone || undefined,
      });

      setProfile(updatedProfile);
      setSuccessMessage('Profile updated successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    clearAuth();
    navigate('/menu');
  };

  const handleReorder = async (order: OrderDetailResponse) => {
    setReorderId(order.orderId);
    setError(null);

    try {
      // Clear cart first
      clearCart();

      // Add each item to cart
      for (const item of order.items) {
        // Create a minimal MenuItemSummaryDto-compatible object
        // Note: We don't have all details like categoryId, so we use defaults
        addItem({
          id: item.menuItemId,
          categoryId: 0, // Default - not critical for cart
          name: item.menuItemName,
          description: null,
          basePrice: item.unitPrice,
          imageUrl: null,
          isAvailable: true,
          isPopular: false,
          isGlutenFree: false,
          isVegetarian: false,
          isVegan: false,
          spicyLevel: 0,
          hasModifiers: false,
        });
      }

      // Pre-fill customer info in checkout store
      setCustomerInfo(
        order.customerName,
        order.customerPhone,
        order.customerEmail
      );

      setSuccessMessage('Items added to cart! Redirecting to checkout...');
      setTimeout(() => {
        navigate('/checkout');
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder');
    } finally {
      setReorderId(null);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-cream">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your account...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <div className="bg-primary text-white py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center">
              <UserIcon className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">
                {profile?.firstName && profile?.lastName
                  ? `${profile.firstName} ${profile.lastName}`
                  : customer?.email?.split('@')[0] || 'Welcome'}
              </h1>
              <p className="text-cream/80">{customer?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="ml-auto p-2 hover:bg-white/10 rounded-full transition"
              aria-label="Logout"
            >
              <ArrowRightOnRectangleIcon className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-300 overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3 font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'overview'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-6 py-3 font-medium border-b-2 transition relative whitespace-nowrap ${
              activeTab === 'orders'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Orders
            {orders.length > 0 && (
              <span className="ml-2 bg-primary text-white text-xs px-2 py-0.5 rounded-full">
                {orders.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('payment')}
            className={`px-6 py-3 font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'payment'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Payment
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-6 py-3 font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'settings'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Settings
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="card p-6 text-center">
                <ShoppingBagIcon className="w-8 h-8 text-primary mx-auto mb-2" />
                <p className="text-2xl font-bold text-secondary">{profile?.orderCount || 0}</p>
                <p className="text-sm text-gray-600">Total Orders</p>
              </div>
              <div className="card p-6 text-center">
                <ClockIcon className="w-8 h-8 text-primary mx-auto mb-2" />
                <p className="text-2xl font-bold text-secondary">
                  {profile?.lastOrderAt
                    ? new Date(profile.lastOrderAt).toLocaleDateString()
                    : 'N/A'}
                </p>
                <p className="text-sm text-gray-600">Last Order</p>
              </div>
              <div className="card p-6 text-center">
                <UserIcon className="w-8 h-8 text-primary mx-auto mb-2" />
                <p className="text-lg font-bold text-secondary">{profile?.customerNumber || 'N/A'}</p>
                <p className="text-sm text-gray-600">Customer #</p>
              </div>
            </div>

            {/* Recent Orders */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-secondary mb-4">Recent Orders</h2>
              {orders.length === 0 ? (
                <p className="text-gray-600 text-center py-8">No orders yet</p>
              ) : (
                <div className="space-y-3">
                  {orders.slice(0, 5).map((order) => (
                    <div
                      key={order.orderId}
                      onClick={() => navigate(`/confirmation/${order.orderNumber}`)}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition cursor-pointer"
                    >
                      <div>
                        <p className="font-medium text-secondary">#{order.orderNumber}</p>
                        <p className="text-sm text-gray-600">
                          {new Date(order.createdAt).toLocaleDateString()} • {order.items.length} items
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-secondary">${order.total.toFixed(2)}</p>
                        <p
                          className={`text-sm ${
                            order.status === 'Completed'
                              ? 'text-green-600'
                              : order.status === 'Ready'
                                ? 'text-blue-600'
                                : 'text-yellow-600'
                          }`}
                        >
                          {order.status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {orders.length > 5 && (
                <button
                  onClick={() => setActiveTab('orders')}
                  className="mt-4 w-full py-2 text-primary hover:underline text-center"
                >
                  View all orders →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-secondary mb-4">Order History</h2>
            {orders.length === 0 ? (
              <div className="text-center py-12">
                <ShoppingBagIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">No orders yet</p>
                <button
                  onClick={() => navigate('/menu')}
                  className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition"
                >
                  Start Ordering
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => (
                  <div
                    key={order.orderId}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div
                        className="flex-1 cursor-pointer"
                        onClick={() => navigate(`/confirmation/${order.orderNumber}`)}
                      >
                        <h3 className="font-semibold text-secondary">#{order.orderNumber}</h3>
                        <p className="text-sm text-gray-600">
                          {new Date(order.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          order.status === 'Completed'
                            ? 'bg-green-100 text-green-700'
                            : order.status === 'Ready'
                              ? 'bg-blue-100 text-blue-700'
                              : order.status === 'Confirmed'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>
                    <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">
                          {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                        </p>
                        <p className="font-semibold text-secondary">${order.total.toFixed(2)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReorder(order);
                        }}
                        disabled={reorderId === order.orderId}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        {reorderId === order.orderId ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Adding...
                          </>
                        ) : (
                          <>
                            <ArrowPathIcon className="w-4 h-4" />
                            Reorder
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-secondary mb-6">Account Settings</h2>

            <form onSubmit={handleSaveProfile} className="space-y-6">
              {/* Name Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                    First Name
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>

              {/* Email (read-only) */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <div className="relative">
                  <EnvelopeIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="email"
                    type="email"
                    value={customer?.email || ''}
                    readOnly
                    className="w-full pl-10 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Contact us to change your email</p>
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <div className="relative">
                  <PhoneIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="04XX XXX XXX"
                    className="w-full pl-10 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>

              {/* Success Message */}
              {successMessage && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                  {successMessage}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setFirstName(profile?.firstName || '');
                    setLastName(profile?.lastName || '');
                    setPhone(profile?.phone || '');
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Payment Methods Tab */}
        {activeTab === 'payment' && (
          <div className="space-y-6">
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-secondary mb-4">Saved Payment Methods</h2>
              {profile?.paymentMethods && profile.paymentMethods.length > 0 ? (
                <div className="space-y-3">
                  {profile.paymentMethods.map((method) => (
                    <div
                      key={method.id}
                      className={`flex items-center justify-between p-4 border rounded-lg ${
                        method.isDefault ? 'border-primary bg-primary/5' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <CreditCardIcon className="w-10 h-10 text-gray-400" />
                        <div>
                          <p className="font-medium text-secondary">
                            {method.cardBrand || 'Card'} •••• {method.cardLastFour || '****'}
                          </p>
                          <p className="text-sm text-gray-600">
                            Expires {method.expiryMonth}/{method.expiryYear}
                          </p>
                        </div>
                      </div>
                      {method.isDefault && (
                        <span className="text-xs bg-primary text-white px-2 py-1 rounded-full">Default</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <CreditCardIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-600 mb-2">No saved payment methods</p>
                  <p className="text-sm text-gray-500">
                    Your payment methods will be saved here when you place an order
                  </p>
                </div>
              )}
            </div>

            <div className="card p-6 bg-blue-50 border border-blue-200">
              <h3 className="font-semibold text-secondary mb-2">About Payment Security</h3>
              <p className="text-sm text-gray-700">
                Your payment information is securely processed through Stripe.
                We never store your full card details on our servers - only a secure token
                that allows us to process future payments.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
