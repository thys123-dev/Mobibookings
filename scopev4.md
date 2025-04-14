# Project Scope Document: mobiViVe Online Booking Page (Version 8 - Custom Backend + GCal + Supabase - Revised)

**Version:** 8
**Date:** 2025-04-10

## 1. Project Overview

*   **Project Title:** mobiViVe Multi-Location Online Booking System (Custom Backend Availability on Supabase) with Zoho CRM & Google Calendar Integration (Next.js 14 Implementation)
*   **Objectives:**
    *   Develop a user-friendly, multi-step online booking page for mobiViVe IV therapy services using Next.js 14.
    *   Allow users to choose between booking at one of **6** physical lounge locations or requesting mobile service (home/office). The specific lounge locations are: **Table Bay Mall, Camps Bay, Durbanville, Paarl, Somerset West, and Stellenbosch**.
    *   Implement a **custom backend system leveraging Supabase (PostgreSQL)** as the database to manage real-time appointment availability (30-minute slots, max 2 attendees per slot) for each of the 6 lounge locations independently. This system will be the **single source of truth** for slot availability, preventing double bookings.
    *   Integrate Zoho CRM via secure, server-side API calls to:
        *   Check if a booking user (based on email/phone) already exists as a Contact/Lead.
        *   If exists: Update the existing record with the new appointment details.
        *   If not exists: Create a new Lead in Zoho CRM.
    *   Integrate Google Calendar API via secure, server-side API calls to **automatically create a calendar event** on the specific Google Calendar associated with the booked location upon successful booking confirmation.
    *   Provide a seamless and intuitive booking experience reflecting positively on the mobiViVe brand, **ensuring a stable and validated technical foundation early in the development process.**
*   **Target Audience:** Individuals seeking IV therapy treatments via online booking.
*   **Scope:**
    *   **In Scope:** Frontend development (Next.js 14 using **Tailwind CSS + shadcn/ui**); Database schema design and setup on Supabase (PostgreSQL); Backend development (Next.js API Routes) for: managing locations/availability, handling booking submissions (including race condition prevention using Supabase/Postgres features), interacting with Zoho CRM API, and interacting with Google Calendar API (authentication, event creation); Logic for 6 specified lounges and initial mobile service selection; **Early validation of core project setup and build process.**
    *   **Out of Scope (Initially):** User account system (Supabase Auth could be added later); Payment processing; Complex mobile booking logic; Full website redesign; Admin panel for managing locations/working hours/calendar IDs; Automated event updates/cancellations sync between database and Google Calendar.
*   **Business Value:** Provides a reliable and accurate booking system fully controlled by mobiViVe, using a modern backend platform (Supabase), ensuring operational efficiency by automatically populating location-specific calendars and integrating customer data into Zoho CRM.

## 2. Core Functionalities (Based on Guide)

*   **User Requirements (Prioritized):**
    *   **Essential (Must-Have):**
        1.  Select Treatment Destination (Dropdown: "Our treatment lounge", "Your home, office...").
        2.  Specify Number of People Attending (Number Input, max 2 if Lounge selected).
        3.  *If Lounge:* Select specific Lounge Location (Dropdown: **Table Bay Mall, Camps Bay, Durbanville, Paarl, Somerset West, Stellenbosch**).
        4.  *If Lounge:* View real-time availability calendar/slots specific to the selected lounge and date, fetched from the **custom backend (Supabase DB)**.
        5.  *If Lounge:* Select an available Date & Time slot (unavailable/full slots visually indicated/disabled based on **Supabase DB state**).
        6.  Enter Attendee Information (Person 1): First Name, Last Name, Email, Phone Number.
        7.  Select desired IV Therapy (Dropdown).
        8.  Submit the complete booking request **to the custom backend API**.
        9.  Receive clear confirmation or error feedback upon submission.
    *   **Important (Should-Have):**
        *   Intuitive multi-step form navigation.
        *   Mobile-responsive design.
        *   Secure data handling & robust backend validation.
        *   Backend logic to prevent booking more than 2 attendees per slot.
        *   Backend logic to handle concurrent booking attempts (using Supabase/Postgres transactions and locking).
    *   **Optional (Could-Have / Future):**
        *   Multi-attendee detail input.
        *   Advanced mobile booking flow.
        *   Admin interface for managing locations/availability rules.
        *   Post-booking calendar event sync (updates/deletes).

*   **Primary Functions:**
    *   Multi-step Form Navigation (Client-side).
    *   Conditional Logic (Client-side).
    *   Backend: Define & Manage Locations, Availability Rules, Associated Google Calendar IDs (in Supabase DB).
    *   Backend API: Fetch Available Time Slots (query Supabase DB).
    *   Frontend: Display Available Slots based on data from backend API.
    *   User Data Capture (Client-side form state).
    *   Backend API: Handle Booking Submission (Validate data, Supabase DB Transaction w/ Locking, Zoho Call, Google Calendar Event Creation).
    *   Backend: Zoho CRM Client Lookup, Lead Creation, Contact/Lead Update.
    *   Backend: Google Calendar Event Creation on correct calendar.

*   **User Interface (UI):**
    *   Layout: Multi-step form.
    *   Components: **Utilizing shadcn/ui components** (Input, Select, Button, Calendar, etc.) styled with Tailwind CSS.
    *   Design: Clean, professional, matching mobiViVe branding. Clear visual indication of available vs. unavailable/full slots. Loading states during availability fetch and submission.

*   **Data Management:**
    *   **Database:** **Supabase (PostgreSQL)**. Database is the **source of truth** for availability.
    *   **Schema (Conceptual):**
        *   `locations` (id, name, working_hours_config, google_calendar_id)
        *   `time_slots` (id, location_id, start_time, end_time, capacity [default 2], booked_count [default 0]) - *Consider if these are pre-generated or dynamically calculated*.
        *   `bookings` (id, time_slot_id (or start_time+location_id), user_name, user_email, user_phone, treatment, attendee_count, zoho_entity_id, booking_time, google_event_id (optional))
    *   **Backend:** Secure data handling, validation, atomic database updates (Supabase/Postgres transactions, row locking) to prevent race conditions. Use Supabase client library (`@supabase/supabase-js`) for interactions.
    *   **Privacy:** Handle PII securely.

*   **Interactivity and User Engagement:**
    *   Dynamic form changes (Client-side).
    *   Dynamic fetching and display of available time slots from the backend API querying Supabase.
    *   Real-time (on submit) validation of slot availability via backend check against Supabase.
    *   Clear success/error messages.

*   **Backend Functionalities (Implemented as Next.js API Routes in `/app/api/...`):**
    *   **API Routes:**
        *   `GET /api/availability?locationId=...&date=...`: Fetches available slots from Supabase for the specified location/date. Calculates `remaining_seats = capacity - booked_count`. Returns available slots.
        *   `POST /api/bookings`: Handles new booking requests.
            *   Receives booking data.
            *   Validates input data thoroughly.
            *   **CRITICAL:** Initiates a database transaction using Supabase client/Postgres functions.
            *   Selects the relevant time slot data **with a lock** (e.g., using Supabase RPC or direct SQL `SELECT ... FOR UPDATE`) to prevent concurrent modifications.
            *   Re-validates if `slot.booked_count + attendee_count <= slot.capacity`.
            *   If valid:
                *   Updates the `time_slots` table (increments `booked_count`).
                *   Creates a record in the `bookings` table.
                *   Commits the transaction.
                *   **(On Success) Perform BOTH:**
                    1.  Call Zoho API logic.
                    2.  Call Google Calendar API logic.
                *   Return success response.
            *   If invalid: Rolls back the transaction, returns appropriate error response.
    *   **Database Logic:** Encapsulated functions using `@supabase/supabase-js` for queries, updates, transaction handling (potentially in `lib/database/...`).
    *   **Zoho CRM API Integration:** Logic remains server-side, called *after* successful database booking confirmation.
    *   **Google Calendar API Integration:** Logic remains server-side, called *after* successful database booking confirmation. Requires setup (GCP Project, API Key/Credentials) and authentication.

*   **Performance and Scalability:**
    *   Efficient database queries using Supabase/Postgres indexing (index `location_id`, `start_time` on `time_slots`).
    *   Backend API route performance.
    *   Leverage Supabase's managed infrastructure.

*   **Security:**
    *   HTTPS, Server-side validation, Secure credential management (Supabase URL/keys, Zoho keys, Google keys via environment variables).
    *   Use Supabase client library features to prevent SQL injection (if not using raw SQL extensively).
    *   Implement proper database transaction/locking.
    *   Configure Supabase Row Level Security (RLS) if appropriate for future features, though likely not strictly needed for backend-only access via API routes using service keys.

*   **Testing and Debugging Capabilities:**
    *   Backend logging (API requests, Supabase DB interactions, Zoho/GCal calls, errors).
    *   Testing concurrent booking scenarios against Supabase.
    *   Client-side error display.

*   **User Feedback Mechanisms:** (Out of scope).

*   **Localization and Accessibility:**
    *   Language: English (initially).
    *   Accessibility: Strive for WCAG 2.1 Level AA using shadcn/ui accessibility features.

## 3. Technology Stack

*   **Framework:** Next.js 14 (App Router)
*   **Language:** TypeScript
*   **Database:** **Supabase (PostgreSQL)**
*   **Database Client:** **`@supabase/supabase-js`**
*   **Frontend:** React, HTML5
*   **Styling:** **Tailwind CSS**
*   **UI Components:** **shadcn/ui** (Built on Tailwind CSS & Radix UI)
*   **CRM Integration:** Zoho CRM API.
*   **Calendar Integration:** Google Calendar API (v3).
    *   **Google API Client Library:** `googleapis` for Node.js.
*   **State Management (Client):** React Hooks (`useState`, `useContext`).
*   **Hosting:** Vercel (recommended for Next.js) or similar platform. Supabase handles DB hosting.
*   **Build Tooling Dependencies:** PostCSS, Autoprefixer (managed by Next.js)

## 4. Development Guidelines & Technical Specifications

*   **API Documentation:** **Consult official Zoho CRM API, Google Calendar API (v3), and Supabase documentation** before and during implementation.
*   **Project Structure:** Follow the suggested file structure (Section 5).
*   **Component Types:** Use Server Components where possible, Client Components (`'use client'`) for interactivity/hooks.
*   **Data Fetching:** Fetch availability data via internal API routes calling Supabase. Submit bookings via internal API routes.
*   **API Interactions:** All external (Zoho, Google) and database (Supabase) interactions MUST occur server-side within Next.js API routes (`/app/api/...`).
*   **Environment Variables:** Store Supabase URL/keys, Zoho keys, Google credentials securely (.env.local, platform settings). Use `process.env` server-side. Ensure keys are in `.gitignore` immediately upon project creation.
*   **Error Handling:** Implement `try...catch` in API routes, handle DB/API errors gracefully, log server-side, provide user feedback client-side. Handle partial success scenarios (e.g., DB ok, GCal fail).
*   **Type Safety:** Use TypeScript strictly. Define interfaces/types (consider using types generated from DB schema if possible). Avoid `any`.
*   **Configuration:** Use `next.config.mjs` as needed.
*   **Troubleshooting Build/Cache Issues:** If persistent build errors (e.g., `EPERM`, dependency issues) or unexpected behavior occurs during development, try the following steps:
    1.  Stop the development server (`Ctrl+C`).
    2.  Delete the `.next` directory.
    3.  Run `npm install` (to ensure all dependencies, including SWC, are correctly installed).
    4.  Restart the development server (`npm run dev`).

## 5. Suggested File Structure

```plaintext
MobiBookings/
├── app/
│   ├── api/
│   │   ├── availability/
│   │   │   └── route.ts       # Handles GET requests (query Supabase)
│   │   └── bookings/
│   │       └── route.ts       # Handles POST (Supabase Tx, Zoho, GCal)
│   ├── book/
│   │   └── page.tsx
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
│
├── components/
│   ├── booking-form.tsx     # Main client component managing state & steps
│   ├── step-destination.tsx
│   ├── step-lounge-select.tsx
│   ├── step-timeslot-select.tsx # Displays slots from /api/availability
│   ├── step-attendee-info.tsx
│   ├── step-confirmation.tsx
│   └── ui/                 # shadcn/ui components added via CLI
│       ├── button.tsx      # Example
│       ├── select.tsx      # Example
│       ├── input.tsx       # Example
│       ├── calendar.tsx    # Example
│       └── ...             # Other needed shadcn/ui components
│
├── lib/
│   ├── database/
│   │   └── supabase-client.ts # Supabase client initialization & helper functions
│   ├── zoho.ts                # Zoho CRM API interactions
│   ├── google-calendar.ts     # Google Calendar API interactions
│   ├── types.ts               # TypeScript interfaces
│   ├── constants.ts           # Lounge names/IDs, Capacity, etc.
│   └── utils.ts               # Utility functions (incl. shadcn/ui utils if needed)
│
├── public/
│   ├── images/
│   └── favicon.ico
│
├── .env.local                   # Supabase URL/Keys, Zoho Keys, Google Credentials
├── .gitignore                   # node_modules, .next, .env*, any credential files
├── next.config.mjs
├── package.json                 # Add @supabase/supabase-js, googleapis
├── tailwind.config.ts           # Tailwind config
├── postcss.config.js            # PostCSS config (often minimal for Next.js)
├── components.json              # shadcn/ui configuration
├── tsconfig.json
└── SCOPE.md                     # This file

*   **Key Structure Notes:**
    *   Simplified `lib/database` to focus on the Supabase client and helpers. Specific transaction logic will likely reside within the `/api/bookings/route.ts` or be called from there using helper functions defined in `lib/database/supabase-client.ts`.
    *   `components/ui` will be populated by running the `shadcn-ui` CLI commands.
    *   `tailwind.config.ts` and `postcss.config.js` are required for Tailwind setup.
    *   `components.json` is generated and used by `shadcn-ui`.

## 6. Phased Development Priorities (Roadmap - Custom Backend + GCal + Supabase - Revised)

1.  **Phase 1: Core Setup & Validation:**
    *   Initialize Next.js 14 TypeScript project.
    *   **Immediately add `.next` and `.env.local` to `.gitignore`.**
    *   Configure basic environment variables for Supabase URL/Key (initially). Store securely.
    *   Install necessary dependencies: `@supabase/supabase-js`, `googleapis`.
    *   **Set up Tailwind CSS and `shadcn-ui`** according to their official documentation for Next.js.
    *   **Add at least one basic `shadcn/ui` component** (e.g., `<Button>`) to the default `/app/page.tsx`.
    *   **VALIDATION GATE:** Perform `npm run dev` and `npm run build`. **Ensure both commands complete successfully without errors.** Resolve any build/dependency issues (using troubleshooting steps in Sec 4 if needed) before proceeding.
    *   Set up Supabase project.
    *   Define database schema (`locations`, `time_slots`, `bookings`) in Supabase SQL editor or via migrations. Add `google_calendar_id` to `locations`.
    *   Implement Supabase client initialization (`lib/database/supabase-client.ts`).

2.  **Phase 2: Basic Availability API & Frontend Display:**
    *   **Decision Point:** Determine strategy for populating `time_slots` (Manual SQL for testing initially, plan for automated generation script in Phase 7).
    *   Create `GET /api/availability` endpoint querying Supabase (ignore `booked_count` initially, return dummy slots for a specific location/date).
    *   Build static React components (`/components`) using **`shadcn/ui` components** (e.g., `Input`, `Select`, `Calendar`).
    *   Assemble components in `/app/book/page.tsx`. Apply layout using Tailwind.
    *   Implement basic client-side state management (`useState`).
    *   Implement client-side logic to fetch data from `/api/availability` and display slots (using dummy data first). Add loading/error states using `shadcn/ui` components.

3.  **Phase 3: Booking Logic & Transaction Handling (Supabase):**
    *   Implement core booking logic within `POST /api/bookings` route using `@supabase/supabase-js`.
    *   Utilize Supabase/Postgres transactions (e.g., via RPC or careful sequencing with locking) for atomic updates of `time_slots` and `bookings`. Implement locking (`SELECT ... FOR UPDATE` equivalent) to prevent race conditions.
    *   Update `/api/availability` to accurately calculate `remaining_seats` based on actual `time_slots` data.
    *   Implement client-side form submission logic to POST data to `/api/bookings`. Handle success/error responses using `shadcn/ui` components (e.g., Toasts/Alerts).

4.  **Phase 4: Google Calendar Integration:**
    *   Set up Google Cloud Project & Credentials (Service Account). Store securely.
    *   Implement Google API auth and event creation logic (`lib/google-calendar.ts`).
    *   Integrate calls within `/api/bookings` *after* successful Supabase transaction commit. Handle errors and partial success scenarios.

5.  **Phase 5: Zoho CRM Integration:**
    *   Set up Zoho API credentials securely.
    *   Implement Zoho auth and API call logic (`lib/zoho.ts`).
    *   Integrate calls within `/api/bookings` *after* successful Supabase transaction commit. Handle errors.

6.  **Phase 6: Refinement & Testing:**
    *   Implement multi-step navigation logic within `booking-form.tsx`.
    *   Refine UI/UX using Tailwind/shadcn/ui, improve error handling (including partial success scenarios).
    *   **Emphasized Testing:**
        *   Unit/Integration tests for API routes and helper functions if feasible.
        *   End-to-end testing of the full booking flow for all lounge locations.
        *   **Specific testing of concurrent booking attempts** against `/api/bookings` to verify the Supabase transaction/locking mechanism prevents double bookings.
        *   Validation of correct Google Calendar event creation for each location.
        *   Verification of Zoho CRM contact/lead creation/update logic.
        *   Testing of all input validation scenarios (client and server-side).
        *   Cross-browser and mobile responsiveness testing.

7.  **Phase 7: Deployment & Automation:**
    *   Configure production Supabase environment variables, Zoho keys, Google keys on hosting platform (e.g., Vercel).
    *   Deploy Next.js application. Ensure database schema is migrated/set up in production Supabase instance.
    *   **Develop and implement the Supabase function/script** for automated generation of `time_slots` based on working hours (as decided in Phase 2) to ensure future availability is populated.
    *   Establish a process/schedule for running the slot generation function.