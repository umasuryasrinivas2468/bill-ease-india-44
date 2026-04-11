# Email Invitation Setup Guide

## 🎯 What Was Implemented

When you invite a user:
1. ✅ User is added to the organization with their role
2. ✅ **Email is sent** with invitation link and details
3. ✅ User can click link to sign up directly
4. ✅ Audit log tracks the invitation

---

## 📧 Setup Steps

### **Step 1: Get Resend API Key** (2 minutes)

1. Go to [resend.com](https://resend.com)
2. Click **Sign Up** (free)
3. Create account
4. Go to **Dashboard** → **API Keys**
5. Copy your API key (starts with `re_`)

### **Step 2: Add Environment Variable**

In your `.env.local` file, add:

```env
VITE_RESEND_API_KEY=re_your_api_key_here
```

**Replace** `re_your_api_key_here` with your actual API key from Step 1.

### **Step 3: Restart Dev Server**

```bash
npm run dev
```

---

## 🧪 Test It

### **Test 1: Send Invitation**

1. Open app → Organization Settings (gear icon)
2. Go to **Users** tab
3. Invite user: **testuser@example.com** as **Manager**
4. Click **Invite**
5. Check Chrome DevTools **Console** for:
   ```
   [emailService] Invitation email sent successfully: email_xxxxx
   ```

✅ **Success** = You'll see the success message

### **Test 2: Check Email**

1. Go to [Resend Dashboard](https://resend.com/emails)
2. Look for email to **testuser@example.com**
3. Click to view full email content
4. Verify it shows:
   - Organization name
   - Role (Manager)
   - Your name (inviter)
   - **Signup link** with email pre-filled

### **Test 3: Generate Verification Code**

In browser console, run:
```javascript
// Test email sending
await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer re_your_api_key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    from: 'test@resend.dev',
    to: 'your-email@example.com',
    subject: 'Test Email',
    html: '<p>If you see this, emails work!</p>'
  })
})
.then(r => r.json())
.then(d => console.log('Result:', d))
```

---

## 🔧 Email Configuration

### **Current Email Settings**

```typescript
// From address
from: 'Bill Ease <invitations@billeaseindia.com>'

// HTML Template
- Organization name
- Inviter name
- Role with description
- Signup link (auto-filled email)
- Access permissions list
- 7-day expiry notice
```

### **Customize Email (Optional)**

To change the email template, edit: `src/services/emailService.ts`

Look for **sendInvitationEmail** function and modify the `htmlContent` variable.

---

## 📩 What Gets Sent

### **Email Content**

```
Subject: You're invited to join YourOrg on Bill Ease India

Body:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Welcome to Bill Ease India! 🎉

John Smith has invited you to join 
Your Organization on Bill Ease India as a Manager.

[ACCEPT INVITATION & SIGN UP BUTTON]
↓ (links to signup form with email pre-filled)

Your Access Includes:
✅ Organization: Your Organization
✅ Role: Manager
✅ Access to invoices, expenses, and reports
✅ Real-time collaboration

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This invitation expires in 7 days.
© 2026 Bill Ease India. All rights reserved.
```

---

## ⚙️ Advanced Configuration

### **Use Different Email Provider**

If you want to use **SendGrid** instead:

1. Install: `npm install @sendgrid/mail`
2. Get API key from [SendGrid](https://sendgrid.com)
3. Modify `emailService.ts` to use SendGrid client
4. Update the function implementation

### **Custom From Email**

To use your organization's domain email:

1. Add DKIM records to your domain (Resend shows how)
2. Verify domain in Resend dashboard
3. Change `from:` in emailService.ts to your email
4. Example: `from: 'noreply@yourcompany.com'`

### **Track Email Opens**

Resend tracks email opens automatically. View in dashboard.

---

## 🐛 Troubleshooting

### **Issue: "API key not found"**

**Fix:**
```bash
# Check .env.local exists
cat .env.local

# Should contain:
VITE_RESEND_API_KEY=re_xxxxx

# Restart dev server
npm run dev
```

### **Issue: Email not sent but no error**

**Check:**
1. Open Browser Console (F12)
2. Look for logs starting with `[emailService]`
3. Check if email is in Resend dashboard
4. Verify recipient email is valid

### **Issue: Email in sandbox mode (Resend free tier)**

**Solution:**
- Free tier only sends to emails you approved
- Go to Resend → Verified Domains
- Add recipient email to approved list
- Or upgrade to paid plan (sends to anyone)

### **Issue: signup link doesn't work**

**Fix:**
- Check your app's actual domain in `src/services/organizationService.ts`
- Change line: `const appUrl = window?.location?.origin || 'https://billeaseindia.com'`
- Replace with your actual domain

---

## 📊 Email Flow Diagram

```
You (Org Admin)
    ↓
Click "Invite User" Button
    ↓
Fill: email, role, click Invite
    ↓
organizationService.inviteUser()
    ↓
├─ Insert user_roles record
├─ Insert user_organizations record
├─ Log audit event
└─ Call sendInvitationEmail()
    ↓
emailService.sendInvitationEmail()
    ↓
Call Resend API
    ↓
Resend sends email
    ↓
User receives email with link
    ↓
User clicks "Accept & Sign Up"
    ↓
Email pre-filled in signup form
    ↓
User signs up with Clerk
    ↓
User appears in organization
```

---

## ✅ Next Steps

1. **Get API Key** from Resend (2 min)
2. **Add to .env.local** (1 min)
3. **Restart dev server** (1 min)
4. **Test invitation** (5 min)
5. **Verify email received** (2 min)

**Total setup time: ~10 minutes**

---

## 💡 What's Already Automatic

Once you complete setup:

✅ When you invite a user:
- Email sent automatically
- To correct email address  
- With organization name, role, etc.
- Pre-filled signup link
- Branded with your content

✅ Email includes:
- Professional formatting
- Clear call-to-action button
- Security notice (7-day expiry)
- Organization & role details
- Copyright footer

✅ Tracking:
- Logs to browser console
- Resend dashboard shows deliverability
- Audit trail records invitation
- Failed emails logged but don't block invitation

---

**Questions?**

Check:
- Resend dashboard for email logs
- Browser console for JavaScript errors
- `.env.local` for correct API key
- Spam folder (sometimes emails go there)

Enjoy! 🚀
