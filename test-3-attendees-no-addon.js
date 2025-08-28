// Test 3 attendees without add-ons to isolate sequential logic issue

const test3AttendeesNoAddOn = async () => {
    console.log('🧪 Testing 3 Attendees WITHOUT Add-ons...\n');

    const testData = {
        locationId: 'table_bay',
        date: '2025-05-10',
        destinationType: 'lounge',
        attendees: [
            {
                treatmentId: 15, // Dr John Myers 
                fluidOption: '200ml', // 30 min = 1 slot
                addOnTreatmentId: null
            },
            {
                treatmentId: 16, // Kick-Start
                fluidOption: '200ml', // 30 min = 1 slot
                addOnTreatmentId: null
            },
            {
                treatmentId: 17, // Babelas Beater
                fluidOption: '200ml', // 30 min = 1 slot
                addOnTreatmentId: null // NO ADD-ON
            }
        ]
    };

    console.log('📋 Test Data (3 attendees, all 30min, no add-ons):');
    testData.attendees.forEach((attendee, index) => {
        console.log(`  ${index + 1}. Treatment ${attendee.treatmentId}, ${attendee.fluidOption}, Add-on: ${attendee.addOnTreatmentId || 'None'}`);
    });

    try {
        console.log('\n🔗 Making request to /api/availability...');

        const response = await fetch('http://localhost:3000/api/availability', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testData)
        });

        const responseText = await response.text();
        console.log(`📱 Response status: ${response.status}`);

        if (!response.ok) {
            console.log('❌ Error response:', responseText);
            return;
        }

        const availableSlots = JSON.parse(responseText);

        console.log(`✅ Available slots count: ${availableSlots.length}`);

        if (availableSlots.length > 0) {
            console.log('\n📅 First few available slots:');
            availableSlots.slice(0, 3).forEach((slot, index) => {
                console.log(`  ${index + 1}. ID: ${slot.id}, Start: ${slot.start_time}`);
                if (slot.booking_pattern) {
                    console.log(`     Pattern: ${slot.booking_pattern.type}, Span: ${slot.booking_pattern.required_span}`);
                    console.log(`     Utilization: ${slot.booking_pattern.utilization_percentage || 'N/A'}%`);
                }
            });

            console.log('\n🎯 Expected Result:');
            console.log('  - Should use sequential logic (3+ attendees)');
            console.log('  - Pattern should be [2, 1] (Group 1: 2 people, Group 2: 1 person)');
            console.log('  - Required span: 2 slots');
            console.log('  - Type: sequential');

        } else {
            console.log('❌ No available slots found');
            console.log('🔍 This suggests an issue with sequential booking logic');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
};

// Also test 3 attendees with mixed durations (no add-ons)
const test3AttendeesMixedDurations = async () => {
    console.log('\n🧪 Testing 3 Attendees Mixed Durations (no add-ons)...\n');

    const testData = {
        locationId: 'table_bay',
        date: '2025-05-10',
        destinationType: 'lounge',
        attendees: [
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
        ]
    };

    try {
        const response = await fetch('http://localhost:3000/api/availability', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testData)
        });

        const availableSlots = await response.json();

        console.log(`✅ Mixed durations result: ${availableSlots.length} available slots`);

        if (availableSlots.length > 0) {
            console.log('  Expected pattern: [2, 1, 1] (Group 1: 2 people/2 slots, Group 2: 1 person/1 slot)');
            if (availableSlots[0].booking_pattern) {
                console.log(`  Actual span: ${availableSlots[0].booking_pattern.required_span}`);
            }
        }

    } catch (error) {
        console.error('❌ Mixed durations test failed:', error.message);
    }
};

// Run both tests
(async () => {
    await test3AttendeesNoAddOn();
    await test3AttendeesMixedDurations();
})(); 