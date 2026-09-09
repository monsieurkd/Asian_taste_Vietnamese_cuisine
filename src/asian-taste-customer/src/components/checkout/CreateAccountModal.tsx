import { useState } from 'react';
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/outline';
import { customerApi, type CreateAccountFromOrderRequest } from '@/api/customerApi';
import { useCustomerAuthStore } from '@/stores/customerAuthStore';
import { useNavigate } from 'react-router-dom';

interface CreateAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderNumber: string;
  customerEmail: string;
  customerName: string;
}

export function CreateAccountModal({
  isOpen,
  onClose,
  orderNumber,
  customerEmail,
  customerName,
}: CreateAccountModalProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const setAuth = useCustomerAuthStore((state) => state.setAuth);
  const navigate = useNavigate();

  if (!isOpen) return null;

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(pwd)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(pwd)) {
      return 'Password must contain at least one number';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password strength
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setIsLoading(true);

    try {
      const request: CreateAccountFromOrderRequest = {
        email: customerEmail,
        password,
        orderNumber,
        marketingConsent,
      };

      const response = await customerApi.createFromOrder(request);

      if (response.success && response.token && response.customer) {
        setAuth(response.token, response.customer);
        setSuccess(true);

        // Close modal after a short delay
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setError(response.error || 'Failed to create account. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-secondary">
            {success ? 'Account Created!' : 'Create Your Account'}
          </h2>
          {!success && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {success ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                <CheckIcon className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-secondary mb-2">
                Welcome, {customerName.split(' ')[0]}!
              </h3>
              <p className="text-gray-600 mb-6">
                Your account has been created. You can now track your orders and enjoy faster checkout next time.
              </p>
              <button
                onClick={() => navigate('/account')}
                className="w-full px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition font-medium"
              >
                View My Account
              </button>
            </div>
          ) : (
            <>
              <p className="text-gray-600 mb-6">
                Save your information for faster checkout next time. Your order details will be linked to your account.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email (pre-filled, read-only) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={customerEmail}
                    readOnly
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                  />
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password *
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a password"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                    required
                    minLength={8}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Must be at least 8 characters with uppercase, lowercase, and number
                  </p>
                </div>

                {/* Confirm Password */}
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password *
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                    required
                    minLength={8}
                  />
                </div>

                {/* Marketing Consent */}
                <div className="flex items-start gap-3">
                  <input
                    id="marketing"
                    type="checkbox"
                    checked={marketingConsent}
                    onChange={(e) => setMarketingConsent(e.target.checked)}
                    className="mt-1 w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <label htmlFor="marketing" className="text-sm text-gray-600">
                    I'd like to receive exclusive offers and updates via email
                  </label>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {error}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleSkip}
                    className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium"
                    disabled={isLoading}
                  >
                    Skip
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Creating...
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </button>
                </div>

                <p className="text-xs text-center text-gray-500 pt-2">
                  By creating an account, you agree to our Terms of Service and Privacy Policy
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
