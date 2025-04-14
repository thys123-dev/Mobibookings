import { supabase } from '@/lib/database/supabase-client';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get('locationId');
    const date = searchParams.get('date'); // Expecting YYYY-MM-DD format

    if (!locationId || !date) {
        return NextResponse.json({ error: 'Missing locationId or date parameter' }, { status: 400 });
    }

    // Validate date format (basic check)
    if (!/\d{4}-\d{2}-\d{2}/.test(date)) {
        return NextResponse.json({ error: 'Invalid date format, use YYYY-MM-DD' }, { status: 400 });
    }

    try {
        // Construct the start and end timestamps for the given date
        const startOfDay = `${date}T00:00:00Z`;
        const endOfDay = `${date}T23:59:59Z`;

        // Fetch slots for the given location and date from Supabase
        // Initially, we fetch all slots for the day regardless of booked_count
        // We also calculate remaining seats for Phase 3 readiness
        const { data: timeSlots, error } = await supabase
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

        // Calculate remaining seats for each slot
        const availableSlots = timeSlots.map(slot => ({
            ...slot,
            remaining_seats: slot.capacity - slot.booked_count
        }));

        return NextResponse.json(availableSlots);

    } catch (error: any) {
        console.error('Error in /api/availability:', error);
        return NextResponse.json({ error: 'Failed to fetch availability', details: error.message }, { status: 500 });
    }
} 