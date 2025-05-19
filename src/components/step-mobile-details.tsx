'use client';

import React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { BookingFormData } from './booking-form'; // This should now import the correctly typed BookingFormData
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { LOUNGE_LOCATIONS } from '@/lib/constants'; // Re-use lounge locations as dispatch locations
import { FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form';

export default function StepMobileDetails() {
    const { control, formState: { errors }, watch, setValue } = useFormContext<BookingFormData>();

    const handleDispatchLoungeChange = (value: string) => {
        setValue('loungeLocationId', value, { shouldValidate: true });
        // Reset date/time when dispatch lounge changes, as availability depends on it
        setValue('selectedDate', undefined, { shouldValidate: true });
        setValue('selectedTimeSlotId', undefined, { shouldValidate: true });
        setValue('selectedStartTime', undefined, { shouldValidate: true });
    };

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold">Step 3: Mobile Service Details</h2>

            {/* Dispatch Lounge Selection */}
            <FormField
                control={control}
                name="loungeLocationId" // This will store the ID of the dispatch lounge
                render={({ field }) => (
                    <FormItem>
                        <Label htmlFor="dispatch-lounge-select">Choose Dispatch Lounge</Label>
                        <Select
                            onValueChange={(value) => {
                                field.onChange(value);
                                handleDispatchLoungeChange(value);
                            }}
                            value={field.value || ""} // Ensure value is not undefined for Select
                            required
                        >
                            <FormControl>
                                <SelectTrigger id="dispatch-lounge-select" className="w-full mt-1 border-gray-400">
                                    <SelectValue placeholder="Select dispatch location..." />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {LOUNGE_LOCATIONS.map((location) => (
                                    <SelectItem key={location.id} value={location.id}>
                                        {location.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage>{errors.loungeLocationId?.message}</FormMessage>
                    </FormItem>
                )}
            />

            {/* Client Address Input */}
            <FormField
                control={control}
                name="clientAddress"
                render={({ field }) => (
                    <FormItem>
                        <Label htmlFor="client-address">Your Full Address for Mobile Service</Label>
                        <FormControl>
                            <Input 
                                id="client-address" 
                                {...field} 
                                placeholder="e.g., 123 Main St, Anytown, AT 12345" 
                                className="mt-1 border-gray-400"
                                value={field.value || ''} // Ensure value is not undefined for Input
                            />
                        </FormControl>
                        <FormMessage>{errors.clientAddress?.message}</FormMessage>
                    </FormItem>
                )}
            />

            {!watch('loungeLocationId') && (
                <p className="text-sm text-gray-600">Please select a dispatch lounge.</p>
            )}
            {watch('loungeLocationId') && !watch('clientAddress') && (
                <p className="text-sm text-gray-600">Please enter your address for the mobile service.</p>
            )}
        </div>
    );
} 