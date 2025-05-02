'use client';

import React from 'react';
import { Input } from "@/components/ui/input"; // Use Input now
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
// Remove RadioGroup import
// import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"; 
import { BookingFormData } from './booking-form'; // Import the type

interface StepDestinationProps {
    formData: BookingFormData;
    updateFormData: (data: Partial<BookingFormData>) => void;
}

export default function StepDestination({ formData, updateFormData }: StepDestinationProps) {

    const handleDestinationChange = (value: string) => {
        const destType = value as 'lounge' | 'mobile';
        const updates: Partial<BookingFormData> = { destinationType: destType };

        // Reset attendee count to 1 ONLY if switching to mobile
        if (destType === 'mobile') {
            updates.attendeeCount = 1; // Mobile service is per person
        }
        // REMOVED: Logic that previously limited count when switching back to lounge

        updateFormData(updates);
    };

    // UPDATED: Handler for number Input
    const handleAttendeeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const count = parseInt(event.target.value, 10);
        // Update only if it's a valid positive number
        if (!isNaN(count) && count > 0) {
            updateFormData({ attendeeCount: count });
        } else if (event.target.value === '') {
            // Allow clearing the input (formData value becomes undefined)
            updateFormData({ attendeeCount: undefined });
        }
        // If input is invalid (e.g., negative, text), do nothing - input field constraints handle display
    };

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold">Step 1: Choose Your Destination & Attendees</h2>

            {/* Destination Selection (Dropdown) */}
            <div>
                <Label htmlFor="destination-select">Where would you like your treatment?</Label>
                <Select
                    value={formData.destinationType}
                    onValueChange={handleDestinationChange}
                    required
                >
                    <SelectTrigger id="destination-select" className="w-full mt-1 border-gray-400">
                        <SelectValue placeholder="Select destination..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="lounge">Our Treatment Lounge</SelectItem>
                        <SelectItem value="mobile">Your Home, Office, etc. (Mobile Service)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* UPDATED: Attendee Count (Number Input) */}
            <div>
                <Label htmlFor="attendee-count">Number of People Attending</Label>
                <Input
                    id="attendee-count"
                    name="attendeeCount" // Ensure name matches formData key
                    type="number"
                    min="1"
                    value={formData.attendeeCount || ''} // Use empty string if undefined
                    onChange={handleAttendeeChange}
                    required
                    // Disable if no destination selected OR if mobile is selected
                    disabled={!formData.destinationType || formData.destinationType === 'mobile'}
                    className="w-full mt-1 border-gray-400"
                    placeholder="Enter number..."
                />
                {/* UPDATED: Help text */}
                {formData.destinationType === 'lounge' && (
                    <p className="text-xs text-gray-500 mt-1">Enter the total number of people. Groups larger than 2 may require booking consecutive time slots.</p>
                )}
                {formData.destinationType === 'mobile' && (
                    <p className="text-xs text-gray-500 mt-1">Mobile service bookings are currently for single attendees.</p>
                )}
            </div>

            {/* Display message if no destination selected yet */}
            {!formData.destinationType && (
                <p className="text-sm text-gray-600">Please select a destination to continue.</p>
            )}
        </div>
    );
} 