/**
 * Development script to fetch Zoho field metadata
 * Run with: npx tsx scripts/fetch-zoho-fields.ts
 */

import { fetchZohoFieldsForBookingIntegration, testModuleFields } from '../src/lib/zoho/fetch-fields';

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Usage: npx tsx scripts/fetch-zoho-fields.ts [options]

Options:
  --module <name>    Test a specific module (e.g., Appointments, Contacts)
  --all             Show all fields, not just relevant ones
  --help, -h        Show this help message

Examples:
  npx tsx scripts/fetch-zoho-fields.ts
  npx tsx scripts/fetch-zoho-fields.ts --module Appointments
  npx tsx scripts/fetch-zoho-fields.ts --module Contacts --all
    `);
        return;
    }

    const moduleIndex = args.indexOf('--module');
    const showAll = args.includes('--all');

    try {
        if (moduleIndex !== -1 && args[moduleIndex + 1]) {
            const moduleName = args[moduleIndex + 1];
            await testModuleFields(moduleName, showAll);
        } else {
            await fetchZohoFieldsForBookingIntegration();
        }
    } catch (error) {
        console.error('Script failed:', error);
        process.exit(1);
    }
}

main(); 