'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

interface BookingInProgressModalProps {
  isOpen: boolean;
}

const BookingInProgressModal: React.FC<BookingInProgressModalProps> = ({ isOpen }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-xl">
        <div className="flex flex-col items-center">
          <Loader2 className="mb-4 h-12 w-12 animate-spin text-blue-600" />
          <p className="text-lg font-semibold text-gray-700">
            Please wait while we confirm your booking...
          </p>
        </div>
      </div>
    </div>
  );
};

export default BookingInProgressModal; 