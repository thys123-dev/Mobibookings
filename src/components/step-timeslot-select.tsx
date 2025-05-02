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
import { BookingFormData } from './booking-form';

// Define the structure of a time slot received from the API
interface TimeSlot {
    id: string | number; // Match DB schema
    start_time: string; // ISO 8601 string
    end_time: string; // ISO 8601 string
    capacity: number;
    booked_count: number;
    remaining_seats: number;
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
    const attendees = formData.attendeeCount || 1; // Default to 1 if not set

    useEffect(() => {
        // Fetch availability when date or location changes
        if (selectedDate && locationId) {
            fetchAvailability(selectedDate);
        }
        // Clear slots if date is cleared
        if (!selectedDate) {
            setAvailableSlots([]);
            updateFormData({ selectedTimeSlotId: undefined }); // Clear selected slot if date changes
        }
    }, [selectedDate, locationId]);

    const fetchAvailability = async (date: Date) => {
        setIsLoading(true);
        setError(null);
        setAvailableSlots([]); // Clear previous slots
        updateFormData({ selectedTimeSlotId: undefined }); // Clear selection on new fetch

        const dateString = format(date, 'yyyy-MM-dd');

        try {
            const response = await fetch(`/api/availability?locationId=${locationId}&date=${dateString}&attendeeCount=${attendees}`);
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

    // This step should only render if destinationType is 'lounge'
    if (formData.destinationType !== 'lounge' || !locationId) {
        return <div className="text-red-500">Error: Lounge location must be selected first.</div>;
    }

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold">Step 3: Select Date & Time Slot</h2>

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
            {selectedDate && (
                <div className="space-y-3">
                    <Label>Select an Available Time Slot for {format(selectedDate, 'PPP')}</Label>
                    {isLoading && <p>Loading slots...</p>}
                    {error && <p className="text-red-500">Error: {error}</p>}
                    {!isLoading && !error && availableSlots.length === 0 && (
                        <p className="text-gray-600">No available slots found for {attendees} attendee{attendees !== 1 ? 's' : ''} on this date.</p>
                    )}
                    {!isLoading && !error && availableSlots.length > 0 && (
                        <div className="grid grid-cols-3 gap-3">
                            {availableSlots
                                .map((slot) => (
                                    <Button
                                        key={slot.id}
                                        variant={formData.selectedTimeSlotId === String(slot.id) ? "default" : "outline"}
                                        onClick={() => handleSlotSelect(slot.id)}
                                        className="flex flex-col h-auto py-2"
                                    >
                                        <span>{formatTime(slot.start_time)}</span>
                                        <span className="text-xs">({slot.remaining_seats} seat{slot.remaining_seats !== 1 ? 's' : ''} left)</span>
                                    </Button>
                                ))
                            }
                        </div>
                    )}
                </div>
            )}

            {/* Display message if no date/slot selected */}
            {!selectedDate && <p className="text-sm text-gray-600">Please select a date.</p>}
            {selectedDate && !formData.selectedTimeSlotId && !isLoading && availableSlots.length > 0 && (
                <p className="text-sm text-gray-600">Please select an available time slot.</p>
            )}
        </div>
    );
} 