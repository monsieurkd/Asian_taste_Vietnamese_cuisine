import { useState } from 'react';
import type { FC } from 'react';
import { LockClosedIcon } from '@heroicons/react/24/outline';

export interface CardDetails {
  cardNumber: string;
  cardholderName: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  saveCard: boolean;
}

interface CardPaymentFormProps {
  isLoading?: boolean;
  onSubmit: (cardDetails: CardDetails) => void | Promise<void>;
}

export const CardPaymentForm: FC<CardPaymentFormProps> = ({
  isLoading = false,
  onSubmit,
}) => {
  const [cardNumber, setCardNumber] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [saveCard, setSaveCard] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof CardDetails, string>>>({});

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof CardDetails, string>> = {};

    // Card number validation (13-19 digits)
    const cleanedCardNumber = cardNumber.replace(/\s/g, '');
    if (!cleanedCardNumber || cleanedCardNumber.length < 13 || cleanedCardNumber.length > 19) {
      newErrors.cardNumber = 'Please enter a valid card number';
    }

    // Cardholder name validation
    if (!cardholderName.trim()) {
      newErrors.cardholderName = 'Please enter the cardholder name';
    }

    // Expiry validation
    if (!expiryMonth) {
      newErrors.expiryMonth = 'Required';
    }
    if (!expiryYear) {
      newErrors.expiryYear = 'Required';
    }

    // Check if expiry date is in the past
    if (expiryMonth && expiryYear) {
      const now = new Date();
      const expiryDate = new Date(parseInt(expiryYear), parseInt(expiryMonth) - 1);
      if (expiryDate < now) {
        newErrors.expiryMonth = 'Card has expired';
      }
    }

    // CVV validation (3-4 digits)
    if (!cvv || cvv.length < 3 || cvv.length > 4) {
      newErrors.cvv = 'Please enter a valid CVV';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit({
        cardNumber: cardNumber.replace(/\s/g, ''),
        cardholderName: cardholderName.trim(),
        expiryMonth,
        expiryYear,
        cvv,
        saveCard,
      });
    }
  };

  const formatCardNumber = (value: string) => {
    // Remove spaces and limit to 19 digits
    const cleaned = value.replace(/\s/g, '').slice(0, 19);
    // Add space every 4 digits
    return cleaned.replace(/(\d{4})(?=\d)/g, '$1 ');
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^\d\s]/g, '');
    setCardNumber(formatCardNumber(value));
    if (errors.cardNumber) {
      setErrors({ ...errors, cardNumber: undefined });
    }
  };

  // Generate expiry years (current year to +15 years)
  const currentYear = new Date().getFullYear();
  const expiryYears = Array.from({ length: 16 }, (_, i) => currentYear + i);
  const expiryMonths = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Card Number */}
      <div>
        <label htmlFor="cardNumber" className="block text-sm font-medium text-gray-700 mb-1">
          Card Number *
        </label>
        <input
          id="cardNumber"
          type="text"
          inputMode="numeric"
          placeholder="1234 5678 9012 3456"
          value={cardNumber}
          onChange={handleCardNumberChange}
          disabled={isLoading}
          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-gray-100 disabled:cursor-not-allowed ${
            errors.cardNumber ? 'border-red-500' : 'border-tan'
          }`}
          maxLength={19} // 16 digits + 3 spaces
        />
        {errors.cardNumber && <p className="mt-1 text-sm text-red-600">{errors.cardNumber}</p>}
      </div>

      {/* Cardholder Name */}
      <div>
        <label htmlFor="cardholderName" className="block text-sm font-medium text-gray-700 mb-1">
          Cardholder Name *
        </label>
        <input
          id="cardholderName"
          type="text"
          placeholder="John Doe"
          value={cardholderName}
          onChange={(e) => {
            setCardholderName(e.target.value);
            if (errors.cardholderName) {
              setErrors({ ...errors, cardholderName: undefined });
            }
          }}
          disabled={isLoading}
          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-gray-100 disabled:cursor-not-allowed ${
            errors.cardholderName ? 'border-red-500' : 'border-tan'
          }`}
        />
        {errors.cardholderName && (
          <p className="mt-1 text-sm text-red-600">{errors.cardholderName}</p>
        )}
      </div>

      {/* Expiry Date and CVV */}
      <div className="grid grid-cols-2 gap-4">
        {/* Expiry Month */}
        <div>
          <label htmlFor="expiryMonth" className="block text-sm font-medium text-gray-700 mb-1">
            Month *
          </label>
          <select
            id="expiryMonth"
            value={expiryMonth}
            onChange={(e) => {
              setExpiryMonth(e.target.value);
              if (errors.expiryMonth) {
                setErrors({ ...errors, expiryMonth: undefined });
              }
            }}
            disabled={isLoading}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-gray-100 disabled:cursor-not-allowed ${
              errors.expiryMonth ? 'border-red-500' : 'border-tan'
            }`}
          >
            <option value="">MM</option>
            {expiryMonths.map((month) => (
              <option key={month} value={month.toString()}>
                {month.toString().padStart(2, '0')}
              </option>
            ))}
          </select>
          {errors.expiryMonth && <p className="mt-1 text-sm text-red-600">{errors.expiryMonth}</p>}
        </div>

        {/* Expiry Year */}
        <div>
          <label htmlFor="expiryYear" className="block text-sm font-medium text-gray-700 mb-1">
            Year *
          </label>
          <select
            id="expiryYear"
            value={expiryYear}
            onChange={(e) => {
              setExpiryYear(e.target.value);
              if (errors.expiryYear) {
                setErrors({ ...errors, expiryYear: undefined });
              }
            }}
            disabled={isLoading}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-gray-100 disabled:cursor-not-allowed ${
              errors.expiryYear ? 'border-red-500' : 'border-tan'
            }`}
          >
            <option value="">YYYY</option>
            {expiryYears.map((year) => (
              <option key={year} value={year.toString()}>
                {year}
              </option>
            ))}
          </select>
          {errors.expiryYear && <p className="mt-1 text-sm text-red-600">{errors.expiryYear}</p>}
        </div>
      </div>

      {/* CVV */}
      <div>
        <label htmlFor="cvv" className="block text-sm font-medium text-gray-700 mb-1">
          CVV / CVC *
        </label>
        <input
          id="cvv"
          type="password"
          inputMode="numeric"
          placeholder="•••"
          value={cvv}
          onChange={(e) => {
            const value = e.target.value.replace(/[^\d]/g, '').slice(0, 4);
            setCvv(value);
            if (errors.cvv) {
              setErrors({ ...errors, cvv: undefined });
            }
          }}
          disabled={isLoading}
          maxLength={4}
          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-gray-100 disabled:cursor-not-allowed ${
            errors.cvv ? 'border-red-500' : 'border-tan'
          }`}
        />
        {errors.cvv && <p className="mt-1 text-sm text-red-600">{errors.cvv}</p>}
        <p className="mt-1 text-xs text-gray-500">
          3 or 4 digit security code on the back of your card
        </p>
      </div>

      {/* Save Card Option */}
      <div className="flex items-center">
        <input
          id="saveCard"
          type="checkbox"
          checked={saveCard}
          onChange={(e) => setSaveCard(e.target.checked)}
          disabled={isLoading}
          className="w-4 h-4 text-primary border-tan rounded focus:ring-primary disabled:cursor-not-allowed"
        />
        <label htmlFor="saveCard" className="ml-2 text-sm text-gray-700">
          Save card for faster checkout next time
        </label>
      </div>

      {/* Digital Wallet Buttons (Future/Placeholder) */}
      <div className="space-y-3 pt-4">
        <p className="text-sm text-gray-600 text-center">Or pay with digital wallet</p>

        <button
          type="button"
          disabled
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-black rounded-lg hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C8.6 17.9 7.27 15.06 7.23 15c-.04-.06-1.62-2.89-1.62-5.4 0-3.28 1.98-4.97 3.35-4.97 1.05 0 1.89.75 2.36.75.47 0 1.42-.86 2.6-.86 1.2 0 2.05.54 2.51.54.46 0 1.32-.74 2.53-.74 1.15 0 2.55.56 3.25 1.63-.14.09-1.9 1.12-1.9 3.18 0 2.3 2.09 3.08 2.18 3.12-.02.06-.35 1.23-1.15 2.38-.7.99-1.41 1.99-2.32 1.99-.88 0-1.12-.57-2.38-.57-1.27 0-1.58.56-2.39.56-.81 0-1.55-.93-2.32-2.06-1.26-1.82-1.79-4.96-1.05-6.83z" />
          </svg>
          <span className="text-white font-medium">Apple Pay</span>
        </button>

        <button
          type="button"
          disabled
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <span className="text-gray-700 font-medium">Google Pay</span>
        </button>
      </div>

      {/* Submit Button */}
      <div className="pt-4">
        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:bg-gray-400 disabled:cursor-not-allowed transition font-semibold text-lg"
        >
          <LockClosedIcon className="w-5 h-5" />
          {isLoading ? 'Processing...' : 'Pay Now'}
        </button>
      </div>

      {/* Security Notice */}
      <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span>Your payment information is encrypted and secure</span>
      </div>
    </form>
  );
};
