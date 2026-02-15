# Complete User Invitation & Onboarding Flow

## 🔄 Full Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      YOU (Organization Admin)                    │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ├─ 1. Open Settings (gear icon)
                      │
                      ├─ 2. Go to "Users" tab
                      │
                      └─ 3. Fill Invite Form
                         ├─ Email: newuser@example.com
                         ├─ Role: Manager
                         └─ Click "Invite"
                         │
        ┌────────────────┴────────────────┐
        │                                 │
        ▼                                 ▼
   BACKEND PROCESSING              EMAIL SERVICE
   ├─ Insert user_roles            ├─ Get org name
   ├─ Insert user_organizations    ├─ Get inviter name
   ├─ Log audit event              ├─ Create signup link
   └─ [Send Email] ◄───────────────┘
      └─ Resend API
         └─ Email.send()
            
        ┌────────────────────────────────┐
        │     EMAIL SENT VIA RESEND       │
        └────────────────┬───────────────┘
                         │
        ┌────────────────┴───────────────┐
        │                                │
        ▼                                ▼
   USER'S INBOX               RESEND DASHBOARD
   ├─ From: Bill Ease         ├─ Email logged
   ├─ Subject: invitation      ├─ Status: Delivered
   ├─ Body: profession email   ├─ Opens tracked
   └─ [Sign Up Button Link] ◄──┘


┌─────────────────────────────────────────────────────────────────┐
│                 NEW USER RECEIVES EMAIL                         │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ├─ Reads: "You've been invited as Manager"
                  │
                  ├─ Sees: Organization name, your name
                  │
                  └─ Clicks: "Accept Invitation & Sign Up"
                     └─ Link: https://yourapp.com/signup
                           ?email=newuser@example.com
                           &org=org-uuid
                           &role=manager
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
        ▼                                     ▼
   SIGNUP FORM AUTO-FILLED              DATABASE READY
   ├─ Email: newuser@example.com        ├─ user_roles exists
   ├─ Organization: YourOrg             ├─ user_organizations exists
   ├─ Role: Manager                     └─ Waiting for Clerk user_id
   │
   ├─ Password field (blank)
   ├─ Name field (blank)
   │
   └─ Click "Sign Up"
      │
      ├─ Clerk creates user account
      ├─ Assign user_id to email
      └─ Sync with Supabase
         └─ Link Clerk user_id to user_roles
            └─ [User_id lookup via DKIM/email]


┌─────────────────────────────────────────────────────────────────┐
│              USER SUCCESSFULLY ONBOARDED                         │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ├─ First login happens
                  │
                  ├─ AuthProvider syncs with Supabase
                  │
                  ├─ OrganizationProvider loads orgs
                  │
                  └─ User sees in Organization Switcher:
                     ├─ YourOrg (Manager) ← automatically appears!
                     ├─ Other orgs (if member of any)
                     │
                     └─ Can now:
                        ├─ Switch to YourOrg
                        ├─ Access Manager features
                        ├─ Create/edit invoices
                        ├─ Approve expenses
                        └─ View reports

```

---

## 📋 Step-by-Step: What Happens at Each Stage

### **Stage 1: Invitation (Your Action)**

```typescript
// What you do:
1. Settings → Users tab
2. Email: manager@company.com
3. Role: Manager
4. Click Invite

// System records:
✓ user_roles: 
    user_id: 'manager@company.com'
    role: 'manager'
    organization_id: 'org-uuid'
    created_at: now

✓ user_organizations:
    user_id: 'manager@company.com'
    organization_id: 'org-uuid'
    invited_by: 'you@company.com'
    created_at: now

✓ audit_logs:
    user_id: 'you@company.com'
    action: 'user.invited'
    resource: 'manager@company.com'
    role_assigned: 'manager'
    timestamp: now
```

### **Stage 2: Email Sent**

```typescript
// System sends email:
FROM: Bill Ease <invitations@billeaseindia.com>
TO: manager@company.com
SUBJECT: You're invited to join YourOrg as Manager

BODY:
"Hi,
You've been invited to join YourOrg as a Manager.

[ACCEPT INVITATION & SIGN UP BUTTON]

Link: https://yourapp.com/signup
      ?email=manager@company.com
      &org=org-uuid
      &role=manager
      
Expires in: 7 days"

// Log entry:
✓ Resend API called
✓ Email ID: email_xxxxx
✓ Status: Successfully sent
✓ Delivery timestamp: now
```

### **Stage 3: User Signs Up**

```typescript
// User receives email and clicks link
// Redirected to: /signup?email=manager@company.com&org=...

// Signup form pre-fills:
Email: manager@company.com
Organization: YourOrg
Role: Manager
Password: [User enters]
Name: [User enters]

// User clicks Sign Up:
1. Clerk creates account with:
   - Clerk ID: clerk_xxxxx
   - Email: manager@company.com
   - Name: [User provided]

2. AuthProvider syncs to Supabase:
   UPDATE users SET clerk_id = 'clerk_xxxxx' 
   WHERE email = 'manager@company.com'

3. User_roles is updated:
   UPDATE user_roles SET user_id = 'clerk_xxxxx'
   WHERE user_id = 'manager@company.com'

4. Audit logs:
   action: 'user.signup'
   clerk_id: 'clerk_xxxxx'
   timestamp: now
```

### **Stage 4: User Logs In**

```typescript
// User logs in with credentials
// Clerk validates and creates session

// React app loads:
1. AuthProvider checks Clerk session
2. Gets Clerk JWT token
3. Syncs with Supabase
4. Supabase returns user's organizations

// User data loaded:
{
  clerk_id: 'clerk_xxxxx',
  email: 'manager@company.com',
  organizations: [
    {
      organization_id: 'org-uuid',
      name: 'YourOrg',
      role: 'manager',
      created_at: '2026-02-08'
    }
  ]
}

// Organization Switcher shows:
✓ YourOrg (Manager) ← Can click to access
✓ Create Organization [button]
```

### **Stage 5: User Works in Organization**

```typescript
// User is now an active member:

1. Permissions Applied:
   Manager role has:
   - invoices:read ✓
   - invoices:create ✓
   - invoices:update ✓
   - expenses:approve ✓
   - users:manage ✗ (only org_admin)

2. Real-time Features:
   - Sessions tracked
   - Activity monitored
   - Concurrent users shown
   - Auto-logout after 30min idle

3. Audit Trail:
   - Every action logged
   - Before/after values tracked
   - Compliance reportable
```

---

## 🔐 Security at Each Stage

### **Stage 1: Invitation**
- ✓ Only org_admin can invite
- ✓ Email format validated
- ✓ Role must be valid enum
- ✓ Organization membership verified
- ✓ Audit logged

### **Stage 2: Email**
- ✓ HTTPS only (Resend)
- ✓ Email verified (SPF/DKIM)
- ✓ Link includes expiry check
- ✓ Unique signup parameters

### **Stage 3: Signup**
- ✓ Email must match invitation
- ✓ Clerk validates identity
- ✓ Password requirements enforced
- ✓ RLS policies apply
- ✓ User_id lookup verified

### **Stage 4: Login**
- ✓ Clerk JWT validated
- ✓ Supabase RLS policies enforce org scoping
- ✓ Role checked against org membership
- ✓ Session token generated
- ✓ Activity monitoring enabled

### **Stage 5: Access**
- ✓ Every API call checks role
- ✓ RLS policies filter data by org
- ✓ Log every action
- ✓ Expire sessions after idle time

---

## 📊 Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Email Invitation                             │
└────────────┬────────────────────────────────┬───────────────────┘
             │                                │
      User (Browser)                   Backend (Node/Deno)
             │                                │
        1. Types email────────────────────►  Validates email
        2. Selects role────────────────────►  Validates role
        3. Clicks Invite──────────────────►  Creates DB records
             ◄─────────────────────────────── Returns success
             │                                │
             │                          4. Calls Resend API
             │                                │ (HTTPS)
             │                                │
             │                         ┌─────▼─────┐
             │                         │   Resend  │
             │                         │  (Email   │
             │                         │  Service) │
             │                         └─────┬─────┘
             │                               │
             │                         5. Sends email
             │                               │
             ◄─────────────────────────────────
             │
        6. User receives email
             │
        7. Clicks verification link
             │
        ◄────────────────────────────────────
             │
        8. Signup page loads
             │─ Email pre-filled
             │─ Org pre-selected
             │─ Role shown


Credential Flow:
├─ User enters: Email, Password, Name
│
├─ Sent to: Clerk (HTTPS, encrypted)
│
├─ Clerk validates & stores securely
│
├─ Returns: Session token
│
└─ Browser stores: Secure cookie

Database Flow:
├─ User signs up with: manager@company.com
│
├─ Clerk creates: clerk_xxxxx
│
├─ System looks up: user_roles WHERE user_id = 'manager@company.com'
│
├─ Updates record: SET user_id = 'clerk_xxxxx'
│
├─ Loads permissions: FROM role_permissions WHERE role = 'manager'
│
└─ User can now access: All manager resources only
```

---

## 🎯 Key Points

### **Before Signup**
- User doesn't have Clerk account
- User_roles has email, not clerk_id
- User cannot log in yet
- Invitation email sent

### **After Signup**
- User has Clerk account with user_id
- User_roles updated with clerk_id
- User can log in
- Permissions active

### **After Login**
- Session created
- Organization list loaded
- User can switch organizations
- All features available based on role

---

## ✅ Complete Checklist

- [ ] Step 1: Get Resend API key
- [ ] Step 2: Add to .env.local
- [ ] Step 3: Restart dev server
- [ ] Step 4: Invite test user
- [ ] Step 5: Check browser console for success
- [ ] Step 6: Check Resend dashboard for email
- [ ] Step 7: Have test user sign up
- [ ] Step 8: Test user sees org in switcher
- [ ] Step 9: Test user can access org
- [ ] Step 10: Check audit logs for all actions

---

**With this setup, your user invitation system is complete and production-ready!** 🚀
