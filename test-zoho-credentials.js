#!/usr/bin/env node

/**
 * Simple script to test Zoho CRM credentials
 * Run with: node test-zoho-credentials.js
 */

const https = require('https');
const querystring = require('querystring');

// Load environment variables from .env.local if available
try {
    const fs = require('fs');
    if (fs.existsSync('.env.local')) {
        const envFile = fs.readFileSync('.env.local', 'utf8');
        envFile.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                process.env[key.trim()] = value.trim();
            }
        });
        console.log('✓ Loaded .env.local file');
    }
} catch (error) {
    console.log('⚠ Could not load .env.local file');
}

const clientId = process.env.ZOHO_CLIENT_ID;
const clientSecret = process.env.ZOHO_CLIENT_SECRET;
const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

console.log('\n=== Zoho Credentials Test ===');
console.log('Client ID:', clientId ? '✓ SET' : '✗ MISSING');
console.log('Client Secret:', clientSecret ? '✓ SET' : '✗ MISSING');
console.log('Refresh Token:', refreshToken ? '✓ SET' : '✗ MISSING');

if (!clientId || !clientSecret || !refreshToken) {
    console.log('\n❌ Missing credentials in .env.local file');
    console.log('Please add:');
    console.log('ZOHO_CLIENT_ID=your_client_id');
    console.log('ZOHO_CLIENT_SECRET=your_client_secret');
    console.log('ZOHO_REFRESH_TOKEN=your_refresh_token');
    process.exit(1);
}

// Test token refresh
const postData = querystring.stringify({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken
});

const options = {
    hostname: 'accounts.zoho.com',
    port: 443,
    path: '/oauth/v2/token',
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
    }
};

console.log('\n🔄 Testing token refresh...');

const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('Status Code:', res.statusCode);

        try {
            const response = JSON.parse(data);

            if (res.statusCode === 200 && response.access_token) {
                console.log('✅ SUCCESS! Token refresh worked');
                console.log('Access Token:', response.access_token.substring(0, 20) + '...');
                console.log('API Domain:', response.api_domain || 'Not provided (will use default)');
                console.log('Expires in:', response.expires_in, 'seconds');
                console.log('\n🎉 Your Zoho credentials are working correctly!');
                console.log('You can now use the field metadata API.');
            } else {
                console.log('❌ FAILED! Token refresh failed');
                console.log('Response:', JSON.stringify(response, null, 2));

                if (response.error) {
                    console.log('\nCommon fixes:');
                    if (response.error === 'invalid_client') {
                        console.log('- Check your Client ID and Client Secret');
                    } else if (response.error === 'invalid_grant') {
                        console.log('- Your refresh token may be expired or invalid');
                        console.log('- Generate a new refresh token');
                    }
                }
            }
        } catch (error) {
            console.log('❌ Invalid JSON response:', data);
        }
    });
});

req.on('error', (error) => {
    console.log('❌ Request failed:', error.message);
});

req.write(postData);
req.end(); 