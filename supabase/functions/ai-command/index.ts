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
  generateImage?: boolean;
  imagePrompt?: string;
}

interface CreateResult {
  success: boolean;
  recordId?: string;
  error?: string;
}

serve(async (req) => {
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Use Lovable AI (Gemini) for better accuracy
    const result = await processWithLovableAI(prompt, LOVABLE_API_KEY);
    console.log("[AI-Command] Parsed result:", JSON.stringify(result));

    let recordId: string | undefined;
    let createSuccess = true;
    let createError: string | undefined;

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

    // Generate image if applicable
    let imageUrl: string | null = null;
    if (result.generateImage && result.imagePrompt) {
      try {
        imageUrl = await generateImage(result.imagePrompt, LOVABLE_API_KEY);
      } catch (imgErr) {
        console.error("[AI-Command] Image generation failed:", imgErr);
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
        imageUrl: imageUrl,
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

// Generate image using Lovable AI image model
async function generateImage(imagePrompt: string, apiKey: string): Promise<string | null> {
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: `Generate a professional, clean, minimalist illustration for: ${imagePrompt}. Style: modern flat design, business/finance theme, soft gradients, no text.`,
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      console.error("[AI-Command] Image gen error:", response.status);
      return null;
    }

    const data = await response.json();
    const imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    return imageData || null;
  } catch (err) {
    console.error("[AI-Command] Image generation error:", err);
    return null;
  }
}

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

function calculateDueDate(data: Record<string, any>): string {
  if (data.dueDate) {
    if (typeof data.dueDate === 'string' && data.dueDate.match(/^\d{4}-\d{2}-\d{2}/)) {
      return data.dueDate.split('T')[0];
    }
    const parsed = new Date(data.dueDate);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  }

  const dueDays = data.dueDays || data.paymentTerms || 30;
  return new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

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

async function processWithLovableAI(prompt: string, apiKey: string): Promise<ParsedCommand> {
  const systemPrompt = `You are an intelligent accounting assistant for BillEase, an Indian accounting and GST management application. You are powered by advanced AI for maximum accuracy.

**DOMAIN RESTRICTION - CRITICAL:**
You must ONLY operate within finance, banking, accounting, taxation, compliance, and business operations.

**Rules:**
- Answer only finance-related questions directly and accurately with specific details.
- If a user asks for non-finance content, REINTERPRET it using financial language.
- Be precise with numbers, tax rates, dates, and compliance details.
- Reference current Indian tax laws (GST, TDS, Income Tax) accurately.

**Always:**
- Maintain a professional BFSI tone
- Use finance terminology where applicable
- Prioritize accuracy, clarity, and compliance-safe language
- Give specific, actionable answers (not vague)

Your capabilities:
1. **CREATE RECORDS** - Parse commands to create: invoices, clients, vendors, quotations, sales orders, purchase orders, inventory items, journal entries
2. **ANSWER QUESTIONS** - Provide expert guidance on GST, TDS, accounting principles, tax compliance, and app usage
3. **GENERATE REPORTS** - Describe what reports would show (P&L, GST summary, outstanding receivables, inventory, cash flow, sales)

**IMAGE GENERATION:**
For questions/answers about financial concepts, reports, or explanations, set "generateImage": true and provide a descriptive "imagePrompt" for a relevant illustration. Examples:
- GST question → imagePrompt: "Indian GST tax structure diagram with CGST SGST IGST flow"
- P&L report → imagePrompt: "Profit and loss statement bar chart with revenue and expenses"
- Cash flow → imagePrompt: "Cash flow waterfall chart showing inflows and outflows"
- Invoice creation → Don't generate image (action-based, not educational)

Only generate images for educational/explanatory responses, NOT for record creation actions.

**COMPREHENSIVE FIELD EXTRACTION**

When creating records, extract ALL possible fields from the user's input:

**For INVOICES:**
- clientName (REQUIRED), clientEmail, clientAddress, clientPhone
- gstNumber (format: 22AAAAA0000A1Z5)
- amount (REQUIRED), gstRate (5/12/18/28, default 18), includeGst
- dueDate, notes
- items: [{name, description, quantity, rate, amount, hsnCode}]

**For QUOTATIONS:**
- clientName (REQUIRED), clientEmail, clientAddress, clientPhone
- amount (REQUIRED), gstRate (default 18), includeGst
- validityPeriod (days, default 30), termsConditions
- items: [{name, description, quantity, rate, amount}]

**For VENDORS:** name (REQUIRED), email, phone, address, gstNumber, pan
**For CLIENTS:** name (REQUIRED), email, phone, address, gstNumber
**For INVENTORY:** productName (REQUIRED), sku, category, type, sellingPrice (REQUIRED), purchasePrice, quantity, reorderLevel
**For SALES_ORDER/PURCHASE_ORDER:** clientName/vendorName (REQUIRED), email, phone, address, gstNumber, amount (REQUIRED), includeGst, dueDate, items, notes

**Response Format** (ALWAYS respond in valid JSON):
{
  "action": "create" | "answer" | "report",
  "recordType": "invoice" | "client" | "vendor" | "quotation" | "sales_order" | "purchase_order" | "inventory" | "journal" | "report" | "answer" | null,
  "data": {},
  "message": "Your detailed, accurate response",
  "isQuestion": true/false,
  "isReport": true/false,
  "generateImage": true/false,
  "imagePrompt": "descriptive prompt for related illustration"
}

**EXTRACTION RULES:**
1. Parse natural language dates: "next week" = +7 days, "end of month", "in 15 days"
2. Parse phone numbers in any format
3. Parse addresses: Look for city names, "from [place]", "based in [place]"
4. Parse GST numbers: 15-character alphanumeric format
5. Parse amounts: "25k" = 25000, "1 lakh" = 100000, "2.5L" = 250000
6. Extract items if mentioned: "for 5 laptops at 50000 each"
7. Default gstRate to 18 if GST is mentioned but rate isn't specified`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[AI-Command] Lovable AI error:", response.status, errorText);

    if (response.status === 429) {
      throw new Error("Rate limit exceeded. Please try again in a moment.");
    }
    if (response.status === 402) {
      throw new Error("AI service quota exceeded. Please add credits.");
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
    // Extract JSON from response (may be wrapped in markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    return {
      action: parsed.action || "answer",
      recordType: parsed.recordType || null,
      data: parsed.data || {},
      message: parsed.message || "Command processed successfully",
      isQuestion: parsed.isQuestion || parsed.action === "answer",
      isReport: parsed.isReport || parsed.action === "report",
      generateImage: parsed.generateImage || false,
      imagePrompt: parsed.imagePrompt || null,
    };
  } catch (parseError) {
    console.error("[AI-Command] Failed to parse AI response:", content);
    return {
      action: "answer",
      recordType: "answer",
      data: {},
      message: content,
      isQuestion: true,
      isReport: false,
      generateImage: false,
    };
  }
}
