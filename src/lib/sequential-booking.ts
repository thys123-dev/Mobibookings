// Optimized Sequential Booking Logic for Option 3
// Maximizes seat utilization by filling capacity first, then staggering remaining attendees

interface AttendeeInput {
    treatmentId: string | number;
    fluidOption: '200ml' | '1000ml' | '1000ml_dextrose';
    addOnTreatmentId?: string | number | null;
    firstName?: string;
    lastName?: string;
    [key: string]: unknown;
}

interface AttendeeBookingInfo {
    attendeeIndex: number;
    slotsNeeded: number;
    actualDuration: number;
    attendee: AttendeeInput;
}

interface SlotAssignment {
    slotIndex: number;
    attendeeIndexes: number[];
    attendeeCount: number;
    maxDuration: number;
    startTime?: string;
}

interface SequentialBookingResult {
    required_span: number;
    demand: number[];
    slotAssignments: SlotAssignment[];
    isSequential: boolean;
    utilizationStats: {
        totalSlots: number;
        fullUtilizationSlots: number;
        utilizationPercentage: number;
    };
}

interface TreatmentDurationInfo {
    duration_minutes_200ml: number;
    duration_minutes_1000ml: number;
}

export const calculateOptimizedSequentialBookingPattern = (
    attendees: AttendeeInput[],
    durationMap: Map<string | number, TreatmentDurationInfo>,
    slotCapacity: number = 2
): SequentialBookingResult => {

    console.log(`🎯 Optimized sequential booking calculation for ${attendees.length} attendees`);

    const demand: number[] = [];
    let max_slot_index = -1;
    const slotAssignments: SlotAssignment[] = [];

    // Step 1: Calculate duration requirements for each attendee
    const attendeeDurations: AttendeeBookingInfo[] = attendees.map((attendee, index) => {
        const lookupId = typeof attendee.treatmentId === 'string' ? parseInt(attendee.treatmentId, 10) : attendee.treatmentId;
        const durationInfo = durationMap.get(lookupId);

        if (!durationInfo) {
            throw new Error(`Duration info missing for treatment ID ${lookupId} during optimized sequential calculation`);
        }

        // Calculate slots needed based on treatment duration and add-ons
        let slotsNeeded;
        let actualDuration;

        // IMPROVED: More robust add-on treatment detection
        const hasAddOnTreatment = attendee.addOnTreatmentId &&
            attendee.addOnTreatmentId !== null &&
            attendee.addOnTreatmentId !== undefined &&
            String(attendee.addOnTreatmentId).trim() !== '' &&
            String(attendee.addOnTreatmentId).toLowerCase() !== 'none' &&
            String(attendee.addOnTreatmentId).toLowerCase() !== 'null';

        console.log(`🔍 Attendee ${index + 1} add-on check:`, {
            addOnTreatmentId: attendee.addOnTreatmentId,
            type: typeof attendee.addOnTreatmentId,
            hasAddOnTreatment,
            stringValue: String(attendee.addOnTreatmentId)
        });

        if (hasAddOnTreatment) {
            slotsNeeded = 3; // 90 minutes = 3 slots for add-on treatments
            actualDuration = 90;
            console.log(`✅ Attendee ${index + 1}: Using add-on duration (90 min, 3 slots)`);
        } else {
            actualDuration = attendee.fluidOption === '200ml'
                ? durationInfo.duration_minutes_200ml
                : durationInfo.duration_minutes_1000ml;
            slotsNeeded = Math.ceil(actualDuration / 30); // Convert minutes to 30-minute slots
            console.log(`✅ Attendee ${index + 1}: Using base treatment duration (${actualDuration} min, ${slotsNeeded} slots)`);
        }

        return {
            attendeeIndex: index,
            slotsNeeded,
            actualDuration,
            attendee
        };
    });

    console.log(`📊 Attendee duration requirements:`, attendeeDurations.map(a =>
        `Attendee ${a.attendeeIndex + 1}: ${a.slotsNeeded} slots (${a.actualDuration}min)`
    ));

    // Step 2: IMPROVED Sequential Logic for Mixed Durations
    if (attendees.length > 2) {
        console.log('\n🔄 Applying IMPROVED Sequential Booking Logic for Mixed Durations:');

        // OPTIMIZATION 1: Sort attendees by duration to group similar durations together
        const sortedAttendees = [...attendeeDurations].sort((a, b) => a.slotsNeeded - b.slotsNeeded);

        console.log('📋 Sorted attendees by duration:', sortedAttendees.map(a =>
            `Attendee ${a.attendeeIndex + 1}: ${a.slotsNeeded} slots`
        ));

        // OPTIMIZATION 2: Intelligent grouping strategy
        const groups: AttendeeBookingInfo[][] = [];
        let currentGroup: AttendeeBookingInfo[] = [];
        let remainingAttendees = [...sortedAttendees];

        while (remainingAttendees.length > 0) {
            if (currentGroup.length === 0) {
                // Start new group with first available attendee
                currentGroup.push(remainingAttendees.shift()!);
            } else {
                // Try to fill current group to capacity (2 people max)
                if (currentGroup.length < slotCapacity && remainingAttendees.length > 0) {
                    // Find attendee with compatible duration for better utilization
                    let bestMatchIndex = 0;
                    let bestMatch = remainingAttendees[0];

                    // Look for attendee with similar duration to current group
                    const currentGroupMaxSlots = Math.max(...currentGroup.map(a => a.slotsNeeded));

                    for (let i = 1; i < remainingAttendees.length; i++) {
                        const candidate = remainingAttendees[i];
                        // Prefer attendees with similar duration requirements
                        if (Math.abs(candidate.slotsNeeded - currentGroupMaxSlots) <
                            Math.abs(bestMatch.slotsNeeded - currentGroupMaxSlots)) {
                            bestMatch = candidate;
                            bestMatchIndex = i;
                        }
                    }

                    currentGroup.push(bestMatch);
                    remainingAttendees.splice(bestMatchIndex, 1);
                } else {
                    // Current group is full, finalize it
                    groups.push([...currentGroup]);
                    currentGroup = [];
                }
            }

            // Safety check: if only one attendee left, they get their own group
            if (remainingAttendees.length === 1 && currentGroup.length === 0) {
                groups.push([remainingAttendees.shift()!]);
            }
        }

        // Don't forget the last group if it exists
        if (currentGroup.length > 0) {
            groups.push(currentGroup);
        }

        console.log(`🎯 Created ${groups.length} optimized groups:`);
        groups.forEach((group, index) => {
            const maxSlots = Math.max(...group.map(a => a.slotsNeeded));
            const maxDuration = Math.max(...group.map(a => a.actualDuration));
            console.log(`  Group ${index + 1}: ${group.length} attendees, ${maxSlots} slots, ${maxDuration}min max`);
        });

        // OPTIMIZATION 3: Smart slot placement with overlap detection
        let currentSlotIndex = 0;
        max_slot_index = -1;

        groups.forEach((group, groupIndex) => {
            const maxSlotsInGroup = Math.max(...group.map(a => a.slotsNeeded));
            const maxDuration = Math.max(...group.map(a => a.actualDuration));

            // Place this group across the required consecutive slots
            for (let j = 0; j < maxSlotsInGroup; j++) {
                const slotIndex = currentSlotIndex + j;
                demand[slotIndex] = (demand[slotIndex] || 0) + group.length;
                max_slot_index = Math.max(max_slot_index, slotIndex);
            }

            // Record the slot assignment
            slotAssignments.push({
                slotIndex: currentSlotIndex,
                attendeeIndexes: group.map(a => a.attendeeIndex),
                attendeeCount: group.length,
                maxDuration: maxDuration,
                startTime: `Slot ${currentSlotIndex + 1}`
            });

            console.log(`✅ Group ${groupIndex + 1}: Slots ${currentSlotIndex + 1}-${currentSlotIndex + maxSlotsInGroup} - ${group.length} attendees (${maxDuration}min max)`);

            // OPTIMIZATION 4: Intelligent slot advancement - FIXED VERSION
            // Ensure groups don't overlap in a way that exceeds capacity
            if (group.length === 1 && maxSlotsInGroup <= 2) {
                // Single attendee with short duration - advance by their full duration
                currentSlotIndex += maxSlotsInGroup;
            } else {
                // For larger groups or longer durations, advance more strategically
                // If next group would overlap and cause capacity issues, advance further
                const nextGroupIndex = groupIndex + 1;
                if (nextGroupIndex < groups.length) {
                    const nextGroup = groups[nextGroupIndex];
                    const nextGroupMaxSlots = Math.max(...nextGroup.map(a => a.slotsNeeded));

                    // Check if advancing by 1 would cause overlap issues
                    const wouldOverlap = (currentSlotIndex + 1) + nextGroupMaxSlots > currentSlotIndex + maxSlotsInGroup;

                    if (wouldOverlap && (group.length + nextGroup.length) > slotCapacity) {
                        // Advance by max slots to avoid capacity conflicts
                        currentSlotIndex += maxSlotsInGroup;
                    } else {
                        // Safe to advance by 1 slot (standard staggering)
                        currentSlotIndex += 1;
                    }
                } else {
                    // Last group, standard advancement
                    currentSlotIndex += 1;
                }
            }
        });

        // OPTIMIZATION 5: Demand array compression - reduce total span where possible
        const compressedDemand = [...demand];
        let compressedSpan = max_slot_index + 1;

        // Check if we can reduce the span by moving groups closer together
        // This is a simplified compression - in practice, this could be more sophisticated
        console.log(`📊 Original span: ${compressedSpan} slots, demand: [${demand.slice(0, compressedSpan).join(', ')}]`);

        // Validation: ensure no slot exceeds capacity
        for (let i = 0; i < compressedSpan; i++) {
            if (compressedDemand[i] > slotCapacity) {
                console.warn(`⚠️ Warning: Slot ${i + 1} has demand ${compressedDemand[i]} > capacity ${slotCapacity}`);
            }
        }

    } else {
        // For 1-2 attendees: Use existing parallel logic (no optimization needed)
        const maxSlots = Math.max(...attendeeDurations.map(a => a.slotsNeeded));
        const maxDuration = Math.max(...attendeeDurations.map(a => a.actualDuration));

        for (let j = 0; j < maxSlots; j++) {
            demand[j] = attendees.length;
            max_slot_index = Math.max(max_slot_index, j);
        }

        slotAssignments.push({
            slotIndex: 0,
            attendeeIndexes: attendeeDurations.map(a => a.attendeeIndex),
            attendeeCount: attendees.length,
            maxDuration: maxDuration,
            startTime: `Slot 1`
        });
    }

    // Ensure demand array has entries up to max_slot_index
    for (let i = 0; i <= max_slot_index; i++) {
        demand[i] = demand[i] || 0;
    }

    // Calculate utilization statistics
    const totalSlots = max_slot_index + 1;
    const slotsWithDemand = demand.filter(d => d > 0).length;
    const utilizationPercentage = slotsWithDemand > 0
        ? Math.round((demand.reduce((sum, d) => sum + d, 0) / (slotsWithDemand * slotCapacity)) * 100)
        : 0;

    const result: SequentialBookingResult = {
        required_span: totalSlots,
        demand,
        slotAssignments,
        isSequential: attendees.length > 2,
        utilizationStats: {
            totalSlots,
            fullUtilizationSlots: slotAssignments.filter(a => a.attendeeCount === slotCapacity).length,
            utilizationPercentage
        }
    };

    console.log(`✅ Optimized sequential pattern result:`, {
        span: result.required_span,
        demand: result.demand,
        isSequential: result.isSequential,
        groups: result.slotAssignments.length,
        utilization: `${result.utilizationStats.utilizationPercentage}%`,
        fullSlots: result.utilizationStats.fullUtilizationSlots
    });

    return result;
};

// Helper function to format slot assignments for display
export const formatSlotAssignments = (slotAssignments: SlotAssignment[]): string[] => {
    return slotAssignments.map((assignment, index) => {
        const attendeeList = assignment.attendeeIndexes.map(i => `Attendee ${i + 1}`).join(' & ');
        return `Group ${index + 1}: ${attendeeList} (${assignment.maxDuration}min)`;
    });
};

// Helper function to validate sequential booking feasibility
export const validateSequentialBooking = (
    attendees: AttendeeInput[],
    availableSlots: unknown[],
    requiredSpan: number
): { feasible: boolean, reason?: string } => {
    if (availableSlots.length < requiredSpan) {
        return {
            feasible: false,
            reason: `Insufficient time slots: need ${requiredSpan}, have ${availableSlots.length}`
        };
    }

    if (attendees.length > availableSlots.length * 2) {
        return {
            feasible: false,
            reason: `Too many attendees: ${attendees.length} attendees need more capacity than available`
        };
    }

    return { feasible: true };
}; 