import { supabase } from '@/lib/database/supabase-client';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get('locationId');
    const date = searchParams.get('date'); // Expecting YYYY-MM-DD format
    const attendeeCountParam = searchParams.get('attendeeCount');

    if (!locationId || !date) {
        return NextResponse.json({ error: 'Missing locationId or date parameter' }, { status: 400 });
    }

    // Validate date format (basic check)
    if (!/\d{4}-\d{2}-\d{2}/.test(date)) {
        return NextResponse.json({ error: 'Invalid date format, use YYYY-MM-DD' }, { status: 400 });
    }

    // Validate and parse attendeeCount, default to 1 if invalid or missing
    let attendeeCount = 1;
    if (attendeeCountParam) {
        const parsedCount = parseInt(attendeeCountParam, 10);
        if (!isNaN(parsedCount) && parsedCount > 0) {
            attendeeCount = parsedCount;
        } else {
            // Optional: return error for invalid attendee count?
            console.warn(`Invalid attendeeCount param: ${attendeeCountParam}. Defaulting to 1.`);
        }
    }

    try {
        // Construct the start and end timestamps for the given date
        // Important: Adjust timezone handling if necessary based on how times are stored/queried
        const startOfDay = `${date}T00:00:00Z`;
        const endOfDay = `${date}T23:59:59Z`;

        // Fetch all slots for the day for the location
        const { data: allTimeSlots, error } = await supabase
            .from('time_slots')
            .select('id, start_time, end_time, capacity, booked_count')
            .eq('location_id', locationId)
            .gte('start_time', startOfDay)
            .lte('start_time', endOfDay)
            .order('start_time', { ascending: true });

        if (error) {
            console.error('Supabase error fetching slots:', error);
            throw error; // Throw error to be caught by the outer catch block
        }

        if (!allTimeSlots) {
            return NextResponse.json([]); // Return empty if no slots found
        }

        let availableStartingSlots = [];

        if (attendeeCount <= 2) {
            // --- Original Logic for 1-2 Attendees ---
            availableStartingSlots = allTimeSlots
                .filter(slot => (slot.capacity - slot.booked_count) >= attendeeCount)
                .map(slot => ({
                    ...slot,
                    remaining_seats: slot.capacity - slot.booked_count
                }));
        } else {
            // --- New Logic for > 2 Attendees (Consecutive Slots) ---
            const slotsNeeded = Math.ceil(attendeeCount / 2.0);
            
            for (let i = 0; i <= allTimeSlots.length - slotsNeeded; i++) {
                const potentialBlock = allTimeSlots.slice(i, i + slotsNeeded);
                
                // Basic check: Ensure the block is truly consecutive based on time
                // This requires assuming slot durations are consistent (e.g., 30 mins)
                // A more robust check would compare end_time of slot j with start_time of j+1
                // For now, we rely on the ordered fetch and limit.
                
                // Calculate combined capacity for the block
                const combinedCapacity = potentialBlock.reduce((sum, slot) => sum + (slot.capacity - slot.booked_count), 0);

                if (combinedCapacity >= attendeeCount) {
                    // The first slot of this block is a valid starting point
                    const startingSlot = potentialBlock[0];
                    availableStartingSlots.push({
                        ...startingSlot,
                        // Indicate capacity relative to the *block* for this request
                        // Note: Displaying individual remaining seats might be confusing here
                        // We could add a property like `books_slots: slotsNeeded`?
                        // For now, just return the starting slot's details.
                        remaining_seats: startingSlot.capacity - startingSlot.booked_count // Or calculate block capacity?
                    });
                    // Optimization: Should we skip checking the next slot if it was part of this block?
                    // For now, simple iteration is fine.
                }
            }
        }

        return NextResponse.json(availableStartingSlots);

    } catch (error: any) {
        console.error('Error in /api/availability:', error);
        return NextResponse.json({ error: 'Failed to fetch availability', details: error.message }, { status: 500 });
    }
} 