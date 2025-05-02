import { NextResponse } from 'next/server';
import { supabase } from '@/lib/database/supabase-client'; // Adjust path if needed

export async function GET() {
  try {
    const { data: treatments, error } = await supabase
      .from('treatments')
      .select('id, name, price, duration_minutes_200ml, duration_minutes_1000ml')
      .eq('is_active', true) // Only fetch active treatments
      .order('name', { ascending: true }); // Optional: order by name

    if (error) {
      console.error('Supabase error fetching treatments:', error);
      throw new Error(error.message); // Throw error to be caught below
    }

    // Return the list of treatments
    return NextResponse.json(treatments);

  } catch (error) {
    console.error('API error fetching treatments:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    // Return an error response
    return NextResponse.json(
      { error: 'Failed to fetch treatments', details: errorMessage },
      { status: 500 }
    );
  }
} 