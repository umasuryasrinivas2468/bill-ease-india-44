# Quick Fix: Create Invitations Table in Supabase

## The Problem
You're getting a 404 error because the `invitations` table doesn't exist in Supabase yet.

## The Solution
Execute the SQL from `EXECUTE_INVITATIONS_TABLE.sql` in your Supabase dashboard.

### Steps:

1. **Open Supabase Dashboard**
   - Go to: https://app.supabase.com
   - Select your project

2. **Navigate to SQL Editor**
   - Left sidebar → SQL Editor

3. **Create New Query**
   - Click "+ New Query"

4. **Copy & Paste**
   - Open: `EXECUTE_INVITATIONS_TABLE.sql` in this repository
   - Copy all the SQL code

5. **Paste into Supabase**
   - Paste into the SQL editor

6. **Execute**
   - Click the blue "Run" button (or Ctrl+Enter)
   - Wait for success message

7. **Verify**
   - Go to Tables (left sidebar)
   - You should see `invitations` table listed
   - Click it to see the schema

---

## What Gets Created

✅ **Table:** `invitations`
- id (UUID, primary key)
- email (user email)
- organization_id (foreign key)
- token (unique, 7-day session)
- role (admin/manager/accountant/viewer)
- invited_by (who sent the invite)
- accepted_at (null until user accepts)
- expires_at (7 days from creation)
- created_at (timestamp)

✅ **Indexes** for fast queries
- By token
- By organization + email
- By expiry date (for cleanup)

✅ **RLS Policies** (security)
- Only org members can see pending invites
- Only org_admin can create/revoke

---

## Done! 

When you return to the app and try to invite a user again, it should work now. The invitations link will display in the green card.

---

## If Still Getting 404

1. Check the table exists: Supabase → Tables → should see `invitations`
2. Check the policy: Table → Policies → should see 5 policies
3. If missing, run the SQL again
4. Hard refresh your app: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
