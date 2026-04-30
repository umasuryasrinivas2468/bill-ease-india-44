# AI Command Intelligence Improvements

## Overview
Enhanced the AI command system with conversation memory, contextual awareness, and payment link generation capabilities.

---

## 1. Conversation Memory & Context Awareness

### What Changed
- **Conversation History**: AI now receives the last 10 turns of chat history
- **Business Data Context**: AI receives live business metrics (client count, revenue, pending invoices)
- **Reference Resolution**: AI can resolve "same client", "that amount", "previous invoice", etc.

### Implementation Details

#### Edge Function (`supabase/functions/ai-command/index.ts`)
```typescript
// New interface for conversation messages
interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

// Accepts conversation history and data context
const {
  prompt,
  userId,
  voiceLanguage,
  conversationHistory,  // NEW
  dataContext,          // NEW
} = await req.json();

// Validates and limits to last 10 turns
const history: ConversationMessage[] = Array.isArray(conversationHistory)
  ? conversationHistory
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant"))
      .slice(-10)
  : [];
```

#### Frontend (`src/components/AICommandBar.tsx`)
```typescript
// Passes conversation history to edge function
const { data, error } = await supabase.functions.invoke('ai-command', {
  body: {
    prompt,
    userId: user.id,
    voiceLanguage: 'english',
    conversationHistory: messages
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content })),
    dataContext: {
      clientCount: performanceData?.clientCount,
      vendorCount: performanceData?.vendorCount,
      totalRevenue: performanceData?.totalRevenue,
      totalExpenses: performanceData?.totalExpenses,
      pendingInvoices: performanceData?.pendingInvoices,
    },
  },
});
```

### Enhanced System Prompt
```
**CONVERSATION AWARENESS:**
- You have access to the full conversation history. Use it to understand follow-up questions.
- If the user says "same client" or "same amount", refer to the previous message.
- If a previous command failed, acknowledge it and try to correct.

**USER'S BUSINESS SNAPSHOT:** 
{clientCount} clients, revenue ₹{totalRevenue}, {pendingInvoices} pending invoices.
Use this to give contextual answers.
```

---

## 2. Improved AI Intelligence

### Token Limit Increase
- **Before**: 2048 tokens (could truncate complex responses)
- **After**: 4096 tokens (handles multi-item invoices, detailed explanations)

### New Record Types
Added support for:
- `expense` - Direct expense creation via AI
- `purchase_bill` - Purchase bill generation

### Better Extraction Rules
```
8. Resolve references from conversation history: 
   "same client", "that vendor", "previous amount"
```

---

## 3. Payment Link Generation

### New Feature: AI-Powered Payment Links
Users can now generate Razorpay payment links via natural language commands.

### Commands Supported
```
✅ "Create payment link for INV-2024-0001"
✅ "Send payment link for latest invoice"
✅ "Generate payment link for last invoice"
✅ "Share payment link with customer"
```

### New Edge Function: `create-payment-link`

**Location**: `supabase/functions/create-payment-link/index.ts`

**Features**:
- Uses vendor's OAuth access token from `payment_settings`
- Auto-refreshes expired tokens
- Creates Razorpay Payment Link with customer details
- Sends SMS/Email notifications if contact info available
- Stores payment link in invoice record
- Sets expiry based on invoice due date

**API**:
```typescript
POST /functions/v1/create-payment-link
{
  "invoiceId": "uuid",
  "userId": "uuid",
  "customerName": "Acme Corp",
  "customerEmail": "contact@acme.com",
  "customerPhone": "+919876543210"
}

Response:
{
  "success": true,
  "paymentLink": "https://rzp.io/l/abc123",
  "paymentLinkId": "plink_xyz",
  "amount": 50000,
  "invoiceNumber": "INV-2024-0001"
}
```

### Frontend Integration

#### Intent Detection
```typescript
{ 
  intent: 'create_payment_link', 
  re: /\b(create|generate|make|send|share)\b.*\b(payment\s*link|pay\s*link)\b/i 
}
```

#### Handler Function
```typescript
const handleCreatePaymentLink = async (prompt: string) => {
  // Extract invoice number or use "latest"
  // Fetch invoice details
  // Call create-payment-link edge function
  // Return formatted message with link
}
```

### Database Schema
Payment link fields added to `invoices` table:
```sql
ALTER TABLE invoices ADD COLUMN payment_link TEXT;
ALTER TABLE invoices ADD COLUMN payment_link_id TEXT;
```

---

## 4. Configuration Updates

### Supabase Config (`supabase/config.toml`)
```toml
[functions.create-payment-link]
verify_jwt = false
```

### Environment Variables Required
```bash
RAZORPAY_PARTNER_CLIENT_ID=your_client_id
RAZORPAY_PARTNER_CLIENT_SECRET=your_client_secret
RAZORPAY_MODE=live  # or "test"
PUBLIC_APP_URL=https://app.aczen.in
```

---

## 5. Testing Guide

### Test Conversation Memory
```
You: "Create an invoice for Acme Corp for ₹50000"
AI: [Creates invoice]

You: "Create another one for the same client for ₹25000"
AI: [Should recognize "same client" = Acme Corp]

You: "What was the first amount?"
AI: [Should recall ₹50000]
```

### Test Multi-Step Commands
```
You: "Create a client named TechStart with email tech@start.com and then create an invoice for them for ₹75000"
AI: [Should handle both actions]
```

### Test Payment Links
```
You: "Create an invoice for ABC Corp for ₹100000"
AI: [Creates INV-2024-0123]

You: "Create payment link for that invoice"
AI: [Generates payment link for INV-2024-0123]

You: "Send payment link for latest invoice"
AI: [Generates payment link for most recent invoice]
```

### Test Contextual Awareness
```
You: "How's my business doing?"
AI: [Should reference your actual client count, revenue, pending invoices]
```

### Test Reference Resolution
```
You: "Create a vendor named ABC Supplies"
AI: [Creates vendor]

You: "Create a purchase bill from them for ₹30000"
AI: [Should resolve "them" = ABC Supplies]
```

---

## 6. Error Handling

### Payment Link Errors
```typescript
// Not activated
"Online payments not activated. Please connect Razorpay in Settings → Payments."

// Token expired
"Payment authorization expired. Please reconnect Razorpay in Settings."

// Insufficient permissions
"Payment authorization missing permissions. Please reconnect Razorpay."

// Invoice already paid
"Invoice INV-2024-0001 is already paid. No payment link needed."

// Invoice not found
"Invoice INV-2024-0001 not found. Please check the invoice number."
```

---

## 7. Benefits

### For Users
✅ **Natural Conversations**: "Create another one for the same client"
✅ **Context Awareness**: AI knows your business metrics
✅ **Multi-Step Commands**: "Create client and invoice in one go"
✅ **Payment Collection**: Generate payment links instantly
✅ **Smarter Responses**: AI remembers previous messages

### For Business
✅ **Faster Payments**: Share payment links immediately
✅ **Better UX**: More natural, conversational interface
✅ **Reduced Errors**: AI resolves ambiguities from context
✅ **Increased Efficiency**: Handle complex commands in one shot

---

## 8. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    User Input (Natural Language)             │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              AICommandBar (Frontend)                         │
│  • Intent Detection (Regex)                                  │
│  • Entity Resolution (Client/Vendor lookup)                  │
│  • Conversation History Management                           │
│  • Data Context Collection                                   │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│         ai-command Edge Function                             │
│  • Receives: prompt + history + dataContext                  │
│  • Calls: Lovable AI (Gemini 2.5 Flash)                     │
│  • System Prompt: Conversation-aware, contextual             │
│  • Max Tokens: 4096                                          │
└────────────────────────────┬────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│  Create Record           │  │  Create Payment Link     │
│  • Invoice               │  │  • Fetch invoice         │
│  • Client                │  │  • Load payment settings │
│  • Vendor                │  │  • Refresh token         │
│  • Expense               │  │  • Call Razorpay API     │
│  • Purchase Bill         │  │  • Store link in DB      │
│  • etc.                  │  │  • Return link URL       │
└──────────────────────────┘  └──────────────────────────┘
                │                         │
                └────────────┬────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Response to User                          │
│  • Success message                                           │
│  • Record ID                                                 │
│  • Payment link (if applicable)                              │
│  • Image (if educational)                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Files Modified

### Edge Functions
- ✅ `supabase/functions/ai-command/index.ts` - Enhanced with memory & payment links
- ✅ `supabase/functions/create-payment-link/index.ts` - NEW

### Frontend
- ✅ `src/components/AICommandBar.tsx` - Added history passing & payment link handler
- ✅ `src/components/ai-command/ChatMessage.tsx` - Added payment_link icon & path

### Configuration
- ✅ `supabase/config.toml` - Added create-payment-link function

---

## 10. Next Steps

### Recommended Enhancements
1. **Email Integration**: Auto-send payment links via email
2. **WhatsApp Integration**: Share payment links on WhatsApp
3. **Payment Status Tracking**: "Check payment status for INV-2024-0001"
4. **Bulk Payment Links**: "Create payment links for all pending invoices"
5. **Payment Reminders**: "Send reminder for unpaid invoices"
6. **Analytics**: Track payment link conversion rates

### Testing Checklist
- [ ] Test conversation memory with 5+ turn conversations
- [ ] Test payment link creation for various invoice states
- [ ] Test with expired Razorpay tokens (auto-refresh)
- [ ] Test with missing payment settings (error handling)
- [ ] Test multi-step commands (create + payment link)
- [ ] Test reference resolution ("same", "that", "previous")
- [ ] Test contextual answers using business data

---

## 11. Deployment

### Prerequisites
1. Razorpay Partner OAuth configured
2. `payment_settings` table exists with OAuth tokens
3. Environment variables set in Supabase

### Deploy Commands
```bash
# Deploy edge functions
supabase functions deploy ai-command
supabase functions deploy create-payment-link

# Verify deployment
supabase functions list
```

### Verify
```bash
# Test payment link creation
curl -X POST https://your-project.supabase.co/functions/v1/create-payment-link \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceId": "uuid",
    "userId": "uuid"
  }'
```

---

## Summary

The AI command system is now significantly more intelligent with:
- **Conversation memory** for natural follow-ups
- **Business context awareness** for relevant answers
- **Payment link generation** for instant payment collection
- **Better extraction** with 4096 token limit
- **Multi-step command** handling

Users can now have natural, multi-turn conversations and generate payment links instantly, making the system more powerful and user-friendly.
