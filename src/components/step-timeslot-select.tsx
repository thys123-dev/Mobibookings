'use client';

import React, { useState, useEffect } from 'react';
import { format, startOfDay, isValid, parseISO } from 'date-fns'; // Date utility functions
import { Calendar as CalendarIcon } from "lucide-react"; // Import calendar icon

import { cn } from "@/lib/utils"; // For conditional classes
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"; // Import Popover components
import { BookingFormData } from './booking-form'; // Import AttendeeData
import { useFormContext } from 'react-hook-form'; // Import
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// ADD TimeSlot interface definition here
interface TimeSlot {
    id: number; // For lounge, this is the slot ID. For mobile, it's the ID of the *second* slot.
    location_id?: string; // Only relevant for lounge
    start_time: string; // ISO 8601 format. For mobile, this is the actual treatment start time (2nd slot)
    end_time: string;   // ISO 8601 format. For mobile, this is the end time of the actual treatment slot (2nd slot)
    is_available?: boolean; // Only relevant for lounge
    capacity?: number; // Only relevant for lounge
    current_bookings?: number; // Only relevant for lounge
}

// --- NEW: Type for the data sent to availability API ---
interface AvailabilityRequestDataBase {
    date: string;
    destinationType: 'lounge' | 'mobile';
}

interface LoungeAvailabilityRequestData extends AvailabilityRequestDataBase {
    destinationType: 'lounge';
    locationId: string;
    attendees: Pick<BookingFormData['attendees'][number], 'treatmentId' | 'fluidOption' | 'addOnTreatmentId'>[];
}

interface MobileAvailabilityRequestData extends AvailabilityRequestDataBase {
    destinationType: 'mobile';
    locationId: string; // This will be the dispatchLoungeId
}

type AvailabilityRequestData = LoungeAvailabilityRequestData | MobileAvailabilityRequestData;

interface StepTimeslotSelectProps {
    // formData: BookingFormData;
    // updateFormData: (data: Partial<BookingFormData>) => void;
}

export default function StepTimeslotSelect(/* { formData, updateFormData }: StepTimeslotSelectProps */) {
    const form = useFormContext<BookingFormData>(); // Use context

    const destinationType = form.watch('destinationType');
    const loungeLocationId = form.watch('loungeLocationId'); // Used as locationId for lounge, and dispatchLoungeId for mobile
    const selectedDate = form.watch('selectedDate');
    const selectedTimeSlotId = form.watch('selectedTimeSlotId');
    const attendeeCount = form.watch('attendeeCount'); // Get attendee count

    const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPopoverOpen, setIsPopoverOpen] = useState(false); // Control popover state

    const attendeesDetails = form.watch('attendees') || []; // Use the attendee details array

    useEffect(() => {
        let canFetch = false;
        let requestBody: AvailabilityRequestData | null = null;
        const dateString = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;

        if (dateString && loungeLocationId) {
            if (destinationType === 'lounge') {
                canFetch = attendeeCount > 0 && 
                           attendeesDetails.length === attendeeCount && 
                           attendeesDetails.every(a => a && (a.treatmentId && a.fluidOption)); // For lounge, treatment & fluid are needed for duration calculation
        if (canFetch) {
                    requestBody = {
                        destinationType: 'lounge',
                        locationId: loungeLocationId,
                date: dateString,
                attendees: attendeesDetails.map(a => ({
                    treatmentId: a?.treatmentId, 
                    fluidOption: a?.fluidOption, 
                    addOnTreatmentId: a?.addOnTreatmentId 
                }))
            };
                }
            } else if (destinationType === 'mobile') {
                canFetch = true; // For mobile, only date and dispatch lounge are needed
                requestBody = {
                    destinationType: 'mobile',
                    locationId: loungeLocationId, // This is the dispatchLoungeId
                    date: dateString,
                };
            }
        }

        if (canFetch && requestBody) {
            setIsLoading(true);
            setError(null);

            console.log('Client is sending this requestBody to /api/availability:', JSON.parse(JSON.stringify(requestBody))); // Deep clone for inspection

            fetch('/api/availability', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            })
                .then(res => {
                    if (!res.ok) {
                        return res.json().then(err => { throw new Error(err.error || 'Failed to fetch availability'); });
                    }
                    return res.json();
                })
                .then((data: TimeSlot[]) => {
                    setAvailableSlots(data);
                    setIsLoading(false);
                })
                .catch(err => {
                    console.error("Availability fetch error:", err);
                    setError(err.message || 'Could not load time slots.');
                    setAvailableSlots([]);
                    setIsLoading(false);
                });
        } else {
            setAvailableSlots([]);
        }
    }, [selectedDate, loungeLocationId, destinationType, attendeeCount, attendeesDetails]); // form.watch removed

    const handleDateSelect = (date: Date | undefined) => {
        if (date) {
            form.setValue('selectedDate', date, { shouldValidate: true });
            form.setValue('selectedTimeSlotId', undefined, { shouldValidate: true });
            form.setValue('selectedStartTime', undefined, { shouldValidate: true });
            setIsPopoverOpen(false);
        }
    };

    const handleSlotSelect = (slotId: string | number) => {
        const selectedSlot = availableSlots.find(slot => String(slot.id) === String(slotId));
        if (selectedSlot) {
            form.setValue('selectedTimeSlotId', String(selectedSlot.id), { shouldValidate: true });
            form.setValue('selectedStartTime', selectedSlot.start_time, { shouldValidate: true });
            form.trigger('selectedStartTime');
        } else {
            form.setValue('selectedTimeSlotId', undefined, { shouldValidate: true });
            form.setValue('selectedStartTime', undefined, { shouldValidate: true });
        }
    };

    // Helper to format time
    const formatTime = (isoString: string): string => {
        try {
            const dateObj = parseISO(isoString);
            if (!isValid(dateObj)) return "Invalid Time";
            return format(dateObj, 'HH:mm'); // e.g., 14:30
        } catch {
            return "Invalid Time";
        }
    };

    const getPrerequisiteMissingMessage = () => {
        if (!loungeLocationId) {
            return destinationType === 'lounge' ? "Please select a lounge location in the previous step." : "Please select a dispatch lounge in the previous step.";
        }
        if (destinationType === 'lounge' && (attendeesDetails.length === 0 || attendeesDetails.some(a => !a.treatmentId || !a.fluidOption))) {
            return "Please ensure all attendee treatment and fluid details are selected in previous steps.";
        }
        return null;
    };

    const prerequisiteMissingMessage = getPrerequisiteMissingMessage();
    
    // This step should only render if a destinationType is selected.
    // The booking form logic should handle showing the correct step (lounge/mobile details) before this one.
    if (!destinationType) {
      return <p className="text-sm text-orange-600">Please select a destination type in Step 1.</p>;
    }

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold">Step 4: Select Date & Time Slot</h2> {/* Updated Step number? Check booking-form.tsx */} 

            {/* Date Selection using Popover */}
            <div>
                <Label className="mb-2 block">Please Select Your Appointment Date *</Label>
                <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant={"outline"}
                            className={cn(
                                "w-full justify-start text-left font-normal",
                                !selectedDate && "text-muted-foreground",
                                !!prerequisiteMissingMessage && "opacity-50 cursor-not-allowed"
                            )}
                            disabled={!!prerequisiteMissingMessage} // Disable if prerequisites are missing
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={handleDateSelect}
                            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                            initialFocus // Focus calendar when opened
                        />
                    </PopoverContent>
                </Popover>
                {!selectedDate && !prerequisiteMissingMessage && <p className="text-sm text-red-600 mt-1">Choose a date.</p>}
            </div>

            {/* Time Slot Selection */}
            {prerequisiteMissingMessage && (
                 <p className="text-sm text-orange-600">{prerequisiteMissingMessage}</p>
            )}

            {!prerequisiteMissingMessage && selectedDate && (
                <div className="space-y-3">
                    <Label>Select an Available Time Slot for {format(selectedDate, 'PPP')}</Label>
                    {isLoading && <p>Loading slots...</p>}
                    {error && <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
                    {!isLoading && !error && availableSlots.length === 0 && (
                        <p className="text-gray-600">
                            {destinationType === 'mobile' 
                                ? "No available 2-hour blocks (including travel time) found for the selected dispatch lounge and date."
                                : "No available slots found matching the required duration and capacity for all attendees on this date."}
                        </p>
                    )}
                    {!isLoading && !error && availableSlots.length > 0 && (
                        <div className="grid grid-cols-3 gap-3">
                            {availableSlots
                                .map((slot) => (
                                    <Button
                                        key={slot.id} // For mobile, this ID is unique for the displayable slot
                                        variant={String(slot.id) === selectedTimeSlotId ? "default" : "outline"}
                                        onClick={() => handleSlotSelect(slot.id)}
                                        type="button"
                                    >
                                        {formatTime(slot.start_time)} {/* For mobile, this is already the treatment time */}
                                    </Button>
                                ))
                            }
                        </div>
                    )}
                </div>
            )}

            {/* Display message if no date/slot selected */}
            {!prerequisiteMissingMessage && !selectedDate && <p className="text-sm text-gray-600">Please select a date first.</p>}
            {!prerequisiteMissingMessage && selectedDate && !selectedTimeSlotId && !isLoading && availableSlots.length > 0 && (
                <p className="text-sm text-red-600 mt-1">Please select an available time slot.</p>
            )}
        </div>
    );
} 