# Architecture & System Design

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Application                            │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │       User Interface Components                           │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  App Sidebar                                       │  │  │
│  │  │  ├── OrganizationSwitcher                         │  │  │
│  │  │  │   ├── Button to list orgs + create new        │  │  │
│  │  │  │   └── CreateOrganizationDialog (modal)        │  │  │
│  │  │  ├── CAClientSwitcher (if CA role)               │  │  │
│  │  │  └── Organization Settings Icon                  │  │  │
│  │  │      └── OrganizationSettingsDialog              │  │  │
│  │  │          ├── Users Tab (invite, manage)          │  │  │
│  │  │          ├── Roles Tab (view role definitions)   │  │  │
│  │  │          ├── Sessions Tab (active users)         │  │  │
│  │  │          └── Audit Tab (view logs)               │  │  │
│  │  │                                                   │  │  │
│  │  │  Other Components                                 │  │  │
│  │  │  ├── SessionExpiryWarning (alert dialog)         │  │  │
│  │  │  ├── PermissionGate (conditional render)         │  │  │
│  │  │  ├── AuditLogViewer (dashboard)                  │  │  │
│  │  │  └── [Your other components]                     │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │       React Hooks & State Management                     │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  Organization State (useOrganization)              │  │  │
│  │  │  ├── currentOrganization                           │  │  │
│  │  │  ├── organizations[]                               │  │  │
│  │  │  └── switchOrganization()                          │  │  │
│  │  ├────────────────────────────────────────────────────┤  │  │
│  │  │  Authorization (useAuthorization)                  │  │  │
│  │  │  ├── hasPermission(code)                           │  │  │
│  │  │  ├── hasRole(role)                                 │  │  │
│  │  │  ├── can(action, resource)                         │  │  │
│  │  │  └── isAtLeastRole(role)                           │  │  │
│  │  ├────────────────────────────────────────────────────┤  │  │
│  │  │  Organization Management (useOrganizationMgmt)     │  │  │
│  │  │  ├── useCreateOrganization()                       │  │  │
│  │  │  ├── useInviteUser()                               │  │  │
│  │  │  ├── useOrganizationRoles()                        │  │  │
│  │  │  ├── useCAClientAssignment()                       │  │  │
│  │  │  └── useAuditLogs()                                │  │  │
│  │  ├────────────────────────────────────────────────────┤  │  │
│  │  │  Concurrent User Management                        │  │  │
│  │  │  ├── useConcurrentUserManagement()                 │  │  │
│  │  │  │   ├── sessions[]                                │  │  │
│  │  │  │   ├── concurrentUsers[]                         │  │  │
│  │  │  │   └── revokeSession()                           │  │  │
│  │  │  └── useSessionExpiry()                            │  │  │
│  │  │      ├── isExpiring                                │  │  │
│  │  │      ├── timeRemaining                             │  │  │
│  │  │      └── extendSession()                           │  │  │
│  │  ├────────────────────────────────────────────────────┤  │  │
│  │  │  CA Client Management (useCAClientState)           │  │  │
│  │  │  ├── clients[]                                      │  │  │
│  │  │  ├── currentClient                                  │  │  │
│  │  │  └── switchToClient()                               │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Service Layer                              │
│                                                                   │
│  organizationService                                             │
│  ├── createOrganization()                                        │
│  ├── updateOrganization()                                        │
│  ├── inviteUser()                                                │
│  ├── removeUser()                                                │
│  ├── updateUserRole()                                            │
│  ├── assignCAClient()                                            │
│  ├── revokeCAClient()                                            │
│  ├── logAudit()                                                  │
│  ├── getAuditLogs()                                              │
│  ├── trackUserSession()                                          │
│  ├── getActiveSessions()                                         │
│  └── revokeSession()                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│             Supabase Client + RLS Enforcement                    │
│                                                                   │
│  All queries filtered by RLS policies based on:                  │
│  ├── current_setting('request.jwt.claims')                       │
│  ├── User's organization membership                              │
│  ├── User's roles and permissions                                │
│  └── User's CA client assignments                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│          PostgreSQL Database with RLS & Security Functions       │
│                                                                   │
│  Core Tables                                                     │
│  ├── organizations                                               │
│  │   ├── id, name, slug, gstin, pan, email, phone              │
│  │   ├── address, city, state, pincode                          │
│  │   ├── logo_url, settings, is_active                          │
│  │   └── RLS: Users can only see their orgs                     │
│  │                                                               │
│  ├── user_organizations (Membership)                             │
│  │   ├── user_id, organization_id                               │
│  │   ├── is_primary, is_active                                  │
│  │   └── RLS: Users see their own memberships                   │
│  │                                                               │
│  ├── user_roles (Authorization)                                  │
│  │   ├── user_id, role (enum), organization_id                 │
│  │   ├── is_active, expires_at, granted_by                     │
│  │   └── RLS: Users/Admins see only their org roles             │
│  │                                                               │
│  ├── permissions (Permission Catalog)                            │
│  │   ├── code, name, description                                │
│  │   ├── resource, action, category                             │
│  │   └── RLS: Anyone authenticated can read                     │
│  │                                                               │
│  ├── role_permissions (Role-Permission Mapping)                  │
│  │   ├── role, permission_id, organization_id                   │
│  │   └── RLS: Anyone authenticated can read                     │
│  │                                                               │
│  ├── ca_client_assignments (CA Access)                           │
│  │   ├── ca_user_id, client_organization_id                     │
│  │   ├── access_level, assigned_by, expires_at                  │
│  │   └── RLS: CAs see own, Admins see all                       │
│  │                                                               │
│  ├── audit_logs (Compliance Trail - Append Only)                 │
│  │   ├── user_id, organization_id, action                       │
│  │   ├── resource_type, resource_id, severity                   │
│  │   ├── old_values, new_values, metadata                       │
│  │   ├── ip_address, user_agent, session_id                     │
│  │   └── RLS: Users see their org's logs                        │
│  │                                                               │
│  └── user_sessions (Concurrent Users)                            │
│      ├── user_id, organization_id                               │
│      ├── session_token (UUID), is_active                        │
│      ├── last_activity_at, expires_at                           │
│      └── RLS: Users manage their own                            │
│                                                                   │
│  Security Functions                                              │
│  ├── has_role(user_id, role, org_id)                            │
│  ├── is_super_admin(user_id)                                    │
│  ├── is_org_member(user_id, org_id)                             │
│  ├── has_ca_access(user_id, org_id)                             │
│  ├── has_permission(user_id, code, org_id)                      │
│  └── get_user_organizations(user_id)                            │
│                                                                   │
│  Triggers & Indexes                                              │
│  ├── updated_at timestamp triggers                              │
│  ├── Performance indexes on user_id, org_id, created_at         │
│  └── Unique constraints on memberships/roles                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Clerk Authentication                        │
│                                                                   │
│  User Identity & Session Management                              │
│  ├── User ID (from JWT token)                                   │
│  ├── Email & Profile                                            │
│  └── Session Token Management                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagrams

### Create Organization Flow

```
User clicks "Create Organization"
         │
         ▼
CreateOrganizationDialog opens
         │
         ▼
User fills form (name, slug, email, etc.)
         │
         ▼
Click "Create" button
         │
         ▼
useCreateOrganization() hook called
         │
         ▼
organizationService.createOrganization(data, userId)
         │
         ├── Validate slug uniqueness (SELECT from organizations)
         │
         ├── INSERT new organization
         │
         ├── INSERT user_role (org_admin)
         │
         ├── INSERT user_organization (membership)
         │
         ├── logAudit({action: 'organization.created'})
         │
         └── Return created organization
         │
         ▼
Dialog closes & UI updates
         │
         ▼
Organization appears in switcher
         │
         ▼
User can immediately work with new org
```

### Permission Check Flow

```
Component calls useAuthorization()
         │
         ▼
Hook fetches user_roles from Supabase
         │
         ▼
Hook fetches role_permissions and permissions
         │
         ▼
hasPermission('invoices:create') called
         │
         ▼
Checks: role_permissions WHERE role IN (user_roles)
         │         AND permission_id = (SELECT id FROM permissions WHERE code = 'invoices:create')
         │
         ├─ Found? Return true ──┐
         └─ Not found? Return false ──┐
                                      │
                                      ▼
                          Component renders accordingly
                          ├─ Show button if true
                          └─ Hide if false
```

### Audit Logging Flow

```
User performs action (create invoice)
         │
         ▼
Application code calls organizationService.logAudit({...})
         │
         ├─ userId: 'clerk_user_123'
         ├─ organizationId: 'org_uuid'
         ├─ action: 'invoice.created'
         ├─ resourceType: 'invoice'
         ├─ resourceId: 'invoice_uuid'
         ├─ newValues: {total: 5000, ...}
         └─ severity: 'info'
         │
         ▼
INSERT into audit_logs (append-only)
         │
         ▼
Logged entry persists forever
         │
         ▼
Can be queried for compliance reports
         │
         ▼
Can be exported as CSV
         │
         ▼
Immutable proof of action for audit trail
```

### Session Tracking Flow

```
User logs in
         │
         ▼
useConcurrentUserManagement(orgId) runs
         │
         ▼
Generates UUID sessionToken
         │
         ▼
organizationService.trackUserSession() called
         │
         ▼
INSERT user_sessions row
         │
         ├─ user_id
         ├─ organization_id
         ├─ session_token (UUID)
         ├─ device_info (user agent)
         └─ expires_at (7 days from now)
         │
         ▼
Set up activity event listeners
         │
         ├─ Mouse movement
         ├─ Keyboard input
         └─ Click events
         │
         ▼
On user activity
         └─ Update last_activity_at every 5 seconds
         │
         ▼
Polling every 10 seconds
         ├─ Check active sessions
         ├─ Count concurrent users
         └─ Update UI
         │
         ▼
After 30 minutes idle
         └─ Show expiry warning (5 min before)
         │
         ▼
User can extend or logout
```

## Component Relationships

```
App.tsx
├── ClerkAuthProvider
├── SupabaseAuthProvider
├── OrganizationProvider
│   └── useOrganization() (Context)
│
└── AppSidebar
    ├── OrganizationSwitcher Component
    │   ├── useOrganization() Hook
    │   ├── useAuthorization() Hook
    │   ├── useState() for modal open/close
    │   │
    │   └── CreateOrganizationDialog
    │       ├── useCreateOrganization() Hook
    │       ├── React Hook Form
    │       └── Zod validation
    │
    ├── CAClientSwitcher Component (if CA)
    │   └── useCAClient() Hook
    │
    └── [Settings Icon]
        └── OrganizationSettingsDialog
            ├── useOrganization() Hook
            ├── useAuthorization() Hook
            ├── useInviteUser() Hook
            ├── useOrganizationRoles() Hook
            ├── useAuditLogs() Hook
            └── useConcurrentUserManagement() Hook
                │
                ├── Users Tab
                ├── Roles Tab
                ├── Sessions Tab
                └── Audit Tab


Other Pages
├── InvoicesPage
│   ├── useAuthorization()
│   ├── <PermissionGate permission="invoices:read" />
│   └── organizationService.logAudit() on actions
│
├── ExpensesPage
│   └── Similar pattern...
│
└── AdminPage
    └── useAuthorization()
        ├── hasRole('org_admin')
        └── Show admin features
```

## Security Layers

```
Layer 1: Client-Side Permission Checks
├── useAuthorization() hook
├── hasPermission() method
├── <PermissionGate /> component
└── Purpose: Better UX, hide disabled features

         │
         ▼

Layer 2: API Request Validation
├── organizationService checks
├── Function parameter validation
└── Purpose: Prevent invalid requests

         │
         ▼

Layer 3: Supabase RLS Policies
├── All tables have RLS enabled
├── Policies check current user JWT
├── Policies check organization membership
└── Purpose: Database-level enforcement

         │
         ▼

Layer 4: Security Definer Functions
├── has_role()
├── has_permission()
├── is_org_member()
└── Purpose: Prevent privilege escalation

         │
         ▼

Layer 5: Audit Trail
├── Every action logged
├── Immutable append-only audit_logs
├── Includes user, timestamp, action, changes
└── Purpose: Compliance & forensics
```

## Data State Management

```
localStorage
├── currentOrganizationId
│   └── Persisted when user switches orgs
│
└── currentCAClientId (if CA)
    └── Persisted when CA switches clients

         │
         ▼

React Hooks State
├── useOrganization()
│   ├── organizations[]
│   ├── currentOrganization
│   └── Fetched from user_organizations table
│
├── useAuthorization()
│   ├── roles[]
│   ├── permissions[]
│   ├── isSuperAdmin
│   └── Fetched from user_roles & role_permissions
│
└── useConcurrentUserManagement()
    ├── sessions[]
    ├── concurrentUsers[]
    └── Polled every 10 seconds
```

## Permission Matrix

```
                    super   org
                    admin   admin   ca   mgr   acct  viewer
invoices:create      ✓      ✓      ✓    ✓     ✓      
invoices:read        ✓      ✓      ✓    ✓     ✓     ✓
invoices:update      ✓      ✓      ✓    ✓     ✓
invoices:delete      ✓      ✓      ✓    ✓
invoices:export      ✓      ✓      ✓    ✓     ✓

expenses:create      ✓      ✓      ✓    ✓     ✓
expenses:approve     ✓      ✓      ✓    ✓
expenses:read        ✓      ✓      ✓    ✓     ✓     ✓

users:manage         ✓      ✓
users:invite         ✓      ✓
roles:manage         ✓

audit:view           ✓      ✓      ✓
reports:view         ✓      ✓      ✓    ✓     ✓     ✓
reports:export       ✓      ✓      ✓    ✓     ✓
```

## Error Handling Flow

```
Operation called
         │
         ▼
try/catch block
         │
         ├─ Success
         │  ├── Update state
         │  ├── Show success toast
         │  └── Update UI
         │
         └─ Error
            ├── Catch error
            ├── Set error state
            ├── Show error alert
            ├── Log to console
            └── Return error to caller
```

## Performance Optimization

```
Rendering
├── useCallback() for memoized functions
├── useState() only for needed state
└── Component lazy loading

Data Fetching
├── useEffect() dependency arrays
├── Polling intervals (10 seconds for sessions)
├── Activity debouncing (5 seconds)
└── Pagination (20 logs per page in audit viewer)

Database
├── Indexes on user_id, organization_id, created_at
├── Unique constraints prevent duplicates
├── Referential integrity with CASCADE
└── RLS policies cached by Supabase

Caching
├── localStorage for org/client selection
├── Context API for org data
└── Hook state for auth data
```

---

This architecture provides:
- **Flexibility**: Add/modify roles and permissions easily
- **Security**: Multiple layers of protection
- **Scalability**: Supports unlimited organizations and users
- **Compliance**: Complete audit trail
- **Usability**: Intuitive UI and smooth interactions
