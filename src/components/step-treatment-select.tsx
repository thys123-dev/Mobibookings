'use client';

import React from 'react';
import { BookingFormData } from './booking-form';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from 'lucide-react'; // Loading spinner

// Reuse the Treatment interface (ideally imported from types.ts)
interface Treatment {
  id: number | string;
  name: string;
  price: number;
  duration_minutes_200ml: number;
  duration_minutes_1000ml: number;
}

interface StepTreatmentSelectProps {
  formData: BookingFormData;
  updateFormData: (data: Partial<BookingFormData>) => void;
  treatmentsList: Treatment[];
  isLoadingTreatments: boolean;
  treatmentError: string | null;
}

export default function StepTreatmentSelect({
  formData,
  updateFormData,
  treatmentsList,
  isLoadingTreatments,
  treatmentError,
}: StepTreatmentSelectProps) {

  const handleTreatmentSelect = (treatmentId: string) => {
    const selectedTreatment = treatmentsList.find(t => String(t.id) === treatmentId);

    if (selectedTreatment) {
      // Defaulting to 200ml duration for now.
      // TODO: Decide how to handle 200ml vs 1000ml duration selection if needed.
      updateFormData({
        treatmentId: selectedTreatment.id,
        treatmentName: selectedTreatment.name,
        treatmentPrice: selectedTreatment.price,
        treatmentDuration: selectedTreatment.duration_minutes_200ml, // Using 200ml duration
      });
    } else {
      // Clear if selection is invalid (shouldn't happen with Select)
      updateFormData({
        treatmentId: undefined,
        treatmentName: undefined,
        treatmentPrice: undefined,
        treatmentDuration: undefined,
      });
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Step 2: Select Your Treatment</h2>

      {isLoadingTreatments && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          <span>Loading treatments...</span>
        </div>
      )}

      {treatmentError && (
        <Alert variant="destructive">
          <AlertTitle>Error Loading Treatments</AlertTitle>
          <AlertDescription>{treatmentError}</AlertDescription>
        </Alert>
      )}

      {!isLoadingTreatments && !treatmentError && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="treatment-select">IV Treatment</Label>
            <Select
              value={formData.treatmentId ? String(formData.treatmentId) : ''}
              onValueChange={handleTreatmentSelect}
              required
            >
              <SelectTrigger id="treatment-select">
                <SelectValue placeholder="Select a treatment..." />
              </SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                {treatmentsList.map((treatment) => (
                  <SelectItem key={treatment.id} value={String(treatment.id)}>
                    {treatment.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.treatmentId && (
            <div className="p-4 border rounded-md bg-muted/50 text-sm">
              <p><strong>Price:</strong> R {formData.treatmentPrice?.toFixed(2)}</p>
              <p><strong>Duration:</strong> {formData.treatmentDuration} minutes</p>
              {/* Add a note about which duration is shown if needed */}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 