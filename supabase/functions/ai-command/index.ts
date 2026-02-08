import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ParsedCommand {
  action: string;
  recordType: string | null;
  data: Record<string, any>;
  message: string;
  isQuestion: boolean;
  isReport: boolean;
}

interface CreateResult {
  success: boolean;
  recordId?: string;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { prompt, userId } = await req.json();

    console.log("[AI-Command] Processing prompt:", prompt);
    console.log("[AI-Command] User ID:", userId);

    if (!userId) {
      throw new Error("User ID is required");
    }

    const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
    if (!MISTRAL_API_KEY) {
      throw new Error("MISTRAL_API_KEY is not configured");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Use Mistral to parse and respond to the command
    const result = await processWithMistral(prompt, MISTRAL_API_KEY);
    console.log("[AI-Command] Parsed result:", JSON.stringify(result));

    let recordId: string | undefined;
    let createSuccess = true;
    let createError: string | undefined;

    // If action is "create", actually create the record
    if (result.action === "create" && result.recordType && !result.isQuestion) {
      const createResult = await createRecord(supabase, userId, result.recordType, result.data);
      if (createResult.success) {
        recordId = createResult.recordId;
        console.log("[AI-Command] Created record:", recordId);
      } else {
        createSuccess = false;
        createError = createResult.error;
        console.error("[AI-Command] Failed to create record:", createError);
      }
    }

    return new Response(
      JSON.stringify({
        success: createSuccess,
        message: createSuccess 
          ? result.message 
          : `Failed to create ${result.recordType}: ${createError}`,
        recordType: result.recordType,
        recordId: recordId,
        data: result.data,
        isQuestion: result.isQuestion,
        isReport: result.isReport,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[AI-Command] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error occurred",
        error: true,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

// Helper to parse items from various formats
function parseItems(data: Record<string, any>): any[] {
  if (Array.isArray(data.items) && data.items.length > 0) {
    return data.items.map((item: any, index: number) => ({
      id: index + 1,
      name: item.name || item.description || 'Item',
      description: item.description || '',
      quantity: item.quantity || 1,
      rate: item.rate || item.price || item.unitPrice || 0,
      amount: item.amount || (item.quantity || 1) * (item.rate || item.price || 0),
      hsnCode: item.hsnCode || item.hsn || '',
    }));
  }
  
  // If no items array but we have item details in the data
  if (data.itemName || data.productName || data.serviceName) {
    return [{
      id: 1,
      name: data.itemName || data.productName || data.serviceName || 'Item',
      description: data.itemDescription || data.description || '',
      quantity: data.itemQuantity || data.quantity || 1,
      rate: data.itemRate || data.rate || data.price || data.amount || 0,
      amount: data.amount || (data.quantity || 1) * (data.rate || data.price || 0),
      hsnCode: data.hsnCode || '',
    }];
  }
  
  return [];
}

// Helper to calculate due date
function calculateDueDate(data: Record<string, any>): string {
  if (data.dueDate) {
    // If it's already a date string, return it
    if (typeof data.dueDate === 'string' && data.dueDate.match(/^\d{4}-\d{2}-\d{2}/)) {
      return data.dueDate.split('T')[0];
    }
    // Try to parse it
    const parsed = new Date(data.dueDate);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  }
  
  // Default: 30 days from now
  const dueDays = data.dueDays || data.paymentTerms || 30;
  return new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

// Function to create records in the database
async function createRecord(
  supabase: any,
  userId: string,
  recordType: string,
  data: Record<string, any>
): Promise<CreateResult> {
  try {
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    switch (recordType) {
      case "invoice": {
        // Generate invoice number
        const { count } = await supabase
          .from('invoices')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);
        
        const invoiceNumber = `INV-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(4, '0')}`;
        
        const amount = data.amount || data.subtotal || 0;
        const gstRate = data.gstRate || 18;
        const gstAmount = data.includeGst !== false ? (amount * gstRate / 100) : 0;
        const discount = data.discount || 0;
        const advance = data.advance || 0;
        const totalAmount = amount + gstAmount - discount - advance;
        
        // Parse items
        const items = parseItems(data);
        
        const { data: invoice, error } = await supabase
          .from('invoices')
          .insert({
            user_id: userId,
            invoice_number: invoiceNumber,
            client_name: data.clientName || data.customerName || 'Unknown Client',
            client_email: data.clientEmail || data.customerEmail || data.email || null,
            client_address: data.clientAddress || data.customerAddress || data.address || null,
            client_gst_number: data.gstNumber || data.clientGstNumber || data.customerGstNumber || null,
            amount: amount,
            gst_rate: gstRate,
            gst_amount: gstAmount,
            total_amount: totalAmount,
            discount: discount,
            advance: advance,
            invoice_date: today,
            due_date: calculateDueDate(data),
            status: 'pending',
            items: items.length > 0 ? items : [],
            notes: data.notes || data.terms || data.remarks || null,
          })
          .select()
          .single();

        if (error) throw error;
        return { success: true, recordId: invoice.id };
      }

      case "client": {
        const { data: client, error } = await supabase
          .from('clients')
          .insert({
            user_id: userId,
            name: data.clientName || data.name || data.customerName || 'Unknown Client',
            email: data.email || data.clientEmail || null,
            phone: data.phone || data.mobile || data.contact || null,
            address: data.address || data.clientAddress || data.city || null,
            gst_number: data.gstNumber || data.gstin || null,
          })
          .select()
          .single();

        if (error) throw error;
        return { success: true, recordId: client.id };
      }

      case "vendor": {
        const { data: vendor, error } = await supabase
          .from('vendors')
          .insert({
            user_id: userId,
            name: data.vendorName || data.name || data.supplierName || 'Unknown Vendor',
            email: data.email || data.vendorEmail || null,
            phone: data.phone || data.mobile || data.contact || null,
            address: data.address || data.vendorAddress || data.city || null,
            gst_number: data.gstNumber || data.gstin || null,
            pan: data.pan || data.panNumber || null,
          })
          .select()
          .single();

        if (error) throw error;
        return { success: true, recordId: vendor.id };
      }

      case "quotation": {
        // Generate quotation number
        const { count } = await supabase
          .from('quotations')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);
        
        const quotationNumber = `QT-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(4, '0')}`;
        
        const subtotal = data.amount || data.subtotal || 0;
        const gstRate = data.gstRate || 18;
        const taxAmount = data.includeGst !== false ? (subtotal * gstRate / 100) : 0;
        const discount = data.discount || 0;
        const totalAmount = subtotal + taxAmount - discount;
        
        // Parse items
        const items = parseItems(data);
        
        const { data: quotation, error } = await supabase
          .from('quotations')
          .insert({
            user_id: userId,
            quotation_number: quotationNumber,
            client_name: data.clientName || data.customerName || 'Unknown Client',
            client_email: data.clientEmail || data.customerEmail || data.email || null,
            client_address: data.clientAddress || data.customerAddress || data.address || null,
            client_phone: data.clientPhone || data.customerPhone || data.phone || null,
            subtotal: subtotal,
            tax_amount: taxAmount,
            discount: discount,
            total_amount: totalAmount,
            quotation_date: today,
            validity_period: data.validityPeriod || data.validDays || 30,
            status: 'draft',
            items: items.length > 0 ? items : [],
            terms_conditions: data.termsConditions || data.terms || data.notes || null,
          })
          .select()
          .single();

        if (error) throw error;
        return { success: true, recordId: quotation.id };
      }

      case "inventory": {
        const sku = data.sku || `SKU-${Date.now()}`;
        
        const { data: item, error } = await supabase
          .from('inventory')
          .insert({
            user_id: userId,
            product_name: data.productName || data.name || data.itemName || 'Unknown Product',
            sku: sku,
            category: data.category || 'General',
            type: data.type || 'goods',
            selling_price: data.price || data.sellingPrice || data.rate || 0,
            purchase_price: data.purchasePrice || data.costPrice || data.cost || data.price || 0,
            stock_quantity: data.quantity || data.stockQuantity || data.stock || 0,
            reorder_level: data.reorderLevel || data.minStock || 10,
            supplier_name: data.supplierName || data.vendorName || null,
            supplier_email: data.supplierEmail || data.vendorEmail || null,
            supplier_contact: data.supplierContact || data.supplierPhone || null,
          })
          .select()
          .single();

        if (error) throw error;
        return { success: true, recordId: item.id };
      }

      case "journal": {
        // Generate journal number
        const { count } = await supabase
          .from('journals')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);
        
        const journalNumber = `JE${String((count || 0) + 1).padStart(6, '0')}`;
        
        const { data: journal, error } = await supabase
          .from('journals')
          .insert({
            user_id: userId,
            journal_number: journalNumber,
            journal_date: data.date || today,
            narration: data.narration || data.description || data.notes || 'Journal Entry',
            total_debit: data.amount || data.debit || 0,
            total_credit: data.amount || data.credit || 0,
            status: 'draft',
          })
          .select()
          .single();

        if (error) throw error;
        return { success: true, recordId: journal.id };
      }

      case "sales_order": {
        const { count } = await supabase
          .from('sales_orders')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);
        
        const orderNumber = `SO-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(4, '0')}`;
        
        const subtotal = data.amount || data.subtotal || 0;
        const gstRate = data.gstRate || 18;
        const taxAmount = data.includeGst !== false ? (subtotal * gstRate / 100) : 0;
        const discount = data.discount || 0;
        const totalAmount = subtotal + taxAmount - discount;
        
        // Parse items
        const items = parseItems(data);
        
        const { data: order, error } = await supabase
          .from('sales_orders')
          .insert({
            user_id: userId,
            order_number: orderNumber,
            client_name: data.clientName || data.customerName || 'Unknown Client',
            client_email: data.clientEmail || data.customerEmail || data.email || null,
            client_address: data.clientAddress || data.customerAddress || data.address || null,
            client_phone: data.clientPhone || data.customerPhone || data.phone || null,
            client_gst: data.gstNumber || data.clientGstNumber || null,
            subtotal: subtotal,
            tax_amount: taxAmount,
            discount: discount,
            total_amount: totalAmount,
            order_date: today,
            due_date: calculateDueDate(data),
            status: 'pending',
            payment_status: 'unpaid',
            items: items.length > 0 ? items : [],
            notes: data.notes || data.remarks || null,
          })
          .select()
          .single();

        if (error) throw error;
        return { success: true, recordId: order.id };
      }

      case "purchase_order": {
        const { count } = await supabase
          .from('purchase_orders')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);
        
        const orderNumber = `PO-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(4, '0')}`;
        
        const subtotal = data.amount || data.subtotal || 0;
        const gstRate = data.gstRate || 18;
        const taxAmount = data.includeGst !== false ? (subtotal * gstRate / 100) : 0;
        const discount = data.discount || 0;
        const totalAmount = subtotal + taxAmount - discount;
        
        // Parse items
        const items = parseItems(data);
        
        const { data: order, error } = await supabase
          .from('purchase_orders')
          .insert({
            user_id: userId,
            order_number: orderNumber,
            vendor_name: data.vendorName || data.supplierName || 'Unknown Vendor',
            vendor_email: data.vendorEmail || data.supplierEmail || data.email || null,
            vendor_address: data.vendorAddress || data.supplierAddress || data.address || null,
            vendor_phone: data.vendorPhone || data.supplierPhone || data.phone || null,
            vendor_gst: data.gstNumber || data.vendorGstNumber || null,
            subtotal: subtotal,
            tax_amount: taxAmount,
            discount: discount,
            total_amount: totalAmount,
            order_date: today,
            due_date: calculateDueDate(data),
            status: 'pending',
            payment_status: 'unpaid',
            items: items.length > 0 ? items : [],
            notes: data.notes || data.remarks || null,
          })
          .select()
          .single();

        if (error) throw error;
        return { success: true, recordId: order.id };
      }

      default:
        return { success: false, error: `Unknown record type: ${recordType}` };
    }
  } catch (error) {
    console.error("[AI-Command] Create record error:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to create record" 
    };
  }
}

async function processWithMistral(prompt: string, apiKey: string): Promise<ParsedCommand> {
  const systemPrompt = `You are an intelligent accounting assistant for BillEase, an Indian accounting and GST management application.

**DOMAIN RESTRICTION - CRITICAL:**
You must ONLY operate within finance, banking, accounting, taxation, compliance, and business operations.

**Rules:**
- Answer only finance-related questions directly.
- If a user asks for non-finance content (e.g., love letters, poems, stories, jokes, general knowledge), do NOT refuse.
- Instead, REINTERPRET the request using financial or compliance language and respond in a professional finance style.
- Never provide content unrelated to finance in tone, structure, or examples.

**Reinterpretation Examples:**
- "Write a love letter" → Respond as a formal financial commitment letter or term-sheet-style note expressing business partnership dedication.
- "Write a poem" → Respond as a cash-flow or balance-sheet metaphor in verse format.
- "Tell a story" → Respond as a business case study, audit narrative, or compliance journey.
- "Tell a joke" → Respond with accounting humor (e.g., depreciation puns, audit jokes).

**Always:**
- Maintain a professional BFSI (Banking, Financial Services, Insurance) tone
- Use finance terminology where applicable
- Avoid casual, creative, or entertainment-only responses
- Prioritize clarity, structure, and compliance-safe language

Your capabilities:
1. **CREATE RECORDS** - Parse commands to create: invoices, clients, vendors, quotations, sales orders, purchase orders, inventory items, journal entries
2. **ANSWER QUESTIONS** - Provide expert guidance on GST, TDS, accounting principles, tax compliance, and app usage
3. **GENERATE REPORTS** - Describe what reports would show (P&L, GST summary, outstanding receivables, inventory, cash flow, sales)

**CRITICAL: COMPREHENSIVE FIELD EXTRACTION**

When creating records, extract ALL possible fields from the user's input. Parse carefully for:

**For INVOICES - Extract these fields:**
- clientName: Customer/client name (REQUIRED)
- clientEmail: Email address if mentioned
- clientAddress: Full address if mentioned
- clientPhone: Phone number if mentioned
- gstNumber: GST number (format: 22AAAAA0000A1Z5)
- amount: Base amount before tax (REQUIRED)
- gstRate: GST percentage (5, 12, 18, or 28) - default 18
- includeGst: true if GST should be added
- dueDate: Payment due date (parse "due in X days", "by [date]", etc.)
- notes: Any special notes or terms
- items: Array of line items with structure: [{name, description, quantity, rate, amount, hsnCode}]

**For QUOTATIONS - Extract these fields:**
- clientName: Customer/client name (REQUIRED)
- clientEmail: Email address
- clientAddress: Full address
- clientPhone: Phone number
- amount: Total quotation amount or subtotal (REQUIRED)
- gstRate: GST percentage - default 18
- includeGst: true if GST should be included
- validityPeriod: Number of days quote is valid (default 30)
- termsConditions: Any terms or conditions mentioned
- items: Array of line items: [{name, description, quantity, rate, amount}]

**For VENDORS - Extract these fields:**
- name: Vendor/supplier name (REQUIRED)
- email: Email address
- phone: Phone number
- address: Full address including city, state
- gstNumber: GST number
- pan: PAN number if mentioned

**For CLIENTS - Extract these fields:**
- name: Client/customer name (REQUIRED)
- email: Email address
- phone: Phone number
- address: Full address
- gstNumber: GST number

**For INVENTORY - Extract these fields:**
- productName: Item/product name (REQUIRED)
- sku: SKU code if mentioned
- category: Product category
- type: "goods" or "services"
- sellingPrice: Selling price (REQUIRED)
- purchasePrice: Purchase/cost price
- quantity: Stock quantity
- reorderLevel: Minimum stock level

**For SALES_ORDER / PURCHASE_ORDER - Extract these fields:**
- clientName/vendorName: Party name (REQUIRED)
- clientEmail/vendorEmail: Email
- clientPhone/vendorPhone: Phone
- clientAddress/vendorAddress: Address
- gstNumber: GST number
- amount: Order amount (REQUIRED)
- includeGst: true if GST applies
- dueDate: Delivery/payment due date
- items: Array of line items
- notes: Any notes

**Response Format** (ALWAYS respond in valid JSON):
{
  "action": "create" | "answer" | "report",
  "recordType": "invoice" | "client" | "vendor" | "quotation" | "sales_order" | "purchase_order" | "inventory" | "journal" | "report" | "answer" | null,
  "data": { 
    // Include ALL extracted fields - even partial information is valuable
    // The user can edit/complete the record after creation
  },
  "message": "Confirm what you're creating with a summary of extracted details. Mention if any key fields are missing that the user should add.",
  "isQuestion": true/false,
  "isReport": true/false
}

**IMPORTANT EXTRACTION RULES:**
1. Parse natural language dates: "next week" = +7 days, "end of month", "in 15 days", etc.
2. Parse phone numbers in any format: "9876543210", "+91-9876543210", etc.
3. Parse addresses: Look for city names, "from [place]", "based in [place]"
4. Parse GST numbers: 15-character alphanumeric format
5. Parse amounts: "25k" = 25000, "1 lakh" = 100000, "2.5L" = 250000
6. Extract items if mentioned: "for 5 laptops at 50000 each"
7. Always default gstRate to 18 if GST is mentioned but rate isn't specified

**Examples with comprehensive extraction:**
1. "Create invoice for ABC Corp, email abc@company.com, address 123 MG Road Bangalore, for 5 laptops at 50000 each with 18% GST, due in 30 days"
   → Extract: clientName, clientEmail, clientAddress, items array, gstRate, includeGst, dueDate

2. "Add vendor Kumar Traders from Chennai, GST 33AABCK1234A1ZF, phone 9876543210"
   → Extract: name, address (Chennai), gstNumber, phone

3. "Quotation for Sharma Industries for consulting services 75000 plus GST valid for 45 days"
   → Extract: clientName, items, amount, includeGst, validityPeriod`;

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-medium",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1024,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[AI-Command] Mistral API error:", response.status, errorText);

    if (response.status === 429) {
      throw new Error("Rate limit exceeded. Please try again in a moment.");
    }
    if (response.status === 401) {
      throw new Error("AI service authentication failed. Please check your API key.");
    }
    if (response.status === 402) {
      throw new Error("AI service quota exceeded. Please add credits to your account.");
    }

    throw new Error(`AI service error: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No response from AI service");
  }

  console.log("[AI-Command] Raw AI response:", content);

  try {
    const parsed = JSON.parse(content);
    return {
      action: parsed.action || "answer",
      recordType: parsed.recordType || null,
      data: parsed.data || {},
      message: parsed.message || "Command processed successfully",
      isQuestion: parsed.isQuestion || parsed.action === "answer",
      isReport: parsed.isReport || parsed.action === "report",
    };
  } catch (parseError) {
    console.error("[AI-Command] Failed to parse AI response:", content);
    // If JSON parsing fails, treat it as a text response
    return {
      action: "answer",
      recordType: "answer",
      data: {},
      message: content,
      isQuestion: true,
      isReport: false,
    };
  }
}
