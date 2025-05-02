import { supabase } from '@/lib/database/supabase-client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod'; // Import Zod

// --- NEW: Define schema for attendee data needed for availability ---
const attendeeAvailabilitySchema = z.object({
    treatmentId: z.union([z.number(), z.string()]), // Allow number or string ID
    fluidOption: z.enum(['200ml', '1000ml', '1000ml_dextrose']),
    // We don't need name/email/phone here, just treatment/fluid
});

const availabilityRequestSchema = z.object({
    locationId: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Invalid date format, use YYYY-MM-DD" }),
    attendees: z.array(attendeeAvailabilitySchema).min(1, { message: "At least one attendee is required" }),
});

// Type for treatment duration data fetched from DB
interface TreatmentDurationInfo {
    id: number | string;
    duration_minutes_200ml: number;
    duration_minutes_1000ml: number;
}


export async function POST(request: NextRequest) { // Changed to POST to accept body
    let requestData: z.infer<typeof availabilityRequestSchema>;

    try {
        // --- Parse and Validate Input Data --- 
        const rawData = await request.json();
        requestData = availabilityRequestSchema.parse(rawData);
        const { locationId, date, attendees } = requestData;
        const attendeeCount = attendees.length;

        // --- Fetch Treatment Durations --- 
        const uniqueTreatmentIds = Array.from(new Set(attendees.map(a => 
            typeof a.treatmentId === 'string' ? parseInt(a.treatmentId, 10) : a.treatmentId
        )));

        if (uniqueTreatmentIds.some(isNaN)) {
            return NextResponse.json({ error: 'Invalid Treatment ID found.' }, { status: 400 });
        }

        const { data: treatmentDurations, error: durationError } = await supabase
            .from('treatments')
            .select('id, duration_minutes_200ml, duration_minutes_1000ml')
            .in('id', uniqueTreatmentIds);

        if (durationError) {
            console.error('Supabase error fetching treatment durations:', durationError);
            throw durationError;
        }
        if (!treatmentDurations || treatmentDurations.length !== uniqueTreatmentIds.length) {
             console.warn('Could not fetch duration info for all requested treatments.');
             // Return error or empty list if treatments are essential?
             return NextResponse.json({ error: 'Could not find duration details for all selected treatments.' }, { status: 404 });
        }

        const durationMap = new Map<string | number, TreatmentDurationInfo>();
        treatmentDurations.forEach(t => durationMap.set(t.id, t));

        // --- Calculate Max Duration & Slots Needed --- 
        let max_duration = 0;
        for (const attendee of attendees) {
            const lookupId = typeof attendee.treatmentId === 'string' ? parseInt(attendee.treatmentId, 10) : attendee.treatmentId;
            const durationInfo = durationMap.get(lookupId);
            if (durationInfo) {
                const currentDuration = attendee.fluidOption === '200ml' 
                    ? durationInfo.duration_minutes_200ml 
                    : durationInfo.duration_minutes_1000ml;
                max_duration = Math.max(max_duration, currentDuration);
            } else {
                // Handle case where duration info wasn't found (should have errored earlier, but belt-and-suspenders)
                console.error(`Duration info not found for treatment ID ${lookupId} during max_duration calculation.`);
                // Maybe return error here
            }
        }

        const durationSlotsNeeded = (max_duration > 30) ? 2 : 1;
        const capacitySlotsNeeded = Math.ceil(attendeeCount / 2.0);
        const finalSlotsNeeded = Math.max(durationSlotsNeeded, capacitySlotsNeeded);

        // --- Fetch All Time Slots for the Day --- 
        const startOfDay = `${date}T00:00:00Z`;
        const endOfDay = `${date}T23:59:59Z`;

        const { data: allTimeSlots, error: slotsError } = await supabase
            .from('time_slots')
            .select('id, start_time, end_time, capacity, booked_count')
            .eq('location_id', locationId)
            .gte('start_time', startOfDay)
            .lte('start_time', endOfDay)
            .order('start_time', { ascending: true });

        if (slotsError) {
            console.error('Supabase error fetching slots:', slotsError);
            throw slotsError;
        }

        if (!allTimeSlots || allTimeSlots.length === 0) {
            return NextResponse.json([]); // No slots available for this day/location
        }

        // --- Filter Available Starting Slots --- 
        const availableStartingSlots = [];
        for (let i = 0; i <= allTimeSlots.length - finalSlotsNeeded; i++) {
            const potentialBlock = allTimeSlots.slice(i, i + finalSlotsNeeded);
            
            // Check 1: EVERY slot in the block must have at least one seat available
            const blockHasMinimumCapacity = potentialBlock.every(slot => slot.capacity > slot.booked_count);
            
            if (blockHasMinimumCapacity) {
                 // Check 2: The TOTAL available seats across the block must be >= attendeeCount
                 const totalAvailableSeatsInBlock = potentialBlock.reduce((sum, slot) => sum + (slot.capacity - slot.booked_count), 0);
                 
                 if (totalAvailableSeatsInBlock >= attendeeCount) {
                    // BOTH checks passed, this is a valid starting slot
                    const startingSlot = potentialBlock[0];
                    availableStartingSlots.push({
                        id: startingSlot.id,
                        start_time: startingSlot.start_time,
                        end_time: startingSlot.end_time,
                        // Omit remaining_seats to avoid confusion
                    });
                }
            }
        }

        return NextResponse.json(availableStartingSlots);

    } catch (error: any) {
        if (error instanceof z.ZodError) {
            console.error('Availability Zod Validation Errors:', error.errors);
            return NextResponse.json({ error: 'Invalid input data', details: error.errors }, { status: 400 });
        }
        console.error('Error in /api/availability:', error);
        const message = error.message || 'An unknown error occurred.';
        return NextResponse.json({ error: 'Failed to fetch availability', details: message }, { status: 500 });
    }
} 