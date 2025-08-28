// Simple availability test to check basic API functionality

const testSimpleAvailability = async () => {
    console.log('🧪 Testing Simple Availability (2 attendees, no add-ons)...\n');

    const testData = {
        locationId: 'table_bay',
        date: '2025-05-10',
        destinationType: 'lounge',
        attendees: [
            {
                treatmentId: 15, // Dr John Myers
                fluidOption: '200ml',
                addOnTreatmentId: null
            },
            {
                treatmentId: 16, // Kick-Start
                fluidOption: '200ml',
                addOnTreatmentId: null
            }
        ]
    };

    console.log('📋 Simple Test Data (2 attendees, 30min each):');
    console.log(JSON.stringify(testData, null, 2));

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
        console.log('📱 Raw response:', response.status, responseText);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${responseText}`);
        }

        const availableSlots = JSON.parse(responseText);

        console.log('\n✅ Response received:');
        console.log(`Available slots count: ${availableSlots.length}`);

        if (availableSlots.length > 0) {
            console.log('\n📅 First few available slots:');
            availableSlots.slice(0, 3).forEach((slot, index) => {
                console.log(`  ${index + 1}. ID: ${slot.id}, Start: ${slot.start_time}`);
                if (slot.booking_pattern) {
                    console.log(`     Pattern: ${slot.booking_pattern.type}, Span: ${slot.booking_pattern.required_span}`);
                }
            });
        } else {
            console.log('❌ No available slots found');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
};

// Test with 1 attendee (even simpler)
const testSingleAttendee = async () => {
    console.log('\n🧪 Testing Single Attendee Availability...\n');

    const testData = {
        locationId: 'table_bay',
        date: '2025-05-10',
        destinationType: 'lounge',
        attendees: [
            {
                treatmentId: 15, // Dr John Myers
                fluidOption: '200ml',
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

        console.log('✅ Single attendee response:');
        console.log(`Available slots count: ${availableSlots.length}`);

        if (availableSlots.length > 0) {
            console.log('✅ Good: Basic availability working');
        } else {
            console.log('❌ Issue: Even single attendee shows no availability');
        }

    } catch (error) {
        console.error('❌ Single attendee test failed:', error.message);
    }
};

// Run tests
(async () => {
    await testSimpleAvailability();
    await testSingleAttendee();
})(); 