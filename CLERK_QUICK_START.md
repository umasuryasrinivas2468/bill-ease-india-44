# Clerk Authorization Quick Start

Get your app running with Clerk-based authorization in 5 minutes.

## 1. Wrap App with OrgContextProvider

**src/main.tsx or src/App.tsx:**

```tsx
import { ClerkProvider } from '@clerk/clerk-react';
import { OrgContextProvider } from '@/components/OrgContextProvider';

export default function App() {
  return (
    <ClerkProvider publishableKey={process.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <OrgContextProvider requiredRole="accountant">
        {/* Your routes here */}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/bills" element={<BillsPage />} />
        </Routes>
      </OrgContextProvider>
    </ClerkProvider>
  );
}
```

## 2. Check Authorization

**In any component:**

```tsx
import { useClerkAuthorization } from '@/hooks/useClerkAuthorization';

export function MyComponent() {
  const auth = useClerkAuthorization();

  if (!auth.orgId) return <p>Loading org...</p>;

  return (
    <div>
      <p>Organization: {auth.orgId}</p>
      <p>Your role: {auth.userRole}</p>
      
      {auth.isOrgAdmin && <AdminPanel />}
      {auth.hasPermission('bill:create') && <CreateBillButton />}
    </div>
  );
}
```

## 3. Gate Components by Permission

```tsx
import { PermissionGate } from '@/components/PermissionGate';

export function BillsPage() {
  return (
    <div>
      <PermissionGate permissions={['bill:read']}>
        <BillsList />
      </PermissionGate>

      <PermissionGate permissions={['bill:create']}>
        <CreateBillButton />
      </PermissionGate>

      <PermissionGate roles={['org:admin']} fallback={<p>Admins only</p>}>
        <AdminSection />
      </PermissionGate>
    </div>
  );
}
```

## 4. Use Data Service

```tsx
import { useBillService } from '@/services/clerkedDataService';

export function BillsList() {
  const billService = useBillService();
  const [bills, setBills] = useState([]);

  useEffect(() => {
    billService.getBills().then(setBills);
  }, []);

  return (
    <div>
      {bills.map(bill => (
        <BillRow key={bill.id} bill={bill} />
      ))}
    </div>
  );
}
```

## 5. Switch Branches (Optional)

```tsx
import { BranchSelector } from '@/components/BranchSelector';

export function DashboardHeader() {
  return (
    <header>
      <Logo />
      <BranchSelector onBranchChange={reload} />
      <UserMenu />
    </header>
  );
}
```

---

## Setup in Clerk Dashboard

### 1. Create Organization
- Go to: Clerk Dashboard → Organizations → New
- Name: "Your Company"
- Slug: "your-company"

### 2. Add Members
- Click organization → Members → Add
- Invite users with roles:
  - `org:admin` = Full access
  - `org:member` = Limited (custom role in metadata)

### 3. Add Branches (Optional)
- Click organization → Edit → Metadata
- Paste:
```json
{
  "branches": [
    {
      "id": "br_001",
      "name": "New Delhi",
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

### 4. Set User Role (For Non-Admins)
- Go to: Users → Select user → Metadata
- Add publicMetadata:
```json
{
  "role": "accountant",
  "assignedBranches": ["br_001", "br_002"]
}
```

---

## Testing

### Check Clerk Context
```tsx
import { useOrganization, useUser } from '@clerk/clerk-react';

// In any component:
const { organization } = useOrganization();
const { user } = useUser();

console.log('Organization:', organization);
console.log('Members:', organization?.members);
console.log('Metadata:', organization?.privateMetadata);
```

### Check Authorization
```tsx
import { useClerkAuthorization } from '@/hooks/useClerkAuthorization';

const auth = useClerkAuthorization();
console.log({
  orgId: auth.orgId,
  userRole: auth.userRole,
  isAdmin: auth.isOrgAdmin,
  permissions: auth,
});
```

---

## Common Issues

### "Organization context required"
- User is not part of any organization
- **Fix:** Add user to organization in Clerk dashboard

### Permission denied for [bill:create]
- User role doesn't have permission
- **Fix:** Check `ROLE_PERMISSIONS` in `useClerkAuthorization.ts`

### Branch not showing
- Organization metadata is missing branches array
- **Fix:** Add `branches` to org metadata in Clerk

### "No organization" error
- OrgContextProvider not wrapping the app
- **Fix:** Check App.tsx has OrgContextProvider wrapper

---

## Files Created

| File | Purpose |
|------|---------|
| `useClerkAuthorization.ts` | Check roles & permissions |
| `useClerkOrganization.ts` | Get org data & branches |
| `OrgContextProvider.tsx` | Enforce single org context |
| `BranchSelector.tsx` | Switch branches (optional) |
| `PermissionGate.tsx` | Conditional rendering by permission |
| `clerkedDataService.ts` | Data queries with auto org-scoping |

---

## Next: Remove Old System

Once testing passes:

```bash
# Delete old components
rm -f src/components/OrganizationSwitcher.tsx
rm -f src/components/auth/OrganizationSettingsDialog.tsx
rm -f src/hooks/useOrganization.ts
rm -f src/hooks/useOrganizationManagement.ts
rm -f src/hooks/useAuthorization.ts
rm -f src/services/organizationService.ts
```

Then update Supabase schema (see MIGRATION_SUPABASE_TO_CLERK.md).

---

## Example App Layout

```tsx
function App() {
  return (
    <ClerkProvider>
      <OrgContextProvider>
        <div className="app">
          <header>
            <Logo />
            <BranchSelector />  {/* Optional */}
            <UserMenu />
          </header>

          <main>
            <PermissionGate permissions={['bill:read']}>
              <BillsList />
            </PermissionGate>

            <PermissionGate roles={['org:admin']}>
              <AdminSection />
            </PermissionGate>
          </main>
        </div>
      </OrgContextProvider>
    </ClerkProvider>
  );
}
```

That's it! 🎉 Your app now uses Clerk for all organization & authorization needs.
