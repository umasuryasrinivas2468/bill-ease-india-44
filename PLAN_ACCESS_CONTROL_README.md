# Plan-Based Access Control System

This document explains the implementation of the plan-based access control system that restricts features based on user subscription tiers.

## Overview

The system restricts access to premium features for starter plan users while providing full access to growth and scale plan users. The restrictions are enforced at both the routing level and the UI level.

## Plan Types and Feature Access

### Starter Plan
**Restricted Features:**
- Loans
- Virtual CFO (AI Tax Advisor)
- Cash Flow Forecasting
- Sales Orders
- Purchase Orders

**Available Features:**
- Invoices
- Clients
- Business Reports (Performance Reports)
- Basic Reports (Receivables/Payables)
- Banking
- Dashboard
- Quotations
- Settings

### Growth & Scale Plans
- Full access to all features
- No restrictions

## Database Schema

The plan information is stored in the `license` table:

```sql
CREATE TABLE license (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    license_key VARCHAR(20) UNIQUE NOT NULL,
    plan_type VARCHAR(10) NOT NULL CHECK (plan_type IN ('starter', 'growth', 'scale')),
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Implementation Components

### 1. useUserPlan Hook (`src/hooks/useUserPlan.ts`)

Central hook for managing plan-based access control:

```typescript
const { planType, userLicense, features, isLoading, error } = useUserPlan();
```

**Features:**
- Fetches user license from database based on Clerk email
- Validates license expiration
- Returns feature access matrix
- Handles loading states and errors

### 2. withPlanAccess HOC (`src/components/withPlanAccess.tsx`)

Higher-order component for protecting entire routes:

```typescript
const PlanRestrictedComponent = createPlanRestrictedRoute(
  Component, 
  'featureName', 
  'Feature Display Name',
  'Feature description'
);
```

**Features:**
- Wraps components to check plan access
- Shows upgrade prompt for restricted features
- Handles loading and error states

### 3. PlanAwareMenuItem (`src/components/PlanAwareMenuItem.tsx`)

Component for conditionally rendering menu items:

```typescript
<PlanAwareMenuItem
  title="Feature Name"
  url="/feature-url"
  icon={FeatureIcon}
  feature="featureKey"
  className="nav-classes"
/>
```

**Features:**
- Shows/hides menu items based on plan access
- Displays lock icon for restricted features
- Provides upgrade tooltips

### 4. FeatureUpgradePrompt (`src/components/FeatureUpgradePrompt.tsx`)

Upgrade prompt shown when users try to access restricted features:

**Features:**
- Plan comparison cards
- Feature lists for each plan
- Direct payment links to Cashfree
- Professional upgrade messaging

## Route Protection

Protected routes are defined in `App.tsx`:

```typescript
// Original route
<Route path="/loans" element={<Loans />} />

// Plan-restricted route
<Route path="/loans" element={<PlanRestrictedLoans />} />
```

## Menu Integration

The sidebar (`AppSidebar.tsx`) uses plan-aware components:

```typescript
<PlanAwareMenuItem
  title="Loans"
  url="/loans"
  icon={HandCoins}
  feature="loans"
  className={getNavCls('/loans')}
/>
```

## Testing

### Test Data
Use `database/sample_license_data.sql` to insert test users with different plan types.

### Test Page
Visit `/plan-test` to view current plan status and feature access matrix.

### Test Users
- `starter1@example.com` - Starter plan (restricted access)
- `growth1@example.com` - Growth plan (full access)
- `scale1@example.com` - Scale plan (full access)

## Error Handling

The system handles various error scenarios:

1. **No License Found**: Shows "No license found" error
2. **Expired License**: Shows "License expired" error
3. **Database Errors**: Shows generic error message
4. **Loading States**: Shows loading spinners

## Upgrade Flow

When starter users try to access restricted features:

1. Route is blocked by `withPlanAccess` HOC
2. `FeatureUpgradePrompt` is displayed
3. User sees plan comparison
4. Direct links to Cashfree payment gateway
5. After upgrade, feature access is immediately available

## Configuration

Feature access is configured in `PLAN_FEATURES` object in `useUserPlan.ts`:

```typescript
const PLAN_FEATURES = {
  starter: {
    loans: false,
    performanceReports: false,
    // ... other features
  },
  growth: {
    // All features: true
  },
  scale: {
    // All features: true
  }
};
```

## Best Practices

1. **Always use hooks**: Use `useUserPlan()` and `useFeatureAccess()` for plan checks
2. **Protect at route level**: Use `withPlanAccess` for entire pages
3. **Hide UI elements**: Use `PlanAwareMenuItem` for navigation
4. **Handle loading states**: Always show loading indicators
5. **Graceful degradation**: Provide meaningful error messages
6. **Test thoroughly**: Test with different plan types

## License Expiry Management

### Expiry Detection
The system monitors license expiry dates and enforces strict access control:

- **Expired License**: Complete access blocked - user redirected to renewal page
- **Expiry Day**: Shows non-dismissible popup continuously until license is renewed
- **Valid License**: No restrictions or popups

### Continuous Popup Behavior
- Popup shows every time user opens/refreshes app on expiry day
- Popup remains until expiry date is actually updated in database
- No localStorage caching - real-time database check
- Users must renew or extend license to remove popup

### Expiry Handling
- **Expiry Day**: Non-dismissible popup shown continuously until database is updated
- **After Expiry**: Complete app access blocked with dedicated renewal page
- **Popup cannot be bypassed**: No close button, no escape key, no outside click
- **Persistent until resolved**: Shows every app session until license renewed
- "Renew License" button → redirects to https://www.aczen.in/pricing
- "Extend License" option for existing users
- "Check License Status" for users who renewed externally
- Email-based license extension (+1 month from current date)

### License Extension
Users can extend any existing license by:
1. Entering the email associated with any plan (starter, growth, scale)
2. System automatically extends expiry by +1 month from current date
3. Works for all plan types

### Components
- `LicenseExpiryManager`: Main component that monitors expiry status
- `LicenseExpiryPopup`: Modal dialog for expiry notifications
- Updated `useUserPlan`: Includes expiry detection logic

## Future Enhancements

1. **Feature Flags**: Add dynamic feature toggling
2. **Usage Limits**: Add usage-based restrictions
3. **Trial Periods**: Add trial period handling
4. **Plan Upgrades**: Add in-app plan upgrade flow
5. **Analytics**: Track feature access attempts
6. **A/B Testing**: Test different upgrade flows
7. **Email Notifications**: Send expiry reminders via email
8. **Grace Period**: Allow limited access after expiry