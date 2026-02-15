# Authorization System Integration Guide

This guide shows how to integrate the authorization system into your existing pages and features.

## Quick Integration Checklist

- [ ] Import hooks at page top
- [ ] Add permission checks in component
- [ ] Add audit logging to operations
- [ ] Test with different roles
- [ ] Verify audit logs appear
- [ ] Test concurrent user tracking

## Common Integration Patterns

### Pattern 1: Protected Page with Permission Check

```typescript
// pages/Invoices.tsx
import { useAuthorization } from '@/components/auth';

export default function InvoicesPage() {
  const { hasPermission, hasRole } = useAuthorization();

  // Option A: Hide entire page if no read permission
  if (!hasPermission('invoices:read')) {
    return <PermissionDenied />;
  }

  return (
    <div>
      <h1>Invoices</h1>

      {/* Option B: Hide specific features based on permissions */}
      {hasPermission('invoices:create') && (
        <button onClick={() => setCreateDialogOpen(true)}>
          Create Invoice
        </button>
      )}

      {/* Option C: Different UI based on role */}
      {hasRole('org_admin') && (
        <div>Admin Settings</div>
      )}

      {hasPermission('invoices:delete') && (
        <DeleteAllButton />
      )}
    </div>
  );
}
```

### Pattern 2: Protected Component

```typescript
// components/PermissionGate.tsx already exists
import { PermissionGate } from '@/components/auth';

export default function InvoiceDashboard() {
  return (
    <>
      <PermissionGate permission="invoices:read">
        <InvoiceList />
      </PermissionGate>

      <PermissionGate permission="invoices:delete" fallback={<p>No delete access</p>}>
        <DeleteInvoiceButton />
      </PermissionGate>

      <PermissionGate roles={['org_admin', 'ca']}>
        <AdminPanel />
      </PermissionGate>
    </>
  );
}
```

### Pattern 3: Add Audit Logging to Operations

```typescript
// services/invoiceService.ts
import { organizationService } from './organizationService';

async function createInvoice(data: InvoiceData, organizationId: string, userId: string) {
  try {
    // Create the invoice
    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert({ ...data, organization_id: organizationId })
      .select();

    if (error) throw error;

    // Log the action
    await organizationService.logAudit({
      userId,
      organizationId,
      action: 'invoice.created',
      resourceType: 'invoice',
      resourceId: invoice[0].id,
      severity: 'info',
      newValues: invoice[0],
      metadata: {
        source: 'web',
        ip: getUserIP() // if available
      }
    });

    return invoice[0];
  } catch (error) {
    // Log errors for critical operations
    await organizationService.logAudit({
      userId,
      organizationId,
      action: 'invoice.create_failed',
      resourceType: 'invoice',
      severity: 'error',
      metadata: {
        error: error.message
      }
    });
    throw error;
  }
}

async function updateInvoice(
  id: string,
  updates: Partial<InvoiceData>,
  organizationId: string,
  userId: string
) {
  // Get old values for audit trail
  const { data: oldInvoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .single();

  // Update
  const { data: newInvoice, error } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', id)
    .select();

  if (error) throw error;

  // Log with before/after values
  await organizationService.logAudit({
    userId,
    organizationId,
    action: 'invoice.updated',
    resourceType: 'invoice',
    resourceId: id,
    severity: 'warning', // Important change
    oldValues: oldInvoice,
    newValues: newInvoice[0],
    metadata: {
      changedFields: Object.keys(updates)
    }
  });

  return newInvoice[0];
}

async function deleteInvoice(id: string, organizationId: string, userId: string) {
  // Get values before deletion
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .single();

  // Delete
  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', id);

  if (error) throw error;

  // Log deletion (destructive action)
  await organizationService.logAudit({
    userId,
    organizationId,
    action: 'invoice.deleted',
    resourceType: 'invoice',
    resourceId: id,
    severity: 'destructive', // High severity action
    oldValues: invoice,
    metadata: {
      deletedAt: new Date().toISOString(),
      reason: 'User deletion'
    }
  });

  return true;
}
```

### Pattern 4: Hook-Based Form with Validation

```typescript
// pages/CreateInvoice.tsx
import { useAuthorization } from '@/components/auth';
import { useCreateInvoiceForm } from '@/hooks/useCreateInvoiceForm';
import { organizationService } from '@/services/organizationService';

export default function CreateInvoicePage() {
  const { hasPermission } = useAuthorization();
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const [error, setError] = useState('');

  // Check permission first
  if (!hasPermission('invoices:create')) {
    return <PermissionDenied permission="invoices:create" />;
  }

  const handleCreateInvoice = async (formData) => {
    try {
      // Create invoice via API
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) throw new Error('Failed to create invoice');
      const invoice = await response.json();

      // Log action
      await organizationService.logAudit({
        userId: user.id,
        organizationId: currentOrganization.id,
        action: 'invoice.created',
        resourceType: 'invoice',
        resourceId: invoice.id,
        severity: 'info',
        newValues: invoice
      });

      // Show success
      toast.success('Invoice created successfully');
      router.push(`/invoices/${invoice.id}`);
    } catch (err) {
      setError(err.message);

      // Log failure
      await organizationService.logAudit({
        userId: user.id,
        organizationId: currentOrganization.id,
        action: 'invoice.create_error',
        resourceType: 'invoice',
        severity: 'error',
        metadata: { error: err.message }
      });
    }
  };

  return (
    <form onSubmit={handleCreateInvoice}>
      {error && <Alert variant="destructive">{error}</Alert>}
      {/* Form fields */}
    </form>
  );
}
```

### Pattern 5: Real-Time User Activity

```typescript
// components/Dashboard.tsx
import { useConcurrentUserManagement } from '@/components/auth';
import { useOrganization } from '@/components/auth';

export default function Dashboard() {
  const { currentOrganization } = useOrganization();
  const { concurrentUsers, sessions, isLoading } = useConcurrentUserManagement(
    currentOrganization.id
  );

  return (
    <div className="dashboard">
      <div className="user-activity">
        <h3>Active Users in Organization: {concurrentUsers.length}</h3>
        
        {isLoading ? (
          <p>Loading...</p>
        ) : (
          <ul>
            {concurrentUsers.map((user) => (
              <li key={user.id}>
                <Avatar src={user.avatar} />
                <span>{user.name}</span>
                <small>{getRelativeTime(user.lastActivityAt)}</small>
              </li>
            ))}
          </ul>
        )}

        {/* Show user sessions */}
        <details>
          <summary>My Sessions ({sessions.length})</summary>
          {sessions.map((session) => (
            <div key={session.id} className="session">
              <p>{session.userAgent}</p>
              <small>Last activity: {getRelativeTime(session.lastActivityAt)}</small>
              <button onClick={() => revokeSession(session.id)}>Revoke</button>
            </div>
          ))}
        </details>
      </div>
    </div>
  );
}
```

### Pattern 6: Session Expiry Warning

```typescript
// App.tsx (wrap top-level component)
import { SessionExpiryWarning, useSessionExpiry } from '@/components/auth';
import { useOrganization } from '@/components/auth';

function AppContent() {
  const { currentOrganization } = useOrganization();
  const sessionExpiry = useSessionExpiry(currentOrganization?.id);

  return (
    <>
      {/* Show warning dialog when expiring */}
      {sessionExpiry.isExpiring && (
        <SessionExpiryWarning sessionExpiry={sessionExpiry} />
      )}

      {/* Rest of app */}
      <Router />
    </>
  );
}
```

### Pattern 7: CA Client Management

```typescript
// pages/CADashboard.tsx
import { useCAClientState, useAuthorization } from '@/components/auth';

export default function CADashboard() {
  const { hasRole } = useAuthorization();
  const { clients, currentClient, switchToClient } = useCAClientState();

  if (!hasRole('ca')) {
    return <PermissionDenied />;
  }

  return (
    <div>
      <h2>My Clients (CA)</h2>
      
      <select value={currentClient?.id} onChange={(e) => switchToClient(e.target.value)}>
        <option value="">Select Client</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name} {client.accessLevel === 'view_only' && '[View Only]'}
            {client.expiresAt && ` (Expires ${formatDate(client.expiresAt)})`}
          </option>
        ))}
      </select>

      {currentClient && (
        <div>
          <h3>Viewing: {currentClient.name}</h3>
          <p>Access Level: {currentClient.accessLevel}</p>
          {/* Show client-specific data */}
        </div>
      )}
    </div>
  );
}
```

## Step-by-Step Integration Example

### Step 1: Add Permission Check to Invoice List

```typescript
// src/pages/invoices/InvoiceList.tsx
import { useAuthorization } from '@/components/auth';

export default function InvoiceList() {
  const { hasPermission } = useAuthorization();

  // Deny access if no read permission
  if (!hasPermission('invoices:read')) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>
          You don't have permission to view invoices. Contact your admin.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {hasPermission('invoices:create') && (
        <button>New Invoice</button>
      )}
      {/* Invoice list */}
    </div>
  );
}
```

### Step 2: Add Audit Logging to Invoice Creation

```typescript
// In your invoice creation handler
import { organizationService } from '@/services/organizationService';
import { useAuth } from '@clerk/clerk-react';
import { useOrganization } from '@/components/auth';

function handleCreateInvoice(invoiceData) {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();

  // After successful creation
  await organizationService.logAudit({
    userId: user.id,
    organizationId: currentOrganization.id,
    action: 'invoice.created',
    resourceType: 'invoice',
    resourceId: newInvoice.id,
    severity: 'info',
    newValues: newInvoice,
    metadata: {
      source: 'invoice_form',
      amount: newInvoice.totalAmount
    }
  });

  toast.success('Invoice created and logged');
}
```

### Step 3: Test Different User Roles

1. Create test users with different roles
2. Log in as each user
3. Verify buttons/features are visible based on permissions
4. Perform actions and check audit logs

### Step 4: Verify Audit Trail

```typescript
import { useAuditLogs } from '@/components/auth';

export function AuditCheck() {
  const { logs, isLoading } = useAuditLogs(organizationId);

  return (
    <div>
      <h3>Recent Actions</h3>
      {logs.map((log) => (
        <div key={log.id}>
          <strong>{log.action}</strong>
          <p>User: {log.userId}</p>
          <p>Time: {formatDate(log.createdAt)}</p>
          <p>Severity: {log.severity}</p>
        </div>
      ))}
    </div>
  );
}
```

## Testing Checklist

### Basic Functionality
- [ ] Create organization with button
- [ ] Organization appears in switcher
- [ ] Switch organizations successfully
- [ ] User management works in settings

### Permissions
- [ ] Accountant can't delete invoices
- [ ] Viewer can't create anything
- [ ] Manager can approve expenses
- [ ] Admin can manage users

### Audit Logging
- [ ] Invoice creation logged
- [ ] User role change logged
- [ ] Deletion marked as 'destructive'
- [ ] Errors have severity 'error'
- [ ] CSV export works

### Sessions
- [ ] Another user shows in active users
- [ ] Session expiry warning appears
- [ ] Can extend session
- [ ] Can revoke other sessions
- [ ] Auto-logout after timeout

### CA Features
- [ ] CA can see assigned clients
- [ ] CA can switch clients
- [ ] View-only CA can't modify
- [ ] Access expiry warning shows

## Troubleshooting Integration

### Permission Denied When Should Have Access

```typescript
// Debug: Check what permissions user has
const { userPermissions, isLoadingAuth } = useAuthorization();

useEffect(() => {
  console.log('User permissions:', userPermissions);
  console.log('User role level:', userRoleLevel); // 0-100 scale
}, [userPermissions]);
```

### Audit Log Not Appearing

```typescript
// 1. Verify organizationId is correct
console.log('Org ID:', currentOrganization.id);

// 2. Verify userId is correct
console.log('User ID:', user.id);

// 3. Check if logAudit succeeded
const result = await organizationService.logAudit({...});
if (result.error) {
  console.error('Audit log error:', result.error);
}
```

### Session Tracking Not Working

```typescript
// 1. Verify useConcurrentUserManagement is initialized
const { sessions, concurrentUsers } = useConcurrentUserManagement(orgId);
console.log('Sessions:', sessions);

// 2. Check polling is active (10s interval)
// Should see network requests to getActiveSessions
```

## Common Permissions Reference

### Invoice Permissions
- `invoices:create` - Create new invoices
- `invoices:read` - View invoices
- `invoices:update` - Edit invoices
- `invoices:delete` - Delete invoices
- `invoices:export` - Export invoice data

### Expense Permissions
- `expenses:create` - Create expense claims
- `expenses:approve` - Approve expenses
- `expenses:read` - View expenses

### User Management
- `users:manage` - Manage users in organization
- `users:invite` - Invite new users
- `roles:manage` - Manage roles and permissions

### Reporting
- `reports:view` - View financial reports
- `reports:export` - Export reports

### Audit
- `audit:view` - View audit logs and history

## Performance Tips

1. **Cache permission checks**: Don't call hasPermission() multiple times in same component
2. **Debounce activity tracking**: Already done in useConcurrentUserManagement (5s debounce)
3. **Lazy load audit logs**: OrganizationSettingsDialog only shows last 10 logs
4. **Pagination**: Use offset/limit for large audit logs

## Security Best Practices

1. **Always check permissions on server**: Client checks are for UX, server must validate
2. **Log destructive actions**: Use severity 'destructive' for delete/major changes
3. **Include context in logs**: Add source, IP, user agent to metadata
4. **Review logs regularly**: Check audit dashboard weekly
5. **Test with minimum role**: Verify viewer role can't access anything

---

**Next Steps:**
1. Pick a page (e.g., InvoicesPage)
2. Add permission checks using the patterns above
3. Add audit logging to operations
4. Test with different user roles
5. Verify audit logs appear in settings panel
