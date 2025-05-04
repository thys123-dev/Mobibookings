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

// --- Helper Function: Calculate Booking Pattern --- 
const calculateBookingPattern = (
    attendees: z.infer<typeof attendeeAvailabilitySchema>[], 
    durationMap: Map<string | number, TreatmentDurationInfo>,
    slotCapacity: number
): { required_span: number, demand: number[] } => {

    let demand: number[] = [];
    let max_slot_index = -1;
    const capacity = slotCapacity; // Typically 2

    // Separate attendees by duration need
    const attendeesNeeding1Slot: any[] = [];
    const attendeesNeeding2Slots: any[] = [];

    attendees.forEach(attendee => {
        const lookupId = typeof attendee.treatmentId === 'string' ? parseInt(attendee.treatmentId, 10) : attendee.treatmentId;
        const durationInfo = durationMap.get(lookupId);
        if (!durationInfo) {
            // This should ideally be caught earlier, but handle defensively
            throw new Error(`Duration info missing for treatment ID ${lookupId} during pattern calculation.`);
        }
        const attendeeDuration = attendee.fluidOption === '200ml' 
            ? durationInfo.duration_minutes_200ml 
            : durationInfo.duration_minutes_1000ml;

        if (attendeeDuration > 30) {
            attendeesNeeding2Slots.push(attendee); // Store original attendee object if needed later
        } else {
            attendeesNeeding1Slot.push(attendee);
        }
    });

    // Simulate placement: Place 2-slot attendees first to establish max span needed for them
    attendeesNeeding2Slots.forEach(() => {
        let placed = false;
        for (let i = 0; ; i++) { // Loop through potential starting slots
            const currentDemand_i = demand[i] || 0;
            const currentDemand_i_plus_1 = demand[i+1] || 0;
            
            if (currentDemand_i < capacity && currentDemand_i_plus_1 < capacity) {
                demand[i] = currentDemand_i + 1;
                demand[i+1] = currentDemand_i_plus_1 + 1;
                max_slot_index = Math.max(max_slot_index, i + 1);
                placed = true;
                break; // Place this attendee and move to the next
            }
            // If we check too far without placing, something is wrong (or capacity is 0)
            if (i > attendees.length * 2) { // Safety break
                 throw new Error("Could not simulate placement for a 2-slot attendee.");
            }
        }
    });

    // Simulate placement: Place 1-slot attendees
    attendeesNeeding1Slot.forEach(() => {
        let placed = false;
        for (let i = 0; ; i++) {
             const currentDemand_i = demand[i] || 0;
             if (currentDemand_i < capacity) {
                demand[i] = currentDemand_i + 1;
                max_slot_index = Math.max(max_slot_index, i);
                placed = true;
                break; // Place this attendee
             }
             if (i > attendees.length * 2) { // Safety break
                 throw new Error("Could not simulate placement for a 1-slot attendee.");
    }
        }
    });

    // Ensure demand array has entries up to max_slot_index (even if 0)
    for (let i = 0; i <= max_slot_index; i++) {
        demand[i] = demand[i] || 0;
    }

    return { required_span: max_slot_index + 1, demand: demand };
};

export async function POST(request: NextRequest) { // Ensure 'request' is used
    let requestData: z.infer<typeof availabilityRequestSchema>;

    try {
        // --- Parse and Validate Input Data --- 
        const rawData = await request.json();
        requestData = availabilityRequestSchema.parse(rawData); // Correct parsing
        const { locationId, date, attendees } = requestData; // Correct destructuring
        const attendeeCount = attendees.length;

        // --- Fetch Treatment Durations --- 
        const uniqueTreatmentIds = Array.from(new Set(attendees.map((a: z.infer<typeof attendeeAvailabilitySchema>) => // Add type annotation for 'a'
            typeof a.treatmentId === 'string' ? parseInt(a.treatmentId, 10) : a.treatmentId
        )));

        if (uniqueTreatmentIds.some(id => isNaN(id as number))) { // Check NaN correctly
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
             return NextResponse.json({ error: 'Could not find duration details for all selected treatments.' }, { status: 404 });
        }

        const durationMap = new Map<string | number, TreatmentDurationInfo>();
        treatmentDurations.forEach(t => durationMap.set(t.id, t));

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

        // === NEW: Calculate the required booking pattern ===
        const { required_span, demand } = calculateBookingPattern(attendees, durationMap, 2); // Assuming capacity 2
        // console.log(`Required Pattern: Span=${required_span}, Demand=${JSON.stringify(demand)}`);

        // --- Filter Available Starting Slots based on Pattern --- 
        const availableStartingSlots = [];
        for (let i = 0; i <= allTimeSlots.length - required_span; i++) {
            const potentialBlock = allTimeSlots.slice(i, i + required_span);
            let blockIsValid = true;
            
            // Check if EVERY slot in the block meets the specific demand for that position
            for (let j = 0; j < required_span; j++) {
                const slot = potentialBlock[j];
                const requiredSeats = demand[j] || 0; // Get demand for this position
                const availableSeats = slot.capacity - slot.booked_count;
                
                if (availableSeats < requiredSeats) {
                    blockIsValid = false;
                    break; // This starting slot `i` is invalid
                }
            }
            
            if (blockIsValid) {
                // This block meets the pattern
                const startingSlot = potentialBlock[0];
                availableStartingSlots.push({
                    id: startingSlot.id,
                    start_time: startingSlot.start_time,
                    end_time: startingSlot.end_time,
                });
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