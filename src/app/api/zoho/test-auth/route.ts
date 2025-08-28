import { NextResponse } from 'next/server';
import { getZohoAccessToken } from '@/lib/zoho/auth';

export async function GET() {
    try {
        console.log('=== Testing Zoho Authentication ===');

        // Test environment variables
        const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
        const clientId = process.env.ZOHO_CLIENT_ID;
        const clientSecret = process.env.ZOHO_CLIENT_SECRET;

        const envStatus = {
            ZOHO_CLIENT_ID: clientId ? 'SET' : 'MISSING',
            ZOHO_CLIENT_SECRET: clientSecret ? 'SET' : 'MISSING',
            ZOHO_REFRESH_TOKEN: refreshToken ? 'SET' : 'MISSING',
        };

        console.log('Environment variables:', envStatus);

        if (!refreshToken || !clientId || !clientSecret) {
            return NextResponse.json({
                success: false,
                error: 'Missing environment variables',
                env_status: envStatus,
                message: 'Please check your .env.local file and ensure ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REFRESH_TOKEN are set.'
            }, { status: 400 });
        }

        // Test token acquisition
        const { token, apiDomain } = await getZohoAccessToken();

        return NextResponse.json({
            success: true,
            message: 'Zoho authentication successful',
            data: {
                has_token: !!token,
                token_length: token.length,
                api_domain: apiDomain,
                env_status: envStatus
            }
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        console.error('Zoho auth test failed:', errorMessage);

        return NextResponse.json({
            success: false,
            error: 'Authentication failed',
            details: errorMessage,
            message: 'Check the server logs for more details'
        }, { status: 500 });
    }
} 