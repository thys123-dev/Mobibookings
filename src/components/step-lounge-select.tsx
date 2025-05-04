'use client';

import React from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { BookingFormData } from './booking-form';
import { LOUNGE_LOCATIONS } from '@/lib/constants'; // Import locations
import { useFormContext } from 'react-hook-form'; // Import

interface StepLoungeSelectProps {
    // formData: BookingFormData;
    // updateFormData: (data: Partial<BookingFormData>) => void;
}

export default function StepLoungeSelect(/* { formData, updateFormData }: StepLoungeSelectProps */) {
    const form = useFormContext<BookingFormData>(); // Use context

    const handleLocationChange = (value: string) => {
        form.setValue('loungeLocationId', value, { shouldValidate: true });
        // updateFormData({ loungeLocationId: value });
    };

    // This step should only render if destinationType is 'lounge'
    // The parent component (BookingForm) should handle this conditional rendering logic
    // by only rendering this component when appropriate.
    // However, we add a check here as a safeguard.
    if (form.watch('destinationType') !== 'lounge') {
        return <div className="text-red-500">Error: This step is only for lounge bookings.</div>;
    }

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold">Step 3: Select Lounge Location</h2>

            <div>
                <Label htmlFor="lounge-select">Choose a Lounge Location</Label>
                <Select
                    value={form.watch('loungeLocationId')}
                    onValueChange={handleLocationChange}
                    required // Ensure a selection is made
                >
                    <SelectTrigger id="lounge-select" className="w-full mt-1 border-gray-400">
                        <SelectValue placeholder="Select a location..." />
                    </SelectTrigger>
                    <SelectContent>
                        {LOUNGE_LOCATIONS.map((location) => (
                            <SelectItem key={location.id} value={location.id}>
                                {location.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Display message if no location selected yet */}
            {!form.watch('loungeLocationId') && (
                <p className="text-sm text-gray-600">Please select a lounge to continue.</p>
            )}
        </div>
    );
} 