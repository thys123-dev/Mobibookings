'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import StepDestination from './step-destination';
import StepAttendeeDetails from './step-attendee-details';
import StepLoungeSelect from './step-lounge-select';
import StepTimeslotSelect from './step-timeslot-select';
import StepConfirmation from './step-confirmation';

// --- NEW: Define Treatment Type ---
// Ideally move this to src/lib/types.ts later
interface Treatment {
  id: number; // Or string if using UUIDs
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
  fluidOption?: '200ml' | '1000ml' | '1000ml_dextrose';
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

const TOTAL_STEPS = 5; // Keep as 5 for now

export default function BookingForm() {
    const [currentStep, setCurrentStep] = useState(1);
    // Adjust initial state if needed, e.g., initialize attendees as empty array
    const [formData, setFormData] = useState<BookingFormData>({ attendees: [] });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submissionError, setSubmissionError] = useState<string | null>(null);
    const [bookingSuccess, setBookingSuccess] = useState(false);

    // --- NEW: State for treatments ---
    const [treatmentsList, setTreatmentsList] = useState<Treatment[]>([]);
    const [isLoadingTreatments, setIsLoadingTreatments] = useState(true);
    const [treatmentError, setTreatmentError] = useState<string | null>(null);

    // Function to update form data
    const updateFormData = (newData: Partial<BookingFormData>) => {
        setFormData(prev => ({ ...prev, ...newData }));
    };

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

    // --- ADJUSTED: Mobile path skip logic --- 
    useEffect(() => {
        if (formData.destinationType === 'mobile') {
            // If user selected mobile and somehow ended up on step 3 (Lounge) or 4 (Timeslot),
            // redirect to step 5 (Confirmation) as Attendee Info is now part of Step 2.
            if (currentStep === 3 || currentStep === 4) {
                setCurrentStep(TOTAL_STEPS); // Go to confirmation
            }
        } 
        // ... lounge logic (no change needed here) ...
    }, [currentStep, formData.destinationType]);

    // --- ADJUSTED: Step Validation Logic ---
    const isCurrentStepValid = (): boolean => {
        const emailRegex = /^\S+@\S+\.\S+$/; 

        switch (currentStep) {
            case 1:
                return !!formData.destinationType && !!formData.attendeeCount && formData.attendeeCount > 0;
            case 2: // Combined Step: Attendee Details
                // Check if attendees array exists and has the correct length
                if (!formData.attendees || formData.attendees.length !== formData.attendeeCount) {
                    return false;
                }
                // Validate each attendee's details
                for (const attendee of formData.attendees) {
                    const isAttendeeValid = 
                        !!attendee.firstName && attendee.firstName.trim().length > 0 &&
                        !!attendee.lastName && attendee.lastName.trim().length > 0 &&
                        !!attendee.treatmentId && String(attendee.treatmentId).length > 0 &&
                        !!attendee.email && emailRegex.test(attendee.email) && // Check email presence and format
                        !!attendee.phone && attendee.phone.trim().length > 0 && // Check phone presence
                        !!attendee.fluidOption; // ADDED: Check fluid option presence
                        
                    if (!isAttendeeValid) {
                        return false; // If any attendee is invalid, the step is invalid
                    }
                }
                // Remove validation for top-level firstName/lastName/email/phone as they are now per-attendee
                // const basicInfoValid = !!formData.firstName &&
                //                      !!formData.lastName &&
                //                      !!formData.email &&
                //                      !!formData.phone;
                // const emailFormatValid = formData.email ? emailRegex.test(formData.email) : false;
                return true; // All attendees are valid
            case 3: // Lounge Select
                return formData.destinationType === 'mobile' || !!formData.loungeLocationId;
            case 4: // Timeslot Select
                return formData.destinationType === 'mobile' || !!formData.selectedStartTime;
            case 5: // Confirmation step
                return true;
            default:
                return false;
        }
    };

    // --- ADJUSTED: nextStep Logic ---
    const nextStep = () => {
        if (!isCurrentStepValid()) {
            console.warn("Step not valid, cannot proceed.");
            return;
        }
        let nextStepToGo = currentStep + 1;
        // Skip steps 3 (Lounge) and 4 (Timeslot) if mobile selected when moving from step 2
        if (currentStep === 2 && formData.destinationType === 'mobile') {
            nextStepToGo = TOTAL_STEPS; // Go directly to Confirmation (Step 5)
        }
        if (nextStepToGo <= TOTAL_STEPS) {
            setCurrentStep(nextStepToGo);
        }
    };

    // --- ADJUSTED: prevStep Logic ---
    const prevStep = () => {
        let prevStepToGo = currentStep - 1;
        // If going back from Confirmation (Step 5) and destination is mobile, go back to Step 2
        if (currentStep === TOTAL_STEPS && formData.destinationType === 'mobile') {
            prevStepToGo = 2; 
        }
        if (prevStepToGo >= 1) {
            setCurrentStep(prevStepToGo);
        }
    };

    // --- ADJUSTED: renderStep Logic ---
    const renderStep = () => {
        switch (currentStep) {
            case 1:
                return <StepDestination formData={formData} updateFormData={updateFormData} />;
            case 2: // Combined Step: Treatment + Attendee Info
                return <StepAttendeeDetails
                            formData={formData}
                            updateFormData={updateFormData}
                            treatmentsList={treatmentsList}
                            isLoadingTreatments={isLoadingTreatments}
                            treatmentError={treatmentError}
                       />;
            case 3: // Lounge Select
                if (formData.destinationType === 'lounge') {
                    return <StepLoungeSelect formData={formData} updateFormData={updateFormData} />;
                } else {
                    return <div>Redirecting...</div>; 
                }
            case 4: // Timeslot Select
                if (formData.destinationType === 'lounge') {
                    return <StepTimeslotSelect formData={formData} updateFormData={updateFormData} />;
                } else {
                    return <div>Redirecting...</div>; 
                }
            case 5: // Confirmation
                return <StepConfirmation 
                            formData={formData} 
                            treatmentsList={treatmentsList}
                       />;
            default:
                return <div>Invalid Step</div>;
        }
    };

    // --- ADJUSTED: Navigation Button Logic ---
    const isFirstStep = currentStep === 1;
    const isLastStep = currentStep === TOTAL_STEPS;
    // Mobile path now finishes step sequence at Step 2 before Confirmation (Step 5)
    const isMobilePathLastRelevantStepBeforeConfirm = currentStep === 2 && formData.destinationType === 'mobile';

    // Handle final submission
    const handleSubmit = async () => {
        // Prevent double submission
        if (isSubmitting) return;

        setIsSubmitting(true);
        setSubmissionError(null);

        // Basic validation before submit (should be redundant due to step validation)
        const { loungeLocationId, selectedStartTime, attendeeCount, attendees, destinationType } = formData;
        if (destinationType === 'lounge' && (!loungeLocationId || !selectedStartTime || !attendeeCount)) {
            setSubmissionError("Missing required booking details (location, time, attendees). Please go back and check.");
            setIsSubmitting(false);
            return;
        }
        // Re-check attendee details validity just in case
        if (!attendees || attendees.length !== attendeeCount || !isCurrentStepValid()) { // Use isCurrentStepValid for detailed check
            setSubmissionError("Missing or invalid attendee details. Please go back to Step 2 and complete all fields for each attendee.");
            setIsSubmitting(false);
            return;
        }
        
        // // Removed old validation for top-level fields
        // if (!firstName || !lastName || !email || !phone || !attendees || attendees.length === 0) {
        //     setSubmissionError("Missing required contact or treatment information.");
        //     setIsSubmitting(false);
        //     return;
        // }

        // Add mobile booking logic/validation if it becomes relevant
        if (destinationType === 'mobile') {
            console.warn("Mobile booking submission not fully implemented yet.");
            // For now, allow placeholder submission for mobile path if needed
            // alert("Mobile booking not yet available.");
            // setIsSubmitting(false);
            // return;
        }

        try {
            // --- Prepare data for submission, ensuring correct types/formats ---
            // Ensure selectedStartTime is a valid ISO string required by Zod
            let formattedStartTime: string | undefined = undefined;
            if (formData.destinationType === 'lounge') {
                if (!formData.selectedStartTime) {
                    throw new Error("Selected start time is missing.");
                }
                try {
                    // Parse the potentially existing ISO string and re-format it
                    formattedStartTime = new Date(formData.selectedStartTime).toISOString();
                } catch (dateError) {
                    console.error("Error parsing selectedStartTime:", formData.selectedStartTime, dateError);
                    throw new Error("Invalid date format for selected start time.");
                }
            }

            const submissionData = {
                ...formData,
                // Use the reformatted time string
                selectedStartTime: formattedStartTime,
            };

            // Remove if selectedStartTime is undefined (e.g., for mobile booking if it existed in formData)
            if (submissionData.selectedStartTime === undefined) {
                delete submissionData.selectedStartTime;
            }

            // --- Prepare the final data to send --- 
            // The backend expects top-level email/phone for the primary contact 
            // and the full attendees array.
            // Let's ensure the top-level fields are populated from the first attendee.
            const finalSubmissionData = {
                ...submissionData,
                email: attendees[0]?.email, // Use first attendee's email
                phone: attendees[0]?.phone, // Use first attendee's phone
                // Remove top-level firstName/lastName if they somehow persist
                firstName: undefined, 
                lastName: undefined,
            };
            // Clean up undefined fields before sending
            Object.keys(finalSubmissionData).forEach(key => {
                if (finalSubmissionData[key as keyof typeof finalSubmissionData] === undefined) {
                    delete finalSubmissionData[key as keyof typeof finalSubmissionData];
                }
            });

            const response = await fetch('/api/bookings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                // --- UPDATED: Send the final data with correct structure ---
                body: JSON.stringify(finalSubmissionData),
            });

            const result = await response.json();

            if (!response.ok) {
                // Handle specific errors from the API (like 409 Conflict, 404 Not Found, 400 Bad Request)
                throw new Error(result.error || `HTTP error ${response.status}`);
            }

            // Booking successful!
            console.log("Booking successful:", result);
            // alert(`Booking confirmed! Your booking ID is: ${result.bookingId}`);
            setBookingSuccess(true); // Set success state to true
            setSubmissionError(null); // Clear any previous error
            // Optionally reset form here if desired for future bookings on the same page load
            // setCurrentStep(1);
            // setFormData({});

        } catch (error: any) {
            console.error("Submission failed:", error);
            setSubmissionError(error.message || "An unexpected error occurred during submission.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto p-6 border rounded-lg shadow-md bg-card/90">

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
                    {/* Progress Indicator (Optional) */}
                    <div className="mb-6">
                        <p className="text-center text-sm text-gray-500">Step {currentStep} of {TOTAL_STEPS} {formData.destinationType === 'mobile' ? '(Mobile Path)' : ''}</p>
                        {/* Add a visual progress bar here later if desired */}
                    </div>

                    {/* Display Submission Error */}
                    {submissionError && (
                        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                            <p><strong>Booking Failed:</strong> {submissionError}</p>
                        </div>
                    )}

                    {renderStep()}

                    {/* Navigation Buttons */}
                    <div className="flex justify-between mt-8">
                        <Button onClick={prevStep} disabled={isFirstStep || isSubmitting}>
                            Previous
                        </Button>
                        {/* Show Next button if not the last step (and not mobile on step 2) */} 
                        {(!isLastStep && !isMobilePathLastRelevantStepBeforeConfirm) && (
                            <Button
                                onClick={nextStep}
                                disabled={isSubmitting || !isCurrentStepValid()}
                            >
                                Next
                            </Button>
                        )}
                        {/* Show Submit button on the actual last step OR on step 2 if mobile */} 
                        {(isLastStep || isMobilePathLastRelevantStepBeforeConfirm) && (
                            <Button
                                onClick={handleSubmit}
                                disabled={isSubmitting || !isCurrentStepValid()}
                            >
                                {isSubmitting ? 'Submitting...' : 'Submit Booking'}
                            </Button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
} 