'use client';

import React from 'react';
import { Input } from "@/components/ui/input"; // Keep for potential future use, but not for attendee count now
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

        // Reset attendee count if switching to mobile, or ensure it's max 1 if mobile
        if (destType === 'mobile') {
            updates.attendeeCount = 1; // Mobile service is per person
        } else {
            // If switching back to lounge, ensure attendee count isn't invalid (>2)
            // or reset if it wasn't set
            if (!formData.attendeeCount || formData.attendeeCount > 2) {
                updates.attendeeCount = 1; // Default to 1 when selecting lounge
            }
        }
        updateFormData(updates);
    };

    const handleAttendeeChange = (value: string) => {
        const count = parseInt(value, 10);
        if (!isNaN(count)) {
            updateFormData({ attendeeCount: count });
        }
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

            {/* Attendee Count (Dropdown) */}
            <div>
                <Label htmlFor="attendee-count">Number of People Attending</Label>
                <Select
                    value={formData.attendeeCount ? String(formData.attendeeCount) : undefined}
                    onValueChange={handleAttendeeChange}
                    required
                    // Disable if no destination selected OR if mobile is selected
                    disabled={!formData.destinationType || formData.destinationType === 'mobile'}
                >
                    <SelectTrigger id="attendee-count" className="w-full mt-1 border-gray-400">
                        <SelectValue placeholder="Select number..." />
                    </SelectTrigger>
                    <SelectContent>
                        {formData.destinationType === 'lounge' ? (
                            <>
                                <SelectItem value="1">1 Person</SelectItem>
                                <SelectItem value="2">2 People</SelectItem>
                            </>
                        ) : (
                            // Only show 1 if mobile or no destination selected (but disabled)
                            <SelectItem value="1">1 Person</SelectItem>
                        )}
                    </SelectContent>
                </Select>
                {formData.destinationType === 'lounge' && (
                    <p className="text-xs text-gray-500 mt-1">Max 2 attendees per booking at our lounges.</p>
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