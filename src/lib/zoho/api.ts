import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { getZohoAccessToken, clearZohoTokenCache } from './auth';

let axiosZoho: AxiosInstance | null = null;

/**
 * Gets an authenticated Zoho API client
 */
export async function getZohoApiClient(): Promise<AxiosInstance> {
    const { token, apiDomain } = await getZohoAccessToken();

    // Create or update the axios instance
    if (!axiosZoho) {
        axiosZoho = axios.create();
    }

    // Set the base URL and auth header
    axiosZoho.defaults.baseURL = apiDomain;
    axiosZoho.defaults.headers.common['Authorization'] = `Zoho-oauthtoken ${token}`;

    // Debug logging
    console.log('Zoho API client configured:');
    console.log('- Base URL:', apiDomain);
    console.log('- Auth header set:', !!axiosZoho.defaults.headers.common['Authorization']);

    // Add request interceptor for debugging
    axiosZoho.interceptors.request.use(
        (config) => {
            const fullUrl = `${config.baseURL}${config.url}`;
            console.log('Making Zoho API request to:', fullUrl);
            return config;
        },
        (error) => {
            console.error('Request interceptor error:', error);
            return Promise.reject(error);
        }
    );

    // Add response interceptor to handle 401s
    axiosZoho.interceptors.response.use(
        (response: AxiosResponse) => {
            console.log('Zoho API response received:', response.status);
            return response;
        },
        async (error: AxiosError) => {
            console.error('Zoho API error:', error.response?.status, error.message);

            if (error.response?.status === 401) {
                console.log('Zoho API returned 401, clearing token cache and retrying...');
                clearZohoTokenCache();

                // Retry the request once with a fresh token
                const { token: newToken, apiDomain: newApiDomain } = await getZohoAccessToken();
                if (error.config) {
                    error.config.baseURL = newApiDomain;
                    error.config.headers = error.config.headers || {};
                    error.config.headers.Authorization = `Zoho-oauthtoken ${newToken}`;

                    console.log('Retrying request with new token to:', `${newApiDomain}${error.config.url}`);
                    return axios.request(error.config);
                }
            }
            return Promise.reject(error);
        }
    );

    return axiosZoho;
} 