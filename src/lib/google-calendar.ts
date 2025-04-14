import { google } from 'googleapis';

// Define the structure for event details
interface EventDetails {
    summary: string;        // Event title (e.g., "IV Booking - John Doe")
    description: string;    // Event details (e.g., Therapy: Energy Boost, Phone: 123...)
    startTime: string;      // ISO 8601 string (e.g., "2025-04-21T10:00:00+00:00")
    endTime: string;        // ISO 8601 string (e.g., "2025-04-21T10:30:00+00:00")
    attendeeEmail?: string; // Optional: Add booker as attendee
    calendarId: string;     // Target Google Calendar ID
}

// Function to get authenticated Google Calendar API client
function getGoogleAuth() {
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;

    // --- DEBUG LOGGING --- 
    console.log("\n--- Google Auth Debug ---");
    console.log("Service Account Email:", serviceAccountEmail ? "Loaded" : "MISSING!");

    // Trim whitespace ONLY - remove explicit newline replacement
    const privateKey = privateKeyRaw?.trim();

    console.log("Private Key for auth (trimmed only):", privateKey ? "Processed" : "MISSING or RAW is undefined!");
    console.log("--- End Google Auth Debug ---\n");
    // --- END DEBUG LOGGING ---

    if (!serviceAccountEmail || !privateKey) {
        throw new Error('Missing Google Calendar service account credentials in environment variables.');
    }

    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: serviceAccountEmail,
            private_key: privateKey, // Pass the trimmed, but otherwise raw, key
        },
        scopes: ['https://www.googleapis.com/auth/calendar.events'],
    });

    return auth;
}

// Function to create a Google Calendar event
export async function createCalendarEvent(details: EventDetails): Promise<string | null> {
    try {
        const auth = getGoogleAuth();
        const calendar = google.calendar({ version: 'v3', auth });

        const event = {
            summary: details.summary,
            description: details.description,
            start: {
                dateTime: details.startTime, // Assumes startTime includes timezone offset
                // timeZone: 'Africa/Johannesburg', // Optional: Specify timezone if startTime is local
            },
            end: {
                dateTime: details.endTime, // Assumes endTime includes timezone offset
                // timeZone: 'Africa/Johannesburg', // Optional: Specify timezone if endTime is local
            },
            // Remove the attendees property
            // attendees: details.attendeeEmail ? [{ email: details.attendeeEmail }] : [],
            // Add other event properties if needed (e.g., location)
        };

        const response = await calendar.events.insert({
            calendarId: details.calendarId,
            requestBody: event,
        });

        console.log('Google Calendar event created:', response.data.id);
        return response.data.id || null; // Return the event ID

    } catch (error: any) {
        console.error('Error creating Google Calendar event:', error.response ? error.response.data : error.message);
        // Decide how to handle errors - log and return null for now
        // We might not want to fail the entire booking if GCal fails
        return null;
    }
} 