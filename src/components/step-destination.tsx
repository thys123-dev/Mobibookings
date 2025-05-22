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
import { BookingFormData } from './booking-form'; // Import the type
import { useFormContext } from 'react-hook-form'; // Import
import { FormField, FormItem, FormControl } from '@/components/ui/form'; // Import Form components

interface StepDestinationProps {
    // formData: BookingFormData;
    // updateFormData: (data: Partial<BookingFormData>) => void;
}

export default function StepDestination(/* { formData, updateFormData }: StepDestinationProps */) {
    const form = useFormContext<BookingFormData>(); // Use context

    const handleDestinationChange = (value: 'lounge' | 'mobile') => {
        form.setValue('destinationType', value, { shouldValidate: true });
        // Reset incompatible fields when changing destination type
        if (value === 'mobile') {
            form.setValue('loungeLocationId', undefined);
            form.setValue('selectedDate', undefined);
            form.setValue('selectedTimeSlotId', undefined);
            form.setValue('selectedStartTime', undefined);
        }
        // updateFormData({ destinationType: value });
    };

    const handleAttendeeCountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const count = parseInt(event.target.value, 10);
        // Update form state using setValue, ensure it's a positive number or default to 1
        form.setValue('attendeeCount', isNaN(count) || count < 1 ? 1 : count, { shouldValidate: true });
        // updateFormData({ attendeeCount: isNaN(count) || count < 1 ? 1 : count });
    };

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold">Step 1: Destination & Group Size</h2>

            {/* Destination Selection - Revert to Select Dropdown */}
            <FormField
                control={form.control}
                name="destinationType"
                render={({ field }) => (
                    <FormItem>
                        <Label className="mb-2 block">Where is your treatment?</Label>
                        <Select 
                            onValueChange={field.onChange} 
                            value={field.value}
                            required
                        >
                            <FormControl>
                                <SelectTrigger id="destination-select" className="w-full mt-1 border-gray-400">
                                    <SelectValue placeholder="Select destination..." />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="lounge">Our Treatment Lounge</SelectItem>
                                <SelectItem value="mobile">Your Home, Office, etc. (Mobile Service)</SelectItem>
                            </SelectContent>
                        </Select>
                        {/* Optional: Add error message display if needed */}
                        {/* <FormMessage /> */}
                    </FormItem>
                )}
            />

            {/* Attendee Count Input */}
            <div>
                <Label htmlFor="attendeeCount">Number of Attendees</Label>
                <Input
                    id="attendeeCount"
                    type="number"
                    // Use watched value from context, ensure it's a number
                    value={form.watch('attendeeCount') || 1} 
                    onChange={handleAttendeeCountChange}
                    min="1"
                    required
                    className="mt-1 border-gray-400"
                />
            </div>

            {/* Display message if no destination selected yet */}
            {!form.watch('destinationType') && (
                <p className="text-sm text-gray-600">Please select a destination to continue.</p>
            )}
        </div>
    );
} 