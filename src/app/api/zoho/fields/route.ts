import { NextRequest, NextResponse } from 'next/server';
import { getZohoModuleFields, getSubformFields, filterRelevantFields } from '@/lib/zoho/field-metadata';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const moduleParam = searchParams.get('module');
        const subform = searchParams.get('subform');
        const showAll = searchParams.get('all') === 'true';

        if (!moduleParam) {
            return NextResponse.json({ error: 'Module parameter is required' }, { status: 400 });
        }

        let fields;

        if (subform) {
            // Fetch subform fields
            fields = await getSubformFields(moduleParam, subform);
        } else {
            // Fetch module fields
            const allFields = await getZohoModuleFields(moduleParam);
            fields = showAll ? allFields : filterRelevantFields(allFields);
        }

        // Format for easy copying
        const fieldMapping = fields.reduce((acc, field) => {
            const key = field.api_name.toLowerCase().replace(/[^a-z0-9]/g, '_');
            acc[key] = field.api_name;
            return acc;
        }, {} as Record<string, string>);

        return NextResponse.json({
            module: moduleParam,
            subform,
            total_fields: fields.length,
            fields: fields.map(field => ({
                api_name: field.api_name,
                label: field.field_label,
                type: field.data_type,
                required: field.required || false,
                custom: field.custom_field || false,
                has_subform: !!field.subform,
                subform_module: field.subform?.module
            })),
            field_mapping: fieldMapping,
            copy_paste_object: `const ${moduleParam.toUpperCase()}_FIELDS = ${JSON.stringify(fieldMapping, null, 2)};`
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error fetching Zoho fields:', errorMessage);
        return NextResponse.json({
            error: 'Failed to fetch field metadata',
            details: errorMessage
        }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const { modules, includeSubforms = true } = await request.json();

        if (!Array.isArray(modules)) {
            return NextResponse.json({ error: 'modules must be an array' }, { status: 400 });
        }

        const results: Record<string, any> = {};

        for (const moduleApiName of modules) {
            try {
                const allFields = await getZohoModuleFields(moduleApiName);
                const relevantFields = filterRelevantFields(allFields);

                results[moduleApiName] = {
                    total_fields: allFields.length,
                    relevant_fields: relevantFields.length,
                    fields: relevantFields.map(field => ({
                        api_name: field.api_name,
                        label: field.field_label,
                        type: field.data_type,
                        required: field.required || false,
                        custom: field.custom_field || false,
                    })),
                    field_mapping: relevantFields.reduce((acc, field) => {
                        const key = field.api_name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                        acc[key] = field.api_name;
                        return acc;
                    }, {} as Record<string, string>)
                };

                // Find subforms if requested
                if (includeSubforms) {
                    const subformFields = allFields.filter(field => field.subform);
                    if (subformFields.length > 0) {
                        results[moduleApiName].subforms = {};

                        for (const subformField of subformFields) {
                            try {
                                const subFields = await getSubformFields(moduleApiName, subformField.api_name);
                                results[moduleApiName].subforms[subformField.api_name] = {
                                    subform_module: subformField.subform?.module,
                                    fields: subFields.map(field => ({
                                        api_name: field.api_name,
                                        label: field.field_label,
                                        type: field.data_type,
                                        required: field.required || false,
                                    })),
                                    field_mapping: subFields.reduce((acc, field) => {
                                        const key = field.api_name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                                        acc[key] = field.api_name;
                                        return acc;
                                    }, {} as Record<string, string>)
                                };
                            } catch (error) {
                                console.error(`Failed to fetch subform ${subformField.api_name}:`, error);
                            }
                        }
                    }
                }

            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`Failed to fetch ${moduleApiName}:`, errorMessage);
                results[moduleApiName] = { error: errorMessage };
            }
        }

        return NextResponse.json(results);

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error processing batch field request:', errorMessage);
        return NextResponse.json({
            error: 'Failed to process request',
            details: errorMessage
        }, { status: 500 });
    }
} 