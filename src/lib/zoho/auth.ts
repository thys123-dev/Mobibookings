import axios, { AxiosResponse } from 'axios';

interface ZohoTokenResponse {
    access_token: string;
    expires_in: number;
    api_domain?: string; // Make this optional since it might not always be present
    token_type: string;
    scope: string;
}

interface CachedToken {
    access_token: string;
    expires_at: number;
    api_domain: string;
}

// In-memory cache for the access token
let tokenCache: CachedToken | null = null;

/**
 * Gets a valid Zoho access token, refreshing if necessary
 */
export async function getZohoAccessToken(): Promise<{ token: string; apiDomain: string }> {
    // Check if we have a valid cached token
    if (tokenCache && Date.now() < tokenCache.expires_at) {
        console.log('Using cached token, API domain:', tokenCache.api_domain);
        return {
            token: tokenCache.access_token,
            apiDomain: tokenCache.api_domain
        };
    }

    // Need to refresh the token
    const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
    const clientId = process.env.ZOHO_CLIENT_ID;
    const clientSecret = process.env.ZOHO_CLIENT_SECRET;

    // Debug: Check if environment variables are set
    console.log('Environment variables check:');
    console.log('- ZOHO_CLIENT_ID:', clientId ? 'SET' : 'MISSING');
    console.log('- ZOHO_CLIENT_SECRET:', clientSecret ? 'SET' : 'MISSING');
    console.log('- ZOHO_REFRESH_TOKEN:', refreshToken ? 'SET' : 'MISSING');

    if (!refreshToken || !clientId || !clientSecret) {
        throw new Error('Missing Zoho OAuth credentials in environment variables. Please set ZOHO_REFRESH_TOKEN, ZOHO_CLIENT_ID, and ZOHO_CLIENT_SECRET.');
    }

    try {
        console.log('Making token refresh request to Zoho...');

        const response: AxiosResponse<ZohoTokenResponse> = await axios.post(
            'https://accounts.zoho.com/oauth/v2/token',
            null,
            {
                params: {
                    refresh_token: refreshToken,
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'refresh_token'
                },
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        console.log('Token response received:', {
            hasAccessToken: !!response.data.access_token,
            expiresIn: response.data.expires_in,
            apiDomain: response.data.api_domain,
            tokenType: response.data.token_type,
            scope: response.data.scope
        });

        const { access_token, expires_in, api_domain } = response.data;

        if (!access_token) {
            throw new Error('No access token received from Zoho');
        }

        // Handle missing or invalid api_domain
        let normalizedDomain: string;
        if (api_domain && typeof api_domain === 'string') {
            normalizedDomain = api_domain.startsWith('http') ? api_domain : `https://${api_domain}`;
            console.log('Using API domain from response:', normalizedDomain);
        } else {
            // Fallback to default domain if api_domain is not provided
            normalizedDomain = 'https://www.zohoapis.com';
            console.log('API domain not provided in response, using fallback:', normalizedDomain);
        }

        // Cache the token (subtract 60 seconds for safety margin)
        tokenCache = {
            access_token,
            expires_at: Date.now() + (expires_in - 60) * 1000,
            api_domain: normalizedDomain
        };

        console.log('Zoho access token refreshed successfully');

        return {
            token: access_token,
            apiDomain: normalizedDomain
        };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const axiosError = axios.isAxiosError(error) ? error.response?.data : null;

        console.error('Failed to refresh Zoho access token:', {
            error: errorMessage,
            axiosError,
            status: axios.isAxiosError(error) ? error.response?.status : 'unknown'
        });

        throw new Error(`Failed to authenticate with Zoho CRM: ${axiosError?.error || errorMessage}`);
    }
}

/**
 * Clears the cached token (useful for handling 401 errors)
 */
export function clearZohoTokenCache(): void {
    tokenCache = null;
} 