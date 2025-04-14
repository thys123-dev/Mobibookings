'use client';

import React from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { BookingFormData } from './booking-form';
import { LOUNGE_LOCATIONS, IV_THERAPIES } from '@/lib/constants';

interface StepConfirmationProps {
    formData: BookingFormData;
}

// Helper function to find name from ID
const findNameById = (id: string | undefined, list: { id: string; name: string }[]) => {
    return list.find(item => item.id === id)?.name || 'N/A';
};

export default function StepConfirmation({ formData }: StepConfirmationProps) {

    const {
        destinationType,
        attendeeCount,
        loungeLocationId,
        selectedDate,
        selectedStartTime,
        firstName,
        lastName,
        email,
        phone,
        therapyType
    } = formData;

    // Helper to format time, duplicated from StepTimeslotSelect for now
    // Consider moving to a shared utils file later
    const formatTime = (isoString: string | undefined): string => {
        if (!isoString) return "N/A";
        try {
            const dateObj = parseISO(isoString);
            if (!isValid(dateObj)) return "Invalid Time";
            return format(dateObj, 'HH:mm'); // e.g., 14:30
        } catch {
            return "Invalid Time";
        }
    };

    const selectedTimeDisplay = formatTime(selectedStartTime);
    const selectedLocationName = findNameById(loungeLocationId, LOUNGE_LOCATIONS);
    const selectedTherapyName = findNameById(therapyType, IV_THERAPIES);
    const formattedDate = selectedDate ? format(selectedDate, 'PPP') : 'N/A'; // e.g., Apr 14th, 2025

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold">Step 5: Confirm Your Booking Details</h2>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Booking Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <Label>Destination:</Label>
                        <span>{destinationType === 'lounge' ? 'Treatment Lounge' : 'Mobile Service'}</span>

                        <Label>Attendees:</Label>
                        <span>{attendeeCount || 'N/A'}</span>

                        {destinationType === 'lounge' && (
                            <>
                                <Label>Location:</Label>
                                <span>{selectedLocationName}</span>

                                <Label>Date:</Label>
                                <span>{formattedDate}</span>

                                <Label>Time:</Label>
                                <span>{selectedTimeDisplay}</span>
                            </>
                        )}
                    </div>

                    <hr />

                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <Label>First Name:</Label>
                        <span>{firstName || 'N/A'}</span>

                        <Label>Last Name:</Label>
                        <span>{lastName || 'N/A'}</span>

                        <Label>Email:</Label>
                        <span>{email || 'N/A'}</span>

                        <Label>Phone:</Label>
                        <span>{phone || 'N/A'}</span>

                        <Label>Therapy:</Label>
                        <span>{selectedTherapyName}</span>
                    </div>

                    <p className="text-xs text-gray-600 pt-4">Please review your details carefully. Clicking "Submit Booking" will finalize your request.</p>

                </CardContent>
            </Card>
        </div>
    );
} 