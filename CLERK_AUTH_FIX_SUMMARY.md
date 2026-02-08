# Clerk Authentication Fix for TDS & Expenses Modules

## Problem
The application was showing "User not authenticated" errors when saving TDS rules and transactions because the hooks were using `useSupabaseUser` which relied on a `users` table lookup that wasn't properly synced with Clerk authentication.

## Solution Implemented

### 1. **Updated Supabase Client Configuration**
- **File**: `src/lib/supabase.ts`
- Already configured with `supabaseAuthFetch` function that automatically attaches Clerk JWT tokens to all Supabase requests
- Uses Clerk's `getToken({ template: 'supabase' })` to fetch the JWT

### 2. **Updated TDS Hooks to Use Clerk Directly**

#### Updated Files:
- `src/hooks/useTDSRules.ts`
- `src/hooks/useTDSTransactions.ts`
- `src/hooks/useTDSMaster.ts`

#### Changes Made:
```typescript
// BEFORE (using useSupabaseUser - unreliable)
const { supabaseUser } = useSupabaseUser();
if (!supabaseUser?.id) throw new Error('User not authenticated');

// AFTER (using Clerk directly - reliable)
const { user } = useUser(); // from @clerk/clerk-react
if (!user || !isValidUserId(user.id)) {
  throw new Error('User not authenticated or invalid user ID');
}
const normalizedUserId = normalizeUserId(user.id);
```

### 3. **How Authentication Works Now**

**Frontend Flow:**
1. User logs in via Clerk
2. Clerk provides JWT token via `useUser()` hook
3. When making Supabase queries, the token is automatically attached via `supabaseAuthFetch`

**Token Injection Process** (`src/lib/supabaseAuthFetch.ts`):
```typescript
export async function supabaseAuthFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers || {});
  const clerk = (window as any)?.Clerk;
  
  if (clerk?.session?.getToken) {
    const token = await clerk.session.getToken({ template: 'supabase' });
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }
  
  return fetch(input, { ...init, headers });
}
```

**Supabase RLS Policies:**
All TDS and Expenses tables use RLS policies that check:
```sql
user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
```

This extracts the user ID from the JWT token and ensures users can only access their own data.

### 4. **Expenses Module Database Connection**

The expenses module (`src/hooks/useExpenses.ts`) already has proper database connection:

#### Features:
- ✅ **Full CRUD operations**: Create, Read, Update, Delete expenses
- ✅ **Vendor management**: Create and manage vendors with TDS integration
- ✅ **Expense categories**: Create and manage expense categories
- ✅ **Advanced filtering**: By date, category, vendor, payment mode, status, search term
- ✅ **Statistics & Analytics**: Total expenses, tax amounts, category breakdown, payment mode breakdown, monthly trends
- ✅ **Auto TDS calculation**: Automatically creates TDS transactions when vendors have TDS enabled
- ✅ **Ledger posting**: Automatically posts expenses to accounting journals

#### Database Tables Used:
- `expenses` - Main expense records
- `expense_categories` - Expense categorization
- `vendors` - Vendor information with TDS settings
- `tds_transactions` - Automatic TDS deductions linked to expenses
- `journals` & `journal_lines` - Accounting entries

### 5. **User ID Normalization**

Uses `normalizeUserId` and `isValidUserId` functions from `src/lib/userUtils.ts` to:
- Ensure consistent user ID format across the app
- Validate user IDs before database operations
- Handle edge cases in user identification

## Testing the Fix

### Test TDS Rules Creation:
1. Log in with Clerk
2. Navigate to `/reports/tds`
3. Click "Add TDS Rule" 
4. Fill in category and rate
5. Save - should now work without "User not authenticated" error

### Test Expenses:
1. Navigate to `/expenses`
2. Click "Add Expense"
3. Fill in expense details
4. Save - should create expense and auto-calculate TDS if vendor has TDS enabled

## Security Features

1. **Row-Level Security (RLS)**: All tables have RLS enabled with user_id checks
2. **JWT Token Validation**: Supabase validates Clerk JWT on every request
3. **Automatic Token Refresh**: Clerk handles token refresh automatically
4. **No Hardcoded Credentials**: All auth flows through Clerk's secure system

## Key Benefits

✅ **Reliable Authentication**: Direct Clerk integration eliminates intermediate user table dependencies
✅ **Automatic Token Management**: No manual token handling required
✅ **Secure by Default**: RLS policies ensure data isolation
✅ **Better Performance**: Fewer database lookups for authentication
✅ **Consistent User Experience**: Same auth flow across all modules

## Files Modified

1. `src/hooks/useTDSRules.ts` - Updated to use Clerk directly
2. `src/hooks/useTDSTransactions.ts` - Updated to use Clerk directly  
3. `src/hooks/useTDSMaster.ts` - Updated to use Clerk directly
4. `src/hooks/useExpenses.ts` - Already properly configured (no changes needed)

## No Changes Needed

- `src/lib/supabase.ts` - Already configured correctly
- `src/lib/supabaseAuthFetch.ts` - Already handles Clerk JWT injection
- `src/components/ClerkAuthProvider.tsx` - Already syncs users properly
- Database RLS policies - Already configured correctly
