# Clerk-Based Authorization System - Setup Guide

## Overview

This system replaces the Supabase organization management with **Clerk as the single source of truth** for:
- ✅ User identity & authentication (MFA, sessions)
- ✅ Organization membership & roles
- ✅ Branch management & metadata
- ✅ Role-based access control
- ✅ Session enforcement

**Supabase remains for:**
- 💾 Transactional data (bills, expenses, reports)
- 🔐 RLS policies (org_id based)
- 📊 Analytics & compliance logs

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Clerk Dashboard                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Organization "ABC Corp"                              │  │
│  │ ├─ Members:                                          │  │
│  │ │  ├─ user@example.com (role: org:admin)           │  │
│  │ │  ├─ accountant@example.com (role: org:member)    │  │
│  │ │  └─ manager@example.com (role: org:member)       │  │
│  │ ├─ Metadata: {                                       │  │
│  │ │    branches: [                                     │  │
│  │ │      { id: "br1", name: "Delhi HQ", code: "DEL" }│  │
│  │ │      { id: "br2", name: "Mumbai", code: "BOM" }   │  │
│  │ │    ]                                               │  │
│  │ │  }                                                  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │
         ├─ Clerk AuthProvider (React)
         │  ├─ useAuth() → userId, sessionId, token
         │  ├─ useUser() → publicMetadata, privateMetadata
         │  └─ useOrganization() → org, members, roles
         │
         ├─ useClerkAuthorization() Hook
         │  ├─ Extract: userRole, permissions, branches
         │  ├─ Check: hasPermission(), canAccessBranch()
         │  └─ Enforce: role hierarchy
         │
         └─ OrgContextProvider
            ├─ Validate org context on mount
            ├─ Enforce single active org per session
            └─ Redirect to onboarding if no org
```

---

## Setup Steps

### 1. Configure Clerk Organization

**Go to Clerk Dashboard → Organizations:**

1. Create organization (if not exists)
2. Add members with roles:
   - `org:admin` → Full access
   - `org:member` → Limited access (custom role in metadata)

3. Add custom metadata to organization:
   ```json
   {
     "branches": [
       {
         "id": "br_001",
         "name": "Delhi HQ",
         "code": "DEL"
       },
       {
         "id": "br_002",
         "name": "Mumbai",
         "code": "BOM"
       }
     ]
   }
   ```

### 2. Configure User Custom Metadata

**For each user in Clerk Dashboard → Users:**

1. Set `publicMetadata`:
   ```json
   {
     "role": "manager",
     "assignedBranches": ["br_001", "br_002"]
   }
   ```

2. Or leave empty for default access (can access all branches)

### 3. Update Your App

#### A. Wrap App with OrgContextProvider

```tsx
import { OrgContextProvider } from '@/components/OrgContextProvider';

function App() {
  return (
    <ClerkProvider {...}>
      <OrgContextProvider 
        requiredRole="accountant"
        redirectTo="/onboarding"
      >
        <Routes>
          {/* Your routes */}
        </Routes>
      </OrgContextProvider>
    </ClerkProvider>
  );
}
```

#### B. Use Authorization Hook

```tsx
import { useClerkAuthorization } from '@/hooks/useClerkAuthorization';

function Dashboard() {
  const auth = useClerkAuthorization();
  
  return (
    <div>
      <p>Org: {auth.orgId}</p>
      <p>Role: {auth.userRole}</p>
      <p>Is Admin: {auth.isOrgAdmin}</p>
      
      {auth.hasPermission('bill:create') && (
        <CreateBillButton />
      )}
    </div>
  );
}
```

#### C. Use Permission Gate

```tsx
import { PermissionGate } from '@/components/PermissionGate';

<PermissionGate permissions={['bill:create']}>
  <CreateBillButton />
</PermissionGate>

<PermissionGate roles={['org:admin']} fallback={<p>Admin only</p>}>
  <AdminPanel />
</PermissionGate>
```

#### D. Use Branch Selector

```tsx
import { BranchSelector } from '@/components/BranchSelector';

<BranchSelector 
  onBranchChange={(branchId) => console.log(branchId)}
/>
```

---

## Role Permissions Matrix

### org:admin
- Full organization access
- Manage members & roles
- Create/update/delete branches
- View all bills & reports
- Export & audit logs

### manager
- Create & manage bills
- View reports & exports
- Cannot manage users or org settings

### accountant
- Create & read bills
- View reports
- Cannot update bills created by others
- Cannot export

### viewer
- Read-only access to bills & reports
- Cannot create or modify

---

## Database Changes (Supabase)

### Remove
```sql
-- Drop custom organization tables
DROP TABLE IF EXISTS user_organizations CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS invitations CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
```

### Keep (add org_id to all tables)
```sql
ALTER TABLE bills ADD COLUMN org_id UUID REFERENCES clerk_orgs(id);
ALTER TABLE expenses ADD COLUMN org_id UUID;
ALTER TABLE reports ADD COLUMN org_id UUID;

-- RLS: Users can only access data for their org
CREATE POLICY "Bills are scoped to organization"
  ON bills FOR SELECT
  USING (org_id IN (
    SELECT org_id FROM user_org_mapping 
    WHERE user_id = auth.uid()
  ));
```

---

## Migration Checklist

- [ ] Remove old OrganizationSwitcher component
- [ ] Remove old organization management routes
- [ ] Delete: useOrganization.ts (old hook)
- [ ] Delete: useOrganizationManagement.ts
- [ ] Delete: useAuthorization.ts (old hook)
- [ ] Update: All data queries to filter by org_id
- [ ] Wrap App with: OrgContextProvider
- [ ] Test: Permission gates with different roles
- [ ] Test: Branch switching
- [ ] Test: Multi-org user scenarios

---

## Key Hooks

### `useClerkAuthorization()`
Returns:
- `userId`, `orgId`, `userRole`, `branchId`
- `isOrgAdmin`, `isManager`, `isAccountant`
- `hasPermission(perm)` - Check single permission
- `hasAnyPermission([perms])` - Check any of list
- `hasAllPermissions([perms])` - Check all in list
- `canAccessBranch(branchId)` - Check branch access
- `getRoleLevel()` - Get numeric role level

### `useClerkOrganization()`
Returns:
- `organization` - Clerk org object
- `orgId`, `orgName`, `orgSlug`
- `branches` - Array of branches from metadata
- `activeBranch` - Currently selected branch
- `switchBranch(branchId)` - Change active branch
- `userRole`, `isAdmin`, `isManager`

---

## Security

✅ **RLS in Supabase** - org_id filter on all queries
✅ **Token Validation** - Clerk JWT verified on backend
✅ **Role Hierarchy** - Enforced in permissions matrix
✅ **Branch Isolation** - Users can only access assigned branches
✅ **Session Enforcement** - Single active org per session
✅ **No Client-Side Bypass** - Backend always validates

---

## Debugging

### Check Active Org
```tsx
const { organization } = useOrganization();
console.log('Current org:', organization?.id);
console.log('User role:', organization?.members?.find(m=>m.userId===userId)?.role);
```

### Check Active Branch
```tsx
const branchId = sessionStorage.getItem(`active-branch-${orgId}`);
console.log('Active branch:', branchId);
```

### Check Auth State
```tsx
const auth = useClerkAuthorization();
console.log('Auth:', auth);
console.log('Permissions:', ROLE_PERMISSIONS[auth.userRole]);
```

---

## Next Steps

1. ✅ Set up Clerk organizations with members
2. ✅ Configure branch metadata
3. ✅ Update Supabase schema (add org_id)
4. ✅ Update data queries with org filter
5. ✅ Wrap app with OrgContextProvider
6. ✅ Replace UI with new components
7. ✅ Test all role scenarios
