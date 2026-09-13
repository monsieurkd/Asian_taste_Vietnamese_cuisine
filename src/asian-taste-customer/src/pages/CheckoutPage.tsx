import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useCartStore } from '@/stores/cartStore';
import { useCheckoutStore } from '@/stores/checkoutStore';
import type { OrderType, PickupTimeType } from '@/types/menu';
import type { PendingOrderData } from '@/stores/checkoutStore';
import { CheckoutSteps } from '@/components/checkout/CheckoutSteps';
import { ContactInfoForm } from '@/components/checkout/ContactInfoForm';
import { PaymentMethodSelector } from '@/components/checkout/PaymentMethodSelector';
import { CheckoutOrderSummary } from '@/components/checkout/CheckoutOrderSummary';

type CheckoutStep = 'details' | 'payment';

interface ContactInfoData {
  name: string;
  phone: string;
  email: string;
  orderType: OrderType;
  pickupTimeType: PickupTimeType;
  scheduledTime?: string;
  instructions?: string;
}

const steps = [
  { id: 'details', title: 'Your Details', number: 1 },
  { id: 'payment', title: 'Payment', number: 2 },
] as const;

export function CheckoutPage() {
  const navigate = useNavigate();
  const { items, getSubtotal } = useCartStore();
  const checkout = useCheckoutStore();

  const [currentStep, setCurrentStep] = useState<CheckoutStep>('details');
  const [error, setError] = useState<string | null>(null);

  // Validate cart has items
  useEffect(() => {
    if (items.length === 0) {
      navigate('/menu');
    }
  }, [items, navigate]);

  const handleDetailsSubmit = (data: ContactInfoData) => {
    checkout.setCustomerInfo(data.name, data.phone, data.email);

    const pickupTime =
      data.pickupTimeType === 'SCHEDULED' && data.scheduledTime
        ? { type: 'SCHEDULED' as const, scheduledTime: new Date(data.scheduledTime) }
        : { type: 'ASAP' as const };

    checkout.setOrderPreferences(data.orderType, pickupTime, data.instructions);
    setCurrentStep('payment');
    setError(null);
  };

  const handlePlaceOrder = () => {
    // Validate customer info is set
    if (!checkout.customerName || !checkout.customerPhone || !checkout.customerEmail) {
      setError('Please fill in all contact information');
      setCurrentStep('details');
      return;
    }

    // Create pending order data (snapshot of current state)
    // Prices already include GST (Australian convention — see README), and the
    // API charges the same figure. This used to multiply by 1.1, which displayed
    // a total 10% higher than the customer was actually charged. The API
    // recomputes from database prices, so this was a display bug rather than an
    // overcharge — but a checkout screen that disagrees with the receipt is its
    // own kind of broken.
    const orderTotal = getSubtotal();

    const pendingOrder: PendingOrderData = {
      customerName: checkout.customerName,
      customerPhone: checkout.customerPhone,
      customerEmail: checkout.customerEmail,
      orderType: checkout.orderType,
      pickupTime: checkout.pickupTime,
      specialInstructions: checkout.specialInstructions || undefined,
      items: items.map((item) => ({
        menuItemId: item.menuItemId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.basePrice,
        totalPrice: item.basePrice * item.quantity, // Simplified, modifiers not counted
        specialInstructions: item.specialInstructions,
        selectedModifierIds: item.modifiers.map((m) => m.id),
      })),
      orderTotal,
      paymentMethod: checkout.paymentMethod,
      savePaymentMethod: checkout.savePaymentMethod,
      createAccount: checkout.createAccount,
      password: checkout.password,
    };

    // Store pending order and navigate - confirmation page will handle API call
    checkout.setPendingOrder(pendingOrder);
    navigate('/confirmation');
  };

  const handleBackToCart = () => navigate('/cart');

  // Prices already include GST (Australian convention — see README), and the
  // API charges the same figure. This used to multiply by 1.1, which displayed
  // a total 10% higher than the customer was actually charged. The API
  // recomputes from database prices, so this was a display bug rather than an
  // overcharge — but a checkout screen that disagrees with the receipt is its
  // own kind of broken.
  const orderTotal = getSubtotal();

  return (
    <div className="min-h-screen bg-cream pb-20">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center">
          <button
            type="button"
            onClick={currentStep === 'details' ? handleBackToCart : () => setCurrentStep('details')}
            className="flex items-center text-gray-600 hover:text-primary transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5 mr-2" />
            {currentStep === 'details' ? 'Back to Cart' : 'Back'}
          </button>
          <h1 className="ml-4 text-lg font-semibold text-secondary">Checkout</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-6 p-4 bg-error/10 border border-error rounded-lg">
            <p className="text-error">{error}</p>
          </div>
        )}

        <CheckoutSteps steps={steps} currentStep={currentStep} />

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            {currentStep === 'details' && (
              <ContactInfoForm
                onSubmit={handleDetailsSubmit}
                initialData={{
                  name: checkout.customerName || undefined,
                  phone: checkout.customerPhone || undefined,
                  email: checkout.customerEmail || undefined,
                  orderType: checkout.orderType,
                }}
              />
            )}

            {currentStep === 'payment' && (
              <PaymentMethodSelector
                orderTotal={orderTotal}
                onSubmit={handlePlaceOrder}
                onBack={() => setCurrentStep('details')}
                isLoading={false}
              />
            )}
          </div>

          <div className="md:col-span-1">
            <CheckoutOrderSummary />
          </div>
        </div>
      </main>
    </div>
  );
}
