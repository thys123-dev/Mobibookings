// Direct test of sequential booking logic with add-on treatments
// This bypasses the API and tests the core logic directly

// Mock the sequential booking logic locally to test
const testSequentialBookingLogic = () => {
    console.log('🧪 Testing Sequential Booking Logic Directly...\n');

    // Mock treatment duration data (from actual database)
    const mockTreatmentDurations = new Map([
        [14, { duration_minutes_200ml: 30, duration_minutes_1000ml: 60 }], // Detox Guru
        [15, { duration_minutes_200ml: 30, duration_minutes_1000ml: 60 }], // Dr John Myers
        [16, { duration_minutes_200ml: 30, duration_minutes_1000ml: 60 }], // Kick-Start  
        [17, { duration_minutes_200ml: 30, duration_minutes_1000ml: 60 }], // Babelas Beater
        [18, { duration_minutes_200ml: 30, duration_minutes_1000ml: 60 }]  // Anti-Clockwise
    ]);

    // Test case: 3 attendees, one with add-on
    const testAttendees = [
        {
            treatmentId: 15, // Dr John Myers (30min for 200ml, 60min for 1000ml)
            fluidOption: '200ml',
            addOnTreatmentId: null // No add-on
        },
        {
            treatmentId: 16, // Kick-Start (30min for 200ml, 60min for 1000ml)
            fluidOption: '1000ml',
            addOnTreatmentId: null // No add-on
        },
        {
            treatmentId: 17, // Babelas Beater (30min for 200ml, 60min for 1000ml)
            fluidOption: '200ml',
            addOnTreatmentId: 14 // ADD-ON: Detox Guru (should force 90min duration)
        }
    ];

    console.log('📋 Test Attendees:');
    testAttendees.forEach((attendee, index) => {
        console.log(`  ${index + 1}. Treatment ID: ${attendee.treatmentId}, Fluid: ${attendee.fluidOption}, Add-on: ${attendee.addOnTreatmentId || 'None'}`);
    });
    console.log();

    // Replicate the core sequential logic
    const attendeeDurations = testAttendees.map((attendee, index) => {
        const durationInfo = mockTreatmentDurations.get(attendee.treatmentId);

        if (!durationInfo) {
            throw new Error(`Duration info missing for treatment ID ${attendee.treatmentId}`);
        }

        // IMPROVED: More robust add-on treatment detection (same as our fix)
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

        let slotsNeeded, actualDuration;

        if (hasAddOnTreatment) {
            slotsNeeded = 3; // 90 minutes = 3 slots for add-on treatments
            actualDuration = 90;
            console.log(`✅ Attendee ${index + 1}: Using add-on duration (90 min, 3 slots)`);
        } else {
            actualDuration = attendee.fluidOption === '200ml'
                ? durationInfo.duration_minutes_200ml
                : durationInfo.duration_minutes_1000ml;
            slotsNeeded = Math.ceil(actualDuration / 30);
            console.log(`✅ Attendee ${index + 1}: Using base treatment duration (${actualDuration} min, ${slotsNeeded} slots)`);
        }

        return {
            attendeeIndex: index,
            slotsNeeded,
            actualDuration,
            attendee
        };
    });

    console.log('\n📊 Final Attendee Duration Requirements:');
    attendeeDurations.forEach(a => {
        console.log(`  Attendee ${a.attendeeIndex + 1}: ${a.slotsNeeded} slots (${a.actualDuration} min)`);
    });

    // Calculate demand pattern (simplified sequential logic)
    const demand = [];
    let max_slot_index = -1;
    const slotCapacity = 2;

    if (testAttendees.length > 2) {
        console.log('\n🔄 Applying Sequential Booking Logic:');

        const remainingAttendees = [...attendeeDurations];
        let currentSlotIndex = 0;

        while (remainingAttendees.length > 0) {
            // Fill current slot to capacity
            const currentSlotGroup = remainingAttendees.splice(0, Math.min(slotCapacity, remainingAttendees.length));
            const maxSlotsInGroup = Math.max(...currentSlotGroup.map(a => a.slotsNeeded));
            const maxDuration = Math.max(...currentSlotGroup.map(a => a.actualDuration));

            console.log(`  Group ${currentSlotIndex + 1}: ${currentSlotGroup.length} attendees, ${maxSlotsInGroup} slots span, ${maxDuration} min max`);

            // Place this group across the required consecutive slots
            for (let j = 0; j < maxSlotsInGroup; j++) {
                const slotIndex = currentSlotIndex + j;
                demand[slotIndex] = (demand[slotIndex] || 0) + currentSlotGroup.length;
                max_slot_index = Math.max(max_slot_index, slotIndex);
            }

            currentSlotIndex += 1;
        }
    }

    const totalSlotsNeeded = max_slot_index + 1;

    console.log('\n🎯 Sequential Booking Result:');
    console.log(`  Total slots needed: ${totalSlotsNeeded}`);
    console.log(`  Demand pattern: [${demand.join(', ')}]`);

    // Check if this would work with available slots (assuming capacity 2 each)
    const wouldWorkWithAvailableSlots = demand.every(demandForSlot => demandForSlot <= 2);
    console.log(`  Would work with capacity 2 slots: ${wouldWorkWithAvailableSlots ? '✅ Yes' : '❌ No'}`);

    return {
        totalSlotsNeeded,
        demand,
        attendeeDurations,
        feasible: wouldWorkWithAvailableSlots
    };
};

// Run the test
const result = testSequentialBookingLogic();

console.log('\n🏁 Test Summary:');
console.log(`- Add-on treatment detection: ${result.attendeeDurations[2].actualDuration === 90 ? '✅ Working' : '❌ Failed'}`);
console.log(`- Sequential logic: ${result.feasible ? '✅ Should work' : '❌ Issue detected'}`);
console.log(`- Expected pattern: [2, 1, 1] (Group 1: 2 people, Group 2: 1 person with add-on)`);
console.log(`- Actual pattern: [${result.demand.join(', ')}]`); 