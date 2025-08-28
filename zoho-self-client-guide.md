# Zoho Self Client Token Generation

## 🎯 Quick Solution: Generate Grant Token via Self Client

Since the Client Credentials flow is redirecting to login, let's use the **Self Client** method to generate a grant token directly from Zoho Developer Console.

### Step 1: Go to Zoho Developer Console

1. Open: https://api-console.zoho.com/
2. Login with your Zoho account

### Step 2: Generate Grant Token

1. **Select your existing client** or create a new Self Client
2. Click on **"Generate Code"** tab
3. **Enter scopes**: `ZohoCRM.modules.ALL,ZohoCRM.settings.ALL`
4. **Select time duration**: Choose 10 minutes or more
5. **Enter description**: "Field metadata testing"
6. **Click Create**
7. **Select your organization**: Choose `Thys van Zyl (Org ID: 884116973)`
8. **Copy the grant token** (it looks like: `1000.abcd1234.efgh5678`)

### Step 3: Exchange Grant Token for Access Token

Once you have the grant token, run this command (replace `YOUR_GRANT_TOKEN_HERE`):

```bash
curl -X POST "https://accounts.zoho.com/oauth/v2/token" \
  -d "grant_type=authorization_code" \
  -d "client_id=1000.1YSY4617U5T2XOO7YND2LKE7YOCBLA" \
  -d "client_secret=5e7776e4df6797e625fd73542a2fa56506c9641156" \
  -d "redirect_uri=https://developer.zoho.com/" \
  -d "code=YOUR_GRANT_TOKEN_HERE"
```

### Step 4: Test the Field Metadata API

Once you have the access token, we can immediately test:

```bash
curl -H "Authorization: Zoho-oauthtoken YOUR_ACCESS_TOKEN" \
  "https://www.zohoapis.com/crm/v7/settings/fields?module=Appointments"
```

## 🚀 This will give us:

✅ **Working access token** for immediate testing  
✅ **New refresh token** for long-term use  
✅ **API domain** for making requests  
✅ **Field metadata** to build your booking system  

## ⏱️ Important Notes:

- Grant tokens expire quickly (10 minutes max)
- Exchange it for access/refresh tokens immediately
- Access tokens last 1 hour
- Refresh tokens don't expire

---

**Ready to proceed?** Get your grant token from the Developer Console and we'll exchange it for working credentials! 