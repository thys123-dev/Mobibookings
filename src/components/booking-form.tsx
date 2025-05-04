'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, FormProvider, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from '@/components/ui/button';
import StepDestination from './step-destination';
import StepAttendeeDetails from './step-attendee-details';
import StepLoungeSelect from './step-lounge-select';
import StepTimeslotSelect from './step-timeslot-select';
import StepConfirmation from './step-confirmation';

// --- NEW: Define Treatment Type ---
// Ideally move this to src/lib/types.ts later
interface Treatment {
  id: number | string;
  name: string;
  price: number;
  duration_minutes_200ml: number;
  duration_minutes_1000ml: number;
}

// --- NEW: Define Attendee Data structure ---
export interface AttendeeData {
  // Using optional key for temporary state before saved?
  // Or use a unique temporary ID?
  // Let's assume simple object for now.
  firstName?: string;
  lastName?: string;
  treatmentId?: number | string; // Required once selected
  // ADDED: Email and Phone per attendee
  email?: string;
  phone?: string;
  // ADDED: Fluid option selection
  fluidOption?: '200ml' | '1000ml' | '1000ml_dextrose' | ''; // Add '' for initial state
  // --- NEW: Add optional add-on treatment ID ---
  addOnTreatmentId?: string | number | null; // Optional, can be string, number, or null
  // Display-only fields, maybe populated later?
  // treatmentName?: string;
  // treatmentPrice?: number;
  // treatmentDuration?: number;
}

// Define a type for the form data
export interface BookingFormData {
    destinationType?: 'lounge' | 'mobile';
    attendeeCount?: number;
    loungeLocationId?: string; 
    selectedDate?: Date;
    selectedTimeSlotId?: string; 
    selectedStartTime?: string; 
    // Move primary attendee info inside attendees array?
    // For now, let's keep primary info separate for simplicity
    // and add the array for *all* attendees including primary.
    firstName?: string; // Keep primary user info separate for now
    lastName?: string;
    email?: string;
    phone?: string;
    // treatmentId?: number | string; // REMOVED
    // treatmentName?: string; // REMOVED
    // treatmentPrice?: number; // REMOVED
    // treatmentDuration?: number; // REMOVED
    // --- ADDED: Array to hold details for each attendee ---
    attendees?: AttendeeData[];
}

// --- NEW: Define Zod Schema for the entire form --- 
const attendeeSchema = z.object({
    firstName: z.string().min(1, "First name required"),
    lastName: z.string().min(1, "Last name required"),
    email: z.string().email("Invalid email format"),
    phone: z.string().min(1, "Phone number required"),
    treatmentId: z.union([z.number(), z.string()]).refine(val => val !== undefined && val !== null && String(val).length > 0, { message: "Treatment selection is required" }),
    // Make fluidOption optional initially
    fluidOption: z.enum(['200ml', '1000ml', '1000ml_dextrose']).optional(),
    addOnTreatmentId: z.union([z.number(), z.string()]).nullable().optional(),
}).superRefine((data, ctx) => {
    // Conditionally require fluidOption only if addOnTreatmentId is NOT selected
    if (!data.addOnTreatmentId && !data.fluidOption) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Fluid option selection is required when no add-on is chosen.",
            path: ['fluidOption'], // Path to the field causing the error
        });
    }
});

const bookingFormSchema = z.object({
    destinationType: z.enum(['lounge', 'mobile'], { required_error: "Destination type is required" }),
    attendeeCount: z.number().min(1, "At least one attendee required"),
    loungeLocationId: z.string().optional(), // Required only if destinationType is 'lounge'
    selectedDate: z.date().optional(),       // Required only if destinationType is 'lounge'
    selectedTimeSlotId: z.string().optional(),// Required only if destinationType is 'lounge'
    selectedStartTime: z.string().optional(), // Required only if destinationType is 'lounge'
    // Keep primary contact fields optional in schema? Or read-only derived from attendees[0]? Let's keep optional for now.
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    attendees: z.array(attendeeSchema).optional(), // Array of attendees
}).superRefine((data, ctx) => {
    // Conditional validation based on destinationType
    if (data.destinationType === 'lounge') {
        if (!data.loungeLocationId) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Lounge location is required.", path: ['loungeLocationId'] });
        }
        if (!data.selectedDate) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Date is required.", path: ['selectedDate'] });
        }
        if (!data.selectedStartTime) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Time slot is required.", path: ['selectedStartTime'] });
        }
    }
    // Validate attendees array length matches attendeeCount
    if (data.attendees && data.attendeeCount && data.attendees.length !== data.attendeeCount) {
         ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Expected ${data.attendeeCount} attendee details, found ${data.attendees.length}.`, path: ['attendees'] });
    }
    // Validate attendee details exist if count > 0
    if (data.attendeeCount && data.attendeeCount > 0 && (!data.attendees || data.attendees.length === 0)) {
         ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Attendee details are missing.", path: ['attendees'] });
    }
});

// Infer the TS type from the schema
type BookingFormSchema = z.infer<typeof bookingFormSchema>;

const TOTAL_STEPS = 5; // Keep as 5 for now

export default function BookingForm() {
    const [currentStep, setCurrentStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submissionError, setSubmissionError] = useState<string | null>(null);
    const [bookingSuccess, setBookingSuccess] = useState(false);
    const [treatmentsList, setTreatmentsList] = useState<Treatment[]>([]);
    const [isLoadingTreatments, setIsLoadingTreatments] = useState(true);
    const [treatmentError, setTreatmentError] = useState<string | null>(null);

    console.log('*** Rendering BookingForm, currentStep:', currentStep);

    // --- NEW: Initialize react-hook-form --- 
    const form = useForm<BookingFormSchema>({
        resolver: zodResolver(bookingFormSchema),
        defaultValues: {
            attendeeCount: 1,
            attendees: [{ // Initialize with one empty attendee object
                firstName: '',
                lastName: '',
                email: '',
                phone: '',
                treatmentId: undefined,
                fluidOption: undefined,
                addOnTreatmentId: null,
            }]
            // Initialize other fields as needed
            // destinationType: undefined,
            // loungeLocationId: undefined,
            // selectedDate: undefined,
            // selectedStartTime: undefined,
        },
        mode: "onChange", // Validate on change for better UX
    });

    // --- Watch relevant fields for conditional logic --- 
    const watchedDestinationType = form.watch('destinationType');
    const watchedAttendeeCount = form.watch('attendeeCount');
    const watchedAttendees = form.watch('attendees'); // Watch attendees for validation/syncing

    // Get errors from form state for disabling Next button
    const { errors } = form.formState;

    // Function to update form data
    // const updateFormData = (newData: Partial<BookingFormData>) => {
    //     setFormData(prev => ({ ...prev, ...newData }));
    // };

    // --- NEW: useEffect to fetch treatments ---
    useEffect(() => {
      const fetchTreatments = async () => {
        setIsLoadingTreatments(true);
        setTreatmentError(null);
        try {
          const response = await fetch('/api/treatments');
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error ${response.status}`);
          }
          const data: Treatment[] = await response.json();
          setTreatmentsList(data);
        } catch (error: any) {
          console.error("Failed to fetch treatments:", error);
          setTreatmentError(error.message || "Could not load treatments.");
        } finally {
          setIsLoadingTreatments(false);
        }
      };

      fetchTreatments();
    }, []); // Empty dependency array means run once on mount

    // --- Sync attendees array size with attendeeCount --- 
    useEffect(() => {
        const currentAttendees = watchedAttendees || [];
        const targetCount = watchedAttendeeCount || 1;
        if (currentAttendees.length !== targetCount) {
            const newAttendees = Array.from({ length: targetCount }, (_, i) => (
                currentAttendees[i] || { 
                     firstName: '',
                     lastName: '',
                     email: '',
                     phone: '',
                     treatmentId: undefined,
                     fluidOption: undefined,
                     addOnTreatmentId: null,
                 }
            ));
            form.setValue('attendees', newAttendees, { shouldValidate: true });
        }
    }, [watchedAttendeeCount, watchedAttendees, form.setValue]);

    // --- Mobile path skip logic (using watched field) --- 
    useEffect(() => {
        if (watchedDestinationType === 'mobile') {
            if (currentStep === 3 || currentStep === 4) {
                setCurrentStep(TOTAL_STEPS);
            }
        } 
    }, [currentStep, watchedDestinationType]);

    // --- NEW: Function to check if current step fields are valid --- 
    const triggerValidationForStep = async (): Promise<boolean> => {
        let fieldsToValidate: (keyof BookingFormSchema)[] = [];
        switch (currentStep) {
            case 1:
                fieldsToValidate = ['destinationType', 'attendeeCount'];
                break;
            case 2:
                fieldsToValidate = ['attendees']; // Validate the entire array and its contents
                // Optionally trigger validation for each field within the array if needed
                // if (watchedAttendees) {
                //    watchedAttendees.forEach((_, index) => {
                //       fieldsToValidate.push(`attendees.${index}.firstName`);
                //       // ... add all attendee fields
                //    });
                // }
                break;
            case 3:
                if (watchedDestinationType === 'lounge') {
                    fieldsToValidate = ['loungeLocationId'];
                }
                break;
            case 4:
                if (watchedDestinationType === 'lounge') {
                    fieldsToValidate = ['selectedDate', 'selectedStartTime'];
                }
                break;
            case 5: // Confirmation step, no validation needed to proceed from here
                return true;
            default:
                return false;
        }
        // Trigger validation for the specific fields
        const isValid = await form.trigger(fieldsToValidate);
        return isValid;
    };

    // --- ADJUSTED: nextStep Logic --- 
    const nextStep = async () => {
        console.log('*** nextStep called, currentStep before validation:', currentStep);
        const isValid = await triggerValidationForStep();
        if (!isValid) {
            console.warn("Step validation failed, cannot proceed.");
            return;
        }
        
        // Always go to the next sequential step
        let nextStepToGo = currentStep + 1;
        // REMOVED mobile skip logic - Step 5 is always the confirmation/submit step
        // if (currentStep === 2 && watchedDestinationType === 'mobile') {
        //     nextStepToGo = TOTAL_STEPS;
        // }
        if (nextStepToGo <= TOTAL_STEPS) {
            setCurrentStep(nextStepToGo);
        }
    };

    // --- ADJUSTED: prevStep Logic --- 
    const prevStep = () => {
        let prevStepToGo = currentStep - 1;
        // REMOVED mobile skip logic for prev button - just go back sequentially
        // if (currentStep === TOTAL_STEPS && watchedDestinationType === 'mobile') {
        //     prevStepToGo = 2;
        // }
        if (prevStepToGo >= 1) {
            setCurrentStep(prevStepToGo);
        }
    };

    // --- ADJUSTED: Pass form object down via context --- 
    const renderStep = () => {
        // formData prop is no longer needed as children use useFormContext
        switch (currentStep) {
            case 1:
                // Pass form methods if StepDestination needs direct access (unlikely if using context)
                // Alternatively, StepDestination can use useFormContext()
                return <StepDestination /* formData={form.getValues()} updateFormData={form.setValue} */ />;
            case 2:
                return <StepAttendeeDetails
                            // Pass necessary props NOT directly from form state
                            treatmentsList={treatmentsList}
                            isLoadingTreatments={isLoadingTreatments}
                            treatmentError={treatmentError}
                       />;
            case 3:
                if (watchedDestinationType === 'lounge') {
                    return <StepLoungeSelect />;
                } else {
                    return <div>Redirecting...</div>;
                }
            case 4:
                if (watchedDestinationType === 'lounge') {
                    return <StepTimeslotSelect />;
                } else {
                    return <div>Redirecting...</div>;
                }
            case 5:
                return <StepConfirmation
                            // Pass the form values for display
                            formData={form.getValues()} 
                            treatmentsList={treatmentsList}
                       />;
            default:
                return <div>Invalid Step</div>;
        }
    };

    const isFirstStep = currentStep === 1;
    const isLastStep = currentStep === TOTAL_STEPS; // Now Step 5 is always the last step

    // --- Determine if current step has validation errors --- 
    let stepHasErrors = false;
    switch (currentStep) {
        case 1:
            stepHasErrors = !!errors.destinationType || !!errors.attendeeCount;
            break;
        case 2:
            // Check errors on the attendees array field itself (covers nested errors)
            stepHasErrors = !!errors.attendees;
            break;
        case 3:
            if (watchedDestinationType === 'lounge') {
                stepHasErrors = !!errors.loungeLocationId;
            }
            break;
        case 4:
            if (watchedDestinationType === 'lounge') {
                stepHasErrors = !!errors.selectedDate || !!errors.selectedStartTime;
            }
            break;
        // Step 5 (Confirmation) doesn't prevent moving forward from itself
    }

    // --- NEW: Handle final submission using react-hook-form --- 
    const processSubmit = async (data: BookingFormSchema) => {
        console.log('*** processSubmit called, data:', data);
        if (isSubmitting) return;
        setIsSubmitting(true);
        setSubmissionError(null);

        // Data is already validated by react-hook-form based on the schema
        console.log("Submitting validated data:", data);

        // Add mobile booking logic/validation if needed
        if (data.destinationType === 'mobile') {
            console.warn("Mobile booking submission not fully implemented yet.");
        }

        try {
            // Prepare data for the backend API
            let formattedStartTime: string | undefined = undefined;
            if (data.destinationType === 'lounge') {
                if (!data.selectedStartTime) {
                    throw new Error("Selected start time is missing.");
                }
                try {
                    formattedStartTime = new Date(data.selectedStartTime).toISOString();
                } catch (dateError) {
                    console.error("Error parsing selectedStartTime:", data.selectedStartTime, dateError);
                    throw new Error("Invalid date format for selected start time.");
                }
            }

            // Ensure primary contact email/phone are set from attendees[0]
            const finalSubmissionData = {
                ...data,
                selectedStartTime: formattedStartTime, // Use formatted time
                email: data.attendees?.[0]?.email, // Use first attendee's email
                phone: data.attendees?.[0]?.phone, // Use first attendee's phone
                // Ensure unused primary fields are removed if they exist in `data`
                firstName: undefined,
                lastName: undefined,
            };

            // Clean up undefined fields before sending
            Object.keys(finalSubmissionData).forEach(key => {
                if (finalSubmissionData[key as keyof typeof finalSubmissionData] === undefined) {
                    delete finalSubmissionData[key as keyof typeof finalSubmissionData];
                }
            });

            console.log("Sending to API:", finalSubmissionData);

            const response = await fetch('/api/bookings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(finalSubmissionData),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `HTTP error ${response.status}`);
            }

            console.log("Booking successful:", result);
            setBookingSuccess(true);
            setSubmissionError(null);

        } catch (error: any) {
            console.error("Submission failed:", error);
            setSubmissionError(error.message || "An unexpected error occurred during submission.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        // Wrap the form content with FormProvider
        <FormProvider {...form}>
            {/* Use <form> tag and pass onSubmit handler */} 
            <form onSubmit={form.handleSubmit(processSubmit)} className="max-w-2xl mx-auto p-6 border rounded-lg shadow-md bg-card/90">

                {bookingSuccess ? (
                    // Success Message View
                    <div className="text-center py-8">
                        <h2 className="text-2xl font-semibold mb-4 text-green-700">Booking Confirmed!</h2>
                        <p className="mb-6">Congratulations! Your booking is confirmed. We look forward to helping you with your treatment.</p>
                        <Button asChild>
                            <Link href="/">Back to Homepage</Link>
                        </Button>
                    </div>
                ) : (
                    // Form Steps View
                    <>
                        <div className="mb-6">
                            <p className="text-center text-sm text-gray-500">Step {currentStep} of {TOTAL_STEPS} {watchedDestinationType === 'mobile' ? '(Mobile Path)' : ''}</p>
                        </div>

                        {submissionError && (
                            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                                <p><strong>Booking Failed:</strong> {submissionError}</p>
                            </div>
                        )}

                        {renderStep()}

                        {/* Navigation Buttons */} 
                        <div className="flex justify-between mt-8">
                            {/* Previous Button - Show on steps 2-5 */} 
                            {currentStep > 1 && (
                                <Button type="button" onClick={prevStep} disabled={isSubmitting || isFirstStep}>
                                    Previous
                                </Button>
                            )}
                             {/* Spacer to push Next/Submit right if Previous is hidden */}
                             {currentStep === 1 && <div />}
                            
                            {/* Next Button - Show on steps 1-4 */} 
                            {currentStep < TOTAL_STEPS && (
                                <Button
                                    type="button" // Prevent form submission
                                    onClick={nextStep}
                                    disabled={isSubmitting || stepHasErrors} 
                                >
                                    Next
                                </Button>
                            )}
                            
                            {/* Submit Button - Show ONLY on Step 5 */} 
                            {currentStep === TOTAL_STEPS && (
                                <Button
                                    type="submit" // Trigger form onSubmit
                                    disabled={isSubmitting || !form.formState.isValid} // Disable if submitting or entire form invalid
                                >
                                    {isSubmitting ? 'Submitting...' : 'Confirm Booking'}
                                </Button>
                            )}
                        </div>
                    </>
                )}
            </form>
        </FormProvider>
    );
} 