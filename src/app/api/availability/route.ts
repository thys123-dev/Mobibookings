import { supabase } from '@/lib/database/supabase-client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod'; // Import Zod
import { calculateOptimizedSequentialBookingPattern } from '@/lib/sequential-booking';

// --- NEW: Define schema for attendee data needed for availability ---
const attendeeAvailabilitySchema = z.object({
    treatmentId: z.union([z.number(), z.string()]), // Allow number or string ID
    fluidOption: z.enum(['200ml', '1000ml', '1000ml_dextrose']),
    addOnTreatmentId: z.union([z.string(), z.number()]).nullable().optional(), // Added to match client data and rule logic
    // We don't need name/email/phone here, just treatment/fluid
});

const availabilityRequestSchema = z.object({
    locationId: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Invalid date format, use YYYY-MM-DD" }),
    attendees: z.array(attendeeAvailabilitySchema).min(1, { message: "At least one attendee is required" }).optional(),
    destinationType: z.enum(['lounge', 'mobile']).default('lounge'),
}).superRefine((data, ctx) => {
    if (data.destinationType === 'lounge' && (!data.attendees || data.attendees.length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Attendees are required for lounge bookings.",
            path: ['attendees'],
        });
    }
    // No specific refinement needed for 'mobile' regarding attendees, as it's optional
});

// Type for treatment duration data fetched from DB
interface TreatmentDurationInfo {
    id: number | string;
    duration_minutes_200ml: number;
    duration_minutes_1000ml: number;
}

interface BaseAvailabilitySlot {
    slot_id: number;
    start_time: string;
    end_time: string;
    available_capacity: number;
}

interface TimeSlot {
    id: number;
    start_time: string;
    end_time: string;
    available_capacity: number;
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
            const currentDemand_i_plus_1 = demand[i + 1] || 0;

            if (currentDemand_i < capacity && currentDemand_i_plus_1 < capacity) {
                demand[i] = currentDemand_i + 1;
                demand[i + 1] = currentDemand_i_plus_1 + 1;
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
        requestData = availabilityRequestSchema.parse(rawData);
        const { locationId, date, attendees, destinationType } = requestData; // attendees can now be undefined
        const isMobileService = destinationType === 'mobile';

        // Conditionally access attendees.length only if attendees is defined (for lounge)
        const attendeeCount = attendees ? attendees.length : 0;

        // --- Set up time range for the day ---
        const startOfDay = `${date}T00:00:00Z`;
        const endOfDay = `${date}T23:59:59Z`;

        // --- Get base availability using the new function ---
        const { data: baseAvailability, error: availabilityError } = await supabase
            .rpc('get_available_slots', {
                p_location_id: locationId,
                p_start_date: startOfDay,
                p_end_date: endOfDay
            });

        if (availabilityError) {
            console.error('Error fetching base availability:', availabilityError);
            throw availabilityError;
        }

        if (!baseAvailability || baseAvailability.length === 0) {
            return NextResponse.json([]); // No slots available for this day/location
        }

        // Convert the base availability into a more usable format
        const timeSlots = baseAvailability.map((slot: BaseAvailabilitySlot) => ({
            id: slot.slot_id,
            start_time: slot.start_time,
            end_time: slot.end_time,
            available_capacity: slot.available_capacity
        })) as TimeSlot[];

        const availableStartingSlots = [];

        if (isMobileService) {
            // --- Mobile Service Availability Logic ---
            const requiredConsecutiveSlots = 4;
            const requiredSeatsPerSlot = 2;

            for (let i = 0; i <= timeSlots.length - requiredConsecutiveSlots; i++) {
                const potentialBlock = timeSlots.slice(i, i + requiredConsecutiveSlots);
                let blockIsValid = true;

                for (let j = 0; j < requiredConsecutiveSlots; j++) {
                    const slot: TimeSlot = potentialBlock[j];
                    if (slot.available_capacity < requiredSeatsPerSlot) {
                        blockIsValid = false;
                        break;
                    }
                }

                if (blockIsValid) {
                    // For mobile, display the start time of the SECOND slot
                    const treatmentStartingSlot = potentialBlock[1];
                    availableStartingSlots.push({
                        id: treatmentStartingSlot.id,
                        start_time: treatmentStartingSlot.start_time,
                        end_time: treatmentStartingSlot.end_time,
                    });
                }
            }
        } else {
            // --- Lounge Service Availability Logic ---
            if (!attendees || attendees.length === 0) {
                return NextResponse.json({ error: 'Attendees are required for lounge service availability.' }, { status: 400 });
            }

            // --- Fetch Treatment Durations ---
            const uniqueTreatmentIds = Array.from(new Set(attendees.map(a =>
                typeof a.treatmentId === 'string' ? parseInt(a.treatmentId, 10) : a.treatmentId
            )));

            if (uniqueTreatmentIds.some(id => isNaN(id as number))) {
                return NextResponse.json({ error: 'Invalid Treatment ID found.' }, { status: 400 });
            }

            const { data: treatmentDurations, error: durationError } = await supabase
                .from('treatments')
                .select('id, duration_minutes_200ml, duration_minutes_1000ml')
                .in('id', uniqueTreatmentIds);

            if (durationError) {
                console.error('Error fetching treatment durations:', durationError);
                throw durationError;
            }

            if (!treatmentDurations || treatmentDurations.length !== uniqueTreatmentIds.length) {
                return NextResponse.json({ error: 'Could not find duration details for all selected treatments.' }, { status: 404 });
            }

            const durationMap = new Map<string | number, TreatmentDurationInfo>();
            treatmentDurations.forEach(t => durationMap.set(t.id, t));

            // Use sequential booking logic for groups > 2, otherwise use parallel logic
            if (attendees.length > 2) {
                const { required_span, demand, slotAssignments, utilizationStats } = calculateOptimizedSequentialBookingPattern(attendees, durationMap, 2);

                console.log(`📊 Sequential booking pattern: ${required_span} slots needed, ${utilizationStats.utilizationPercentage}% utilization`);

                for (let i = 0; i <= timeSlots.length - required_span; i++) {
                    let blockIsValid = true;

                    for (let j = 0; j < required_span; j++) {
                        const currentSlot = timeSlots[i + j];
                        if (!currentSlot) {
                            blockIsValid = false;
                            break;
                        }

                        const demandForThisSlot = demand[j] || 0;
                        if (demandForThisSlot > currentSlot.available_capacity) {
                            blockIsValid = false;
                            break;
                        }
                    }

                    if (blockIsValid) {
                        const startingSlot = timeSlots[i];
                        const endingSlot = timeSlots[i + required_span - 1];

                        availableStartingSlots.push({
                            id: startingSlot.id,
                            start_time: startingSlot.start_time,
                            end_time: endingSlot.end_time,
                            booking_pattern: {
                                type: 'sequential',
                                required_span,
                                attendee_count: attendees.length,
                                groups: slotAssignments.length,
                                utilization_percentage: utilizationStats.utilizationPercentage,
                                full_capacity_slots: utilizationStats.fullUtilizationSlots
                            }
                        });
                    }
                }
            } else {
                // Parallel logic for 1-2 attendees
                const slotLengthMinutes = 30;
                const attendeeSlotSpans = attendees.map(attendee => {
                    const hasAddOnTreatment = attendee.addOnTreatmentId &&
                        attendee.addOnTreatmentId !== null &&
                        attendee.addOnTreatmentId !== undefined &&
                        String(attendee.addOnTreatmentId).trim() !== '' &&
                        String(attendee.addOnTreatmentId).toLowerCase() !== 'none' &&
                        String(attendee.addOnTreatmentId).toLowerCase() !== 'null';

                    if (hasAddOnTreatment) {
                        return 3; // 90 minutes = 3 slots
                    }

                    const lookupId = typeof attendee.treatmentId === 'string' ? parseInt(attendee.treatmentId, 10) : attendee.treatmentId;
                    const durationInfo = durationMap.get(lookupId);
                    if (!durationInfo) throw new Error(`Duration info missing for treatment ID ${lookupId}`);
                    const duration = attendee.fluidOption === '200ml' ? durationInfo.duration_minutes_200ml : durationInfo.duration_minutes_1000ml;
                    return Math.ceil(duration / slotLengthMinutes);
                });
                const maxSpan = Math.max(...attendeeSlotSpans);

                console.log(`📊 Parallel booking pattern: ${maxSpan} slots needed for ${attendees.length} attendees`);

                for (let i = 0; i <= timeSlots.length - maxSpan; i++) {
                    let blockIsValid = true;

                    for (let j = 0; j < maxSpan; j++) {
                        const currentSlot = timeSlots[i + j];
                        if (!currentSlot) {
                            blockIsValid = false;
                            break;
                        }

                        let demandForThisSlotByGroup = 0;
                        for (let a = 0; a < attendees.length; a++) {
                            const attendeeNeeds_N_Slots = attendeeSlotSpans[a];
                            if (j < attendeeNeeds_N_Slots) {
                                demandForThisSlotByGroup++;
                            }
                        }

                        if (demandForThisSlotByGroup > currentSlot.available_capacity) {
                            blockIsValid = false;
                            break;
                        }
                    }

                    if (blockIsValid) {
                        const startingSlot = timeSlots[i];
                        const endingSlot = timeSlots[i + maxSpan - 1];
                        availableStartingSlots.push({
                            id: startingSlot.id,
                            start_time: startingSlot.start_time,
                            end_time: endingSlot.end_time,
                            booking_pattern: {
                                type: 'parallel',
                                required_span: maxSpan,
                                attendee_count: attendees.length
                            }
                        });
                    }
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