# Business Branding System

## Overview
This system allows users to store and manage their business logo and signature URLs for use in invoices and quotations. The system integrates with both onboarding and settings pages.

## Features
- ✅ Store logo and signature URLs in database
- ✅ URL validation and preview
- ✅ Onboarding integration
- ✅ Settings page management
- ✅ Automatic fallback to Clerk metadata
- ✅ Invoice and quotation integration
- ✅ Row-level security (RLS)

## Database Setup

### 1. Run SQL in Supabase
Copy and paste the contents of `SUPABASE_BRANDING_SETUP.sql` into your Supabase SQL Editor.

### 2. Table Structure
```sql
CREATE TABLE user_branding (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  logo_url TEXT,
  signature_url TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## Usage

### Onboarding Flow
1. User enters logo URL and signature URL in the branding step
2. URLs are validated and previewed
3. Data is saved to `user_branding` table
4. Both fields are mandatory in onboarding

### Settings Page
1. User can update their branding assets
2. Data from onboarding is automatically loaded
3. Real-time URL validation
4. Optional preview functionality
5. Changes are saved to database

### Invoice/Quotation Integration
1. System fetches branding data from database
2. Falls back to Clerk metadata if database is empty
3. URLs are used in both PDF generation and UI display

## Components

### SimpleBrandingManager
- Located: `src/components/SimpleBrandingManager.tsx`
- Purpose: Settings page branding management
- Features: URL input, validation, preview, save functionality

### BrandingStep
- Located: `src/components/onboarding/BrandingStep.tsx` 
- Purpose: Onboarding branding collection
- Features: Required URL inputs with validation

## Hooks

### useSimpleBranding
- Located: `src/hooks/useSimpleBranding.ts`
- Purpose: Database operations for branding data
- Methods:
  - `updateBranding()` - Save/update branding URLs
  - `getBrandingWithFallback()` - Get data with Clerk fallback

### useEnhancedBusinessData
- Located: `src/hooks/useEnhancedBusinessData.ts`
- Purpose: Integrated business data with branding
- Methods:
  - `getPreferredLogo()` - Get best available logo URL
  - `getPreferredSignature()` - Get best available signature URL

## Data Flow

```
Onboarding → Database → Settings Page
     ↓           ↓           ↓
   BrandingStep → user_branding → SimpleBrandingManager
     ↓           ↓           ↓
   Save URLs → Store URLs → Display/Edit URLs
```

## Integration Points

### Invoice Viewer
- File: `src/components/InvoiceViewer.tsx`
- Uses: `getPreferredLogo()`, `getPreferredSignature()`
- Display: Both PDF generation and UI preview

### Quotation Viewer  
- File: `src/components/QuotationViewer.tsx`
- Uses: `getPreferredLogo()`, `getPreferredSignature()`
- Display: Both PDF generation and UI preview

## URL Requirements

### Logo URLs
- Format: Direct image URLs (https://example.com/logo.png)
- Recommended: PNG or JPG format
- Optimal size: 200x80 pixels
- Usage: Invoice/quotation headers

### Signature URLs
- Format: Direct image URLs (https://example.com/signature.png)
- Recommended: PNG with transparent background  
- Optimal size: 150x60 pixels
- Usage: Document footer signatures

## Error Handling

### URL Validation
- Invalid URLs show error messages
- Save button disabled for invalid URLs
- Preview fails gracefully with fallback

### Database Errors
- Toast notifications for save failures
- Automatic retry mechanism
- Fallback to Clerk metadata

## Testing
Run tests with: `npm test SimpleBrandingManager.test.tsx`

### Test Coverage
- ✅ Save branding URLs successfully
- ✅ Handle empty URL values  
- ✅ Validate URL format correctly
- ✅ Show onboarding data in settings
- ✅ Handle database connection errors

## Security

### Row Level Security (RLS)
- Users can only access their own branding data
- Policies prevent cross-user data access
- Automatic user_id filtering

### Data Validation
- URL format validation on frontend
- Database constraints prevent invalid data
- Sanitization of user inputs

## Troubleshooting

### Common Issues
1. **Logo not showing**: Check if URL is publicly accessible
2. **CORS errors**: Use direct image links, not page URLs  
3. **Save failing**: Check database connection and permissions
4. **Preview not working**: Verify URL format and accessibility

### Debug Steps
1. Check browser network tab for failed requests
2. Verify Supabase RLS policies are active
3. Test URLs directly in browser
4. Check console for error messages

## Future Enhancements
- [ ] File upload support
- [ ] Image optimization
- [ ] Multiple logo variants
- [ ] Bulk asset management
- [ ] Image cropping/editing tools