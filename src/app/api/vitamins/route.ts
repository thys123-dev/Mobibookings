import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
// Ensure these environment variables are set in your Vercel/Next.js environment
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL is not set.');
  // Return a server error response or throw to prevent further execution
}
if (!supabaseAnonKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.');
  // Return a server error response or throw
}

// Create a Supabase client instance, ensuring keys are checked
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase client not initialized. Check server logs for missing environment variables.' }, { status: 500 });
  }

  try {
    const { data, error } = await supabase
      .from('additional_vitamins')
      .select('id, name, price')
      .order('name', { ascending: true }); // Optional: order by name

    if (error) {
      console.error('Supabase error fetching vitamins:', error);
      throw error; // Let the catch block handle it
    }

    // It's good practice to add a "none" option on the client-side if needed for dropdowns,
    // or ensure your DB has such an entry if it's universally required.
    // For now, returning raw DB data.

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API error fetching vitamins:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch additional vitamins.' },
      { status: 500 }
    );
  }
} 