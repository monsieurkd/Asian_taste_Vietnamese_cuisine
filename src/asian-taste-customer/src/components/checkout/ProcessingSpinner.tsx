import type { FC } from 'react';

export const ProcessingSpinner: FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh]">
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
        <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
      </div>

      <h2 className="text-xl font-semibold mt-6 text-secondary">Placing Your Order...</h2>
      <p className="text-gray-600 mt-2 text-center">
        Please don't close this window
      </p>
    </div>
  );
};
