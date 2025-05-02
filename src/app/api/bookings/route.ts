import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/database/supabase-client';
// import { IV_THERAPIES } from '@/lib/constants'; // No longer needed if fetching from DB
import { createCalendarEvent } from '@/lib/google-calendar'; // Import GCal helper
// import { BookingFormData } from '@/components/booking-form'; // Type not strictly needed here if using Zod

// Zod schema for strict validation of incoming data
const bookingSchema = z.object({
    loungeLocationId: z.string().min(1, { message: "Location ID is required" }),
    selectedStartTime: z.string().datetime({ message: "Valid ISO 8601 start time string is required" }), // Use z.datetime()
    attendeeCount: z.number().int().min(1),
    firstName: z.string().min(1, { message: "First name is required" }),
    lastName: z.string().min(1, { message: "Last name is required" }),
    email: z.string().email({ message: "Valid email is required" }),
    phone: z.string().min(1, { message: "Phone number is required" }),
    // therapyType: z.string().min(1, { message: "Therapy type is required" }), // REMOVED
    treatmentId: z.union([z.number(), z.string()]).refine(val => val !== undefined && val !== null, { message: "Treatment ID is required" }), // ADDED
    destinationType: z.literal('lounge'),
    // Optional fields from frontend, not strictly needed for backend logic if treatmentId is present
    // treatmentPrice: z.number().optional(),
    // treatmentDuration: z.number().optional(),
    selectedDate: z.string().optional(), // Keep for potential future use
    selectedTimeSlotId: z.union([z.number(), z.string()]).optional(), // Keep for potential future use or if switching from RPC
});

// Infer the TypeScript type from the Zod schema
type BookingData = z.infer<typeof bookingSchema>;

export async function POST(request: NextRequest) {
    let bookingData: BookingData;
    let supabaseAdmin;
    let newBookingId: number | null = null; // Variable to store the new booking ID

    try {
        supabaseAdmin = getSupabaseAdmin();
        const rawData = await request.json();
        bookingData = bookingSchema.parse(rawData);

        if (bookingData.destinationType !== 'lounge') {
            return NextResponse.json({ error: 'Invalid booking type' }, { status: 400 });
        }

        // ---- Database Booking using RPC Function ----
        const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
            'book_appointment_multi_slot',
            {
                p_location_id: bookingData.loungeLocationId,
                p_start_time: bookingData.selectedStartTime,
                p_attendee_count: bookingData.attendeeCount,
                p_treatment_id: bookingData.treatmentId,
                p_user_name: `${bookingData.firstName} ${bookingData.lastName}`,
                p_user_email: bookingData.email,
                p_user_phone: bookingData.phone,
            }
        );

        if (rpcError) {
            console.error('Supabase RPC Error (book_appointment_multi_slot):', rpcError);
            // Handle specific errors raised by the function
            if (rpcError.message.includes('Insufficient consecutive slots')) {
                return NextResponse.json({ error: 'Sorry, not enough consecutive time slots are available for your group size starting at this time.' }, { status: 409 });
            }
            if (rpcError.message.includes('Insufficient combined capacity')) {
                return NextResponse.json({ error: 'Sorry, the selected time slots do not have enough combined capacity for your group size.' }, { status: 409 });
            }
            // Generic database error
            return NextResponse.json({ error: 'Database error during booking process.', details: rpcError.message }, { status: 500 });
        }

        // If RPC succeeded, the returned data is the new booking ID
        if (typeof rpcResult !== 'number') {
             console.error('Supabase RPC Error: Expected booking ID (number) as result, received:', rpcResult);
             return NextResponse.json({ error: 'Database error: Invalid booking confirmation received.' }, { status: 500 });
        }
        newBookingId = rpcResult;

        // ---- Google Calendar Event Creation ----
        let googleEventId: string | null = null;
        try {
            // Fetch location details (for GCal ID)
            const { data: locationData, error: locationError } = await supabaseAdmin
                .from('locations')
                .select('name, google_calendar_id')
                .eq('id', bookingData.loungeLocationId)
                .single();

            // Fetch treatment name
            const { data: treatmentData, error: treatmentError } = await supabaseAdmin
                .from('treatments')
                .select('name')
                .eq('id', bookingData.treatmentId)
                .single();
                
            // --- Calculate End Time for GCal ---
            // Fetch the start times and end times of the booked slots based on the booking
            // This assumes the RPC function correctly updated the booked_counts
            const slotsNeeded = Math.ceil(bookingData.attendeeCount / 2.0);
            const { data: bookedSlotsData, error: bookedSlotsError } = await supabaseAdmin
                .from('time_slots')
                .select('start_time, end_time')
                .eq('location_id', bookingData.loungeLocationId)
                .gte('start_time', bookingData.selectedStartTime)
                .order('start_time', { ascending: true })
                .limit(slotsNeeded);

            if (bookedSlotsError || !bookedSlotsData || bookedSlotsData.length < slotsNeeded) {
                 throw new Error(`Failed to fetch details of booked slots for booking ${newBookingId}: ${bookedSlotsError?.message}`);
            }
            const endTime = bookedSlotsData[bookedSlotsData.length - 1].end_time; // Get end time of the last slot in the block

            // --- GCal Event Details ---
            if (locationError || !locationData || !locationData.google_calendar_id) {
                throw new Error(`Failed to fetch location details or Google Calendar ID for ${bookingData.loungeLocationId}: ${locationError?.message}`);
            }
            if (!endTime) {
                 throw new Error(`Missing end_time for the last booked slot`);
            }
            if (treatmentError || !treatmentData) {
                throw new Error(`Failed to fetch treatment name for ID ${bookingData.treatmentId}: ${treatmentError?.message}`);
            }

            const therapyName = treatmentData.name;
            const eventSummary = `IV Booking - ${bookingData.firstName} ${bookingData.lastName}`;
            const eventDescription =
                `Booking Details:\n` +
                `Name: ${bookingData.firstName} ${bookingData.lastName}\n` +
                `Email: ${bookingData.email}\n` +
                `Phone: ${bookingData.phone}\n` +
                `Attendees: ${bookingData.attendeeCount}\n` +
                `Therapy: ${therapyName}\n` +
                `Location: ${locationData.name}\n` +
                `Booking ID: ${newBookingId}`;

            googleEventId = await createCalendarEvent({
                calendarId: locationData.google_calendar_id,
                startTime: bookingData.selectedStartTime,
                endTime: endTime, // Use end_time fetched from DB
                summary: eventSummary,
                description: eventDescription,
                attendeeEmail: bookingData.email
            });

            // Update the booking record with the Google Event ID
            if (googleEventId && newBookingId) {
                const { error: updateError } = await supabaseAdmin
                    .from('bookings')
                    .update({ google_event_id: googleEventId })
                    .eq('id', newBookingId);
                if (updateError) {
                    // Log error but don't fail the overall request
                    console.error(`Failed to update booking ${newBookingId} with Google Event ID ${googleEventId}:`, updateError.message);
                }
            }

        } catch (gcalError: any) {
            // Log the error but don't fail the booking response to the user
            console.error('Google Calendar integration failed:', gcalError.message);
            // We already successfully booked in the DB, so return success to user
        }

        // TODO: Add Zoho integration here

        return NextResponse.json({
            message: 'Booking successful!',
            bookingId: newBookingId,
            googleEventId: googleEventId // Optionally return GCal event ID
        }, { status: 201 });

    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error('Zod Validation Errors:', error.errors);
            return NextResponse.json({ error: 'Invalid input data', details: error.errors }, { status: 400 });
        }
        if (error instanceof Error && error.message.includes("admin client is not initialized")) {
            console.error("Booking API failed: Supabase admin client not initialized.");
            return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
        }
        console.error('Error in /api/bookings:', error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        return NextResponse.json({ error: 'An unexpected error occurred.', details: message }, { status: 500 });
    }
} 