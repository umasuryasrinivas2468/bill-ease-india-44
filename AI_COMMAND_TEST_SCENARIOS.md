# AI Command Test Scenarios

## Quick Test Commands

### 1. Payment Link Generation

#### Basic Payment Link
```
"Create payment link for INV-2024-0001"
```
**Expected**: Payment link generated with Razorpay URL

#### Latest Invoice
```
"Send payment link for latest invoice"
```
**Expected**: Finds most recent invoice and generates link

#### After Creating Invoice
```
User: "Create invoice for Acme Corp for ₹50000"
AI: [Creates INV-2024-0123]

User: "Create payment link for that invoice"
```
**Expected**: Generates link for INV-2024-0123

---

### 2. Conversation Memory

#### Same Client Reference
```
User: "Create invoice for TechCorp for ₹100000"
AI: [Creates invoice]

User: "Create another invoice for the same client for ₹50000"
```
**Expected**: Creates second invoice for TechCorp

#### Amount Recall
```
User: "Create invoice for ABC Ltd for ₹75000"
AI: [Creates invoice]

User: "What was the amount?"
```
**Expected**: "₹75,000"

#### Entity Reference
```
User: "Create a vendor named XYZ Supplies"
AI: [Creates vendor]

User: "Create a purchase bill from them for ₹30000"
```
**Expected**: Creates bill for XYZ Supplies

---

### 3. Multi-Step Commands

#### Create Client + Invoice
```
"Create a client named StartupCo with email hello@startup.co and then create an invoice for them for ₹125000 with 18% GST"
```
**Expected**: 
1. Creates client StartupCo
2. Creates invoice for StartupCo

#### Create Invoice + Payment Link
```
"Create invoice for MegaCorp for ₹200000 and generate payment link"
```
**Expected**:
1. Creates invoice
2. Generates payment link
3. Returns both invoice number and payment URL

---

### 4. Contextual Awareness

#### Business Overview
```
"How's my business doing?"
```
**Expected**: Response includes actual client count, revenue, pending invoices

#### Payment Follow-up
```
"Should I follow up on payments?"
```
**Expected**: If pending invoices > 0, suggests following up

---

### 5. Indian Accounting Specifics

#### Amount Formats
```
"Create invoice for ABC Corp for 2.5 lakhs"
```
**Expected**: Creates invoice for ₹250,000

```
"Create expense for 50k"
```
**Expected**: Creates expense for ₹50,000

#### GST Rates
```
"What's the GST rate for software services?"
```
**Expected**: "18% under SAC 998314"

#### GST Number Extraction
```
"Create client named TechSolutions with GST 27AABCT1234C1Z5"
```
**Expected**: Client created with GST number stored

---

### 6. Error Handling

#### Payment Link - Not Activated
```
"Create payment link for INV-2024-0001"
```
**Expected** (if Razorpay not connected):
"Online payments not activated. Please connect Razorpay in Settings → Payments."

#### Payment Link - Already Paid
```
"Create payment link for INV-2024-0001"
```
**Expected** (if invoice paid):
"Invoice INV-2024-0001 is already paid. No payment link needed."

#### Payment Link - Not Found
```
"Create payment link for INV-9999-9999"
```
**Expected**:
"Invoice INV-9999-9999 not found. Please check the invoice number."

#### Ambiguous Command
```
"Create an invoice"
```
**Expected**:
"Please specify the client and amount. Example: 'Create invoice for Acme Corp for ₹50000'"

---

### 7. Complex Scenarios

#### Full Invoice Workflow
```
User: "Create client named GlobalTech with email contact@global.tech"
AI: [Creates client]

User: "Create invoice for them for 1 lakh with 18% GST"
AI: [Creates invoice INV-2024-0045]

User: "Generate payment link for that invoice"
AI: [Creates payment link]

User: "What's the total amount?"
AI: "₹1,18,000 (₹1,00,000 + ₹18,000 GST)"
```

#### Expense with Vendor
```
User: "Create vendor named Office Supplies Co"
AI: [Creates vendor]

User: "Record expense of ₹5000 from them for stationery"
AI: [Creates expense linked to vendor]
```

#### Stock Check + Invoice
```
User: "Check stock for laptops"
AI: "Laptop: 10 units @ ₹50,000"

User: "Create invoice for TechBuyer for 3 laptops"
AI: [Creates invoice with 3 laptops @ ₹50,000 each = ₹1,50,000]
```

---

### 8. Voice Language (Future)

#### Hindi Response
```
User: "Create invoice for ₹10000" [in Hindi voice]
```
**Expected**:
- `message`: "Invoice created for ₹10,000" (English)
- `speechMessage`: "दस हज़ार रुपये का चालान बनाया गया" (Hindi)

---

## Testing Checklist

### Conversation Memory
- [ ] Resolves "same client" from previous message
- [ ] Resolves "that amount" from previous message
- [ ] Resolves "them" referring to vendor/client
- [ ] Recalls information from 3+ messages ago
- [ ] Handles "latest" or "last" invoice reference

### Payment Links
- [ ] Creates link for specific invoice number
- [ ] Creates link for "latest invoice"
- [ ] Handles already-paid invoices gracefully
- [ ] Handles missing invoice gracefully
- [ ] Handles Razorpay not connected error
- [ ] Handles expired token (auto-refresh)
- [ ] Stores payment link in database
- [ ] Returns shareable URL

### Multi-Step Commands
- [ ] Create client + invoice in one command
- [ ] Create invoice + payment link in one command
- [ ] Create vendor + purchase bill in one command
- [ ] Create inventory + invoice with items

### Contextual Awareness
- [ ] Uses actual business metrics in responses
- [ ] Gives relevant suggestions based on data
- [ ] Understands business state (revenue, pending invoices)

### Indian Formats
- [ ] Parses "lakh" correctly (₹1,00,000)
- [ ] Parses "crore" correctly (₹1,00,00,000)
- [ ] Parses "k" correctly (₹1,000)
- [ ] Extracts GST numbers (15 chars)
- [ ] Applies correct GST rates (5/12/18/28)

### Error Recovery
- [ ] Asks for clarification when ambiguous
- [ ] Suggests correct format when command fails
- [ ] Provides helpful error messages
- [ ] Doesn't lose context after error

---

## Performance Benchmarks

### Response Time
- Simple command (create client): < 2 seconds
- Complex command (create invoice with items): < 3 seconds
- Payment link generation: < 4 seconds (includes Razorpay API)
- Question answering: < 2 seconds

### Accuracy
- Intent detection: > 95%
- Entity extraction: > 90%
- Reference resolution: > 85%
- Amount parsing: > 98%

---

## Common Issues & Solutions

### Issue: AI doesn't remember previous message
**Solution**: Check that `conversationHistory` is being passed in frontend

### Issue: Payment link fails with "not activated"
**Solution**: Connect Razorpay in Settings → Payments

### Issue: Payment link fails with "expired token"
**Solution**: Token should auto-refresh; check Razorpay OAuth credentials

### Issue: AI creates wrong amount
**Solution**: Be explicit: "₹50000" or "50 thousand rupees"

### Issue: AI doesn't recognize "same client"
**Solution**: Ensure previous message mentioned the client name

---

## Advanced Test Cases

### Edge Cases

#### Multiple Clients with Similar Names
```
User: "Create client named Tech Solutions"
User: "Create client named Tech Solutions India"
User: "Create invoice for Tech Solutions for ₹50000"
```
**Expected**: AI should ask which Tech Solutions

#### Very Long Conversation
```
[After 15+ messages]
User: "What was the first invoice I created?"
```
**Expected**: AI should recall from history (limited to last 10 turns)

#### Concurrent Commands
```
User: "Create invoice for A for ₹10000 and B for ₹20000 and C for ₹30000"
```
**Expected**: AI should handle or ask to do one at a time

#### Ambiguous References
```
User: "Create invoice for ABC Corp for ₹50000"
User: "Create invoice for XYZ Ltd for ₹75000"
User: "Create payment link for that invoice"
```
**Expected**: AI should use the most recent invoice (XYZ Ltd)

---

## Regression Tests

After any changes, verify:
1. ✅ Basic invoice creation still works
2. ✅ Client/vendor creation still works
3. ✅ Expense recording still works
4. ✅ Stock checking still works
5. ✅ Navigation commands still work
6. ✅ Question answering still works
7. ✅ Payment link generation works
8. ✅ Conversation memory works

---

## Load Testing

### Concurrent Users
- 10 users: < 3s response time
- 50 users: < 5s response time
- 100 users: < 8s response time

### Rate Limits
- Lovable AI: Check quota
- Razorpay API: 600 requests/minute
- Supabase Edge Functions: 500 requests/second

---

## Monitoring

### Metrics to Track
- Average response time
- Success rate (%)
- Intent detection accuracy
- Payment link creation success rate
- Token refresh success rate
- Error rate by type

### Logs to Monitor
```
[AI-Command] Processing prompt: ...
[AI-Command] History length: 5
[AI-Command] Parsed result: {...}
[AI-Command] Created record: uuid
[PaymentLink] Created payment link plink_xyz for invoice INV-2024-0001
[PaymentLink] Refreshed token for user uuid
```

---

## Success Criteria

✅ **Conversation Memory**: 85%+ accuracy on reference resolution
✅ **Payment Links**: 95%+ success rate when Razorpay connected
✅ **Multi-Step**: Handles 2-step commands correctly
✅ **Response Time**: < 3s for 90% of commands
✅ **User Satisfaction**: Positive feedback on natural conversation flow
