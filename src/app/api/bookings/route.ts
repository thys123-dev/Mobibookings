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
    attendeeCount: z.number().int().min(1).max(2, { message: "Attendees must be 1 or 2" }),
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

        // ---- Database Booking using Direct Commands ----
        // IMPORTANT: Supabase JS client doesn't directly support row locking ('FOR UPDATE').
        // For true concurrency safety, a Supabase Edge Function or a database function (RPC)
        // that performs the check and update atomically is the robust solution.
        // Here, we simulate the logic with checks, but it has a small race condition window.

        // 1. Fetch the time slot
        const { data: timeSlot, error: slotFetchError } = await supabaseAdmin
            .from('time_slots')
            .select('id, capacity, booked_count, end_time') // Select necessary fields including end_time for GCal
            .eq('location_id', bookingData.loungeLocationId)
            .eq('start_time', bookingData.selectedStartTime)
            .single();

        if (slotFetchError || !timeSlot) {
            console.error('Supabase Error fetching slot:', slotFetchError);
            return NextResponse.json({ error: 'Sorry, the selected time slot could not be found.' }, { status: 404 });
        }

        // 2. Check capacity (Race condition possible here)
        if (timeSlot.booked_count + bookingData.attendeeCount > timeSlot.capacity) {
            return NextResponse.json({ error: 'Sorry, the selected time slot is now full.' }, { status: 409 }); // 409 Conflict
        }

        // 3. Insert the booking
        const { data: newBooking, error: bookingInsertError } = await supabaseAdmin
            .from('bookings')
            .insert({
                time_slot_id: timeSlot.id,
                user_name: `${bookingData.firstName} ${bookingData.lastName}`,
                user_email: bookingData.email,
                user_phone: bookingData.phone,
                treatment_id: bookingData.treatmentId, // Use the new treatmentId
                attendee_count: bookingData.attendeeCount,
                // Omit google_event_id and zoho_entity_id initially
            })
            .select('id') // Select the ID of the newly created booking
            .single();

        if (bookingInsertError || !newBooking) {
            console.error('Supabase Error inserting booking:', bookingInsertError);
            return NextResponse.json({ error: 'Database error during booking creation.', details: bookingInsertError?.message }, { status: 500 });
        }
        newBookingId = newBooking.id; // Store the ID

        // 4. Update the booked_count (Race condition also possible here)
        const newBookedCount = timeSlot.booked_count + bookingData.attendeeCount;
        const { error: slotUpdateError } = await supabaseAdmin
            .from('time_slots')
            .update({ booked_count: newBookedCount })
            .eq('id', timeSlot.id);
            // Optional: Add a condition to ensure the booked_count hasn't changed unexpectedly
            // .eq('booked_count', timeSlot.booked_count);

        if (slotUpdateError) {
            console.error('Supabase Error updating slot count:', slotUpdateError);
            // Attempt to roll back booking insertion? Difficult without transactions.
            // Log this inconsistency, but the booking might already be confirmed.
            // Consider returning success but logging the error for investigation.
            // For now, let's proceed but log it.
            console.error(`CRITICAL: Failed to update booked_count for slot ${timeSlot.id} after inserting booking ${newBookingId}. Manual check required.`);
            // return NextResponse.json({ error: 'Database error updating slot capacity.', details: slotUpdateError.message }, { status: 500 });
        }

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

            if (locationError || !locationData || !locationData.google_calendar_id) {
                throw new Error(`Failed to fetch location details or Google Calendar ID for ${bookingData.loungeLocationId}: ${locationError?.message}`);
            }
            // Use end_time fetched earlier with the slot data
            const endTime = timeSlot.end_time;
            if (!endTime) {
                 throw new Error(`Missing end_time for slot ${timeSlot.id}`);
            }
            if (treatmentError || !treatmentData) {
                throw new Error(`Failed to fetch treatment name for ID ${bookingData.treatmentId}: ${treatmentError?.message}`);
            }

            // const therapyName = IV_THERAPIES.find(t => t.id === bookingData.therapyType)?.name || bookingData.therapyType; // OLD
            const therapyName = treatmentData.name; // NEW
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