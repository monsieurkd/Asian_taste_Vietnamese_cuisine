import { useForm } from 'react-hook-form';
import type { FC } from 'react';
import type { OrderType, PickupTimeType } from '@/types/menu';

interface ContactInfoData {
  name: string;
  phone: string;
  email: string;
  orderType: OrderType;
  pickupTimeType: PickupTimeType;
  scheduledTime?: string;
  instructions?: string;
}

interface ContactInfoFormProps {
  onSubmit: (data: ContactInfoData) => void;
  initialData?: Partial<ContactInfoData>;
  submitLabel?: string;
  isLoading?: boolean;
}

export const ContactInfoForm: FC<ContactInfoFormProps> = ({
  onSubmit,
  initialData,
  submitLabel = 'Continue to Payment',
  isLoading = false,
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<ContactInfoData>({
    defaultValues: {
      name: initialData?.name || '',
      phone: initialData?.phone || '',
      email: initialData?.email || '',
      orderType: initialData?.orderType || 'Pickup',
      pickupTimeType: 'ASAP',
    },
  });

  const orderType = watch('orderType');
  const pickupTimeType = watch('pickupTimeType');

  const handleFormSubmit = (data: ContactInfoData) => {
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Contact Information */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-4 text-secondary">Contact Information</h3>

        {/* Name */}
        <div className="mb-4">
          <label htmlFor="name" className="block text-sm font-medium mb-1 text-secondary">
            Name *
          </label>
          <input
            id="name"
            type="text"
            {...register('name', { required: 'Name is required' })}
            className="w-full px-4 py-2 border border-tan rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="Jane Doe"
          />
          {errors.name && <p className="text-error text-sm mt-1">{errors.name.message}</p>}
        </div>

        {/* Phone */}
        <div className="mb-4">
          <label htmlFor="phone" className="block text-sm font-medium mb-1 text-secondary">
            Phone *
          </label>
          <input
            id="phone"
            type="tel"
            {...register('phone', {
              required: 'Phone is required',
              pattern: {
                value: /^(\+61|0)[0-9]{9}$/,
                message: 'Please enter a valid Australian phone number',
              },
            })}
            className="w-full px-4 py-2 border border-tan rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="0412 345 678"
          />
          {errors.phone && <p className="text-error text-sm mt-1">{errors.phone.message}</p>}
        </div>

        {/* Email */}
        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-medium mb-1 text-secondary">
            Email *
          </label>
          <input
            id="email"
            type="email"
            {...register('email', {
              required: 'Email is required',
              pattern: {
                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                message: 'Please enter a valid email address',
              },
            })}
            className="w-full px-4 py-2 border border-tan rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="jane@example.com"
          />
          {errors.email && <p className="text-error text-sm mt-1">{errors.email.message}</p>}
        </div>

        <p className="text-sm text-gray-600">
          We'll send your order confirmation to this email
        </p>
      </div>

      {/* Order Type */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-4 text-secondary">Order Type</h3>

        <div className="space-y-3">
          <label
            className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition ${
              orderType === 'Pickup'
                ? 'border-primary bg-primary/5'
                : 'border-tan hover:border-gray-300'
            }`}
          >
            <input
              {...register('orderType')}
              type="radio"
              value="Pickup"
              className="sr-only"
            />
            <div className="flex-1">
              <div className="font-medium text-secondary">Pickup</div>
              <div className="text-sm text-gray-600">Pick up at restaurant</div>
            </div>
            {orderType === 'Pickup' && (
              <div className="w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-primary" />
              </div>
            )}
          </label>

          <label
            className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition ${
              orderType === 'DineIn'
                ? 'border-primary bg-primary/5'
                : 'border-tan hover:border-gray-300'
            }`}
          >
            <input
              {...register('orderType')}
              type="radio"
              value="DineIn"
              className="sr-only"
            />
            <div className="flex-1">
              <div className="font-medium text-secondary">Dine-in</div>
              <div className="text-sm text-gray-600">Eat at restaurant</div>
            </div>
            {orderType === 'DineIn' && (
              <div className="w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-primary" />
              </div>
            )}
          </label>
        </div>
      </div>

      {/* Pickup Time */}
      {orderType === 'Pickup' && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4 text-secondary">Pickup Time</h3>

          <div className="space-y-3">
            <label className="flex items-start">
              <input
                {...register('pickupTimeType')}
                type="radio"
                value="ASAP"
                className="mt-1 mr-3"
              />
              <div>
                <div className="font-medium text-secondary">ASAP (15-20 minutes)</div>
                <div className="text-sm text-gray-600">
                  Ready as soon as possible
                </div>
              </div>
            </label>

            <label className="flex items-start">
              <input
                {...register('pickupTimeType')}
                type="radio"
                value="SCHEDULED"
                className="mt-1 mr-3"
              />
              <div className="flex-1">
                <div className="font-medium text-secondary">Schedule for later</div>
                {pickupTimeType === 'SCHEDULED' && (
                  <input
                    type="time"
                    {...register('scheduledTime')}
                    className="mt-2 px-3 py-2 border border-tan rounded-lg"
                    min="09:00"
                    max="20:00"
                  />
                )}
              </div>
            </label>
          </div>
        </div>
      )}

      {/* Special Instructions */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-4 text-secondary">Special Instructions</h3>
        <textarea
          {...register('instructions')}
          className="w-full px-4 py-2 border border-tan rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          rows={3}
          placeholder="Any requests? (optional)"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Processing...' : submitLabel}
      </button>
    </form>
  );
};
