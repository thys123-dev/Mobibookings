'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, FormProvider, useWatch } from "react-hook-form";
import { z } from "zod";
import { isValidPhoneNumber } from 'react-phone-number-input';

import { Button } from '@/components/ui/button';
import StepDestination from './step-destination';
import StepAttendeeDetails from './step-attendee-details';
import StepLoungeSelect from './step-lounge-select';
import StepTimeslotSelect from './step-timeslot-select';
import StepConfirmation from './step-confirmation';
import StepMobileDetails from './step-mobile-details';
import BookingInProgressModal from './booking-in-progress-modal';

interface Treatment {
  id: number | string;
  name: string;
  price: number;
  duration_minutes_200ml: number;
  duration_minutes_1000ml: number;
}

interface Vitamin {
  id: number | string; 
  name: string;
  price: number;
}

const attendeeSchema = z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().refine(val => val.length === 0 || z.string().email().safeParse(val).success, { message: "Valid email is required" }),
    phone: z.string()
      .refine(value => value.length === 0 || isValidPhoneNumber(value), {
        message: "Invalid phone number",
      }),
    treatmentId: z.union([z.string(), z.number()]).refine(val => val !== undefined && val !== null && String(val).length > 0, { message: "Treatment is required" }),
    fluidOption: z.enum(['200ml', '1000ml', '1000ml_dextrose'], { required_error: "Fluid option is required" }),
    addOnTreatmentId: z.union([z.string(), z.number()]).nullable().optional(),
    additionalVitaminId: z.union([z.string(), z.number()]).nullable().optional(),
});

export const bookingFormSchema = z.object({
    destinationType: z.enum(['lounge', 'mobile'], { required_error: "Please select a destination type." }),
    attendeeCount: z.number().min(1, "At least one attendee is required."),
    attendees: z.array(attendeeSchema).min(1, "At least one attendee's details must be provided.")
        .superRefine((attendees, ctx) => { 
            attendees.forEach((attendee, index) => {
                if (!attendee.treatmentId) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: "Treatment is required.",
                        path: [index, 'treatmentId'],
                    });
                }
                if (!attendee.fluidOption) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
                        message: "Fluid option is required.",
                        path: [index, 'fluidOption'],
        });
    }
});
        }),
    loungeLocationId: z.string().optional(), 
    selectedDate: z.date().optional(), 
    selectedTimeSlotId: z.string().optional(),
    selectedStartTime: z.string().optional(), 
    clientAddress: z.string().optional(), 
    email: z.string().email().optional(),
    phone: z.string().optional(),
}).superRefine((data, ctx) => {
    if (data.destinationType === 'lounge') {
        if (!data.loungeLocationId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Lounge location is required.",
                path: ['loungeLocationId'],
            });
        }
        if (!data.selectedDate) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Date is required.",
                path: ['selectedDate'],
            });
        }
        if (!data.selectedStartTime) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Time slot is required.",
                path: ['selectedStartTime'],
            });
        }
    } else if (data.destinationType === 'mobile') {
        if (!data.loungeLocationId) { 
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Dispatch lounge is required.",
                path: ['loungeLocationId'],
            });
        }
        if (!data.clientAddress || data.clientAddress.trim() === '') {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Client address is required for mobile service.",
                path: ['clientAddress'],
            });
    }
        if (!data.selectedDate) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Date is required.",
                path: ['selectedDate'],
            });
        }
        if (!data.selectedStartTime) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Time slot is required.",
                path: ['selectedStartTime'],
            });
        }
    }
});

export type BookingFormData = z.infer<typeof bookingFormSchema>;

const TOTAL_STEPS = 5;

export default function BookingForm() {
    const [currentStep, setCurrentStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showBookingInProgressModal, setShowBookingInProgressModal] = useState(false);
    const [submissionError, setSubmissionError] = useState<string | null>(null);
    const [bookingSuccess, setBookingSuccess] = useState(false);
    const [treatmentsList, setTreatmentsList] = useState<Treatment[]>([]);
    const [isLoadingTreatments, setIsLoadingTreatments] = useState(true);
    const [treatmentError, setTreatmentError] = useState<string | null>(null);

    const [vitaminsList, setVitaminsList] = useState<Vitamin[]>([]);
    const [isLoadingVitamins, setIsLoadingVitamins] = useState(true);
    const [vitaminError, setVitaminError] = useState<string | null>(null);

    console.log('*** Rendering BookingForm, currentStep:', currentStep);

    const form = useForm<BookingFormData>({
        resolver: zodResolver(bookingFormSchema),
        defaultValues: {
            attendeeCount: 1,
            attendees: [{
                firstName: '',
                lastName: '',
                email: '',
                phone: '',
                treatmentId: undefined,
                fluidOption: undefined,
                addOnTreatmentId: null,
                additionalVitaminId: null,
            }]
        },
        mode: "onChange",
    });

    const watchedDestinationType = form.watch('destinationType');
    const watchedAttendeeCount = form.watch('attendeeCount');
    const watchedAttendees = form.watch('attendees');
    const watchedLoungeLocationId = form.watch('loungeLocationId');
    const watchedClientAddress = form.watch('clientAddress');

    const { errors } = form.formState;

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
    }, []);

    useEffect(() => {
      const fetchVitamins = async () => {
        setIsLoadingVitamins(true);
        setVitaminError(null);
        try {
          const response = await fetch('/api/vitamins');
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error ${response.status}`);
          }
          const data: Vitamin[] = await response.json();
          setVitaminsList([{ id: 'none', name: '-- None --', price: 0 }, ...data]);
        } catch (error: any) {
          console.error("Failed to fetch vitamins:", error);
          setVitaminError(error.message || "Could not load vitamins.");
        } finally {
          setIsLoadingVitamins(false);
        }
      };

      fetchVitamins();
    }, []);

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
                     additionalVitaminId: null, 
                 }
            ));
            form.setValue('attendees', newAttendees, { shouldValidate: true });
        }
    }, [watchedAttendeeCount, watchedAttendees, form.setValue]);

    useEffect(() => {
    }, [currentStep, watchedDestinationType]);

    const triggerValidationForStep = async (): Promise<boolean> => {
        let fieldsToValidate: (keyof BookingFormData)[] = [];
        switch (currentStep) {
            case 1:
                fieldsToValidate = ['destinationType', 'attendeeCount'];
                break;
            case 2:
                fieldsToValidate = ['attendees']; 
                break;
            case 3:
                if (watchedDestinationType === 'lounge') {
                    fieldsToValidate = ['loungeLocationId'];
                } else if (watchedDestinationType === 'mobile') {
                    fieldsToValidate = ['loungeLocationId', 'clientAddress']; 
                }
                break;
            case 4:
                    fieldsToValidate = ['selectedDate', 'selectedStartTime'];
                break;
            case 5: 
                return true;
            default:
                return false;
        }
        const isValid = await form.trigger(fieldsToValidate);
        return isValid;
    };

    const nextStep = async () => {
        console.log('*** nextStep called, currentStep before validation:', currentStep);
        const isValid = await triggerValidationForStep();
        if (!isValid) {
            console.warn("Step validation failed, cannot proceed.");
            return;
        }
        
        let nextStepToGo = currentStep + 1;
        if (nextStepToGo <= TOTAL_STEPS) {
            setCurrentStep(nextStepToGo);
        }
    };

    const prevStep = () => {
        let prevStepToGo = currentStep - 1;
        if (prevStepToGo >= 1) {
            setCurrentStep(prevStepToGo);
        }
    };

    const renderStep = () => {
        switch (currentStep) {
            case 1:
                return <StepDestination />;
            case 2:
                return <StepAttendeeDetails
                            treatmentsList={treatmentsList}
                            isLoadingTreatments={isLoadingTreatments}
                            treatmentError={treatmentError}
                            vitaminsList={vitaminsList}
                            isLoadingVitamins={isLoadingVitamins}
                            vitaminError={vitaminError}
                       />;
            case 3:
                if (watchedDestinationType === 'lounge') {
                    return <StepLoungeSelect />;
                } else if (watchedDestinationType === 'mobile') {
                    return <StepMobileDetails />;
                }
                return <div>Please select a destination type in Step 1.</div>;
            case 4:
                    return <StepTimeslotSelect />;
            case 5:
                return <StepConfirmation
                            formData={form.getValues()} 
                            treatmentsList={treatmentsList}
                            vitaminsList={vitaminsList}
                       />;
            default:
                return <div>Invalid Step</div>;
        }
    };

    const isFirstStep = currentStep === 1;
    const isLastStep = currentStep === TOTAL_STEPS;

    let stepHasErrors = false;
    switch (currentStep) {
        case 1:
            stepHasErrors = !!errors.destinationType || !!errors.attendeeCount;
            break;
        case 2:
            stepHasErrors = !!errors.attendees;
            break;
        case 3:
            if (watchedDestinationType === 'lounge') {
                stepHasErrors = !!errors.loungeLocationId;
            } else if (watchedDestinationType === 'mobile') {
                stepHasErrors = !!errors.loungeLocationId || !!errors.clientAddress;
            }
            break;
        case 4:
            if (watchedDestinationType === 'lounge' && !watchedLoungeLocationId) {
                 stepHasErrors = true; 
            } else if (watchedDestinationType === 'mobile' && (!watchedLoungeLocationId || !watchedClientAddress)) {
                 stepHasErrors = true; 
            }
            stepHasErrors = stepHasErrors || !!errors.selectedDate || !!errors.selectedStartTime;
            break;
    }

    const processSubmit = async (data: BookingFormData) => {
        console.log('*** processSubmit called, data:', data);
        if (isSubmitting) return;
        setIsSubmitting(true);
        setShowBookingInProgressModal(true);
        setSubmissionError(null);

        console.log("Submitting validated data:", data);

        if (data.destinationType === 'mobile') {
        } else if (data.destinationType === 'lounge') {
             if (!data.selectedStartTime) {
                console.error("Lounge booking missing selectedStartTime.");
                setSubmissionError("Selected start time is missing for lounge booking.");
                setIsSubmitting(false);
                setShowBookingInProgressModal(false);
                return;
            }
        }

        try {
            const apiPayload: any = {
                ...data,
                selectedStartTime: data.selectedStartTime ? new Date(data.selectedStartTime).toISOString() : undefined,
            };
            
            if (data.attendees && data.attendees.length > 0) {
                apiPayload.email = data.attendees[0].email;
                apiPayload.phone = data.attendees[0].phone;
            }
             // Remove fields not expected by the backend at the top level if they were part of form state only
            delete apiPayload.firstName; // Assuming these were placeholders and actual data is in attendees
            delete apiPayload.lastName; 

            console.log("Sending to API:", apiPayload);

            const response = await fetch('/api/bookings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(apiPayload),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || result.details || `HTTP error ${response.status}`);
            }

            console.log("Booking successful:", result);
            setBookingSuccess(true);
            setCurrentStep(TOTAL_STEPS + 1);
            setSubmissionError(null);

        } catch (error: any) {
            console.error("Submission failed:", error);
            setSubmissionError(error.message || "An unexpected error occurred during submission.");
            setBookingSuccess(false);
        } finally {
            setIsSubmitting(false);
            setShowBookingInProgressModal(false);
        }
    };

    return (
        <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(processSubmit)} className="max-w-2xl mx-auto p-6 border rounded-lg shadow-md bg-card/90">

                {bookingSuccess ? (
                    <div className="text-center py-8">
                        <h2 className="text-2xl font-semibold mb-4 text-green-700">Booking Confirmed!</h2>
                        <p className="mb-6">Congratulations! Your booking is confirmed. We look forward to helping you with your treatment.</p>
                        <Button asChild>
                            <Link href="/">Back to Homepage</Link>
                        </Button>
                    </div>
                ) : (
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

                        <div className="flex justify-between mt-8">
                            {currentStep > 1 && (
                                <Button type="button" onClick={prevStep} disabled={isSubmitting || isFirstStep}>
                                    Previous
                                </Button>
                            )}
                             {currentStep === 1 && <span />}
                            
                            {currentStep < TOTAL_STEPS && (
                                <Button
                                    type="button" 
                                    onClick={nextStep}
                                    disabled={isSubmitting || stepHasErrors} 
                                >
                                    Next
                                </Button>
                            )}
                            
                            {currentStep === TOTAL_STEPS && (
                                <Button
                                    type="submit" 
                                    disabled={isSubmitting || !form.formState.isValid} 
                                >
                                    {isSubmitting ? 'Submitting...' : 'Confirm Booking'}
                                </Button>
                            )}
                        </div>
                    </>
                )}
            </form>
            <BookingInProgressModal isOpen={showBookingInProgressModal} />
        </FormProvider>
    );
} 
