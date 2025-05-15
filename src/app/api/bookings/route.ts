import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/database/supabase-client';
// import { IV_THERAPIES } from '@/lib/constants'; // No longer needed if fetching from DB
import { createCalendarEvent } from '@/lib/google-calendar'; // Import GCal helper
// import { BookingFormData } from '@/components/booking-form'; // Type not strictly needed here if using Zod
// import { AttendeeData } from '@/components/booking-form'; // Maybe import if needed later

// --- NEW: Zod schema for individual attendee details ---
const attendeeSchema = z.object({
    firstName: z.string().min(1, { message: "Attendee first name is required" }),
    lastName: z.string().min(1, { message: "Attendee last name is required" }),
    treatmentId: z.union([z.number(), z.string()]).refine(val => val !== undefined && val !== null && String(val).length > 0, { message: "Treatment selection is required for each attendee" }),
    email: z.string().email({ message: "Valid email is required for each attendee" }),
    phone: z.string().min(1, { message: "Phone number is required for each attendee" }),
    fluidOption: z.enum(['200ml', '1000ml', '1000ml_dextrose'], { required_error: "Fluid option selection is required for each attendee" }),
    // --- NEW: Add optional add-on treatment ID ---
    addOnTreatmentId: z.union([z.number(), z.string()]).nullable().optional(),
    // --- NEW: Add optional additional vitamin ID ---
    additionalVitaminId: z.union([z.number(), z.string()]).nullable().optional(),
});

// Zod schema for strict validation of incoming data
const bookingSchema = z.object({
    loungeLocationId: z.string().min(1, { message: "Location ID is required" }),
    selectedStartTime: z.string().datetime({ message: "Valid ISO 8601 start time string is required" }), // Use z.datetime()
    attendeeCount: z.number().int().min(1),
    // Primary contact info (read from request, will be overwritten by attendee[0] before DB update)
    email: z.string().email({ message: "Valid primary contact email is required" }),
    phone: z.string().min(1, { message: "Valid primary contact phone number is required" }),
    // --- MODIFIED: Use attendees array ---
    attendees: z.array(attendeeSchema).min(1, { message: "At least one attendee's details must be provided" }),
    // --- REMOVED individual fields ---
    // firstName: z.string().min(1, { message: "First name is required" }),
    // lastName: z.string().min(1, { message: "Last name is required" }),
    // treatmentId: z.union([z.number(), z.string()]).refine(val => val !== undefined && val !== null, { message: "Treatment ID is required" }),
    destinationType: z.literal('lounge'),
    // Optional fields from frontend, not strictly needed for backend logic if treatmentId is present
    // treatmentPrice: z.number().optional(),
    // treatmentDuration: z.number().optional(),
    selectedDate: z.string().optional(), // Keep for potential future use
    selectedTimeSlotId: z.union([z.number(), z.string()]).optional(), // Keep for potential future use or if switching from RPC
});

// Infer the TypeScript type from the Zod schema
type BookingData = z.infer<typeof bookingSchema>;

// --- NEW: Type for treatment data fetched from DB ---
interface TreatmentDbInfo {
    id: number | string;
    name: string;
    // No duration needed here, just name for GCal mapping
}

// --- NEW: Type for Vitamin data fetched from DB for GCal ---
interface VitaminDbInfo {
    id: number | string;
    name: string;
}

export async function POST(request: NextRequest) {
    let bookingData: BookingData;
    let supabaseAdmin;
    let newBookingId: number | null = null; // Variable to store the new booking ID
    // Declare primary contact variables here for wider scope
    let primaryEmail: string | undefined | null = null;
    let primaryPhone: string | undefined | null = null;

    try {
        supabaseAdmin = getSupabaseAdmin();
        const rawData = await request.json();
        bookingData = bookingSchema.parse(rawData);

        // --- Validation: Ensure attendee array count matches attendeeCount ---
        if (bookingData.attendees.length !== bookingData.attendeeCount) {
            return NextResponse.json({ error: 'Attendee details count does not match attendee count.' }, { status: 400 });
        }

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
                p_attendees_details: bookingData.attendees
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

        // --- ADJUSTED: Handle array result from RPC --- 
        // RPC functions returning TABLE return an array of rows.
        if (!rpcResult || !Array.isArray(rpcResult) || rpcResult.length === 0) {
            console.error('Supabase RPC Error: Expected non-empty array as result, received:', rpcResult);
            return NextResponse.json({ error: 'Database error: Invalid booking confirmation data received (empty/invalid array).' }, { status: 500 });
        }

        // Extract the first row from the result array
        const bookingConfirmation = rpcResult[0];

        // Check the structure of the first row object
        if (typeof bookingConfirmation.booking_id !== 'number' || bookingConfirmation.booking_id <= 0 || 
            typeof bookingConfirmation.required_span !== 'number' || bookingConfirmation.required_span <= 0) {
             console.error('Supabase RPC Error: Expected {booking_id: number, required_span: number} in result array element, received:', bookingConfirmation);
             return NextResponse.json({ error: 'Database error: Invalid booking confirmation data structure received.' }, { status: 500 });
        }

        // Assign values from the extracted object
        newBookingId = bookingConfirmation.booking_id;
        const actualSlotSpan = bookingConfirmation.required_span;
        console.log(`RPC successful, received booking ID: ${newBookingId}, Required Span: ${actualSlotSpan}`); // Log successful RPC ID and span

        // ---- NEW: Update Booking with Attendee Details and Contact Info ----
        try {
            // Ensure primary contact info is taken from the first attendee
            // Assign values to the variables declared above
            primaryEmail = bookingData.attendees[0]?.email;
            primaryPhone = bookingData.attendees[0]?.phone;

            if (!primaryEmail || !primaryPhone) {
                 // This should ideally be caught by frontend validation, but double-check
                 console.error(`Booking ${newBookingId}: Missing email or phone for the primary attendee (index 0).`);
                 // Decide how to handle: fail the request or proceed with missing primary contact?
                 // Let's fail it for now to ensure data integrity.
                 return NextResponse.json({ error: 'Primary attendee email and phone are missing.'}, { status: 400 });
            }

            // --- ADDED Logging before update ---
            console.log(`Attempting to update booking ID: ${newBookingId} with attendee details and primary contact.`);
            const { data: updateData, error: updateError } = await supabaseAdmin // Capture data too
                .from('bookings')
                .update({
                    attendees_details: bookingData.attendees, // Store the whole array in JSONB
                    user_email: primaryEmail, // CORRECTED: Use user_email
                    user_phone: primaryPhone, // CORRECTED: Use user_phone
                    // ADDED: Set user_name here from primary attendee
                    user_name: `${bookingData.attendees[0]?.firstName || ''} ${bookingData.attendees[0]?.lastName || ''}`
                })
                .eq('id', newBookingId)
                .select(); // Select the updated row to confirm

            if (updateError) {
                 // --- MODIFIED Logging on error ---
                console.error(`FAILED to update booking ${newBookingId} with attendee details:`, updateError); // Log full error object
                // Decide whether to proceed? For now, let GCal happen but log error.
            } else {
                // --- ADDED Logging on success --- 
                 console.log(`Successfully ran update query for booking ID: ${newBookingId}.`);
                 if (!updateData || updateData.length === 0) {
                     console.warn(`Booking update query for ID ${newBookingId} succeeded BUT returned no data. Row might not exist or condition failed?`);
                 } else {
                     console.log(`Booking ${newBookingId} confirmed updated with attendee details. Data:`, JSON.stringify(updateData));
                 }
            }
        } catch(updateCatchError: any) {
             // --- MODIFIED Logging on exception ---
             console.error(`Exception during booking update logic for ${newBookingId}:`, updateCatchError); 
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

            // Fetch treatment names AND durations for ALL attendees
            const uniqueTreatmentIds = Array.from(new Set(bookingData.attendees.map(a => a.treatmentId)));
            // --- NEW: Collect unique add-on IDs as well ---
            const uniqueAddOnTreatmentIds = Array.from(new Set(
                bookingData.attendees
                    .map(a => a.addOnTreatmentId)
                    // Filter out null/undefined/empty string values before creating the Set
                    .filter(id => id !== null && id !== undefined && String(id).length > 0)
            ));
            // Combine both sets of IDs for a single query
            const allUniqueTreatmentAndAddOnIds = Array.from(new Set([...uniqueTreatmentIds, ...uniqueAddOnTreatmentIds]));

            const { data: treatmentsAndAddOnsData, error: treatmentsAndAddOnsError } = await supabaseAdmin
                .from('treatments')
                .select('id, name') // Only need id and name for GCal description mapping
                .in('id', allUniqueTreatmentAndAddOnIds); // Fetch details for both base and add-on treatments

            if (treatmentsAndAddOnsError || !treatmentsAndAddOnsData) {
                 throw new Error(`Failed to fetch treatment and add-on details: ${treatmentsAndAddOnsError?.message}`);
            }

            // Create a map for easy lookup (handles both base and add-on names)
            const treatmentAndAddOnInfoMap = new Map<string | number, { name: string }>();
            treatmentsAndAddOnsData.forEach(t => treatmentAndAddOnInfoMap.set(t.id, { name: t.name }));

            // --- NEW: Fetch Vitamin names for ALL attendees ---
            const uniqueVitaminIds = Array.from(new Set(
                bookingData.attendees
                    .map(a => a.additionalVitaminId)
                    .filter(id => id !== null && id !== undefined && String(id).length > 0)
            ));

            let vitaminInfoMap = new Map<string | number, { name: string }>();
            if (uniqueVitaminIds.length > 0) {
                const { data: vitaminsData, error: vitaminsError } = await supabaseAdmin
                    .from('additional_vitamins')
                    .select('id, name')
                    .in('id', uniqueVitaminIds);

                if (vitaminsError || !vitaminsData) {
                    // Log error but don't necessarily fail the booking if vitamins can't be fetched for GCal
                    console.error(`Failed to fetch vitamin details for GCal: ${vitaminsError?.message}`);
                } else {
                    vitaminsData.forEach(v => vitaminInfoMap.set(v.id, { name: v.name }));
                }
            }

            // --- Fetch treatment durations (both 200ml and 1000ml) ---
            // --- NOTE: Duration fetch only needs BASE treatment IDs ---
             const { data: treatmentsDurationData, error: treatmentsDurationError } = await supabaseAdmin
                .from('treatments')
                .select('id, name, duration_minutes_200ml, duration_minutes_1000ml') // Select both durations
                .in('id', uniqueTreatmentIds); // <<< Use only uniqueTreatmentIds (base treatments)

            if (treatmentsDurationError || !treatmentsDurationData) {
                 throw new Error(`Failed to fetch treatment durations: ${treatmentsDurationError?.message}`);
            }
            const treatmentDurationMap = new Map<string | number, { name: string, duration_200: number, duration_1000: number}>();
            treatmentsDurationData.forEach(t => treatmentDurationMap.set(t.id, { name: t.name, duration_200: t.duration_minutes_200ml, duration_1000: t.duration_minutes_1000ml }));

            // Fetch the start times and end times of the booked slots using the CORRECT number of slots
            // const slotsNeeded = Math.ceil(bookingData.attendeeCount / 2.0); // OLD calculation
            const { data: bookedSlotsData, error: bookedSlotsError } = await supabaseAdmin
                .from('time_slots')
                .select('start_time, end_time')
                .eq('location_id', bookingData.loungeLocationId)
                .gte('start_time', bookingData.selectedStartTime)
                .order('start_time', { ascending: true })
                .limit(actualSlotSpan); // <<< CORRECTED: Use actualSlotSpan from RPC result

            if (bookedSlotsError || !bookedSlotsData || bookedSlotsData.length < actualSlotSpan) { // Check against actualSlotSpan
                 throw new Error(`Failed to fetch details of booked slots (required: ${actualSlotSpan}) for booking ${newBookingId}: ${bookedSlotsError?.message}`);
            }
            // Ensure we use the last slot in the *actual span*
            const endTime = bookedSlotsData[actualSlotSpan - 1].end_time; 

            // --- GCal Event Details ---
            if (locationError || !locationData || !locationData.google_calendar_id) {
                throw new Error(`Failed to fetch location details or Google Calendar ID for ${bookingData.loungeLocationId}: ${locationError?.message}`);
            }
            if (!endTime) {
                 throw new Error(`Missing end_time for the last booked slot`);
            }
            if (treatmentAndAddOnInfoMap.size !== allUniqueTreatmentAndAddOnIds.length) {
                 // Check if we found info for all requested unique treatments
                 console.warn(`Could not find details for all treatment IDs requested. Found: ${treatmentAndAddOnInfoMap.size}, Requested unique: ${allUniqueTreatmentAndAddOnIds.length}`);
                 // Decide if this is a fatal error or just continue with partial info
            }

            // Use first attendee's name for primary identification in summary
            const primaryAttendee = bookingData.attendees[0];
            let eventSummary = `IV Booking - ${primaryAttendee.firstName} ${primaryAttendee.lastName}`;
            if(bookingData.attendeeCount > 1) {
                 eventSummary += ` (+${bookingData.attendeeCount - 1} others)`;
            }

            // Build detailed description
            let eventDescription =
                `Booking Details:
` +
                `Primary Contact (Attendee 1):
` + // Clarify it's Attendee 1
                `  Email: ${primaryEmail || 'N/A'}
` + // Use primaryEmail variable (add fallback)
                `  Phone: ${primaryPhone || 'N/A'}
` + // Use primaryPhone variable (add fallback)
                `Total Attendees: ${bookingData.attendeeCount}
` +
                `Location: ${locationData.name}
` +
                `Booking ID: ${newBookingId}

` +
                `Attendees & Treatments:
`;

            bookingData.attendees.forEach((attendee, index) => {
                // Convert attendee.treatmentId (likely string) to number for map lookup
                const lookupId = typeof attendee.treatmentId === 'string' ? parseInt(attendee.treatmentId, 10) : attendee.treatmentId;
                const treatmentDetails = treatmentDurationMap.get(lookupId); // For duration and base name
                const treatmentName = treatmentDetails ? treatmentDetails.name : `Unknown Treatment (ID: ${attendee.treatmentId})`;
                
                // Determine correct duration based on fluidOption AND add-on
                let duration = 'N/A';
                if (attendee.addOnTreatmentId) {
                    duration = '90 minutes'; // Fixed duration for add-on
                } else if (treatmentDetails && attendee.fluidOption) {
                   duration = attendee.fluidOption === '200ml' 
                                ? `${treatmentDetails.duration_200} minutes` 
                                : `${treatmentDetails.duration_1000} minutes`;
                }
                
                // ADDED: Include email/phone/fluid/duration in GCal description per attendee
                // Reordered and added Vitamins
                eventDescription += `  ${index + 1}. ${attendee.firstName} ${attendee.lastName}\n` +
                                  `     Email: ${attendee.email}\n` +
                                  `     Phone: ${attendee.phone}\n` +
                                  `     Treatment: ${treatmentName}\n` +
                                  `     Fluid: ${attendee.fluidOption || 'N/A'}${attendee.fluidOption === '1000ml_dextrose' ? ' (+Dextrose)' : ''}\n`;
                
                // Add Add-on treatment if present
                if (attendee.addOnTreatmentId) {
                    const addOnLookupId = typeof attendee.addOnTreatmentId === 'string' ? parseInt(attendee.addOnTreatmentId, 10) : attendee.addOnTreatmentId;
                    const addOnDetails = treatmentAndAddOnInfoMap.get(addOnLookupId); // Use the renamed map
                    const addOnName = addOnDetails ? addOnDetails.name : `Unknown Add-on (ID: ${attendee.addOnTreatmentId})`;
                    eventDescription += `     Add-on: ${addOnName}\n`;
                }

                // Add Vitamin if present
                if (attendee.additionalVitaminId) {
                    const vitaminLookupId = typeof attendee.additionalVitaminId === 'string' ? parseInt(attendee.additionalVitaminId, 10) : attendee.additionalVitaminId;
                    const vitaminDetails = vitaminInfoMap.get(vitaminLookupId);
                    const vitaminName = vitaminDetails ? vitaminDetails.name : `Unknown Vitamin (ID: ${attendee.additionalVitaminId})`;
                    eventDescription += `     Vitamins: ${vitaminName}\n`;
                }

                eventDescription += `     Duration: ${duration}\n`;
            });

            googleEventId = await createCalendarEvent({
                calendarId: locationData.google_calendar_id,
                startTime: bookingData.selectedStartTime,
                endTime: endTime, // Use end_time fetched from DB
                summary: eventSummary,
                description: eventDescription,
                attendeeEmail: primaryEmail || bookingData.email // Use primary email, fallback to original top-level email if needed
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