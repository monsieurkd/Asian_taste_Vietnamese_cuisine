import type { FC } from 'react';

interface Step {
  id: string;
  title: string;
  number: number;
}

interface CheckoutStepsProps {
  steps: readonly Step[];
  currentStep: string;
}

export const CheckoutSteps: FC<CheckoutStepsProps> = ({ steps, currentStep }) => {
  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex items-center justify-center mb-8">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center">
          {/* Step Circle */}
          <div className="flex flex-col items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                index <= currentStepIndex
                  ? 'bg-primary text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {step.number}
            </div>
            <span className="text-sm mt-1 hidden sm:block">{step.title}</span>
          </div>

          {/* Connector Line */}
          {index < steps.length - 1 && (
            <div
              className={`w-12 sm:w-24 h-1 mx-2 transition-colors ${
                index < currentStepIndex ? 'bg-primary' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
};
