// Test the improved sequential booking logic

const testImprovedSequentialLogic = () => {
    console.log('🧪 Testing IMPROVED Sequential Booking Logic...\n');

    // Mock treatment duration data
    const mockTreatmentDurations = new Map([
        [14, { duration_minutes_200ml: 30, duration_minutes_1000ml: 60 }], // Detox Guru
        [15, { duration_minutes_200ml: 30, duration_minutes_1000ml: 60 }], // Dr John Myers
        [16, { duration_minutes_200ml: 30, duration_minutes_1000ml: 60 }], // Kick-Start  
        [17, { duration_minutes_200ml: 30, duration_minutes_1000ml: 60 }], // Babelas Beater
    ]);

    // Test Case 1: Mixed durations (the failing scenario)
    console.log('🎯 TEST CASE 1: Mixed Durations (Previously Failing)');
    const mixedDurationAttendees = [
        {
            treatmentId: 15,
            fluidOption: '200ml', // 30 min = 1 slot
            addOnTreatmentId: null
        },
        {
            treatmentId: 16,
            fluidOption: '1000ml', // 60 min = 2 slots
            addOnTreatmentId: null
        },
        {
            treatmentId: 17,
            fluidOption: '200ml', // 30 min = 1 slot  
            addOnTreatmentId: null
        }
    ];

    const result1 = simulateImprovedLogic(mixedDurationAttendees, mockTreatmentDurations);
    console.log('📊 Mixed Duration Result:', {
        span: result1.totalSlotsNeeded,
        demand: result1.demand,
        feasible: result1.feasible
    });

    // Test Case 2: With add-on treatment (the original issue)
    console.log('\n🎯 TEST CASE 2: With Add-on Treatment (Original Issue)');
    const addOnAttendees = [
        {
            treatmentId: 15,
            fluidOption: '200ml', // 30 min = 1 slot
            addOnTreatmentId: null
        },
        {
            treatmentId: 16,
            fluidOption: '1000ml', // 60 min = 2 slots
            addOnTreatmentId: null
        },
        {
            treatmentId: 17,
            fluidOption: '200ml', // 30 min = 1 slot
            addOnTreatmentId: 14 // ADD-ON: 90 min = 3 slots
        }
    ];

    const result2 = simulateImprovedLogic(addOnAttendees, mockTreatmentDurations);
    console.log('📊 Add-on Treatment Result:', {
        span: result2.totalSlotsNeeded,
        demand: result2.demand,
        feasible: result2.feasible
    });

    // Test Case 3: All same duration (should still work)
    console.log('\n🎯 TEST CASE 3: All Same Duration (Should Still Work)');
    const sameDurationAttendees = [
        {
            treatmentId: 15,
            fluidOption: '200ml', // 30 min = 1 slot
            addOnTreatmentId: null
        },
        {
            treatmentId: 16,
            fluidOption: '200ml', // 30 min = 1 slot
            addOnTreatmentId: null
        },
        {
            treatmentId: 17,
            fluidOption: '200ml', // 30 min = 1 slot
            addOnTreatmentId: null
        }
    ];

    const result3 = simulateImprovedLogic(sameDurationAttendees, mockTreatmentDurations);
    console.log('📊 Same Duration Result:', {
        span: result3.totalSlotsNeeded,
        demand: result3.demand,
        feasible: result3.feasible
    });

    return { result1, result2, result3 };
};

const simulateImprovedLogic = (testAttendees, mockTreatmentDurations) => {
    console.log('\n📋 Attendees:');
    testAttendees.forEach((attendee, index) => {
        console.log(`  ${index + 1}. Treatment ${attendee.treatmentId}, ${attendee.fluidOption}, Add-on: ${attendee.addOnTreatmentId || 'None'}`);
    });

    // Step 1: Calculate duration requirements
    const attendeeDurations = testAttendees.map((attendee, index) => {
        const durationInfo = mockTreatmentDurations.get(attendee.treatmentId);

        // Add-on treatment detection
        const hasAddOnTreatment = attendee.addOnTreatmentId &&
            attendee.addOnTreatmentId !== null &&
            attendee.addOnTreatmentId !== undefined &&
            String(attendee.addOnTreatmentId).trim() !== '' &&
            String(attendee.addOnTreatmentId).toLowerCase() !== 'none' &&
            String(attendee.addOnTreatmentId).toLowerCase() !== 'null';

        let slotsNeeded, actualDuration;
        if (hasAddOnTreatment) {
            slotsNeeded = 3;
            actualDuration = 90;
        } else {
            actualDuration = attendee.fluidOption === '200ml'
                ? durationInfo.duration_minutes_200ml
                : durationInfo.duration_minutes_1000ml;
            slotsNeeded = Math.ceil(actualDuration / 30);
        }

        return {
            attendeeIndex: index,
            slotsNeeded,
            actualDuration,
            attendee
        };
    });

    console.log('📊 Duration requirements:', attendeeDurations.map(a =>
        `Attendee ${a.attendeeIndex + 1}: ${a.slotsNeeded} slots (${a.actualDuration}min)`
    ));

    // Step 2: IMPROVED Sequential Logic
    console.log('\n🔄 Applying IMPROVED Sequential Logic:');

    // Sort by duration
    const sortedAttendees = [...attendeeDurations].sort((a, b) => a.slotsNeeded - b.slotsNeeded);
    console.log('📋 Sorted by duration:', sortedAttendees.map(a =>
        `Attendee ${a.attendeeIndex + 1}: ${a.slotsNeeded} slots`
    ));

    // Intelligent grouping
    const groups = [];
    let currentGroup = [];
    let remainingAttendees = [...sortedAttendees];
    const slotCapacity = 2;

    while (remainingAttendees.length > 0) {
        if (currentGroup.length === 0) {
            currentGroup.push(remainingAttendees.shift());
        } else {
            if (currentGroup.length < slotCapacity && remainingAttendees.length > 0) {
                // Find best match for current group
                let bestMatchIndex = 0;
                let bestMatch = remainingAttendees[0];
                const currentGroupMaxSlots = Math.max(...currentGroup.map(a => a.slotsNeeded));

                for (let i = 1; i < remainingAttendees.length; i++) {
                    const candidate = remainingAttendees[i];
                    if (Math.abs(candidate.slotsNeeded - currentGroupMaxSlots) <
                        Math.abs(bestMatch.slotsNeeded - currentGroupMaxSlots)) {
                        bestMatch = candidate;
                        bestMatchIndex = i;
                    }
                }

                currentGroup.push(bestMatch);
                remainingAttendees.splice(bestMatchIndex, 1);
            } else {
                groups.push([...currentGroup]);
                currentGroup = [];
            }
        }

        if (remainingAttendees.length === 1 && currentGroup.length === 0) {
            groups.push([remainingAttendees.shift()]);
        }
    }

    if (currentGroup.length > 0) {
        groups.push(currentGroup);
    }

    console.log(`🎯 Created ${groups.length} groups:`);
    groups.forEach((group, index) => {
        const maxSlots = Math.max(...group.map(a => a.slotsNeeded));
        const maxDuration = Math.max(...group.map(a => a.actualDuration));
        console.log(`  Group ${index + 1}: ${group.length} attendees, ${maxSlots} slots, ${maxDuration}min max`);
    });

    // Smart slot placement
    const demand = [];
    let max_slot_index = -1;
    let currentSlotIndex = 0;

    groups.forEach((group, groupIndex) => {
        const maxSlotsInGroup = Math.max(...group.map(a => a.slotsNeeded));
        const maxDuration = Math.max(...group.map(a => a.actualDuration));

        for (let j = 0; j < maxSlotsInGroup; j++) {
            const slotIndex = currentSlotIndex + j;
            demand[slotIndex] = (demand[slotIndex] || 0) + group.length;
            max_slot_index = Math.max(max_slot_index, slotIndex);
        }

        console.log(`✅ Group ${groupIndex + 1}: Slots ${currentSlotIndex + 1}-${currentSlotIndex + maxSlotsInGroup} - ${group.length} attendees`);

        // Intelligent advancement - FIXED VERSION
        if (group.length === 1 && maxSlotsInGroup <= 2) {
            currentSlotIndex += maxSlotsInGroup;
        } else {
            // For larger groups or longer durations, advance more strategically
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

    const totalSlotsNeeded = max_slot_index + 1;
    const feasible = demand.every(demandForSlot => demandForSlot <= 2);

    console.log(`📊 Result: ${totalSlotsNeeded} slots needed, demand: [${demand.slice(0, totalSlotsNeeded).join(', ')}]`);
    console.log(`✅ Feasible: ${feasible ? 'YES' : 'NO'}`);

    return {
        totalSlotsNeeded,
        demand: demand.slice(0, totalSlotsNeeded),
        feasible,
        groups
    };
};

// Run the test
const results = testImprovedSequentialLogic();

console.log('\n🏁 SUMMARY:');
console.log(`- Mixed durations: ${results.result1.feasible ? '✅ FIXED' : '❌ Still failing'} (${results.result1.totalSlotsNeeded} slots)`);
console.log(`- With add-on: ${results.result2.feasible ? '✅ FIXED' : '❌ Still failing'} (${results.result2.totalSlotsNeeded} slots)`);
console.log(`- Same duration: ${results.result3.feasible ? '✅ Working' : '❌ Broken'} (${results.result3.totalSlotsNeeded} slots)`); 