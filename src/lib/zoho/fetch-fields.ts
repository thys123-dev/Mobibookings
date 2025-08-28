import { getZohoModuleFields, getSubformFields, filterRelevantFields, printFieldsForCopying } from './field-metadata';

/**
 * Main function to fetch and display Zoho field metadata
 * Run this to get the field API names you need for your integration
 */
export async function fetchZohoFieldsForBookingIntegration() {
    console.log('🔍 Fetching Zoho CRM field metadata for booking integration...\n');

    try {
        // Based on your payload, you'll likely need these modules:
        const modulesToFetch = [
            'Appointments', // or 'Appointments__s' if custom
            'Contacts',
            'Leads',
            'Products', // for IV treatments and vitamins
            'Services' // if you use this for treatments
        ];

        console.log('📋 Fetching fields for modules:', modulesToFetch.join(', '));

        for (const moduleApiName of modulesToFetch) {
            try {
                console.log(`\n🔄 Processing ${moduleApiName}...`);

                const allFields = await getZohoModuleFields(moduleApiName);
                const relevantFields = filterRelevantFields(allFields);

                console.log(`Found ${allFields.length} total fields, ${relevantFields.length} relevant for booking integration`);

                printFieldsForCopying(relevantFields, moduleApiName);

                // Check for subforms (important for line items like vitamins/treatments)
                const subformFields = allFields.filter(field => field.subform);
                if (subformFields.length > 0) {
                    console.log(`\n📋 Found ${subformFields.length} subform field(s) in ${moduleApiName}:`);

                    for (const subformField of subformFields) {
                        console.log(`\n--- SUBFORM: ${subformField.api_name} (${subformField.field_label}) ---`);
                        try {
                            const subFields = await getSubformFields(moduleApiName, subformField.api_name);
                            printFieldsForCopying(subFields, `${moduleApiName}.${subformField.api_name}`);
                        } catch (error) {
                            console.error(`Failed to fetch subform fields: ${error}`);
                        }
                    }
                }

            } catch (error: any) {
                console.error(`❌ Failed to fetch fields for ${moduleApiName}:`, error.message);
            }
        }

        console.log('\n✅ Field metadata fetch complete!');
        console.log('\n💡 Next Steps:');
        console.log('1. Copy the field API names from the output above');
        console.log('2. Update your payload mapping with the correct field names');
        console.log('3. Test with a small payload first');

    } catch (error: any) {
        console.error('❌ Error fetching Zoho field metadata:', error.message);
        throw error;
    }
}

// Helper function to test a specific module
export async function testModuleFields(moduleApiName: string, showAllFields = false) {
    try {
        console.log(`🧪 Testing fields for ${moduleApiName}...`);

        const fields = await getZohoModuleFields(moduleApiName);
        const fieldsToShow = showAllFields ? fields : filterRelevantFields(fields);

        printFieldsForCopying(fieldsToShow, moduleApiName);

        return fieldsToShow;
    } catch (error: any) {
        console.error(`❌ Test failed for ${moduleApiName}:`, error.message);
        throw error;
    }
} 