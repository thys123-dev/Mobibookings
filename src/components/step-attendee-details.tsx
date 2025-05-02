'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { BookingFormData, AttendeeData } from './booking-form';
import { Label } from '@/components/ui/label';
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

interface StepAttendeeDetailsProps {
  formData: BookingFormData;
  updateFormData: (data: Partial<BookingFormData>) => void;
  treatmentsList: Treatment[];
  isLoadingTreatments: boolean;
  treatmentError: string | null;
}

export default function StepAttendeeDetails({
  formData,
  updateFormData,
  treatmentsList,
  isLoadingTreatments,
  treatmentError,
}: StepAttendeeDetailsProps) {

  const [emailError, setEmailError] = useState<string>('');
  const attendeeCount = formData.attendeeCount || 1;
  const DEXTROSE_EXTRA_COST = 200; // Define cost for dextrose

  // --- Initialize attendees array based on count ---
  useEffect(() => {
    if (attendeeCount > 0 && (!formData.attendees || formData.attendees.length !== attendeeCount)) {
      const initialAttendees: AttendeeData[] = Array.from({ length: attendeeCount }, (_, i) => (
        // Preserve existing data if resizing/remounting, otherwise default
        formData.attendees?.[i] || { firstName: '', lastName: '', treatmentId: undefined, fluidOption: undefined, email: '', phone: '' }
      ));
      // Keep primary attendee info synced with the first entry if needed?
      // For now, assume separate primary fields are the source of truth for GCal/Zoho
      updateFormData({ attendees: initialAttendees });
    }
  }, [attendeeCount]); // Rerun if attendeeCount changes

  // --- Modified handler to update specific attendee ---
  const handleAttendeeInputChange = (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    const updatedAttendees = [...(formData.attendees || [])];
    if (updatedAttendees[index]) {
      updatedAttendees[index] = { ...updatedAttendees[index], [name]: value };
      updateFormData({ attendees: updatedAttendees });
    }
    // Add specific email validation if needed for each attendee later
  };

  // --- Modified handler to update specific attendee's treatment ---
  const handleAttendeeTreatmentSelect = (index: number, treatmentId: string) => {
    const updatedAttendees = [...(formData.attendees || [])];
    if (updatedAttendees[index]) {
      updatedAttendees[index] = { ...updatedAttendees[index], treatmentId: treatmentId, fluidOption: undefined };
      updateFormData({ attendees: updatedAttendees });
    }
  };

  // --- NEW: Handler for fluid option radio buttons ---
  const handleFluidOptionChange = (index: number, value: '200ml' | '1000ml' | '1000ml_dextrose') => {
    const updatedAttendees = [...(formData.attendees || [])];
    if (updatedAttendees[index]) {
      updatedAttendees[index] = { ...updatedAttendees[index], fluidOption: value };
      updateFormData({ attendees: updatedAttendees });
    }
  };

  // Helper to get treatment details (can be memoized later)
  const getTreatmentDetails = (treatmentId: number | string | undefined): Treatment | undefined => {
      if (!treatmentId) return undefined;
      return treatmentsList.find(t => String(t.id) === String(treatmentId));
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Step 2: Attendee Details & Treatment Selection</h2>

      {/* Loop through attendees based on count */}
      {Array.from({ length: attendeeCount }).map((_, index) => {
          const attendeeData = formData.attendees?.[index] || {};
          const selectedTreatment = getTreatmentDetails(attendeeData.treatmentId);
          
          // --- Calculate display price and duration based on fluid option ---
          const displayPrice = useMemo(() => {
              if (!selectedTreatment) return undefined;
              let price = selectedTreatment.price;
              if (attendeeData.fluidOption === '1000ml_dextrose') {
                  price += DEXTROSE_EXTRA_COST;
              }
              return price;
          }, [selectedTreatment, attendeeData.fluidOption]);

          const displayDuration = useMemo(() => {
              if (!selectedTreatment || !attendeeData.fluidOption) return undefined;
              return attendeeData.fluidOption === '200ml' 
                  ? selectedTreatment.duration_minutes_200ml 
                  : selectedTreatment.duration_minutes_1000ml; // Use 1000ml for both 1000ml options
          }, [selectedTreatment, attendeeData.fluidOption]);
          
          // --- END Calculation ---

          return (
              <div key={index} className="p-4 border rounded-md space-y-4 mt-4">
                  <h3 className="text-lg font-medium">Attendee {index + 1}</h3>
                  {/* Name Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                          <Label htmlFor={`attendee-${index}-firstName`}>First Name</Label>
                          <Input
                              id={`attendee-${index}-firstName`}
                              name="firstName" // Key within the attendee object
                              value={attendeeData.firstName || ''}
                              onChange={(e) => handleAttendeeInputChange(index, e)}
                              required
                              className="mt-1"
                          />
                      </div>
                      <div>
                          <Label htmlFor={`attendee-${index}-lastName`}>Last Name</Label>
                          <Input
                              id={`attendee-${index}-lastName`}
                              name="lastName" // Key within the attendee object
                              value={attendeeData.lastName || ''}
                              onChange={(e) => handleAttendeeInputChange(index, e)}
                              required
                              className="mt-1"
                          />
                      </div>
                  </div>

                  {/* ADDED: Email and Phone Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`attendee-${index}-email`}>Email</Label>
                          <Input
                              id={`attendee-${index}-email`}
                              name="email"
                              type="email"
                              value={attendeeData.email || ''}
                              onChange={(e) => handleAttendeeInputChange(index, e)}
                              required
                              className="mt-1"
                          />
                      </div>
                       <div>
                          <Label htmlFor={`attendee-${index}-phone`}>Phone Number</Label>
                          <Input
                              id={`attendee-${index}-phone`}
                              name="phone"
                              type="tel" // Use type="tel" for better mobile experience
                              value={attendeeData.phone || ''}
                              onChange={(e) => handleAttendeeInputChange(index, e)}
                              required
                              className="mt-1"
                          />
                      </div>
                  </div>

                  {/* Treatment Selection */}
                  <div>
                      <Label htmlFor={`attendee-${index}-treatment`}>IV Treatment</Label>
                      <Select
                          value={attendeeData.treatmentId ? String(attendeeData.treatmentId) : ''}
                          onValueChange={(value) => handleAttendeeTreatmentSelect(index, value)}
                          required
                      >
                          <SelectTrigger id={`attendee-${index}-treatment`}>
                              <SelectValue placeholder="Select a treatment..." />
                          </SelectTrigger>
                          <SelectContent className="max-h-72 overflow-y-auto">
                              {isLoadingTreatments && <SelectItem value="loading" disabled>Loading...</SelectItem>}
                              {treatmentError && <SelectItem value="error" disabled>Error loading</SelectItem>}
                              {!isLoadingTreatments && !treatmentError && treatmentsList.map((treatment) => (
                                  <SelectItem key={treatment.id} value={String(treatment.id)}>
                                      {treatment.name}
                                  </SelectItem>
                              ))}
                          </SelectContent>
                      </Select>
                  </div>
                  
                  {/* NEW: Fluid Option Selection */}
                  {selectedTreatment && (
                  <div className="pt-2">
                    <Label className="mb-2 block">IV Fluid Bag Size</Label>
                     <RadioGroup 
                        defaultValue={attendeeData.fluidOption}
                        onValueChange={(value) => handleFluidOptionChange(index, value as any)} // Cast as any for simplicity here
                        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
                        required
                     > 
                      {/* Option 1: 200ml */}
                      <div className="flex items-start space-x-3 p-3 border rounded-md bg-muted/30"> {/* Increased space, items-start */}
                        <RadioGroupItem value="200ml" id={`attendee-${index}-fluid-200`} className="mt-1" /> {/* Add margin-top for alignment */} 
                        <Label htmlFor={`attendee-${index}-fluid-200`} className="cursor-pointer font-normal"> {/* Remove font-medium if default is desired */} 
                           {/* Structured Label Text */}
                           <span className="block font-medium">200ml IV</span> {/* UPDATED Bold Text */}
                           <span className="block text-xs text-muted-foreground">Moderate rehydration. No extra cost.</span>
                        </Label>
                      </div>
                      {/* Option 2: 1000ml */}
                      <div className="flex items-start space-x-3 p-3 border rounded-md bg-muted/30"> {/* Increased space, items-start */}
                        <RadioGroupItem value="1000ml" id={`attendee-${index}-fluid-1000`} className="mt-1" /> {/* Add margin-top */} 
                        <Label htmlFor={`attendee-${index}-fluid-1000`} className="cursor-pointer font-normal">
                           {/* Structured Label Text */}
                           <span className="block font-medium">1000ml IV</span> {/* UPDATED Bold Text */}
                           <span className="block text-xs text-muted-foreground">Super rehydration. No extra cost.</span>
                           </Label>
                      </div>
                      {/* Option 3: 1000ml + Dextrose */}
                      <div className="flex items-start space-x-3 p-3 border rounded-md bg-muted/30"> {/* Increased space, items-start */}
                        <RadioGroupItem value="1000ml_dextrose" id={`attendee-${index}-fluid-1000d`} className="mt-1" /> {/* Add margin-top */} 
                        <Label htmlFor={`attendee-${index}-fluid-1000d`} className="cursor-pointer font-normal">
                            {/* Structured Label Text */}
                           <span className="block font-medium">1000ml IV + Dextrose</span> {/* UPDATED Bold Text */}
                           <span className="block text-xs text-muted-foreground">Additional R 200.</span>
                           </Label>
                      </div>
                    </RadioGroup>
                  </div>
                  )}

                  {/* UPDATED: Display Price/Duration based on selection */}
                  {(selectedTreatment && attendeeData.fluidOption) && ( // Only show if treatment AND fluid are selected
                    <div className="p-2 border rounded-md bg-muted/50 text-sm mt-2">
                      <p><strong>Price:</strong> {displayPrice !== undefined ? `R ${displayPrice.toFixed(2)}` : 'N/A'}</p>
                      <p><strong>Duration:</strong> {displayDuration !== undefined ? `${displayDuration} minutes` : 'N/A'}</p>
                    </div>
                  )}
              </div>
          );
      })}

      {/* Show overall loading/error for treatments if needed */}
      {isLoadingTreatments && attendeeCount === 0 && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
            <span>Loading treatments...</span>
          </div>
      )}
      {treatmentError && attendeeCount === 0 && (
          <Alert variant="destructive">
            <AlertTitle>Error Loading Treatments</AlertTitle>
            <AlertDescription>{treatmentError}</AlertDescription>
          </Alert>
      )}

    </div>
  );
} 