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
    loungeLocationId: z.string().min(1, { message: "Location ID (or Dispatch Lounge ID for mobile) is required" }),
    selectedStartTime: z.string().datetime({ message: "Valid ISO 8601 start time string is required" }), // Use z.datetime()
    attendeeCount: z.number().int().min(1),
    // Primary contact info (read from request, will be overwritten by attendee[0] before DB update)
    email: z.string().email({ message: "Valid primary contact email is required" }),
    phone: z.string().min(1, { message: "Valid primary contact phone number is required" }),
    // --- MODIFIED: Use attendees array ---
    attendees: z.array(attendeeSchema).min(1, { message: "At least one attendee's details must be provided" }),
    // --- NEW: Add destinationType and clientAddress ---
    destinationType: z.enum(['lounge', 'mobile'], { required_error: "Destination type ('lounge' or 'mobile') is required" }),
    clientAddress: z.string().optional(), // Address for mobile service
    // --- REMOVED individual fields ---
    // firstName: z.string().min(1, { message: "First name is required" }),
    // lastName: z.string().min(1, { message: "Last name is required" }),
    // treatmentId: z.union([z.number(), z.string()]).refine(val => val !== undefined && val !== null, { message: "Treatment ID is required" }),
    // treatmentPrice: z.number().optional(),
    // treatmentDuration: z.number().optional(),
    selectedDate: z.string().optional(), // Keep for potential future use
    selectedTimeSlotId: z.union([z.number(), z.string()]).optional(), // Keep for potential future use or if switching from RPC
}).refine(data => {
    // If destinationType is 'mobile', clientAddress must be provided and be a non-empty string
    if (data.destinationType === 'mobile') {
        return typeof data.clientAddress === 'string' && data.clientAddress.trim().length > 0;
    }
    return true; // For 'lounge', clientAddress is not required
}, {
    message: "Client address is required for mobile service bookings.",
    path: ['clientAddress'], // Specify the path of the error
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
    // --- NEW: Helper for mobile service ---
    let isMobileService = false;

    try {
        supabaseAdmin = getSupabaseAdmin();
        const rawData = await request.json();
        console.log("--- Received Raw Booking Request Data ---", JSON.stringify(rawData, null, 2)); // Log raw data
        bookingData = bookingSchema.parse(rawData);
        console.log("--- Parsed and Validated Booking Data ---", JSON.stringify(bookingData, null, 2)); // Log parsed data

        // --- NEW: Set helper for mobile service ---
        isMobileService = bookingData.destinationType === 'mobile';

        // --- Validation: Ensure attendee array count matches attendeeCount ---
        if (bookingData.attendees.length !== bookingData.attendeeCount) {
            return NextResponse.json({ error: 'Attendee details count does not match attendee count.' }, { status: 400 });
        }

        if (isMobileService && (!bookingData.clientAddress || bookingData.clientAddress.trim() === '')) {
            // This is now covered by Zod .refine, but an explicit check can remain for clarity or specific error message.
            // However, Zod refine should make this redundant. If Zod parse fails, it won't reach here.
            // For safety, we can keep it or rely on Zod's error. Let's assume Zod handles it.
        }

        // --- MODIFIED: Conditional logic based on destination type for RPC call ---
        let rpcResult, rpcError;

        if (isMobileService) {
            // ---- Mobile Booking Logic ----
            // The client's selectedStartTime is the treatment start time (2nd slot)
            // We need to calculate the actual start of the 4-slot block (30 mins prior)
            const treatmentStartTime = new Date(bookingData.selectedStartTime);
            const travelBlockStartTime = new Date(treatmentStartTime.getTime() - 30 * 60 * 1000).toISOString();
            
            console.log(`Mobile service booking attempt for dispatch lounge ${bookingData.loungeLocationId} at ${bookingData.clientAddress}, treatment start ${bookingData.selectedStartTime}, travel block start ${travelBlockStartTime}`);

            // Ensure primary contact info is available for the RPC call
            const primaryAttendeeForRPC = bookingData.attendees[0];
            if (!primaryAttendeeForRPC || !primaryAttendeeForRPC.email || !primaryAttendeeForRPC.phone) {
                // This should ideally be caught by Zod schema, but an explicit check before RPC is good.
                console.error('Primary attendee email or phone missing for mobile booking RPC call.');
                return NextResponse.json({ error: 'Primary attendee contact details are required.' }, { status: 400 });
            }

            const paramsForMobileRpc = {
                p_dispatch_lounge_id: bookingData.loungeLocationId,
                p_start_time_for_travel: travelBlockStartTime,
                p_client_address: bookingData.clientAddress,
                p_attendees_details: bookingData.attendees,
                p_attendee_count: bookingData.attendeeCount,
                p_user_email: primaryAttendeeForRPC.email,
                p_user_phone: primaryAttendeeForRPC.phone,
                p_user_name: `${primaryAttendeeForRPC.firstName || ''} ${primaryAttendeeForRPC.lastName || ''}`
            };
            console.log("--- Params for book_mobile_appointment_v1 RPC ---", JSON.stringify(paramsForMobileRpc, null, 2)); // Log params for mobile RPC

            ({ data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
                'book_mobile_appointment_v1', 
                paramsForMobileRpc
            ));

        } else {
            // ---- Existing Lounge Booking Logic ----
            ({ data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
                'book_appointment_multi_slot',
                {
                    p_location_id: bookingData.loungeLocationId,
                    p_start_time: bookingData.selectedStartTime,
                    p_attendee_count: bookingData.attendeeCount,
                    p_attendees_details: bookingData.attendees
                }
            ));
        }

        if (rpcError) {
            console.error('Supabase RPC Error (full object):', JSON.stringify(rpcError, null, 2)); // Log full RPC error object
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
                    user_name: `${bookingData.attendees[0]?.firstName || ''} ${bookingData.attendees[0]?.lastName || ''}`,
                    client_address: isMobileService ? bookingData.clientAddress : null,
                    is_mobile_service: isMobileService, // Use the new column
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
            if (isMobileService) {
                eventSummary += ` (Mobile Service)`;
            }

            // Build detailed description
            let eventDescription =
                `Booking Details:
` +
                `Primary Contact (Attendee 1):
` +
                `  Email: ${primaryEmail || 'N/A'}
` +
                `  Phone: ${primaryPhone || 'N/A'}
` +
                `Total Attendees: ${bookingData.attendeeCount}
` +
                `Location: ${locationData.name}
`;

            if (isMobileService && bookingData.clientAddress) {
                eventDescription += `Client Address: ${bookingData.clientAddress.replace(/'/g, "\'")}\n`; // Add client address if mobile service
            }

            eventDescription += `Booking ID: ${newBookingId}

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
            // --- NEW: Customize error message for clientAddress based on refine ---
            const clientAddressError = error.errors.find(e => e.path.includes('clientAddress') && e.message === "Client address is required for mobile service bookings.");
            if (clientAddressError) {
                 return NextResponse.json({ error: clientAddressError.message, details: error.errors }, { status: 400 });
            }
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