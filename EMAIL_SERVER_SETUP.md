# Email Server Setup Instructions

## ✅ Email Functionality Added

Your license generation system now includes:

### 📧 **Email Features:**
- ✅ Automatic email sending after license generation
- ✅ Welcome email with Aczen branding
- ✅ Two attachments included:
  1. **Welcome Letter** (`.txt` file) with complete welcome message
  2. **License Certificate PDF** with QR code of license key

### 📄 **Email Content:**
- ✅ **Welcome Letter**: Complete welcome message mentioning "Welcome to Aczen, one stop accounting software" ending with "Regards Team Aczen"
- ✅ **PDF Certificate**: User email, license key, expiry date in table format with QR code
- ✅ **Aczen Branding**: Professional design with Aczen logo and branding

## 🚀 **How to Start Email Server:**

### Step 1: Navigate to email server directory
```bash
cd src/api
```

### Step 2: Install dependencies
```bash
npm install
```

### Step 3: Start the email server
```bash
node emailServer.js
```

You should see:
```
📧 Email API server running on port 3001
Ready to send Aczen license emails!
```

## 🧪 **How to Test:**

1. **Start both servers:**
   - Main app: `npm run dev` (port 8080)
   - Email server: `cd src/api && node emailServer.js` (port 3001)

2. **Generate a license:**
   - Go to http://localhost:8080/starter.202512a
   - Enter an email address
   - Click "Generate Starter License"

3. **Check email:**
   - Email will be sent to the provided address
   - Contains welcome letter and PDF certificate
   - PDF includes QR code of license key

## 📧 **Email Details:**

### **From:** Aczen <onboarding@resend.dev>
### **Subject:** Welcome to Aczen - Your [plan] License Key

### **Attachments:**
1. **Welcome_to_Aczen.txt** - Welcome letter
2. **Aczen_License_[plan]_[key].pdf** - Certificate with QR code

### **Email Template:**
- Professional HTML design
- Aczen branding colors
- License details display
- Welcome message
- Next steps guide

## 🔧 **Configuration:**

The email service uses your Resend API key: `re_EapcU328_C9ZT39spPGKz5FATg2Xs9cud`

Email server runs on: http://localhost:3001

## ✅ **Ready to Use!**

Your complete license generation system with email functionality is now ready. Users will receive professional welcome emails with license certificates after generating their keys!

## 🎯 **Test URLs:**
- Starter: http://localhost:8080/starter.202512a
- Growth: http://localhost:8080/growth.202514b  
- Scale: http://localhost:8080/scale.202516c