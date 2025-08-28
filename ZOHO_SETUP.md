# Zoho CRM Integration Setup

## Environment Variables

Add these to your `.env.local` file:

```env
# Zoho CRM API Configuration
ZOHO_CLIENT_ID=your_zoho_client_id_here
ZOHO_CLIENT_SECRET=your_zoho_client_secret_here
ZOHO_REFRESH_TOKEN=your_zoho_refresh_token_here
```

## Getting Zoho Credentials

### 1. Create a Connected App

1. Go to [Zoho API Console](https://api-console.zoho.com/)
2. Click "Create Client"
3. Choose "Self Client" for development or "Server-based Application" for production
4. Note down your `Client ID` and `Client Secret`

### 2. Generate Refresh Token

1. Use the Zoho OAuth 2.0 playground or create a simple authorization flow
2. Use these scopes: `ZohoCRM.modules.ALL,ZohoCRM.settings.ALL`
3. Exchange the authorization code for access and refresh tokens
4. Save the refresh token (it doesn't expire)

## Testing the Integration

### 1. Start your development server

```bash
npm run dev
```

### 2. Test field metadata fetching

```bash
# Get fields for Appointments module
curl "http://localhost:3000/api/zoho/fields?module=Appointments"

# Get all fields (not just relevant ones)
curl "http://localhost:3000/api/zoho/fields?module=Appointments&all=true"

# Batch request for multiple modules
curl -X POST "http://localhost:3000/api/zoho/fields" \
  -H "Content-Type: application/json" \
  -d '{"modules": ["Appointments", "Contacts", "Products"]}'
```

### 3. Common Modules for IV Therapy Booking

- `Appointments` or `Appointments__s` (if custom)
- `Contacts` - for customer information
- `Products` - for IV treatments and vitamins
- `Services` - if you use this for treatments

## Troubleshooting

### Invalid Credentials Error
- Check that all three environment variables are set correctly
- Verify your refresh token hasn't been revoked
- Ensure your app has the required scopes

### Module Not Found Error
- Check if the module name is correct (case-sensitive)
- Some custom modules might have `__s` suffix
- Use the exact API name from Zoho CRM

### Permission Errors
- Verify your OAuth app has the required scopes
- Check if your Zoho CRM user has access to the module
- Ensure the refresh token was generated with sufficient permissions

## Next Steps

1. Run the field metadata fetcher to get actual field names
2. Map your booking form fields to Zoho field API names
3. Create the payload transformation functions
4. Test with small data payloads first 

node test-zoho-credentials.js 