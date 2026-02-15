# Migration Guide: Supabase → Clerk Authorization

## Overview

**Before:** Organization management in Supabase + Clerk for authentication  
**After:** Clerk for everything (orgs, roles, members) + Supabase for transactional data only

This is a **cleaner, more secure architecture** that reduces complexity and eliminates data duplication.

---

## What's Changing

### Removed (from Supabase)
```sql
organizations          -- Moved to Clerk
user_organizations     -- Moved to Clerk
user_roles            -- Moved to Clerk
invitations           -- Removed (Clerk handles this)
permissions           -- Moved to code (ROLE_PERMISSIONS)
role_permissions      -- Moved to code (ROLE_PERMISSIONS)
organization_audit    -- Use Clerk audit logs
```

### Updated (in Supabase)
```sql
-- Add org_id to all transactional tables
bills: + org_id UUID
expenses: + org_id UUID  
reports: + org_id UUID
bank_statements: + org_id UUID

-- Add RLS policies
-- All: "WHERE org_id = current_user_org"
```

### New (in Clerk)
```
Organizations
  ├─ Name, Slug, Image
  ├─ Members with roles
  └─ Metadata: { branches: [...] }

Users
  ├─ Auth (email, password, MFA)
  └─ Metadata: { role: "accountant", assignedBranches: [...] }
```

---

## Step-by-Step Migration

### Phase 1: Prepare Old System (No Breaking Changes)

#### 1.1 Create Clerk Organizations
- Go to Clerk Dashboard → Organizations
- Create org for each existing organization in Supabase
- Map: Clerk org.id = Supabase organization.id (in metadata)

#### 1.2 Migrate Organization Members
```tsx
// Script to sync Supabase → Clerk
async function migrateMembers() {
  // Get existing members from Supabase
  const { data: members } = await supabase
    .from('user_organizations')
    .select('*, user_roles(role)');

  // For each member:
  // - Get Clerk user ID by email
  // - Add to Clerk org with appropriate role
  // - Store Supabase assignedBranches in publicMetadata
}
```

#### 1.3 Add Branch Metadata to Clerk
```json
// Clerk Organization → Edit Metadata
{
  "branches": [
    { "id": "br_001", "name": "Delhi HQ", "code": "DEL" },
    { "id": "br_002", "name": "Mumbai", "code": "BOM" }
  ]
}
```

### Phase 2: Parallel Run (Both Systems)

#### 2.1 Add New Hooks (Keep Old)
- ✅ Create: `useClerkAuthorization()` - new hook
- ✅ Create: `useClerkOrganization()` - new hook
- ⚠️ Keep: `useAuthorization()` - old hook (for comparison)

#### 2.2 Update Data Service
```typescript
// clerkedDataService.ts
async getBills() {
  // Always filter by: org_id + current user org from Clerk
  const auth = useClerkAuthorization();
  
  const { data } = await supabase
    .from('bills')
    .select()
    .eq('org_id', auth.orgId); // From Clerk, not Supabase
  
  return data;
}
```

#### 2.3 Test Both Systems
```bash
npm test  # Should pass with old system
# Gradually update components to use new system
```

### Phase 3: Cutover (Breaking Change)

#### 3.1 Remove Supabase Org Tables
```sql
-- In Supabase SQL Editor
DROP TRIGGER IF EXISTS set_user_organizations_updated_at ON user_organizations;
DROP TABLE user_organizations CASCADE;
DROP TABLE user_roles CASCADE;
DROP TABLE invitations CASCADE;
DROP TABLE permissions CASCADE;
DROP TABLE role_permissions CASCADE;
```

#### 3.2 Update Supabase RLS
```sql
-- Update ALL policies to use Clerk org context
-- Instead of checking tables, check session.claims.org_id

-- Example for bills:
CREATE POLICY "Users can access bills in their org"
  ON bills FOR SELECT
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
  );
```

#### 3.3 Replace All Components
```bash
# Remove old components
rm src/components/OrganizationSwitcher.tsx
rm src/components/OrganizationSettingsDialog.tsx

# Replace with new
# - OrgContextProvider (wrapper)
# - BranchSelector (optional)
# - PermissionGate (conditional rendering)
```

#### 3.4 Remove Old Hooks
```bash
# Delete
rm src/hooks/useOrganization.ts
rm src/hooks/useOrganizationManagement.ts
rm src/hooks/useAuthorization.ts

# Replace with
src/hooks/useClerkAuthorization.ts  ✅
src/hooks/useClerkOrganization.ts ✅
```

#### 3.5 Deprecate organizationService.ts
```bash
# Archive (don't delete yet)
mv src/services/organizationService.ts src/services/organizationService.ts.backup

# Use new service
src/services/clerkedDataService.ts ✅
```

---

## Component Migration Examples

### Before (Supabase)
```tsx
import { useOrganization } from '@/hooks/useOrganization';
import { useAuthorization } from '@/hooks/useAuthorization';

function Dashboard() {
  const { currentOrganization } = useOrganization();
  const { hasRole } = useAuthorization();

  if (!hasRole('org_admin', currentOrganization?.id)) {
    return <p>Access denied</p>;
  }

  return <AdminPanel org={currentOrganization} />;
}
```

### After (Clerk)
```tsx
import { useClerkOrganization } from '@/hooks/useClerkOrganization';
import { useClerkAuthorization } from '@/hooks/useClerkAuthorization';
import { PermissionGate } from '@/components/PermissionGate';

function Dashboard() {
  const { orgName } = useClerkOrganization();

  return (
    <PermissionGate roles={['org:admin']}>
      <AdminPanel org={orgName} />
    </PermissionGate>
  );
}
```

---

## Data Query Migration

### Before
```typescript
async function getBills() {
  const org = currentOrganization;
  
  const { data } = await supabase
    .from('bills')
    .select()
    .eq('organization_id', org.id);
    
  return data;
}
```

### After
```typescript
async function getBills() {
  const billService = useBillService(); // From clerkedDataService
  return await billService.getBills();
  
  // Internally:
  // - Gets org_id from Clerk useClerkAuthorization()
  // - Filters: .eq('org_id', auth.orgId)
  // - No manual org_id passing needed
}
```

---

## Database Schema Changes

### Add org_id to all tables
```sql
-- For bills
ALTER TABLE bills ADD COLUMN org_id UUID REFERENCES clerk_orgs(id);
UPDATE bills SET org_id = 'clerk-org-id' WHERE organization_id = 'supabase-org-id';
ALTER TABLE bills DROP COLUMN organization_id;
CREATE INDEX idx_bills_org ON bills(org_id);

-- For expenses
ALTER TABLE expenses ADD COLUMN org_id UUID;
CREATE INDEX idx_expenses_org ON expenses(org_id);

-- For reports
ALTER TABLE reports ADD COLUMN org_id UUID;
CREATE INDEX idx_reports_org ON reports(org_id);
```

### Update RLS Policies
```sql
-- Remove old org table checks
-- Add Clerk org context checks

CREATE POLICY "org_scoped_access"
  ON bills FOR SELECT
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
  );
```

---

## Rollback Plan

If issues arise:

1. **Keep Supabase org tables** during Phase 2
2. **Maintain both systems** until fully confident
3. **Run comparison queries** to verify data consistency
4. **Keep old hooks available** but unused
5. **Tag a Git release** before Phase 3

---

## Checklist

### Phase 1: Preparation
- [ ] Create Clerk organizations
- [ ] Copy organization data to Clerk
- [ ] Add members to Clerk orgs
- [ ] Configure branch metadata in Clerk

### Phase 2: Parallel
- [ ] Implement new hooks
- [ ] Update data service
- [ ] Write tests for new authorization
- [ ] Gradually migrate components
- [ ] Verify functionality matches old system

### Phase 3: Cutover
- [ ] Update Supabase RLS policies
- [ ] Remove Supabase org tables
- [ ] Delete old components/hooks
- [ ] Archive old services
- [ ] Run full test suite
- [ ] Monitor production
- [ ] Celebrate! 🎉

---

## Key Benefits

✅ **Single source of truth** - Clerk is authoritative  
✅ **Simpler schema** - No org table duplication  
✅ **Better security** - Clerk's audit logs + RLS  
✅ **Scalable** - Built for multi-org from ground up  
✅ **Less code** - No custom org management logic  
✅ **Type-safe** - Clerk types are accurate  

---

## Support

If you encounter issues:

1. Check that Clerk org has all organization members
2. Verify branch metadata is valid JSON in Clerk
3. Ensure RLS policies use correct org_id
4. Test with `useClerkAuthorization()` directly
5. Check browser console for auth context errors
