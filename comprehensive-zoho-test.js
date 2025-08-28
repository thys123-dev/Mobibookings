#!/usr/bin/env node

/**
 * Comprehensive Zoho CRM credentials test
 * Tests multiple authentication methods and domains
 */

const https = require('https');
const querystring = require('querystring');

// Load environment variables
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

console.log('\n=== Comprehensive Zoho Test ===');
console.log('Client ID:', clientId ? '✓ SET' : '❌ MISSING');
console.log('Client Secret:', clientSecret ? '✓ SET' : '❌ MISSING');
console.log('Refresh Token:', refreshToken ? '✓ SET' : '❌ MISSING');

if (!clientId || !clientSecret || !refreshToken) {
    console.log('\n❌ Missing credentials in .env.local file');
    process.exit(1);
}

// Test domains
const domains = [
    'https://accounts.zoho.com',      // US
    'https://accounts.zoho.eu',       // EU
    'https://accounts.zoho.com.au',   // AU
    'https://accounts.zoho.in',       // IN
    'https://accounts.zoho.com.cn',   // CN
    'https://accounts.zoho.jp',       // JP
    'https://accounts.zohocloud.ca'   // CA
];

async function testRefreshToken(domain) {
    return new Promise((resolve) => {
        const postData = querystring.stringify({
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token'
        });

        const url = new URL(domain + '/oauth/v2/token');

        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    resolve({
                        domain,
                        status: res.statusCode,
                        success: !!response.access_token,
                        response
                    });
                } catch (error) {
                    resolve({
                        domain,
                        status: res.statusCode,
                        success: false,
                        response: { error: 'Invalid JSON response', data }
                    });
                }
            });
        });

        req.on('error', (error) => {
            resolve({
                domain,
                status: 0,
                success: false,
                response: { error: error.message }
            });
        });

        req.write(postData);
        req.end();
    });
}

async function testAllDomains() {
    console.log('\n🔄 Testing refresh token across all Zoho domains...\n');

    for (const domain of domains) {
        process.stdout.write(`Testing ${domain}... `);
        const result = await testRefreshToken(domain);

        if (result.success) {
            console.log('✅ SUCCESS!');
            console.log(`🎉 Found working domain: ${domain}`);
            console.log('Response:', JSON.stringify(result.response, null, 2));
            console.log('\n✅ Update your auth.ts file to use this domain:');
            console.log(`const ZOHO_ACCOUNTS_URL = '${domain}';`);
            return;
        } else {
            if (result.response.error === 'invalid_client') {
                console.log('❌ Invalid client (wrong domain)');
            } else if (result.response.error === 'invalid_code') {
                console.log('❌ Invalid refresh token');
            } else {
                console.log(`❌ Error: ${result.response.error || 'Unknown'}`);
            }
        }
    }

    console.log('\n❌ Refresh token failed on all domains');
    console.log('\n🔍 This suggests the refresh token might be:');
    console.log('   1. Revoked or expired');
    console.log('   2. Generated with different client credentials');
    console.log('   3. Generated with a different redirect URI');
    console.log('\n💡 Solutions:');
    console.log('   1. Generate a new refresh token');
    console.log('   2. Try the Client Credentials flow (need your Org ID)');
    console.log('   3. Check your Connected App settings in Zoho');
}

// Run the test
testAllDomains(); 