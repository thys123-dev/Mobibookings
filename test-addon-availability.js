// Test script for add-on treatment availability logic
// Tests 3 attendees where one has an add-on treatment

const testAvailabilityWithAddOn = async () => {
    console.log('🧪 Testing availability with add-on treatment...\n');

    // Test Case 1: 3 attendees, one with add-on treatment
    const testData = {
        locationId: 'table_bay',
        date: '2025-05-10',
        destinationType: 'lounge',
        attendees: [
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
        ]
    };

    console.log('📋 Test Data:');
    console.log(`Location: ${testData.locationId}`);
    console.log(`Date: ${testData.date}`);
    console.log('Attendees:');
    testData.attendees.forEach((attendee, index) => {
        console.log(`  ${index + 1}. Treatment ID: ${attendee.treatmentId}, Fluid: ${attendee.fluidOption}, Add-on: ${attendee.addOnTreatmentId || 'None'}`);
    });
    console.log();

    try {
        console.log('🔗 Making request to /api/availability...');

        const response = await fetch('http://localhost:3000/api/availability', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
        }

        const availableSlots = await response.json();

        console.log('✅ Response received:');
        console.log(`Available slots count: ${availableSlots.length}`);

        if (availableSlots.length > 0) {
            console.log('\n📅 Available time slots:');
            availableSlots.slice(0, 5).forEach((slot, index) => {
                console.log(`  ${index + 1}. ID: ${slot.id}, Start: ${slot.start_time}`);
                if (slot.booking_pattern) {
                    console.log(`     Pattern: ${slot.booking_pattern.type}, Span: ${slot.booking_pattern.required_span} slots`);
                }
            });

            if (availableSlots.length > 5) {
                console.log(`     ... and ${availableSlots.length - 5} more slots`);
            }
        } else {
            console.log('❌ No available slots found');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);

        if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch')) {
            console.log('\n💡 Note: Make sure your Next.js dev server is running:');
            console.log('   npm run dev');
        }
    }

    console.log('\n🧪 Test completed\n');
};

// Test Case 2: Same scenario but with add-on set to null (edge case)
const testAvailabilityWithNullAddOn = async () => {
    console.log('🧪 Testing availability with null add-on (edge case)...\n');

    const testData = {
        locationId: 'table_bay',
        date: '2025-05-10',
        destinationType: 'lounge',
        attendees: [
            {
                treatmentId: 15,
                fluidOption: '200ml',
                addOnTreatmentId: null
            },
            {
                treatmentId: 16,
                fluidOption: '1000ml',
                addOnTreatmentId: null
            },
            {
                treatmentId: 17,
                fluidOption: '200ml',
                addOnTreatmentId: null // Explicitly null (should NOT trigger 90min duration)
            }
        ]
    };

    try {
        console.log('🔗 Making request to /api/availability...');

        const response = await fetch('http://localhost:3000/api/availability', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testData)
        });

        const availableSlots = await response.json();

        console.log('✅ Response received:');
        console.log(`Available slots count: ${availableSlots.length}`);

        if (availableSlots.length > 0) {
            console.log('✅ Good: Slots available when no add-ons are selected');
        } else {
            console.log('❌ Issue: No slots available even without add-ons');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }

    console.log('\n🧪 Edge case test completed\n');
};

// Run the tests
console.log('🚀 Starting add-on treatment availability tests...\n');

// Run tests sequentially
(async () => {
    await testAvailabilityWithAddOn();
    await testAvailabilityWithNullAddOn();

    console.log('🏁 All tests completed');
})(); 