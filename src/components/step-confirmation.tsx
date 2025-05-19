'use client';

import React, { useMemo } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { BookingFormData } from './booking-form';
import { LOUNGE_LOCATIONS } from '@/lib/constants';

// Reuse the Treatment interface (ideally imported from types.ts)
// Define it here temporarily if not passed down or imported
interface Treatment {
  id: number | string;
  name: string;
  price: number;
  duration_minutes_200ml: number; // Keep both for potential future use
  duration_minutes_1000ml: number;
}

// Vitamin interface - assuming it will be available from props or a shared type
interface Vitamin {
  id: number | string;
  name: string;
  price: number;
}

interface StepConfirmationProps {
    formData: BookingFormData;
    treatmentsList: Treatment[];
    vitaminsList: Vitamin[]; // Add vitaminsList prop
}

// Helper function to find name from ID
const findNameById = (id: string | undefined, list: { id: string; name: string }[]) => {
    return list.find(item => item.id === id)?.name || 'N/A';
};

export default function StepConfirmation({ formData, treatmentsList, vitaminsList }: StepConfirmationProps) {

    const {
        destinationType,
        attendeeCount,
        loungeLocationId,
        selectedDate,
        selectedStartTime,
        clientAddress,
        email,
        phone,
        attendees
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
    const formattedDate = selectedDate ? format(selectedDate, 'PPP') : 'N/A'; // e.g., Apr 14th, 2025

    // --- Helper to get treatment details - Allow null ID ---
    const getTreatmentDetails = (treatmentId: number | string | undefined | null): Treatment | undefined => {
        if (!treatmentId || !treatmentsList) return undefined;
        return treatmentsList.find(t => String(t.id) === String(treatmentId));
    }

    // Helper to get vitamin details
    const getVitaminDetails = (vitaminId: string | number | undefined | null): Vitamin | undefined => {
      if (!vitaminId || vitaminId === 'none') return undefined;
      // Use vitaminsList from props (formData doesn't contain it, it comes from BookingForm directly)
      return vitaminsList.find(v => String(v.id) === String(vitaminId));
    }

    const DEXTROSE_EXTRA_COST = 200; // Define cost here too for consistency

    // --- NEW: Calculate total cost (same logic as Step 2) --- 
    const totalCost = React.useMemo(() => { // Added React.useMemo
        if (!attendees || attendees.length === 0) {
            return 0;
        }
        
        return attendees.reduce((total, attendee) => {
            const treatment = getTreatmentDetails(attendee.treatmentId);
            const addOnTreatment = getTreatmentDetails(attendee.addOnTreatmentId); // Get add-on details
            const selectedVitamin = getVitaminDetails(attendee.additionalVitaminId);

            let currentCost = 0; // Start cost at 0
            
            if (treatment) {
                currentCost += treatment.price; // Add base price if treatment exists

                if (addOnTreatment) {
                    currentCost += addOnTreatment.price || 0; // Add add-on price if it also exists
                }
                // Always add Dextrose cost if selected, independently of add-on
                if (attendee.fluidOption === '1000ml_dextrose') {
                     currentCost += DEXTROSE_EXTRA_COST;
                }
                // Add vitamin cost
                if (selectedVitamin) {
                    currentCost += selectedVitamin.price || 0;
                }
            }
            // No need to check treatment again here, already handled above
            return total + currentCost; 
        }, 0);
    }, [attendees, treatmentsList]); // Dependencies look correct

    // Helper to find treatment details by ID
    const getTreatmentById = (id: number | string | undefined | null): Treatment | undefined => {
        if (!id) return undefined;
        return treatmentsList.find(t => String(t.id) === String(id));
    };

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

                        <Label>Total Attendees:</Label>
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
                        {destinationType === 'mobile' && (
                            <>
                                <Label>Dispatch Lounge:</Label>
                                <span>{selectedLocationName || 'N/A'}</span>

                                <Label>Treatment Address:</Label>
                                <span>{clientAddress || 'N/A'}</span>

                                <Label>Date:</Label>
                                <span>{formattedDate}</span>

                                <Label>Treatment Time:</Label>
                                <span>{selectedTimeDisplay}</span>
                            </>
                        )}
                    </div>

                    <hr />

                    {/* REMOVED: Primary Contact Details section */}
                    {/* <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                         <Label>Contact Email:</Label>
                        <span>{email || 'N/A'}</span>

                         <Label>Contact Phone:</Label>
                        <span>{phone || 'N/A'}</span>
                    </div> */}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Attendee Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!attendees || attendees.length === 0 ? (
                        <p className="text-gray-600">No attendee details provided.</p>
                    ) : (
                        attendees.map((attendee, index) => {
                            const treatment = getTreatmentDetails(attendee.treatmentId);
                            const addOnTreatment = getTreatmentById(attendee.addOnTreatmentId); // Define addOnTreatment HERE
                            const selectedVitamin = getVitaminDetails(attendee.additionalVitaminId);
                            
                            // Calculate display price and duration based on fluid option
                            const displayPrice = useMemo(() => {
                                if (!treatment) { // Only need base treatment to exist
                                    return undefined;
                                }
                                
                                let currentCost = treatment.price;
                                // Add add-on treatment price if it exists
                                if (addOnTreatment) {
                                    currentCost += addOnTreatment.price || 0;
                                }
                                // Add Dextrose cost if selected
                                if (attendee.fluidOption === '1000ml_dextrose') {
                                    currentCost += DEXTROSE_EXTRA_COST;
                                }
                                // Add vitamin cost
                                if (selectedVitamin) {
                                    currentCost += selectedVitamin.price || 0;
                                }
                                return currentCost;
                            }, [treatment, addOnTreatment, attendee.fluidOption, selectedVitamin]);

                            // ADJUST Duration logic for confirmation page
                            let displayDurationText = 'N/A';
                            if (addOnTreatment) {
                                displayDurationText = '90 minutes'; // Fixed duration if add-on selected
                            } else if (treatment && attendee.fluidOption) {
                                const durationMinutes = attendee.fluidOption === '200ml' 
                                    ? treatment.duration_minutes_200ml 
                                    : treatment.duration_minutes_1000ml;
                                displayDurationText = `${durationMinutes} minutes`;
                            }
                            
                            // Format fluid option text
                            let fluidText: string = attendee.fluidOption || 'N/A';
                            if (attendee.fluidOption === '1000ml_dextrose') {
                                fluidText = '1000ml + Dextrose';
                            }

                            return (
                                <div key={index} className="p-3 border rounded-md bg-muted/30 space-y-2">
                                     <h4 className="font-medium">Attendee {index + 1}: {attendee.firstName || 'N/A'} {attendee.lastName || 'N/A'}</h4>
                                     <div className="grid grid-cols-[auto_1fr] gap-x-2 text-sm">
                                         {/* Display Email and Phone per attendee - MOVED UP */}
                                        <Label className="text-right">Email:</Label>
                                        <span>{attendee.email || 'N/A'}</span>

                                        <Label className="text-right">Phone:</Label>
                                        <span>{attendee.phone || 'N/A'}</span>
                                        
                                         <Label className="text-right">Treatment:</Label>
                                         <span>{treatment?.name || 'N/A'}</span>

                                        {/* ADDED: Display Fluid Option */}
                                        <Label className="text-right">Fluid:</Label>
                                        <span>{fluidText}</span>

                                        {/* Display Add-on Treatment - Styled like others, with price */} 
                                        {addOnTreatment && (
                                            <>
                                                <Label className="text-right font-semibold">Add-on:</Label>
                                                <span>{addOnTreatment.name} {addOnTreatment.price ? `(R ${addOnTreatment.price.toFixed(0)})` : ''}</span>
                                            </>
                                        )}
                                        {/* Display Selected Vitamin */}
                                        {selectedVitamin && selectedVitamin.id !== 'none' && (
                                            <>
                                                <Label className="text-right font-semibold">Vitamin:</Label>
                                                <span>{selectedVitamin.name} {selectedVitamin.price > 0 ? `(R ${selectedVitamin.price.toFixed(0)})` : ''}</span>
                                            </>
                                        )}

                                         <Label className="text-right">Duration:</Label>
                                         {/* Use the adjusted duration text */}
                                         <span>{displayDurationText}</span>

                                         <Label className="text-right">Price:</Label>
                                         <span>{displayPrice !== undefined ? `R ${displayPrice.toFixed(0)}` : 'N/A'}</span>
                                     </div>
                                </div>
                            );
                        })
                    )}
                     {/* --- ADDED: Display Total Cost --- */}
                     <div className="mt-4 pt-4 border-t">
                         <p className="text-lg font-semibold text-right">Total Estimated Cost: R {totalCost.toFixed(0)}</p>
                    </div>

                    <p className="text-xs text-gray-600 pt-4">Please review all details carefully. Clicking "Submit Booking" will finalize your request.</p>
                </CardContent>
            </Card>
        </div>
    );
} 