'use client';

import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookingFormData } from './booking-form';

interface StepAttendeeInfoProps {
    formData: BookingFormData;
    updateFormData: (data: Partial<BookingFormData>) => void;
}

export default function StepAttendeeInfo({ formData, updateFormData }: StepAttendeeInfoProps) {
    // State for email validation error
    const [emailError, setEmailError] = useState<string>('');

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        updateFormData({ [name]: value });

        // Email validation
        if (name === 'email') {
            // Simple regex for basic email format check
            const emailRegex = /^\S+@\S+\.\S+$/;
            if (value && !emailRegex.test(value)) {
                setEmailError('Invalid email format');
            } else {
                setEmailError(''); // Clear error if valid or empty
            }
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold">Step 5: Your Information</h2>

            {/* Input fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                        id="firstName"
                        name="firstName"
                        value={formData.firstName || ''}
                        onChange={handleInputChange}
                        required
                        className="mt-1"
                    />
                </div>
                <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                        id="lastName"
                        name="lastName"
                        value={formData.lastName || ''}
                        onChange={handleInputChange}
                        required
                        className="mt-1"
                    />
                </div>
                <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email || ''}
                        onChange={handleInputChange}
                        required
                        className="mt-1"
                    />
                    {/* Display email error message */}
                    {emailError && <p className="text-red-500 text-xs mt-1">{emailError}</p>}
                </div>
                <div>
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                        id="phone"
                        name="phone"
                        type="tel" // Use tel type for potential mobile features
                        value={formData.phone || ''}
                        onChange={handleInputChange}
                        required
                        className="mt-1"
                    />
                </div>
            </div>

            {/* Note: Multi-attendee input is out of scope for now */}
            {formData.attendeeCount && formData.attendeeCount > 1 && (
                <p className="text-sm text-blue-600">Input for additional attendees will be added later.</p>
            )}

        </div>
    );
} 