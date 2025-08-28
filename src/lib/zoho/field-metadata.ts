import { getZohoApiClient } from './api';

export interface ZohoField {
    api_name: string;
    display_label: string;
    data_type: string;
    field_label: string;
    length?: number;
    required?: boolean;
    custom_field?: boolean;
    lookup?: {
        module: string;
        display_label: string;
    };
    subform?: {
        module: string;
        tab_label: string;
    };
    pick_list_values?: Array<{
        display_value: string;
        actual_value: string;
    }>;
}

export interface ZohoModule {
    api_name: string;
    module_name: string;
    fields: ZohoField[];
}

/**
 * Fetches field metadata for a specific Zoho module
 */
export async function getZohoModuleFields(moduleApiName: string): Promise<ZohoField[]> {
    try {
        const client = await getZohoApiClient();

        console.log(`Fetching field metadata for module: ${moduleApiName}`);

        const response = await client.get(`/crm/v7/settings/fields?module=${moduleApiName}`);

        if (!response.data?.fields) {
            throw new Error(`No fields found for module ${moduleApiName}`);
        }

        const fields: ZohoField[] = response.data.fields;
        console.log(`Retrieved ${fields.length} fields for ${moduleApiName}`);

        return fields;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error fetching fields for ${moduleApiName}:`, errorMessage);
        throw error;
    }
}

/**
 * Fetches field metadata for multiple modules
 */
export async function getZohoMultipleModuleFields(moduleApiNames: string[]): Promise<Record<string, ZohoField[]>> {
    const result: Record<string, ZohoField[]> = {};

    for (const moduleApiName of moduleApiNames) {
        try {
            result[moduleApiName] = await getZohoModuleFields(moduleApiName);
        } catch (error) {
            console.error(`Failed to fetch fields for ${moduleApiName}:`, error);
            result[moduleApiName] = [];
        }
    }

    return result;
}

/**
 * Filters fields to show only the ones we typically need for booking integration
 */
export function filterRelevantFields(fields: ZohoField[]): ZohoField[] {
    return fields.filter(field => {
        // Include custom fields, required fields, and common booking-related fields
        const isCustom = field.custom_field;
        const isRequired = field.required;
        const isBookingRelated = [
            'email', 'phone', 'name', 'first_name', 'last_name', 'address',
            'appointment', 'service', 'treatment', 'date', 'time', 'price',
            'location', 'notes', 'status', 'subject', 'description'
        ].some(keyword =>
            field.api_name.toLowerCase().includes(keyword) ||
            field.field_label.toLowerCase().includes(keyword)
        );

        return isCustom || isRequired || isBookingRelated;
    });
}

/**
 * Gets subform fields for a parent field
 */
export async function getSubformFields(moduleApiName: string, subformFieldApiName: string): Promise<ZohoField[]> {
    try {
        const client = await getZohoApiClient();

        console.log(`Fetching subform fields for ${moduleApiName}.${subformFieldApiName}`);

        const response = await client.get(`/crm/v7/settings/fields?module=${moduleApiName}`);

        if (!response.data?.fields) {
            throw new Error(`No fields found for module ${moduleApiName}`);
        }

        // Find the subform field
        const subformField = response.data.fields.find((field: ZohoField) =>
            field.api_name === subformFieldApiName && field.subform
        );

        if (!subformField?.subform) {
            throw new Error(`Subform field ${subformFieldApiName} not found in ${moduleApiName}`);
        }

        // Get the subform module fields
        const subformModuleApiName = subformField.subform.module;
        return await getZohoModuleFields(subformModuleApiName);

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error fetching subform fields:`, errorMessage);
        throw error;
    }
}

/**
 * Pretty prints field information for easy copying
 */
export function printFieldsForCopying(fields: ZohoField[], moduleName: string): void {
    console.log(`\n=== ${moduleName.toUpperCase()} MODULE FIELDS ===`);
    console.log('API Name\t\t\tLabel\t\t\tType\t\tRequired');
    console.log('-'.repeat(80));

    fields.forEach(field => {
        const apiName = field.api_name.padEnd(24);
        const label = field.field_label.substring(0, 20).padEnd(20);
        const dataType = field.data_type.padEnd(12);
        const required = field.required ? 'YES' : 'NO';

        console.log(`${apiName}\t${label}\t${dataType}\t${required}`);
    });

    console.log('\n=== FOR COPY-PASTE ===');
    console.log('const FIELD_API_NAMES = {');
    fields.forEach(field => {
        const key = field.api_name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        console.log(`  ${key}: '${field.api_name}',`);
    });
    console.log('};');
} 