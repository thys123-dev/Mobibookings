import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/database/supabase-client';
import { IV_THERAPIES } from '@/lib/constants'; // Import therapies to get name
import { createCalendarEvent } from '@/lib/google-calendar'; // Import GCal helper
// import { BookingFormData } from '@/components/booking-form'; // Type not strictly needed here if using Zod

// Zod schema for strict validation of incoming data
const bookingSchema = z.object({
    loungeLocationId: z.string().min(1, { message: "Location ID is required" }),
    selectedStartTime: z.string().refine((val) => {
        try {
            new Date(val).toISOString();
            return /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/.test(val);
        } catch {
            return false;
        }
    }, { message: "Valid ISO 8601 start time string is required" }),
    attendeeCount: z.number().int().min(1).max(2, { message: "Attendees must be 1 or 2" }),
    firstName: z.string().min(1, { message: "First name is required" }),
    lastName: z.string().min(1, { message: "Last name is required" }),
    email: z.string().email({ message: "Valid email is required" }),
    phone: z.string().min(1, { message: "Phone number is required" }),
    therapyType: z.string().min(1, { message: "Therapy type is required" }),
    destinationType: z.literal('lounge'),
    selectedDate: z.string().optional(),
    selectedTimeSlotId: z.string().optional(),
});

export async function POST(request: NextRequest) {
    let bookingData;
    let supabaseAdmin;
    try {
        supabaseAdmin = getSupabaseAdmin(); // Initialize client early
        const rawData = await request.json();
        bookingData = bookingSchema.parse(rawData);

        if (bookingData.destinationType !== 'lounge') {
            return NextResponse.json({ error: 'Invalid booking type' }, { status: 400 });
        }

        // ---- Database Booking ----
        const { data: newBookingId, error: rpcError } = await supabaseAdmin.rpc('create_booking', {
            p_location_id: bookingData.loungeLocationId,
            p_start_time: bookingData.selectedStartTime,
            p_user_name: `${bookingData.firstName} ${bookingData.lastName}`,
            p_user_email: bookingData.email,
            p_user_phone: bookingData.phone,
            p_treatment: bookingData.therapyType,
            p_attendee_count: bookingData.attendeeCount
        });

        if (rpcError) {
            console.error('Supabase RPC Error:', rpcError);
            if (rpcError.message.includes('Slot capacity exceeded')) {
                return NextResponse.json({ error: 'Sorry, the selected time slot is now full.' }, { status: 409 });
            }
            if (rpcError.message.includes('Time slot not found')) {
                return NextResponse.json({ error: 'Sorry, the selected time slot could not be found.' }, { status: 404 });
            }
            return NextResponse.json({ error: 'Database error during booking.', details: rpcError.message }, { status: 500 });
        }

        // ---- Google Calendar Event Creation ----
        let googleEventId: string | null = null;
        try {
            // Fetch location details (for GCal ID) and slot details (for end time)
            const { data: locationData, error: locationError } = await supabaseAdmin
                .from('locations')
                .select('name, google_calendar_id')
                .eq('id', bookingData.loungeLocationId)
                .single();

            const { data: slotData, error: slotError } = await supabaseAdmin
                .from('time_slots')
                .select('end_time')
                .eq('location_id', bookingData.loungeLocationId)
                .eq('start_time', bookingData.selectedStartTime)
                .single();

            if (locationError || !locationData || !locationData.google_calendar_id) {
                throw new Error(`Failed to fetch location details or Google Calendar ID for ${bookingData.loungeLocationId}: ${locationError?.message}`);
            }
            if (slotError || !slotData) {
                throw new Error(`Failed to fetch time slot end time for ${bookingData.selectedStartTime} at ${bookingData.loungeLocationId}: ${slotError?.message}`);
            }

            const therapyName = IV_THERAPIES.find(t => t.id === bookingData.therapyType)?.name || bookingData.therapyType;
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
                endTime: slotData.end_time, // Use end_time fetched from DB
                summary: eventSummary,
                description: eventDescription,
                attendeeEmail: bookingData.email
            });

            // (Optional) Update the booking record with the Google Event ID
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