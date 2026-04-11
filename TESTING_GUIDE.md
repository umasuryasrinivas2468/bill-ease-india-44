# Testing Guide: Clerk Authorization System

Complete testing guide for the new Clerk-based authorization system.

---

## 1. Manual Testing in Browser

### Step 1: Setup Clerk Organization

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Select your development project
3. Create organization: "Test Company"
4. Add members:
   - `admin@test.com` → role: `org:admin`
   - `manager@test.com` → role: `org:member` (set metadata role: "manager")
   - `accountant@test.com` → role: `org:member` (set metadata role: "accountant")
   - `viewer@test.com` → role: `org:member` (set metadata role: "viewer")

### Step 2: Add Branches to Organization

In Clerk Dashboard → Organization → Edit → Metadata, paste:

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
    },
    {
      "id": "br_003",
      "name": "Bangalore",
      "code": "BNG"
    }
  ]
}
```

### Step 3: Set User Metadata

For `manager@test.com`:
```json
// publicMetadata
{
  "role": "manager",
  "assignedBranches": ["br_001", "br_002"]
}
```

For `accountant@test.com`:
```json
// publicMetadata
{
  "role": "accountant",
  "assignedBranches": ["br_001"]
}
```

For `viewer@test.com`:
```json
// publicMetadata
{
  "role": "viewer",
  "assignedBranches": []
}
```

### Step 4: Test in App

#### Test 1: Organization Context
```
TEST: User can access app with organization
STEPS:
1. Sign in as admin@test.com
2. Grant permission to "Test Company" org in Clerk
3. Navigate to / (home)
4. Page loads without redirect

EXPECTED: Dashboard loads, no error
```

#### Test 2: No Organization
```
TEST: User with no org is redirected
STEPS:
1. Create new user in Clerk: notinorg@test.com
2. Sign in as notinorg@test.com
3. Navigate to /

EXPECTED: Redirects to /onboarding with error message
```

#### Test 3: Permission Gate - Admin Only
```
TEST: Admin panel visible for org:admin
STEPS:
1. Sign in as admin@test.com
2. Look for "Organization Settings" (should be visible)
3. Try editing org settings

EXPECTED: Settings open and work
```

```
TEST: Admin panel hidden for non-admin
STEPS:
1. Sign in as accountant@test.com
2. Look for "Organization Settings"

EXPECTED: Not visible or shows permission denied
```

#### Test 4: Branch Selector
```
TEST: Branch selector shows all branches
STEPS:
1. Sign in as admin@test.com
2. Look for BranchSelector component in header
3. Click dropdown

EXPECTED: Shows Delhi HQ, Mumbai, Bangalore
```

#### Test 5: Branch Access Control
```
TEST: Manager can access assigned branches only
STEPS:
1. Sign in as manager@test.com (assigned to br_001, br_002)
2. Check billService.getBills()
3. Check if can see bill from br_003

EXPECTED: Can see bills from br_001, br_002 only
```

```
TEST: Admin can access all branches
STEPS:
1. Sign in as admin@test.com
2. Try to access bill data
3. Branch filter should not apply

EXPECTED: Can see all branch data
```

#### Test 6: Permission Checks
```
TEST: Accountant cannot create org settings
STEPS:
1. Sign in as accountant@test.com
2. Try to access organization settings panel

EXPECTED: Permission denied / not visible
```

```
TEST: Only bill:create users can create bills
STEPS:
1. Sign in as viewer@test.com
2. Look for "Create Bill" button

EXPECTED: Button not visible or disabled
```

---

## 2. Code Testing - Browser Console

Open browser DevTools (F12) and test these in console:

### Check Organization Context
```javascript
// In any component
const { organization } = useOrganization();
console.log('Org:', organization);
console.log('Members:', organization?.members);
console.log('Metadata:', organization?.privateMetadata);
```

### Check Authorization
```javascript
import { useClerkAuthorization } from '@/hooks/useClerkAuthorization';

const auth = useClerkAuthorization();
console.log({
  userId: auth.userId,
  orgId: auth.orgId,
  userRole: auth.userRole,
  isOrgAdmin: auth.isOrgAdmin,
  isManager: auth.isManager,
  isAccountant: auth.isAccountant,
  hasPermission_bill_create: auth.hasPermission('bill:create'),
  hasPermission_bill_read: auth.hasPermission('bill:read'),
  canAccessBr001: auth.canAccessBranch('br_001'),
  getRoleLevel: auth.getRoleLevel(),
});
```

### Check Organization Data
```javascript
import { useClerkOrganization } from '@/hooks/useClerkOrganization';

const org = useClerkOrganization();
console.log({
  orgId: org.orgId,
  orgName: org.orgName,
  branches: org.branches,
  activeBranch: org.activeBranch,
  userRole: org.userRole,
  isAdmin: org.isAdmin,
});
```

### Check Session Storage
```javascript
// See what's stored in session
const activeOrgId = sessionStorage.getItem('active-org-id');
const activeBranch = sessionStorage.getItem('active-branch-' + activeOrgId);
console.log({ activeOrgId, activeBranch });
```

---

## 3. Unit Tests (Vitest)

Create `src/hooks/__tests__/useClerkAuthorization.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useClerkAuthorization } from '../useClerkAuthorization';
import * as clerkReact from '@clerk/clerk-react';

// Mock Clerk hooks
vi.mock('@clerk/clerk-react', () => ({
  useAuth: vi.fn(),
  useUser: vi.fn(),
  useOrganization: vi.fn(),
}));

describe('useClerkAuthorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return user role from organization', () => {
    // Mock Clerk data
    (clerkReact.useAuth as any).mockReturnValue({
      userId: 'user_123',
    });
    (clerkReact.useUser as any).mockReturnValue({
      user: { publicMetadata: {} },
    });
    (clerkReact.useOrganization as any).mockReturnValue({
      organization: {
        id: 'org_123',
        members: [
          { userId: 'user_123', role: 'org:admin' },
        ],
      },
    });

    const { result } = renderHook(() => useClerkAuthorization());

    expect(result.current.userRole).toBe('org:admin');
    expect(result.current.isOrgAdmin).toBe(true);
  });

  it('should check permission correctly', () => {
    (clerkReact.useAuth as any).mockReturnValue({
      userId: 'user_123',
    });
    (clerkReact.useUser as any).mockReturnValue({
      user: { publicMetadata: {} },
    });
    (clerkReact.useOrganization as any).mockReturnValue({
      organization: {
        id: 'org_123',
        members: [
          { userId: 'user_123', role: 'org:admin' },
        ],
      },
    });

    const { result } = renderHook(() => useClerkAuthorization());

    expect(result.current.hasPermission('bill:create')).toBe(true);
    expect(result.current.hasPermission('org:delete')).toBe(true);
  });

  it('should deny permission for non-admin', () => {
    (clerkReact.useAuth as any).mockReturnValue({
      userId: 'user_123',
    });
    (clerkReact.useUser as any).mockReturnValue({
      user: { publicMetadata: { role: 'viewer' } },
    });
    (clerkReact.useOrganization as any).mockReturnValue({
      organization: {
        id: 'org_123',
        members: [
          { userId: 'user_123', role: 'org:member' },
        ],
      },
    });

    const { result } = renderHook(() => useClerkAuthorization());

    expect(result.current.hasPermission('org:delete')).toBe(false);
    expect(result.current.hasPermission('bill:create')).toBe(false);
  });

  it('should check branch access', () => {
    (clerkReact.useAuth as any).mockReturnValue({
      userId: 'user_123',
    });
    (clerkReact.useUser as any).mockReturnValue({
      user: {
        publicMetadata: {
          assignedBranches: ['br_001', 'br_002'],
        },
      },
    });
    (clerkReact.useOrganization as any).mockReturnValue({
      organization: {
        id: 'org_123',
        members: [
          { userId: 'user_123', role: 'org:member' },
        ],
      },
    });

    const { result } = renderHook(() => useClerkAuthorization());

    expect(result.current.canAccessBranch('br_001')).toBe(true);
    expect(result.current.canAccessBranch('br_003')).toBe(false);
  });
});
```

Run tests:
```bash
npm test
```

---

## 4. Integration Tests

Create `src/components/__tests__/PermissionGate.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PermissionGate } from '../PermissionGate';
import * as clerk from '@clerk/clerk-react';

vi.mock('@clerk/clerk-react');

describe('PermissionGate', () => {
  it('should show content for users with permission', () => {
    const mockAuth = {
      orgId: 'org_123',
      userRole: 'org:admin',
      hasAllPermissions: vi.fn(() => true),
      hasAnyPermission: vi.fn(() => true),
      canAccessBranch: vi.fn(() => true),
    };

    vi.mocked(useClerkAuthorization).mockReturnValue(mockAuth);

    render(
      <PermissionGate permissions={['bill:create']}>
        <div>Create Bill</div>
      </PermissionGate>
    );

    expect(screen.getByText('Create Bill')).toBeInTheDocument();
  });

  it('should hide content for users without permission', () => {
    const mockAuth = {
      orgId: 'org_123',
      userRole: 'viewer',
      hasAllPermissions: vi.fn(() => false),
      hasAnyPermission: vi.fn(() => false),
      canAccessBranch: vi.fn(() => true),
    };

    vi.mocked(useClerkAuthorization).mockReturnValue(mockAuth);

    render(
      <PermissionGate permissions={['bill:create']}>
        <div>Create Bill</div>
      </PermissionGate>
    );

    expect(screen.queryByText('Create Bill')).not.toBeInTheDocument();
    expect(screen.getByText(/insufficient permissions/i)).toBeInTheDocument();
  });
});
```

---

## 5. Permission Matrix Testing

Test all role/permission combinations:

```typescript
// Test matrix coverage
const permissions = [
  'org:read', 'org:update', 'org:delete',
  'branch:create', 'branch:read',
  'bill:create', 'bill:read', 'bill:update', 'bill:delete', 'bill:export',
  'report:read', 'report:generate',
];

const roles = ['org:admin', 'manager', 'accountant', 'viewer'];

roles.forEach(role => {
  permissions.forEach(perm => {
    test(`${role} should ${shouldHavePermission(role, perm) ? 'have' : 'not have'} ${perm}`, () => {
      // Test here
    });
  });
});
```

---

## 6. E2E Testing Scenarios

### Scenario 1: Admin Workflow
```
1. Sign in as admin@test.com
2. Go to /settings
3. See "Organization Settings" menu
4. Click and open settings dialog
5. See Users tab with members list
6. See button to invite new user
7. Open "Settings for branch" dropdown
8. Switch branches
9. Verify data changes based on branch
```

### Scenario 2: Accountant Workflow
```
1. Sign in as accountant@test.com
2. Go to /bills
3. See "Create Bill" button (has bill:create)
4. Cannot see "Settings" gear (no org:update)
5. Try to access /settings → redirected
6. Can see only bills from assigned branch
```

### Scenario 3: Multi-Org User
```
1. Create second organization in Clerk: "Second Company"
2. Add user to both:
   - "Test Company" as org:admin
   - "Second Company" as org:member
3. Sign in
4. See active org: "Test Company"
5. Context shows: Test Company's data
6. Session has: active-org-id = org_123
7. Switch org via Clerk org switcher
8. Page reloads
9. Context now shows: Second Company's data
```

---

## 7. Debugging Tips

### Check Active Organization
```tsx
import { useOrganization } from '@clerk/clerk-react';

export function DebugOrg() {
  const { organization } = useOrganization();
  
  return (
    <pre>
      {JSON.stringify({
        id: organization?.id,
        name: organization?.name,
        slug: organization?.slug,
        members: organization?.members?.map(m => ({
          userId: m.userId,
          role: m.role,
        })),
        metadata: organization?.privateMetadata,
      }, null, 2)}
    </pre>
  );
}
```

### Check Auth State
```tsx
import { useClerkAuthorization } from '@/hooks/useClerkAuthorization';

export function DebugAuth() {
  const auth = useClerkAuthorization();
  
  return (
    <pre>
      {JSON.stringify({
        userId: auth.userId,
        orgId: auth.orgId,
        userRole: auth.userRole,
        branchId: auth.branchId,
        isOrgAdmin: auth.isOrgAdmin,
        isManager: auth.isManager,
        isAccountant: auth.isAccountant,
      }, null, 2)}
    </pre>
  );
}
```

### Browser Logs
```javascript
// Add to useClerkAuthorization hook for debugging
console.group('🔐 Authorization Debug');
console.log('User Role:', userRole);
console.log('Permissions:', permissions);
console.log('Organization:', organization?.id);
console.groupEnd();
```

---

## 8. Test Checklist

- [ ] User can sign in
- [ ] User with no org sees error
- [ ] User with org loads dashboard
- [ ] Organization name displays correctly
- [ ] Branches load from metadata
- [ ] Branch selector works
- [ ] Branch switching persists in session
- [ ] Admin sees settings option
- [ ] Non-admin doesn't see settings
- [ ] Permission gates show/hide correctly
- [ ] Bill creation allowed for org:admin
- [ ] Bill creation denied for viewer
- [ ] Branch filtering works
- [ ] Multi-org switching works
- [ ] Session persists across reloads
- [ ] Permissions matrix matches roles
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] No console errors
- [ ] No TypeScript errors

---

## 9. Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test useClerkAuthorization

# Run with UI
npm run test:ui

# Run once and exit
npm run test:run
```

---

## 10. Local Development Testing

Start dev server:
```bash
npm run dev
```

Open app at `http://localhost:5173`

Test with different users:
```
admin@test.com → org:admin
manager@test.com → manager
accountant@test.com → accountant
viewer@test.com → viewer
```

Watch console for errors and debug logs.

---

## Troubleshooting

### "Organization context required"
- Check user is added to org in Clerk
- Check organization ID is correct
- Verify OrgContextProvider wraps app

### Permissions not working
- Check ROLE_PERMISSIONS in hook
- Verify user role matches Clerk
- Check publicMetadata for custom role

### Branches not loading
- Check metadata in Clerk org
- Verify JSON is valid
- Check branches array exists

### Session not persisting
- Clear sessionStorage manually
- Check browser allows sessionStorage
- Verify key names are correct

---

Good luck testing! 🧪
