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
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { useFormContext } from 'react-hook-form';

// Reuse the Treatment interface (ideally imported from types.ts)
interface Treatment {
  id: number | string;
  name: string;
  price: number;
  duration_minutes_200ml: number;
  duration_minutes_1000ml: number;
}

// Vitamin interface (can be received from props or a global type)
interface Vitamin {
  id: number | string;
  name: string;
  price: number;
}

interface StepAttendeeDetailsProps {
  treatmentsList: Treatment[];
  isLoadingTreatments: boolean;
  treatmentError: string | null;
  // Add vitamin props
  vitaminsList: Vitamin[];
  isLoadingVitamins: boolean;
  vitaminError: string | null;
}

export default function StepAttendeeDetails({
  treatmentsList,
  isLoadingTreatments,
  treatmentError,
  // Destructure new props
  vitaminsList,
  isLoadingVitamins,
  vitaminError,
}: StepAttendeeDetailsProps) {
  const form = useFormContext<BookingFormData>();

  const attendeeCount = form.watch('attendeeCount') || 1;
  const attendees = form.watch('attendees');

  const [emailError, setEmailError] = useState<string>('');
  const DEXTROSE_EXTRA_COST = 200; // Define cost for dextrose

  // Helper to get treatment details (can be memoized later)
  const getTreatmentDetails = (treatmentId: number | string | undefined | null): Treatment | undefined => {
      if (!treatmentId) return undefined;
      return treatmentsList.find(t => String(t.id) === String(treatmentId));
  }

  // Helper to get vitamin details
  const getVitaminDetails = (vitaminId: string | number | undefined | null): Vitamin | undefined => {
    if (!vitaminId || vitaminId === 'none') return undefined;
    // Use the vitaminsList from props now
    return vitaminsList.find(v => String(v.id) === String(vitaminId));
  }

  // --- Calculate total cost directly, removing useMemo for debugging ---
  let calculatedTotalCost = 0;
  if (attendees && attendees.length > 0) {
    calculatedTotalCost = attendees.reduce((total, attendee) => {
        const treatment = getTreatmentDetails(attendee?.treatmentId);
        const selectedAddOnTreatment = getTreatmentDetails(attendee?.addOnTreatmentId);
        const selectedVitamin = getVitaminDetails(attendee?.additionalVitaminId);

        let currentCost = treatment?.price || 0;

        if (selectedAddOnTreatment) {
            currentCost += selectedAddOnTreatment.price || 0;
        }
        // Always add Dextrose cost if selected, independently of add-on
        if (attendee?.fluidOption === '1000ml_dextrose') {
            if (treatment) { // Ensure there's a base treatment to add Dextrose to
                 currentCost += DEXTROSE_EXTRA_COST;
            }
        }
        // Add vitamin cost
        if (selectedVitamin) {
            currentCost += selectedVitamin.price || 0;
        }

        if (treatment) {
             return total + currentCost;
        } else {
             return total;
        }
    }, 0);
    }
  // --- End direct calculation ---

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Step 2: Attendee Details & Treatment Selection</h2>

      {/* Loop through attendees based on count */}
      {Array.from({ length: attendeeCount }).map((_, index) => {
          const attendeeData = attendees?.[index] || {};
          const selectedTreatment = getTreatmentDetails(attendeeData?.treatmentId);
          const selectedAddOnTreatment = getTreatmentDetails(attendeeData?.addOnTreatmentId);
          const selectedVitamin = getVitaminDetails(attendeeData?.additionalVitaminId);
          
          // --- Calculate display price and duration based on fluid option ---
          const displayPrice = useMemo(() => {
              if (!selectedTreatment) return undefined;
              let price = selectedTreatment.price;
              if (selectedAddOnTreatment) {
                  price += selectedAddOnTreatment.price;
              }
              // Always add Dextrose cost if selected, independently of add-on
              if (attendeeData?.fluidOption === '1000ml_dextrose') {
                  price += DEXTROSE_EXTRA_COST;
              }
              // Add vitamin cost
              if (selectedVitamin) {
                  price += selectedVitamin.price;
              }
              return price;
          }, [selectedTreatment, selectedAddOnTreatment, attendeeData?.fluidOption, selectedVitamin]);

          const displayDuration = useMemo(() => {
              if (selectedAddOnTreatment) {
                  return 90;
              }
              if (!selectedTreatment || !attendeeData?.fluidOption) return undefined;
              return attendeeData?.fluidOption === '200ml' 
                  ? selectedTreatment.duration_minutes_200ml 
                  : selectedTreatment.duration_minutes_1000ml;
          }, [selectedTreatment, selectedAddOnTreatment, attendeeData?.fluidOption]);
          
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
                        {...form.register(`attendees.${index}.firstName`)}
                  required
                  className="mt-1"
              />
          </div>
          <div>
                      <Label htmlFor={`attendee-${index}-lastName`}>Last Name</Label>
              <Input
                        id={`attendee-${index}-lastName`}
                        {...form.register(`attendees.${index}.lastName`)}
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
                        {...form.register(`attendees.${index}.email`)}
                  type="email"
                  required
                  className="mt-1"
              />
          </div>
          <div>
                      <Label htmlFor={`attendee-${index}-phone`}>Phone Number</Label>
              <Input
                        id={`attendee-${index}-phone`}
                        {...form.register(`attendees.${index}.phone`)}
                        type="tel" // Use type="tel" for better mobile experience
                  required
                  className="mt-1"
              />
          </div>
      </div>

                  {/* Treatment Selection */}
                  <div>
                    <Label htmlFor={`attendee-${index}-treatment`}>IV Treatment</Label>
                    <FormField
                      control={form.control}
                      name={`attendees.${index}.treatmentId`}
                      render={({ field }) => (
                        <FormItem>
                          <Select 
                            value={field.value ? String(field.value) : ''} 
                            onValueChange={(value) => { 
                              field.onChange(value); 
                              form.setValue(`attendees.${index}.fluidOption`, undefined, { shouldValidate: true }); 
                            }}
                            required
                          >
                            <FormControl>
                              <SelectTrigger id={`attendee-${index}-treatment`}>
                                <SelectValue placeholder="Select a treatment..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-72 overflow-y-auto">
                              {isLoadingTreatments && <SelectItem value="loading" disabled>Loading...</SelectItem>}
                              {treatmentError && <SelectItem value="error" disabled>Error loading</SelectItem>}
                              {!isLoadingTreatments && !treatmentError && treatmentsList.map((treatment) => (
                                <SelectItem key={treatment.id} value={String(treatment.id)}>
                                  {treatment.name} - R{treatment.price.toFixed(0)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* NEW: Fluid Option Selection */}
                  {selectedTreatment && (
                    <FormField
                      control={form.control}
                      name={`attendees.${index}.fluidOption`}
                      render={({ field }) => (
                        <FormItem className="pt-2">
                          <Label className="mb-2 block">IV Fluid Bag Size</Label>
                          <FormControl>
                            <RadioGroup 
                              onValueChange={field.onChange}
                              value={field.value || ''}
                              className="grid grid-cols-1 sm:grid-cols-3 gap-4"
                              required
                            > 
                              {/* Option 1: 200ml */}
                              <div className="flex items-start space-x-3 p-3 border rounded-md bg-muted/30">
                                <RadioGroupItem value="200ml" id={`attendee-${index}-fluid-200`} className="mt-1" />
                                <Label htmlFor={`attendee-${index}-fluid-200`} className="cursor-pointer font-normal">
                                  <span className="block font-medium">200ml IV</span>
                                  <span className="block text-xs text-muted-foreground">Moderate rehydration. No extra cost.</span>
                                </Label>
                              </div>
                              {/* Option 2: 1000ml */}
                              <div className="flex items-start space-x-3 p-3 border rounded-md bg-muted/30">
                                <RadioGroupItem value="1000ml" id={`attendee-${index}-fluid-1000`} className="mt-1" />
                                <Label htmlFor={`attendee-${index}-fluid-1000`} className="cursor-pointer font-normal">
                                  <span className="block font-medium">1000ml IV</span>
                                  <span className="block text-xs text-muted-foreground">Super rehydration. No extra cost.</span>
                                </Label>
                              </div>
                              {/* Option 3: 1000ml + Dextrose */}
                              <div className="flex items-start space-x-3 p-3 border rounded-md bg-muted/30">
                                <RadioGroupItem value="1000ml_dextrose" id={`attendee-${index}-fluid-1000d`} className="mt-1" />
                                <Label htmlFor={`attendee-${index}-fluid-1000d`} className="cursor-pointer font-normal">
                                  <span className="block font-medium">1000ml IV + Dextrose</span>
                                  <span className="block text-xs text-muted-foreground">Additional R{DEXTROSE_EXTRA_COST.toFixed(0)}.</span>
                                </Label>
                              </div>
                            </RadioGroup>
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Add-on Treatment Selection - Moved UP */}
                  <FormField
                    control={form.control}
                    name={`attendees.${index}.addOnTreatmentId`}
                    render={({ field }) => (
                      <FormItem className="mb-4">
                        <Label>Optional Add-on Treatment</Label>
                        <FormControl>
                          <Select
                            value={field.value ? String(field.value) : "none"} 
                            onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select add-on (optional)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">-- None --</SelectItem>
                              {treatmentsList.map((treatment) => (
                                <SelectItem key={treatment.id} value={String(treatment.id)}>
                                  {treatment.name} - R{treatment.price.toFixed(0)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* NEW: Additional Vitamins Selection */}
                  <FormField
                    control={form.control}
                    name={`attendees.${index}.additionalVitaminId`}
                    render={({ field }) => (
                      <FormItem className="mb-4">
                        <Label>Additional Vitamins (Optional)</Label>
                        <FormControl>
                          <Select
                            value={field.value ? String(field.value) : "none"}
                            onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select vitamin (optional)" />
                            </SelectTrigger>
                            <SelectContent>
                              {isLoadingVitamins && <SelectItem value="loading-vitamins" disabled>Loading vitamins...</SelectItem>}
                              {vitaminError && <SelectItem value="error-vitamins" disabled>Error loading vitamins</SelectItem>}
                              {!isLoadingVitamins && !vitaminError && vitaminsList.map((vitamin) => (
                                <SelectItem key={vitamin.id} value={String(vitamin.id)}>
                                  {vitamin.name} {vitamin.price > 0 ? `- R${vitamin.price.toFixed(0)}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Display Price/Duration - Now AFTER Add-on selection */}
                  {(selectedTreatment) && ( // Only show if base treatment is selected
                    <div className="p-2 border rounded-md bg-muted/50 text-sm mt-2">
                      <p><strong>Price:</strong> {displayPrice !== undefined ? `R ${displayPrice.toFixed(0)}` : 'N/A'}</p>
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

      {/* Display Total Cost */}
      <div className="mt-6 pt-4 border-t">
          <p className="text-lg font-semibold text-right">Total Estimated Cost: R {calculatedTotalCost.toFixed(0)}</p>
          </div>

    </div>
  );
} 