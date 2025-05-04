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
import { BookingFormData, AttendeeData } from './booking-form'; // Import AttendeeData
import { useFormContext } from 'react-hook-form'; // Import
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// ADD TimeSlot interface definition here
interface TimeSlot {
    id: number;
    location_id: string;
    start_time: string; // ISO 8601 format
    end_time: string;   // ISO 8601 format
    is_available: boolean;
    capacity: number;
    current_bookings: number;
}

// --- NEW: Type for the data sent to availability API ---
interface AvailabilityRequestData {
    locationId: string;
    date: string;
    attendees: Pick<AttendeeData, 'treatmentId' | 'fluidOption'>[]; // Only need these fields
}

interface StepTimeslotSelectProps {
    // formData: BookingFormData;
    // updateFormData: (data: Partial<BookingFormData>) => void;
}

export default function StepTimeslotSelect(/* { formData, updateFormData }: StepTimeslotSelectProps */) {
    const form = useFormContext<BookingFormData>(); // Use context

    // Get necessary values from form context
    const locationId = form.watch('loungeLocationId');
    const selectedDate = form.watch('selectedDate');
    const selectedTimeSlotId = form.watch('selectedTimeSlotId');
    const attendeeCount = form.watch('attendeeCount'); // Get attendee count

    const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPopoverOpen, setIsPopoverOpen] = useState(false); // Control popover state

    const attendeesDetails = form.watch('attendees') || []; // Use the attendee details array

    useEffect(() => {
        // Ensure all necessary data including attendee details are present
        const canFetch = selectedDate && locationId && attendeeCount && 
                       attendeesDetails.length === attendeeCount && // Make sure array matches count
                       attendeesDetails.every(a => a && (a.addOnTreatmentId || a.fluidOption)); // Require either add-on OR fluid option

        if (canFetch) {
            setIsLoading(true);
            setError(null);
            const dateString = format(selectedDate, 'yyyy-MM-dd');
            
            // --- Revert to POST request --- 
            const requestBody = {
                locationId: locationId,
                date: dateString,
                attendeeCount: attendeeCount,
                // Add the attendees array with necessary fields
                attendees: attendeesDetails.map(a => ({
                    treatmentId: a?.treatmentId, 
                    fluidOption: a?.fluidOption, 
                    addOnTreatmentId: a?.addOnTreatmentId 
                }))
            };

            fetch('/api/availability', { // Use POST
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
                    setAvailableSlots([]); // Clear slots on error
                    setIsLoading(false);
                });
        } else {
            setAvailableSlots([]); // Clear slots if date/location/attendeeCount not set
        }
    }, [selectedDate, locationId, attendeeCount, attendeesDetails]); // Add attendeesDetails dependency

    const handleDateSelect = (date: Date | undefined) => {
        if (date) {
            form.setValue('selectedDate', date, { shouldValidate: true });
            // Reset selected time slot when date changes
            form.setValue('selectedTimeSlotId', undefined, { shouldValidate: true });
            form.setValue('selectedStartTime', undefined, { shouldValidate: true });
            // updateFormData({ selectedDate: date, selectedTimeSlotId: undefined, selectedStartTime: undefined });
        }
    };

    const handleSlotSelect = (slotId: string | number) => {
        console.log('*** handleSlotSelect called for slot:', slotId);
        // Find the full slot object from the availableSlots array
        const selectedSlot = availableSlots.find(slot => String(slot.id) === String(slotId));
        if (selectedSlot) {
            form.setValue('selectedTimeSlotId', String(selectedSlot.id), { shouldValidate: true });
            form.setValue('selectedStartTime', selectedSlot.start_time, { shouldValidate: true });
            // Trigger validation specifically for selectedStartTime after setting it
            form.trigger('selectedStartTime');
            // updateFormData({
            //     selectedTimeSlotId: String(selectedSlot.id),
            //     selectedStartTime: selectedSlot.start_time // Store the start time string
            // });
        } else {
            console.error("Selected slot not found in available slots list");
            // Optionally handle this error case, e.g., clear selection or show message
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

    // --- Check if prerequisite data is available --- 
    const prerequisiteMissing = !locationId || attendeesDetails.length === 0 || attendeesDetails.some(a => !a.treatmentId || !a.fluidOption);

    if (form.watch('destinationType') !== 'lounge') {
        // This case should ideally not be reached due to form flow logic
        return null; 
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
                                !selectedDate && "text-muted-foreground"
                            )}
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
                {!selectedDate && <p className="text-sm text-red-600 mt-1">Choose a date.</p>}
                {error && !selectedDate && <p className="text-sm text-red-600 mt-1">{error}</p>}
            </div>

            {/* Time Slot Selection */}
            {prerequisiteMissing && (
                 <p className="text-sm text-orange-600">Please ensure location and all attendee treatment/fluid details are selected in previous steps.</p>
            )}

            {!prerequisiteMissing && selectedDate && (
                <div className="space-y-3">
                    <Label>Select an Available Time Slot for {format(selectedDate, 'PPP')}</Label>
                    {isLoading && <p>Loading slots...</p>}
                    {error && <p className="text-red-500">Error: {error}</p>}
                    {!isLoading && !error && availableSlots.length === 0 && (
                        <p className="text-gray-600">No available slots found matching the required duration and capacity for all attendees on this date.</p> // Updated message
                    )}
                    {!isLoading && !error && availableSlots.length > 0 && (
                        <div className="grid grid-cols-3 gap-3">
                            {availableSlots
                                .map((slot) => (
                                    <Button
                                        key={slot.id}
                                        variant={String(slot.id) === selectedTimeSlotId ? "default" : "outline"}
                                        onClick={() => handleSlotSelect(slot.id)}
                                        type="button"
                                    >
                                        {formatTime(slot.start_time)}
                                        {/* Removed seat count as it's no longer reliable/provided */}
                                        {/* <span className="text-xs">({slot.remaining_seats} seat{slot.remaining_seats !== 1 ? 's' : ''} left)</span> */}
                                    </Button>
                                ))
                            }
                        </div>
                    )}
                </div>
            )}

            {/* Display message if no date/slot selected */}
            {!prerequisiteMissing && !selectedDate && <p className="text-sm text-gray-600">Please select a date.</p>}
            {!prerequisiteMissing && selectedDate && !selectedTimeSlotId && !isLoading && availableSlots.length > 0 && (
                <p className="text-sm text-gray-600">Please select an available time slot.</p>
            )}
        </div>
    );
} 