import { NextRequest, NextResponse } from 'next/server';
import { getZohoApiClient } from '@/lib/zoho/api';
import { calculateBookingPrice, generatePricingDescription, formatCurrency } from '@/lib/pricing';
import { supabase } from '@/lib/database/supabase-client';

export async function POST(request: NextRequest) {
    try {
        console.log('=== Creating Zoho CRM Record from Booking ===');

        const bookingData = await request.json();
        console.log('Received booking data:', bookingData);

        // Get authenticated Zoho API client
        const zohoClient = await getZohoApiClient();
        if (!zohoClient) {
            return NextResponse.json(
                { success: false, error: 'Failed to authenticate with Zoho CRM' },
                { status: 500 }
            );
        }

        // Fetch treatments and vitamins data for pricing calculation
        const [treatmentsResult, vitaminsResult] = await Promise.all([
            supabase.from('treatments').select('id, name, price, is_active'),
            supabase.from('additional_vitamins').select('id, name, price')
        ]);

        if (treatmentsResult.error || vitaminsResult.error) {
            console.error('Error fetching pricing data:', {
                treatments: treatmentsResult.error,
                vitamins: vitaminsResult.error
            });
            return NextResponse.json(
                { success: false, error: 'Failed to fetch pricing data' },
                { status: 500 }
            );
        }

        // Calculate pricing for the booking
        const pricing = await calculateBookingPrice(
            bookingData.attendees || [],
            treatmentsResult.data || [],
            vitaminsResult.data || []
        );

        console.log('=== PRICING CALCULATION ===');
        console.log('Pricing breakdown:', pricing);
        console.log('=== END PRICING CALCULATION ===');

        // Build per-attendee records for Zoho (multiple records in one call)
        const zohoRecords = mapBookingToZohoRecords(
            bookingData,
            pricing,
            treatmentsResult.data || [],
            vitaminsResult.data || []
        );

        console.log('Mapped records for Zoho (per attendee):', zohoRecords);

        // Prepare the complete payload for Zoho CRM API
        const zohoPayload = {
            data: zohoRecords
        };

        console.log('=== COMPLETE ZOHO CRM API PAYLOAD ===');
        console.log('API Endpoint: POST /crm/v7/Leads');
        console.log('Payload Structure:');
        console.log(JSON.stringify(zohoPayload, null, 2));
        console.log('=== END ZOHO CRM API PAYLOAD ===');

        // --- Optional: Forward payload to an external webhook for auditing/integration ---
        let webhookResult: { status: number, body: string } | null = null;
        try {
            const webhookUrl = (bookingData && bookingData.webhook_url) || process.env.ZOHO_WEBHOOK_URL || process.env.WEBHOOK_ZOHO_PAYLOAD_URL;
            if (webhookUrl) {
                const attendeeCount = (bookingData && (bookingData.attendeeCount ?? bookingData.attendee_count));
                const selectedStart = bookingData?.local_start_time || bookingData?.selectedStartTime || null;
                const selectedIso = selectedStart ? new Date(selectedStart).toISOString() : null;
                const selectedDate = selectedIso ? selectedIso.slice(0, 10) : null;
                const selectedTime = selectedIso ? selectedIso.slice(11, 19) : null;

                const webhookPayload = {
                    booking: {
                        booking_id: bookingData?.booking_id,
                        attendee_count: attendeeCount,
                        location_name: bookingData?.location_name,
                        destination_type: bookingData?.destinationType,
                        selected_start_date: selectedDate,
                        selected_start_time: selectedTime,
                        location_id: bookingData?.loungeLocationId || bookingData?.location_id,
                        google_event_id: bookingData?.google_event_id
                    },
                    zoho_payload: zohoPayload
                } as any;
                const resp = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(webhookPayload)
                });
                const text = await resp.text().catch(() => '');
                webhookResult = { status: resp.status, body: text };
                console.log('Forwarded Zoho payload to webhook', webhookResult);
            }
        } catch (webhookErr) {
            console.error('Failed to forward Zoho payload to webhook:', webhookErr);
        }

        // Create the record in Zoho CRM (using Leads module as an example)
        const response = await zohoClient.post('/crm/v7/Leads', zohoPayload);

        console.log('=== ZOHO CRM API RESPONSE ===');
        console.log('Status:', response.status);
        console.log('Response Data:');
        console.log(JSON.stringify(response.data, null, 2));
        console.log('=== END ZOHO CRM API RESPONSE ===');

        if (response.data.data?.[0]?.code === 'SUCCESS') {
            return NextResponse.json({
                success: true,
                message: 'Booking record(s) created in Zoho CRM',
                data: response.data,
                webhook_result: webhookResult
            });
        } else {
            return NextResponse.json({
                success: false,
                error: 'Failed to create record in Zoho CRM',
                details: response.data,
                webhook_result: webhookResult
            }, { status: 400 });
        }

    } catch (error) {
        console.error('=== ERROR CREATING ZOHO CRM RECORD ===');
        console.error('Error details:', error);
        if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
        }
        console.error('=== END ERROR ===');

        return NextResponse.json({
            success: false,
            error: 'Failed to create Zoho CRM record',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

function mapBookingToZohoRecords(
    bookingData: any,
    pricing: any,
    treatments: Array<{ id: number | string, name: string, price: number, zoho_id?: string }>,
    vitamins: Array<{ id: number | string, name: string, price: number }>
) {
    console.log('=== MAPPING BOOKING DATA TO ZOHO RECORDS (PER ATTENDEE) ===');

    const attendeeBreakdown = pricing?.attendeeBreakdown || [];

    const records = (bookingData.attendees || []).map((attendee: any, index: number) => {
        const treatment = treatments.find(t => t.id.toString() === String(attendee.treatmentId));
        const vitamin = attendee.additionalVitaminId
            ? vitamins.find(v => v.id.toString() === String(attendee.additionalVitaminId))
            : undefined;

        // Base subtotal from pricing breakdown if available (breakdown = treatment + vitamin)
        // If no breakdown, sum treatment + vitamin directly
        const baseTreatmentPrice = Number(treatment?.price || 0);
        const baseVitaminPrice = Number(vitamin?.price || 0);
        let subtotal = attendeeBreakdown[index]?.attendeeTotal ?? (baseTreatmentPrice + baseVitaminPrice);

        // Add-on treatment price should always be included if present
        const addOnTreatmentId = attendee.addOnTreatmentId;
        const hasAddOn = addOnTreatmentId !== null && addOnTreatmentId !== undefined && String(addOnTreatmentId).length > 0;
        const addOnTreatment = hasAddOn ? treatments.find(t => t.id.toString() === String(addOnTreatmentId)) : undefined;
        if (hasAddOn && addOnTreatment) {
            subtotal += Number(addOnTreatment.price || 0);
        }
        const therapyName = treatment?.name || `Treatment ${attendee.treatmentId}`;
        const therapyZohoId = (treatment as any)?.zoho_id || null; // Fallback until zoho_id is available
        const addOnName = addOnTreatment?.name;
        const vitaminName = vitamin?.name;

        const record = {
            First_Name: attendee.firstName,
            Last_Name: attendee.lastName,
            Email: attendee.email,
            Phone: attendee.phone,
            Lead_Status: 'Booked',
            Lead_Source: 'IV Therapy Booking',
            iv_therapy: therapyName,
            therapy_id: therapyZohoId,
            fluid_option: attendee.fluidOption,
            subtotal,
            add_iv_therapy: addOnName ?? null,
            add_vitamins: vitaminName ?? null
        } as any;

        // Remove empty values
        return Object.fromEntries(
            Object.entries(record).filter(([_, value]) => value !== undefined && value !== null && value !== '')
        );
    });

    console.log('=== END MAPPING (PER ATTENDEE) ===');
    return records;
}