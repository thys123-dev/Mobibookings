import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL");
}
if (!supabaseAnonKey) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

// Create a single Supabase client for interacting with your database
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Note: For server-side operations requiring elevated privileges (e.g., in API routes),
// you might need to create a separate client using the service role key.
// Example (DO NOT use this client on the client-side):

const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Throw error during build if service key is missing in production/preview envs,
// but allow missing in local dev if needed (though it will fail at runtime).
// Adjust this logic based on deployment strategy.
if (process.env.NODE_ENV !== 'development' && !supabaseServiceRoleKey) {
    console.warn("WARN: Missing environment variable: SUPABASE_SERVICE_ROLE_KEY. Booking API will fail.");
    // Optionally throw error in production builds:
    // throw new Error("Missing environment variable: SUPABASE_SERVICE_ROLE_KEY");
}

// Initialize admin client only if key exists
export const supabaseAdmin = supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
    : null; // Handle cases where key might be missing in dev

// Helper function to get the required admin client
export const getSupabaseAdmin = () => {
    if (!supabaseAdmin) {
        throw new Error("Supabase admin client is not initialized. Check SUPABASE_SERVICE_ROLE_KEY.");
    }
    return supabaseAdmin;
} 