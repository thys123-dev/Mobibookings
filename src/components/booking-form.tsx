'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import StepDestination from './step-destination';
import StepLoungeSelect from './step-lounge-select';
import StepTimeslotSelect from './step-timeslot-select';
import StepAttendeeInfo from './step-attendee-info';
import StepConfirmation from './step-confirmation';

// Define a type for the form data
// Expand this as more fields are added
export interface BookingFormData {
    destinationType?: 'lounge' | 'mobile';
    attendeeCount?: number;
    loungeLocationId?: string; // Or number, depending on DB schema
    selectedDate?: Date;
    selectedTimeSlotId?: string; // Or number
    selectedStartTime?: string; // Add start time ISO string
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    therapyType?: string;
}

const TOTAL_STEPS = 5; // Keep total steps for overall structure, logic will handle skipping

export default function BookingForm() {
    const [currentStep, setCurrentStep] = useState(1);
    const [formData, setFormData] = useState<BookingFormData>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submissionError, setSubmissionError] = useState<string | null>(null);
    const [bookingSuccess, setBookingSuccess] = useState(false);

    // Function to update form data
    const updateFormData = (newData: Partial<BookingFormData>) => {
        setFormData(prev => ({ ...prev, ...newData }));
    };

    // Automatically skip steps if mobile is selected
    // This is a bit complex, managing step transitions might need refinement
    useEffect(() => {
        if (formData.destinationType === 'mobile') {
            // If user selected mobile and somehow ended up on step 2 or 3, redirect to 4
            if (currentStep === 2 || currentStep === 3) {
                setCurrentStep(4);
            }
        } else if (formData.destinationType === 'lounge') {
            // If user switched back to lounge from mobile and was on step 4 or 5,
            // potentially reset to step 2 if location isn't selected?
            // Or simply let them navigate back manually.
            // For now, no automatic backwards navigation on switch.
        }
    }, [currentStep, formData.destinationType]);

    const nextStep = () => {
        let nextStepToGo = currentStep + 1;

        // Skip steps 2 and 3 if mobile is selected when moving from step 1
        if (currentStep === 1 && formData.destinationType === 'mobile') {
            nextStepToGo = 4;
        }

        // Add validation logic here before proceeding if needed
        let isValid = true;
        if (currentStep === 1 && !formData.destinationType) {
            alert("Please select a destination type.");
            isValid = false;
        }
        else if (formData.destinationType === 'lounge') {
            if (currentStep === 2 && !formData.loungeLocationId) {
                alert("Please select a lounge location.");
                isValid = false;
            }
            else if (currentStep === 3 && (!formData.selectedDate || !formData.selectedTimeSlotId)) {
                alert("Please select a date and an available time slot.");
                isValid = false;
            }
        }
        // Add validation for Step 4 (common to both paths)
        if (currentStep === 4) {
            if (!formData.firstName || !formData.lastName || !formData.email || !formData.phone || !formData.therapyType) {
                alert("Please fill in all your information and select a therapy.");
                isValid = false;
            }
            // Add more specific validation (e.g., email format) if needed
        }

        if (isValid && nextStepToGo <= TOTAL_STEPS) {
            setCurrentStep(nextStepToGo);
        }
    };

    const prevStep = () => {
        let prevStepToGo = currentStep - 1;

        // If going back from step 4 and destination is mobile, go back to step 1
        if (currentStep === 4 && formData.destinationType === 'mobile') {
            prevStepToGo = 1;
        }

        if (prevStepToGo >= 1) {
            setCurrentStep(prevStepToGo);
        }
    };

    const renderStep = () => {
        switch (currentStep) {
            case 1:
                return <StepDestination formData={formData} updateFormData={updateFormData} />;
            case 2:
                // Only show lounge select if destination is lounge
                if (formData.destinationType === 'lounge') {
                    return <StepLoungeSelect formData={formData} updateFormData={updateFormData} />;
                } else {
                    // This case should ideally be skipped by the useEffect/nextStep logic
                    // Render nothing or a message, or redirect (handled by useEffect)
                    return <div>Redirecting...</div>; // Should be brief
                }
            case 3:
                if (formData.destinationType === 'lounge') {
                    return <StepTimeslotSelect formData={formData} updateFormData={updateFormData} />;
                } else {
                    return <div>Redirecting...</div>; // Should be brief
                }
            case 4:
                return <StepAttendeeInfo formData={formData} updateFormData={updateFormData} />;
            case 5:
                return <StepConfirmation formData={formData} />;
            default:
                return <div>Invalid Step</div>;
        }
    };

    // Determine button visibility/state based on complex logic
    const isFirstStep = currentStep === 1;
    const isLastStep = currentStep === TOTAL_STEPS;
    const isMobilePathLastRelevantStep = currentStep === 4 && formData.destinationType === 'mobile';

    // Handle final submission
    const handleSubmit = async () => {
        // Prevent double submission
        if (isSubmitting) return;

        setIsSubmitting(true);
        setSubmissionError(null);

        // Basic validation before submit (though step validation should cover most)
        // Re-validate crucial fields just in case
        const { loungeLocationId, selectedStartTime, attendeeCount, firstName, lastName, email, phone, therapyType, destinationType } = formData;
        if (destinationType === 'lounge' && (!loungeLocationId || !selectedStartTime || !attendeeCount)) {
            setSubmissionError("Missing required booking details (location, time, attendees).");
            setIsSubmitting(false);
            return;
        }
        if (!firstName || !lastName || !email || !phone || !therapyType) {
            setSubmissionError("Missing required contact information or therapy selection.");
            setIsSubmitting(false);
            return;
        }
        // Add mobile booking logic/validation if it becomes relevant
        if (destinationType === 'mobile') {
            console.warn("Mobile booking submission not fully implemented yet.");
            // For now, allow placeholder submission for mobile path if needed
            // alert("Mobile booking not yet available.");
            // setIsSubmitting(false);
            // return;
        }

        try {
            const response = await fetch('/api/bookings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData), // Send the complete form data
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

                        {/* Show Next button if not the last step (and not mobile on step 4) */}
                        {(!isLastStep && !isMobilePathLastRelevantStep) && (
                            <Button onClick={nextStep} disabled={isSubmitting}>
                                Next
                            </Button>
                        )}

                        {/* Show Submit button on the actual last step OR on step 4 if mobile */}
                        {(isLastStep || isMobilePathLastRelevantStep) && (
                            <Button onClick={handleSubmit} disabled={isSubmitting}>
                                {isSubmitting ? 'Submitting...' : 'Submit Booking'}
                            </Button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
} 