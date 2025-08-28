interface Treatment {
    id: string;
    name: string;
    price: number;
}

interface Vitamin {
    id: string;
    name: string;
    price: number;
}

interface AttendeeWithPricing {
    firstName: string;
    lastName: string;
    treatmentId: string;
    additionalVitaminId?: string;
    fluidOption?: string;
    treatmentName?: string;
    treatmentPrice?: number;
    vitaminName?: string;
    vitaminPrice?: number;
}

interface PricingCalculation {
    attendeeBreakdown: {
        attendeeName: string;
        treatmentName: string;
        treatmentPrice: number;
        vitaminName?: string;
        vitaminPrice?: number;
        attendeeTotal: number;
    }[];
    totalTreatmentCost: number;
    totalVitaminCost: number;
    grandTotal: number;
    currency: string;
}

/**
 * Calculate total pricing for a booking with multiple attendees
 */
export async function calculateBookingPrice(
    attendees: any[],
    treatments: Treatment[],
    vitamins: Vitamin[]
): Promise<PricingCalculation> {
    const currency = 'ZAR'; // South African Rand
    let totalTreatmentCost = 0;
    let totalVitaminCost = 0;

    const attendeeBreakdown = attendees.map((attendee) => {
        // Find treatment details - handle both string and number IDs
        const treatment = treatments.find(t => t.id.toString() === attendee.treatmentId.toString());
        const treatmentName = treatment?.name || `Treatment ${attendee.treatmentId}`;
        const treatmentPrice = treatment?.price || 0;

        // Find vitamin details (optional)
        let vitaminName: string | undefined;
        let vitaminPrice = 0;

        if (attendee.additionalVitaminId) {
            const vitamin = vitamins.find(v => v.id.toString() === attendee.additionalVitaminId.toString());
            vitaminName = vitamin?.name;
            vitaminPrice = vitamin?.price || 0;
        }

        const attendeeTotal = treatmentPrice + vitaminPrice;
        totalTreatmentCost += treatmentPrice;
        totalVitaminCost += vitaminPrice;

        return {
            attendeeName: `${attendee.firstName} ${attendee.lastName}`,
            treatmentName,
            treatmentPrice,
            vitaminName,
            vitaminPrice,
            attendeeTotal
        };
    });

    return {
        attendeeBreakdown,
        totalTreatmentCost,
        totalVitaminCost,
        grandTotal: totalTreatmentCost + totalVitaminCost,
        currency
    };
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currency: string = 'ZAR'): string {
    if (currency === 'ZAR') {
        return `R${amount.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
    return `${currency} ${amount.toFixed(2)}`;
}

/**
 * Generate detailed pricing description for Zoho CRM
 */
export function generatePricingDescription(pricing: PricingCalculation): string {
    let description = '\n--- PRICING BREAKDOWN ---\n';

    pricing.attendeeBreakdown.forEach((attendee, index) => {
        description += `\nAttendee ${index + 1}: ${attendee.attendeeName}\n`;
        description += `  Treatment: ${attendee.treatmentName} - ${formatCurrency(attendee.treatmentPrice)}\n`;

        if (attendee.vitaminName && attendee.vitaminPrice && attendee.vitaminPrice > 0) {
            description += `  Vitamin Add-on: ${attendee.vitaminName} - ${formatCurrency(attendee.vitaminPrice)}\n`;
        }

        description += `  Subtotal: ${formatCurrency(attendee.attendeeTotal)}\n`;
    });

    description += `\n--- TOTALS ---\n`;
    description += `Total Treatments: ${formatCurrency(pricing.totalTreatmentCost)}\n`;
    description += `Total Vitamins: ${formatCurrency(pricing.totalVitaminCost)}\n`;
    description += `GRAND TOTAL: ${formatCurrency(pricing.grandTotal)}\n`;

    return description;
} 