# Enterprise Authorization System

This document describes the comprehensive authorization system built for enterprise-scale financial platforms, integrated with Clerk authentication.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Clerk Authentication                           │
│                    (Identity Management & JWT Provider)                  │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Supabase Authorization Layer                        │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐  │
│  │ user_roles  │  │ permissions  │  │organizations│  │ audit_logs   │  │
│  └─────────────┘  └──────────────┘  └─────────────┘  └──────────────┘  │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         React Application                                │
│  ┌──────────────────┐  ┌────────────────┐  ┌─────────────────────────┐  │
│  │ useAuthorization │  │ useOrganization│  │ PermissionGate/HOC      │  │
│  └──────────────────┘  └────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Role Hierarchy

| Role         | Level | Description                               |
|--------------|-------|-------------------------------------------|
| super_admin  | 100   | Platform-wide administrator               |
| org_admin    | 80    | Organization administrator                |
| ca           | 70    | Chartered Accountant (multi-client)       |
| manager      | 60    | Team manager with approval rights         |
| accountant   | 40    | Standard accounting user                  |
| viewer       | 20    | Read-only access                          |

## Database Tables

### organizations
Stores organization/company entities with profile information.

### user_roles
Maps users to roles, optionally scoped to organizations.

### user_organizations
Tracks user membership in organizations.

### permissions
Defines granular permission codes (e.g., `invoices:create`).

### role_permissions
Maps roles to permissions.

### ca_client_assignments
Enables CA users to access multiple client organizations.

### audit_logs
Stores all significant actions for compliance tracking.

### user_sessions
Tracks concurrent user sessions.

## React Hooks

### useAuthorization
Primary hook for checking permissions and roles.

```typescript
const { 
  hasPermission,      // Check single permission
  hasRole,            // Check if user has role
  can,                // Check action on resource
  isAtLeastRole,      // Role hierarchy check
  isSuperAdmin,       // Quick admin check
} = useAuthorization(organizationId);

// Examples
if (hasPermission('invoices:create')) { ... }
if (can('create', 'invoices')) { ... }
if (isAtLeastRole('manager')) { ... }
```

### useOrganization
Manages organization context and switching.

```typescript
const {
  organizations,        // List of user's orgs
  currentOrganization,  // Active organization
  switchOrganization,   // Change active org
} = useOrganization();
```

### useCAClients
For CA users to manage client access.

```typescript
const {
  clients,              // CA's assigned clients
  currentClient,        // Active client
  switchClient,         // Change active client
  getCurrentAccessLevel,// Get access level
} = useCAClients();
```

### useAuditLog
Log and query audit trail.

```typescript
const {
  log,          // Generic log function
  logCreate,    // Log record creation
  logUpdate,    // Log record update
  logDelete,    // Log record deletion
  logAuth,      // Log auth events
  fetchLogs,    // Query audit logs
} = useAuditLog();

// Example
await logCreate('invoice', invoiceId, invoiceData, organizationId);
```

## Components

### PermissionGate
Conditionally render based on permissions.

```tsx
<PermissionGate permission="invoices:create">
  <CreateInvoiceButton />
</PermissionGate>

<PermissionGate minimumRole="manager">
  <ApprovalPanel />
</PermissionGate>

<PermissionGate 
  permissions={['invoices:create', 'invoices:update']} 
  mode="all"
>
  <InvoiceEditor />
</PermissionGate>
```

### withPermission HOC
Protect entire components/pages.

```typescript
const ProtectedComponent = withPermission(MyComponent, {
  permission: 'reports:view',
  fallback: <AccessDenied />,
});
```

### OrganizationSwitcher
Dropdown to switch between organizations.

```tsx
<OrganizationSwitcher 
  showAddNew={true}
  onAddNew={() => navigate('/organizations/new')}
/>
```

### CAClientSwitcher
For CAs to switch between client organizations.

```tsx
<CAClientSwitcher />
```

### AuditLogViewer
View and filter audit logs.

```tsx
<AuditLogViewer organizationId={orgId} />
```

## Permission Codes

### Billing
- `invoices:create`, `invoices:read`, `invoices:update`, `invoices:delete`, `invoices:export`
- `quotations:create`, `quotations:read`, `quotations:update`, `quotations:delete`

### CRM
- `clients:create`, `clients:read`, `clients:update`, `clients:delete`
- `vendors:create`, `vendors:read`, `vendors:update`, `vendors:delete`

### Accounting
- `expenses:create`, `expenses:read`, `expenses:update`, `expenses:delete`, `expenses:approve`
- `journals:create`, `journals:read`, `journals:update`, `journals:post`

### Reporting
- `reports:view`, `reports:export`, `reports:gst`, `reports:tds`

### Admin
- `users:invite`, `users:manage`, `roles:manage`, `settings:manage`, `audit:view`

### Banking
- `banking:view`, `banking:reconcile`, `payments:create`, `payments:approve`

## Security Features

1. **RLS Policies**: All tables have Row-Level Security enabled
2. **Security Definer Functions**: Prevent RLS recursion
3. **Role Hierarchy**: Automatic permission inheritance
4. **Session Tracking**: Monitor concurrent users
5. **Audit Logging**: Complete action trail

## CA Multi-Client Workflow

1. CA is assigned to client organizations via `ca_client_assignments`
2. `CAClientSwitcher` component shows available clients
3. Switching clients stores context in localStorage
4. All data queries filter by current client organization
5. Access levels: `full`, `limited`, `view_only`

## Audit Log Severity

- **info**: Normal operations (create, read, update)
- **warning**: Sensitive operations (delete, role changes)
- **critical**: Security events (auth failures, permission violations)

## Best Practices

1. Always wrap sensitive components with `PermissionGate`
2. Use `withPermission` HOC for route-level protection
3. Call audit log functions for all significant actions
4. Check permissions server-side via RLS policies
5. Use `isAtLeastRole` for hierarchy-based checks
6. Store organization context for multi-tenant queries
