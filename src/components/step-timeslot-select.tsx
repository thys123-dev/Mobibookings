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

// Define the structure of a time slot received from the API
interface TimeSlot {
    id: string | number; // Match DB schema
    start_time: string; // ISO 8601 string
    end_time: string; // ISO 8601 string
    // No longer necessarily includes remaining_seats from the backend
    // capacity: number;
    // booked_count: number;
    // remaining_seats: number;
}

// --- NEW: Type for the data sent to availability API ---
interface AvailabilityRequestData {
    locationId: string;
    date: string;
    attendees: Pick<AttendeeData, 'treatmentId' | 'fluidOption'>[]; // Only need these fields
}

interface StepTimeslotSelectProps {
    formData: BookingFormData;
    updateFormData: (data: Partial<BookingFormData>) => void;
}

export default function StepTimeslotSelect({ formData, updateFormData }: StepTimeslotSelectProps) {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(formData.selectedDate);
    const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPopoverOpen, setIsPopoverOpen] = useState(false); // Control popover state

    const locationId = formData.loungeLocationId;
    // const attendeesCount = formData.attendeeCount || 1; // No longer used directly for API call
    const attendeesDetails = formData.attendees || []; // Use the attendee details array

    useEffect(() => {
        // Fetch availability when date, location, or relevant attendee details change
        // Check if all attendees have treatmentId and fluidOption before fetching
        const canFetch = selectedDate && locationId && attendeesDetails.length > 0 && 
                       attendeesDetails.every(a => a.treatmentId && a.fluidOption);
                       
        if (canFetch) {
            fetchAvailability(selectedDate);
        } else {
            setAvailableSlots([]); // Clear slots if required data is missing
            updateFormData({ selectedTimeSlotId: undefined, selectedStartTime: undefined });
        }
        // Trigger fetch if date, location, or attendee details change
    }, [selectedDate, locationId, attendeesDetails]); // Add attendeesDetails dependency

    const fetchAvailability = async (date: Date) => {
        setIsLoading(true);
        setError(null);
        setAvailableSlots([]); // Clear previous slots
        updateFormData({ selectedTimeSlotId: undefined, selectedStartTime: undefined }); // Clear selection on new fetch

        const dateString = format(date, 'yyyy-MM-dd');
        
        // Prepare data for POST request
        const requestBody: AvailabilityRequestData = {
            locationId: locationId!,
            date: dateString,
            attendees: attendeesDetails.map(a => ({
                treatmentId: a.treatmentId!,
                fluidOption: a.fluidOption!
            }))
        };

        try {
            // --- UPDATED: Use POST request --- 
            const response = await fetch('/api/availability', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const slots: TimeSlot[] = await response.json();
            setAvailableSlots(slots);
        } catch (err: any) {
            console.error("Failed to fetch availability:", err);
            setError(err.message || "Could not fetch time slots. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDateSelect = (date: Date | undefined) => {
        if (date) {
            // Prevent selecting dates in the past
            if (startOfDay(date) < startOfDay(new Date())) {
                setError("Cannot select past dates.");
                setSelectedDate(undefined);
                updateFormData({ selectedDate: undefined, selectedTimeSlotId: undefined });
            } else {
                setSelectedDate(date);
                updateFormData({ selectedDate: date, selectedTimeSlotId: undefined }); // Update form data, clear slot
                setError(null); // Clear any previous errors
                setIsPopoverOpen(false); // Close popover on date selection
            }
        } else {
            setSelectedDate(undefined);
            updateFormData({ selectedDate: undefined, selectedTimeSlotId: undefined });
        }
    };

    const handleSlotSelect = (slotId: string | number) => {
        // Find the full slot object from the availableSlots array
        const selectedSlot = availableSlots.find(slot => String(slot.id) === String(slotId));
        if (selectedSlot) {
            updateFormData({
                selectedTimeSlotId: String(selectedSlot.id),
                selectedStartTime: selectedSlot.start_time // Store the start time string
            });
        } else {
            console.error("Selected slot not found in available slots list");
            // Optionally handle this error case, e.g., clear selection or show message
            updateFormData({ selectedTimeSlotId: undefined, selectedStartTime: undefined });
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

    if (formData.destinationType !== 'lounge') {
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
                            disabled={(date) => startOfDay(date) < startOfDay(new Date())}
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
                                        variant={formData.selectedTimeSlotId === String(slot.id) ? "default" : "outline"}
                                        onClick={() => handleSlotSelect(slot.id)}
                                        // Removed explicit height/py classes for default button sizing
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
            {!prerequisiteMissing && selectedDate && !formData.selectedTimeSlotId && !isLoading && availableSlots.length > 0 && (
                <p className="text-sm text-gray-600">Please select an available time slot.</p>
            )}
        </div>
    );
} 