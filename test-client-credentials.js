#!/usr/bin/env node

const https = require('https');
const querystring = require('querystring');

const CLIENT_ID = '1000.1YSY4617U5T2XOO7YND2LKE7YOCBLA';
const CLIENT_SECRET = '5e7776e4df6797e625fd73542a2fa56506c9641156';
const ORG_ID = '884116973';

console.log('🔄 Testing Client Credentials Flow...');
console.log(`Organization ID: ${ORG_ID}`);

// Try URL parameters instead of form data for client credentials
const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'ZohoCRM.modules.ALL,ZohoCRM.settings.ALL',
    soid: `ZohoCRM.${ORG_ID}`
});

const url = `https://accounts.zoho.com/oauth/v2/auth?${params.toString()}`;

console.log('📝 Request URL:');
console.log(url.replace(CLIENT_SECRET, 'HIDDEN'));

const options = {
    hostname: 'accounts.zoho.com',
    port: 443,
    path: `/oauth/v2/auth?${params.toString()}`,
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
    }
};

const req = https.request(options, (res) => {
    console.log(`Status Code: ${res.statusCode}`);
    console.log('Headers:', res.headers);

    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log('\n📝 Raw Response:');
        console.log(data);

        if (data.trim()) {
            try {
                const response = JSON.parse(data);
                console.log('\n📋 Parsed Response:');
                console.log(JSON.stringify(response, null, 2));

                if (response.access_token) {
                    console.log('\n✅ SUCCESS! Client Credentials working!');
                    console.log('\n🔑 Access Token (first 50 chars):', response.access_token.substring(0, 50) + '...');
                    console.log('🌐 API Domain:', response.api_domain);
                    console.log('⏰ Expires in:', response.expires_in, 'seconds (1 hour)');

                    console.log('\n📋 Add to your .env.local (optional):');
                    console.log(`ZOHO_ACCESS_TOKEN=${response.access_token}`);
                    console.log(`ZOHO_API_DOMAIN=${response.api_domain}`);
                } else {
                    console.log('\n❌ FAILED! Error in response:', response);
                }
            } catch (error) {
                console.log('\n❌ Could not parse as JSON');
            }
        } else {
            console.log('\n⚠️ Empty response body');
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Request failed:', error.message);
});

req.end(); 