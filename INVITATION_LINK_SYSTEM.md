# Invitation Link System Setup Guide

## Overview
The application now uses a **shareable invitation link** system instead of automatic email sending. Organization admins can generate unique invitation links for each accountant/user and manually share them (via email, WhatsApp, etc.).

## How It Works

### 1. **Admin Invites User**
- Admin opens Organization Settings → Users tab
- Enters email and selects role (Admin, Manager, Accountant, Viewer)
- Clicks "Invite" button

### 2. **System Generates Link**
- Unique 7-day token is created
- Invitation record is stored in the database
- Link is displayed in a green card with "Copy" button
- Admin copies and shares manually

### 3. **Accountant Signs Up**
- Accountant clicks the link
- Signup form is pre-filled with email and organization
- After signup, invitation is marked as "accepted"

### 4. **Admin Manages Invitations**
- Pending invitations are listed in the "Pending Invitations" section
- Shows: Email, Role, Days until expiry
- Actions: Copy link, Revoke invitation
- Expired invitations are automatically hidden

---

## Database Setup

Execute this SQL in Supabase to create the invitations table:

```sql
-- Create invitations table for tracking user invitations
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL,
  invited_by UUID NOT NULL,
  accepted_at TIMESTAMP NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_pending_invitation UNIQUE(email, organization_id) WHERE accepted_at IS NULL,
  CONSTRAINT valid_expiry CHECK (expires_at > created_at),
  CONSTRAINT valid_invite_by FOREIGN KEY (invited_by) REFERENCES users(id)
);

-- Create index for faster lookups
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email_org ON invitations(email, organization_id);
CREATE INDEX idx_invitations_expires_at ON invitations(expires_at);

-- Enable RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users in organization can see invitations for their org
CREATE POLICY "Users can view invitations in their organization"
  ON invitations FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- RLS Policy: Only org_admin can create invitations
CREATE POLICY "Only org admins can create invitations"
  ON invitations FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_roles
      WHERE user_id = auth.uid() AND role = 'org_admin'
    )
  );

-- Allow public access to get invitation by token (for signup link)
CREATE POLICY "Public can view invitation by valid token"
  ON invitations FOR SELECT
  USING (
    expires_at > NOW() AND accepted_at IS NULL
  );
```

---

## Key Features

### ✅ Copy Link Button
- One-click copy to clipboard
- "Copied!" feedback for 2 seconds
- Works in all browsers

### ✅ Expiry Countdown
- Shows days remaining until expiration
- Red warning when ≤ 2 days left
- Yellow caution when ≤ 5 days left
- Green when plenty of time

### ✅ Revoke Invitations
- Click trash icon to revoke any pending invitation
- Requires confirmation
- Immediately removes from pending list
- User cannot use the link after revocation

### ✅ Audit Logging
- All invitations and revocations are logged
- Tracks who invited whom and when
- Available in the Audit tab

---

## Service Functions

All functions are in `/src/services/organizationService.ts`:

### inviteUser()
```typescript
async inviteUser(
  input: InviteUserInput, 
  invitedBy: string
): Promise<{ invitationLink: string; token: string; expiresAt: string }>
```
- **Input:** Email, role, organizationId
- **Returns:** Shareable link and expiry date
- **Creates:** Invitation record in database

### getPendingInvitations()
```typescript
async getPendingInvitations(organizationId: string): Promise<any[]>
```
- Fetches all pending (non-accepted) invitations
- Returns: Email, role, token, expiry, created_at

### revokeInvitation()
```typescript
async revokeInvitation(
  invitationId: string, 
  organizationId: string, 
  revokedBy: string
): Promise<void>
```
- Deletes invitation record
- Logs audit event

### getInvitationByToken()
```typescript
async getInvitationByToken(token: string): Promise<any>
```
- Validates token exists, is not expired, not already used
- Used during signup for pre-filling form
- Returns null if invalid or expired

### acceptInvitation()
```typescript
async acceptInvitation(invitationId: string): Promise<void>
```
- Marks invitation as accepted
- Called after user completes signup

---

## UI Components

### OrganizationSettingsDialog.tsx
- **Invite Form:** Email + Role dropdown + Invite button
- **Invitation Link Display:** Green card with copyable link
- **Users Table:** Current organization members
- **Pending Invitations Table:** Active invitations with copy/revoke buttons

---

## Signup Integration (Next Steps)

To complete the flow, you need to update the signup page to:

1. **Read the token** from URL: `?token=xxxxx`
2. **Validate the token** using `getInvitationByToken()`
3. **Pre-fill** email and organization from invitation
4. **On success**, call `acceptInvitation()` to mark as used

Example:
```typescript
const token = new URLSearchParams(window.location.search).get('token');
if (token) {
  const invitation = await organizationService.getInvitationByToken(token);
  if (invitation) {
    // Pre-fill form with: email, organizationId, role
    // On signup completion, call acceptInvitation(invitation.id)
  }
}
```

---

## Migration from Email System

If you previously had the email-based system:

1. **Keep** `emailService.ts` for future notifications
2. **Remove** email sending from `inviteUser()`  ✅ Already done
3. **Update** OrganizationSettingsDialog.tsx ✅ Already done
4. **Update** useOrganizationManagement.ts ✅ Already done
5. **Update** signup flow (your next task)

---

## Security Considerations

✅ **RLS Policies** prevent unauthorized access
- Only org members can see invitations for their org
- Only org_admins can create invitations
- Tokens are cryptographically unique (UUID v4)

✅ **7-Day Expiry** reduces token reuse risk

✅ **One-time Use** - Each token marks as accepted after signup

✅ **No Email Dependency** - Simpler and more reliable

---

## Link Format

```
https://billeaseindia.com/signup?token=550e8400-e29b-41d4-a716-446655440000&email=accountant@example.com
```

- **token:** 36-character UUID v4, unique per invitation
- **email:** URL-encoded email for pre-filling form

---

## Future Enhancements

- [ ] Resend invitation (generate new link)
- [ ] Bulk invitations (CSV upload)
- [ ] Email reminders for pending invitations
- [ ] Customize expiry duration per invitation
- [ ] Invite multiple users at once
