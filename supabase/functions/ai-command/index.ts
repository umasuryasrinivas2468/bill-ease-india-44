import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ActionType = 
  | 'create_invoice' | 'create_client' | 'create_journal' | 'create_quotation'
  | 'create_vendor' | 'create_sales_order' | 'create_purchase_order' 
  | 'create_inventory' | 'ask_question' | 'generate_report' | 'unknown';

interface ParsedCommand {
  action: ActionType;
  data: Record<string, any>;
  confidence: number;
}

function parseCommand(prompt: string): ParsedCommand {
  const lower = prompt.toLowerCase().trim();
  
  // Report generation patterns
  if (lower.includes('report') || lower.includes('summary') || lower.includes('statement') || 
      lower.includes('analytics') || lower.includes('p&l') || lower.includes('profit') || 
      lower.includes('loss') || lower.includes('outstanding') || lower.includes('cash flow') ||
      lower.includes('gst summary') || lower.includes('sales report') || lower.includes('inventory report')) {
    const data: Record<string, any> = { question: prompt };
    
    if (lower.includes('p&l') || lower.includes('profit') || lower.includes('loss')) {
      data.reportType = 'profit_loss';
    } else if (lower.includes('gst')) {
      data.reportType = 'gst_summary';
    } else if (lower.includes('outstanding') || lower.includes('receivable')) {
      data.reportType = 'outstanding';
    } else if (lower.includes('inventory')) {
      data.reportType = 'inventory';
    } else if (lower.includes('cash flow')) {
      data.reportType = 'cash_flow';
    } else if (lower.includes('sales')) {
      data.reportType = 'sales';
    } else {
      data.reportType = 'general';
    }
    
    return { action: 'generate_report', data, confidence: 0.85 };
  }
  
  // Question patterns (general accounting/GST/app usage questions)
  if (lower.includes('what is') || lower.includes('how to') || lower.includes('how do') || 
      lower.includes('explain') || lower.includes('tell me') || lower.includes('help me') ||
      lower.includes('difference between') || lower.includes('?') ||
      (lower.includes('gst') && !lower.includes('create') && !lower.includes('invoice')) ||
      lower.includes('meaning') || lower.includes('define')) {
    return { action: 'ask_question', data: { question: prompt }, confidence: 0.80 };
  }
  
  // Invoice patterns
  if (lower.includes('invoice') || lower.includes('bill')) {
    const data: Record<string, any> = {};
    
    const forMatch = prompt.match(/(?:for|to)\s+([A-Za-z0-9\s&]+?)(?:\s+(?:for|of|worth|amount|₹|\$|rs|inr|with|at)|$)/i);
    if (forMatch) {
      data.client_name = forMatch[1].trim();
    }
    
    const amountMatch = prompt.match(/(?:₹|rs\.?|inr|rupees?|\$)?\s*([0-9,]+(?:\.[0-9]+)?)\s*(?:₹|rs\.?|inr|rupees?|\$)?/i);
    if (amountMatch) {
      data.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }
    
    data.include_gst = lower.includes('gst') || lower.includes('tax');
    
    const itemsMatch = prompt.match(/(\d+)\s*(?:units?|items?|pieces?|pcs?|qty)/i);
    if (itemsMatch) {
      data.quantity = parseInt(itemsMatch[1]);
    }
    
    return { action: 'create_invoice', data, confidence: 0.85 };
  }
  
  // Sales Order patterns
  if (lower.includes('sales order') || lower.includes('sale order') || lower.includes('so ')) {
    const data: Record<string, any> = {};
    
    const forMatch = prompt.match(/(?:for|to)\s+([A-Za-z0-9\s&]+?)(?:\s+(?:for|of|worth|amount|₹|\$|rs|inr|with|at)|$)/i);
    if (forMatch) {
      data.client_name = forMatch[1].trim();
    }
    
    const amountMatch = prompt.match(/(?:₹|rs\.?|inr|rupees?|\$)?\s*([0-9,]+(?:\.[0-9]+)?)\s*(?:₹|rs\.?|inr|rupees?|\$)?/i);
    if (amountMatch) {
      data.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }
    
    const qtyMatch = prompt.match(/(\d+)\s*(?:units?|items?|pieces?|pcs?|qty)/i);
    if (qtyMatch) {
      data.quantity = parseInt(qtyMatch[1]);
    }
    
    return { action: 'create_sales_order', data, confidence: 0.85 };
  }
  
  // Purchase Order patterns
  if (lower.includes('purchase order') || lower.includes('po ') || lower.includes('buy order')) {
    const data: Record<string, any> = {};
    
    const forMatch = prompt.match(/(?:for|to|from)\s+([A-Za-z0-9\s&]+?)(?:\s+(?:for|of|worth|amount|₹|\$|rs|inr|with|at)|$)/i);
    if (forMatch) {
      data.vendor_name = forMatch[1].trim();
    }
    
    const amountMatch = prompt.match(/(?:₹|rs\.?|inr|rupees?|\$)?\s*([0-9,]+(?:\.[0-9]+)?)\s*(?:₹|rs\.?|inr|rupees?|\$)?/i);
    if (amountMatch) {
      data.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }
    
    const qtyMatch = prompt.match(/(\d+)\s*(?:units?|items?|pieces?|pcs?|qty)/i);
    if (qtyMatch) {
      data.quantity = parseInt(qtyMatch[1]);
    }
    
    return { action: 'create_purchase_order', data, confidence: 0.85 };
  }
  
  // Vendor patterns
  if (lower.includes('vendor') || lower.includes('supplier')) {
    const data: Record<string, any> = {};
    
    const namedMatch = prompt.match(/(?:named?|called?)\s+([A-Za-z0-9\s&]+?)(?:\s+(?:from|in|at|with|email|phone)|$)/i);
    if (namedMatch) {
      data.name = namedMatch[1].trim();
    } else {
      const vendorMatch = prompt.match(/(?:add|create|new)\s+(?:a\s+)?(?:vendor|supplier)\s+([A-Za-z0-9\s&]+?)(?:\s+(?:from|in|at|with|email|phone)|$)/i);
      if (vendorMatch) {
        data.name = vendorMatch[1].trim();
      }
    }
    
    const fromMatch = prompt.match(/(?:from|in|at)\s+([A-Za-z\s]+?)(?:\s+(?:with|email|phone)|$)/i);
    if (fromMatch) {
      data.address = fromMatch[1].trim();
    }
    
    const emailMatch = prompt.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      data.email = emailMatch[1];
    }
    
    const gstMatch = prompt.match(/(?:gst|gstin)\s*:?\s*([0-9A-Z]{15})/i);
    if (gstMatch) {
      data.gst_number = gstMatch[1].toUpperCase();
    }
    
    return { action: 'create_vendor', data, confidence: 0.85 };
  }
  
  // Inventory patterns
  if (lower.includes('inventory') || lower.includes('stock') || lower.includes('product') || lower.includes('item')) {
    if (lower.includes('add') || lower.includes('create') || lower.includes('new')) {
      const data: Record<string, any> = {};
      
      const namedMatch = prompt.match(/(?:named?|called?)\s+([A-Za-z0-9\s&]+?)(?:\s+(?:at|for|with|price|sku|category)|$)/i);
      if (namedMatch) {
        data.product_name = namedMatch[1].trim();
      }
      
      const priceMatch = prompt.match(/(?:price|at|@|₹|rs\.?)\s*([0-9,]+(?:\.[0-9]+)?)/i);
      if (priceMatch) {
        data.selling_price = parseFloat(priceMatch[1].replace(/,/g, ''));
      }
      
      const qtyMatch = prompt.match(/(\d+)\s*(?:units?|items?|pieces?|pcs?|qty|stock)/i);
      if (qtyMatch) {
        data.stock_quantity = parseInt(qtyMatch[1]);
      }
      
      const skuMatch = prompt.match(/(?:sku|code)\s*:?\s*([A-Za-z0-9\-]+)/i);
      if (skuMatch) {
        data.sku = skuMatch[1].toUpperCase();
      }
      
      return { action: 'create_inventory', data, confidence: 0.85 };
    }
  }
  
  // Client patterns
  if (lower.includes('client') || lower.includes('customer') || lower.includes('party')) {
    const data: Record<string, any> = {};
    
    const namedMatch = prompt.match(/(?:named?|called?)\s+([A-Za-z0-9\s&]+?)(?:\s+(?:from|in|at|with|email|phone)|$)/i);
    if (namedMatch) {
      data.name = namedMatch[1].trim();
    } else {
      const clientMatch = prompt.match(/(?:add|create|new)\s+(?:a\s+)?(?:client|customer|party)\s+([A-Za-z0-9\s&]+?)(?:\s+(?:from|in|at|with|email|phone)|$)/i);
      if (clientMatch) {
        data.name = clientMatch[1].trim();
      }
    }
    
    const fromMatch = prompt.match(/(?:from|in|at)\s+([A-Za-z\s]+?)(?:\s+(?:with|email|phone)|$)/i);
    if (fromMatch) {
      data.address = fromMatch[1].trim();
    }
    
    const emailMatch = prompt.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      data.email = emailMatch[1];
    }
    
    const phoneMatch = prompt.match(/(?:phone|mobile|contact|call)\s*:?\s*([0-9+\-\s]{10,})/i);
    if (phoneMatch) {
      data.phone = phoneMatch[1].trim();
    }
    
    const gstMatch = prompt.match(/(?:gst|gstin)\s*:?\s*([0-9A-Z]{15})/i);
    if (gstMatch) {
      data.gst_number = gstMatch[1].toUpperCase();
    }
    
    return { action: 'create_client', data, confidence: 0.85 };
  }
  
  // Journal entry patterns
  if (lower.includes('journal') || lower.includes('entry') || lower.includes('record') || lower.includes('expense') || lower.includes('payment')) {
    const data: Record<string, any> = {};
    
    const forMatch = prompt.match(/(?:for|entry\s+for)\s+([a-zA-Z\s]+?)(?:\s+(?:₹|rs|inr|of|worth|amount|paid|received|via|through|by))/i);
    if (forMatch) {
      data.narration = forMatch[1].trim();
    }
    
    const amountMatch = prompt.match(/(?:₹|rs\.?|inr|rupees?|\$)?\s*([0-9,]+(?:\.[0-9]+)?)\s*(?:₹|rs\.?|inr|rupees?|\$)?/i);
    if (amountMatch) {
      data.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }
    
    if (lower.includes('bank') || lower.includes('transfer') || lower.includes('neft') || lower.includes('rtgs') || lower.includes('imps')) {
      data.payment_mode = 'bank';
    } else if (lower.includes('cash')) {
      data.payment_mode = 'cash';
    } else if (lower.includes('upi') || lower.includes('gpay') || lower.includes('phonepe') || lower.includes('paytm')) {
      data.payment_mode = 'upi';
    } else if (lower.includes('cheque') || lower.includes('check')) {
      data.payment_mode = 'cheque';
    }
    
    if (lower.includes('paid') || lower.includes('expense') || lower.includes('spent') || lower.includes('payment')) {
      data.type = 'expense';
    } else if (lower.includes('received') || lower.includes('income') || lower.includes('collection')) {
      data.type = 'income';
    }
    
    return { action: 'create_journal', data, confidence: 0.80 };
  }
  
  // Quotation patterns
  if (lower.includes('quotation') || lower.includes('quote') || lower.includes('estimate') || lower.includes('proforma')) {
    const data: Record<string, any> = {};
    
    const forMatch = prompt.match(/(?:for|to)\s+([A-Za-z0-9\s&]+?)(?:\s+(?:for|of|worth|amount|₹|\$|rs|inr|with|at)|$)/i);
    if (forMatch) {
      data.client_name = forMatch[1].trim();
    }
    
    const qtyMatch = prompt.match(/(\d+)\s*(?:units?|items?|pieces?|pcs?|qty)/i);
    if (qtyMatch) {
      data.quantity = parseInt(qtyMatch[1]);
    }
    
    const rateMatch = prompt.match(/(?:at|@|rate)\s*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]+)?)\s*(?:each|per|\/)?/i);
    if (rateMatch) {
      data.rate = parseFloat(rateMatch[1].replace(/,/g, ''));
    }
    
    const amountMatch = prompt.match(/(?:₹|rs\.?|inr|rupees?|\$)?\s*([0-9,]+(?:\.[0-9]+)?)\s*(?:₹|rs\.?|inr|rupees?|\$)?/i);
    if (amountMatch && !data.rate) {
      data.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }
    
    return { action: 'create_quotation', data, confidence: 0.85 };
  }
  
  return { action: 'unknown', data: {}, confidence: 0 };
}

function generateNumber(prefix: string): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${year}${month}-${random}`;
}

async function askAI(question: string, context: any = {}): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    return "I'm sorry, I can't answer questions right now. Please try again later.";
  }

  const systemPrompt = `You are an expert Indian accounting and GST assistant for a business accounting app called Aczen.
You help users understand:
- GST (Goods and Services Tax) concepts, rates, filing, compliance
- Accounting principles, journal entries, ledgers
- Invoice management, quotations, sales/purchase orders
- TDS (Tax Deducted at Source) rules
- Financial reports and statements
- How to use the Aczen accounting app

Keep responses concise, practical, and in simple language. Use examples with Indian Rupees (₹).
If providing calculations or tax rates, ensure they are accurate for India.`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question }
        ],
        max_tokens: 500,
        temperature: 0.3
      }),
    });

    if (!response.ok) {
      console.error("AI API error:", response.status);
      return "I couldn't process your question. Please try again.";
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "I couldn't generate a response.";
  } catch (error) {
    console.error("AI request error:", error);
    return "I encountered an error. Please try again.";
  }
}

async function generateReport(reportType: string, userId: string, supabase: any): Promise<string> {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

    switch (reportType) {
      case 'profit_loss':
      case 'sales': {
        const { data: invoices } = await supabase
          .from('invoices')
          .select('total_amount, gst_amount, status')
          .eq('user_id', userId)
          .gte('invoice_date', startOfMonth)
          .lte('invoice_date', endOfMonth);
        
        const totalSales = invoices?.reduce((sum: number, inv: any) => sum + Number(inv.total_amount || 0), 0) || 0;
        const paidSales = invoices?.filter((inv: any) => inv.status === 'paid')
          .reduce((sum: number, inv: any) => sum + Number(inv.total_amount || 0), 0) || 0;
        const totalGst = invoices?.reduce((sum: number, inv: any) => sum + Number(inv.gst_amount || 0), 0) || 0;
        
        return `📊 **Sales Summary (This Month)**\n\n` +
          `• Total Sales: ₹${totalSales.toLocaleString('en-IN')}\n` +
          `• Paid: ₹${paidSales.toLocaleString('en-IN')}\n` +
          `• Pending: ₹${(totalSales - paidSales).toLocaleString('en-IN')}\n` +
          `• GST Collected: ₹${totalGst.toLocaleString('en-IN')}\n` +
          `• Invoices: ${invoices?.length || 0}`;
      }
      
      case 'gst_summary': {
        const { data: invoices } = await supabase
          .from('invoices')
          .select('gst_amount, total_amount')
          .eq('user_id', userId)
          .gte('invoice_date', startOfMonth)
          .lte('invoice_date', endOfMonth);
        
        const totalGst = invoices?.reduce((sum: number, inv: any) => sum + Number(inv.gst_amount || 0), 0) || 0;
        const cgst = totalGst / 2;
        const sgst = totalGst / 2;
        
        return `🧾 **GST Summary (This Month)**\n\n` +
          `• Total GST: ₹${totalGst.toLocaleString('en-IN')}\n` +
          `• CGST (9%): ₹${cgst.toLocaleString('en-IN')}\n` +
          `• SGST (9%): ₹${sgst.toLocaleString('en-IN')}\n` +
          `• Taxable Invoices: ${invoices?.length || 0}`;
      }
      
      case 'outstanding': {
        const { data: invoices } = await supabase
          .from('invoices')
          .select('client_name, total_amount, due_date')
          .eq('user_id', userId)
          .in('status', ['pending', 'overdue']);
        
        const totalOutstanding = invoices?.reduce((sum: number, inv: any) => sum + Number(inv.total_amount || 0), 0) || 0;
        const overdueCount = invoices?.filter((inv: any) => new Date(inv.due_date) < today).length || 0;
        
        return `💰 **Outstanding Receivables**\n\n` +
          `• Total Outstanding: ₹${totalOutstanding.toLocaleString('en-IN')}\n` +
          `• Pending Invoices: ${invoices?.length || 0}\n` +
          `• Overdue: ${overdueCount}\n` +
          (invoices?.slice(0, 3).map((inv: any) => 
            `• ${inv.client_name}: ₹${Number(inv.total_amount).toLocaleString('en-IN')}`
          ).join('\n') || '• No outstanding invoices');
      }
      
      case 'inventory': {
        const { data: items } = await supabase
          .from('inventory')
          .select('product_name, stock_quantity, selling_price, reorder_level')
          .eq('user_id', userId);
        
        const totalItems = items?.length || 0;
        const lowStock = items?.filter((item: any) => item.stock_quantity <= item.reorder_level).length || 0;
        const totalValue = items?.reduce((sum: number, item: any) => 
          sum + (Number(item.stock_quantity || 0) * Number(item.selling_price || 0)), 0) || 0;
        
        return `📦 **Inventory Summary**\n\n` +
          `• Total Products: ${totalItems}\n` +
          `• Low Stock Alerts: ${lowStock}\n` +
          `• Total Stock Value: ₹${totalValue.toLocaleString('en-IN')}\n` +
          (items?.filter((item: any) => item.stock_quantity <= item.reorder_level)
            .slice(0, 3).map((item: any) => 
              `⚠️ ${item.product_name}: ${item.stock_quantity} units`
            ).join('\n') || '• All items well stocked');
      }
      
      case 'cash_flow': {
        const { data: paidInvoices } = await supabase
          .from('invoices')
          .select('total_amount')
          .eq('user_id', userId)
          .eq('status', 'paid')
          .gte('invoice_date', startOfMonth);
        
        const { data: journals } = await supabase
          .from('journals')
          .select('total_debit')
          .eq('user_id', userId)
          .gte('journal_date', startOfMonth);
        
        const inflow = paidInvoices?.reduce((sum: number, inv: any) => sum + Number(inv.total_amount || 0), 0) || 0;
        const outflow = journals?.reduce((sum: number, j: any) => sum + Number(j.total_debit || 0), 0) || 0;
        
        return `💸 **Cash Flow (This Month)**\n\n` +
          `• Cash Inflow: ₹${inflow.toLocaleString('en-IN')}\n` +
          `• Cash Outflow: ₹${outflow.toLocaleString('en-IN')}\n` +
          `• Net Flow: ₹${(inflow - outflow).toLocaleString('en-IN')}\n` +
          `• Status: ${inflow > outflow ? '✅ Positive' : '⚠️ Negative'}`;
      }
      
      default:
        return "Please specify a report type: P&L, GST summary, outstanding, inventory, or cash flow.";
    }
  } catch (error) {
    console.error("Report generation error:", error);
    return "Error generating report. Please try again.";
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { prompt, userId } = body;

    if (!prompt || !userId) {
      return new Response(JSON.stringify({ error: 'Prompt and userId are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[AI-Command] Processing prompt:', prompt);
    console.log('[AI-Command] User ID:', userId);

    const parsed = parseCommand(prompt);
    console.log('[AI-Command] Parsed command:', parsed);

    // Handle Q&A
    if (parsed.action === 'ask_question') {
      const answer = await askAI(parsed.data.question);
      return new Response(JSON.stringify({
        success: true,
        message: answer,
        recordType: 'answer'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Handle Report Generation
    if (parsed.action === 'generate_report') {
      const report = await generateReport(parsed.data.reportType, userId, supabase);
      return new Response(JSON.stringify({
        success: true,
        message: report,
        recordType: 'report'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (parsed.action === 'unknown') {
      return new Response(JSON.stringify({
        success: false,
        message: "I can help you with:\n\n📝 **Create Records:**\n• Invoice, Quotation, Sales/Purchase Order\n• Client, Vendor, Inventory item\n• Journal entry, Payment\n\n📊 **Reports:**\n• P&L, Sales, GST summary\n• Outstanding, Inventory, Cash flow\n\n❓ **Questions:**\n• GST, TDS, Accounting concepts\n• App usage help\n\nTry: 'Create invoice for ABC Corp ₹25,000 with GST'"
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let result: any = null;
    let message = '';
    let recordType = '';
    let recordData: any = null;

    switch (parsed.action) {
      case 'create_invoice': {
        const today = new Date().toISOString().split('T')[0];
        const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const amount = parsed.data.amount || 0;
        const gstRate = parsed.data.include_gst ? 0.18 : 0;
        const gstAmount = amount * gstRate;
        const totalAmount = amount + gstAmount;

        const invoiceData = {
          user_id: userId,
          invoice_number: generateNumber('INV'),
          invoice_date: today,
          due_date: dueDate,
          client_name: parsed.data.client_name || 'New Client',
          amount: amount,
          gst_amount: gstAmount,
          gst_rate: gstRate * 100,
          total_amount: totalAmount,
          status: 'pending',
          items: [{
            description: 'Services/Products',
            quantity: parsed.data.quantity || 1,
            rate: amount / (parsed.data.quantity || 1),
            amount: amount
          }]
        };

        const { data, error } = await supabase.from('invoices').insert([invoiceData]).select().single();
        if (error) throw error;
        result = data;
        recordType = 'invoice';
        recordData = invoiceData;
        message = `✅ Invoice ${invoiceData.invoice_number} created for ${invoiceData.client_name} - ₹${totalAmount.toLocaleString('en-IN')}${parsed.data.include_gst ? ' (incl. GST)' : ''}`;
        break;
      }

      case 'create_client': {
        if (!parsed.data.name) {
          return new Response(JSON.stringify({
            success: false,
            message: "Please specify the client name. Example: 'Add a client named ABC Traders from Mumbai'"
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const clientData = {
          user_id: userId,
          name: parsed.data.name,
          email: parsed.data.email || null,
          phone: parsed.data.phone || null,
          address: parsed.data.address || null,
          gst_number: parsed.data.gst_number || null
        };

        const { data, error } = await supabase.from('clients').insert([clientData]).select().single();
        if (error) {
          if (error.message.includes('duplicate') || error.code === '23505') {
            return new Response(JSON.stringify({
              success: false, message: `A client named "${parsed.data.name}" already exists.`
            }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          throw error;
        }
        result = data;
        recordType = 'client';
        recordData = clientData;
        message = `✅ Client "${clientData.name}" added${clientData.address ? ` from ${clientData.address}` : ''}`;
        break;
      }

      case 'create_vendor': {
        if (!parsed.data.name) {
          return new Response(JSON.stringify({
            success: false,
            message: "Please specify the vendor name. Example: 'Add a vendor named XYZ Supplies from Delhi'"
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const vendorData = {
          user_id: userId,
          name: parsed.data.name,
          email: parsed.data.email || null,
          phone: parsed.data.phone || null,
          address: parsed.data.address || null,
          gst_number: parsed.data.gst_number || null
        };

        const { data, error } = await supabase.from('vendors').insert([vendorData]).select().single();
        if (error) {
          if (error.code === '23505') {
            return new Response(JSON.stringify({
              success: false, message: `A vendor named "${parsed.data.name}" already exists.`
            }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          throw error;
        }
        result = data;
        recordType = 'vendor';
        recordData = vendorData;
        message = `✅ Vendor "${vendorData.name}" added${vendorData.address ? ` from ${vendorData.address}` : ''}`;
        break;
      }

      case 'create_sales_order': {
        const today = new Date().toISOString().split('T')[0];
        const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const quantity = parsed.data.quantity || 1;
        const rate = parsed.data.amount ? parsed.data.amount / quantity : 0;
        const subtotal = quantity * rate;
        const taxAmount = subtotal * 0.18;
        const totalAmount = subtotal + taxAmount;

        const orderData = {
          user_id: userId,
          order_number: generateNumber('SO'),
          order_date: today,
          due_date: dueDate,
          client_name: parsed.data.client_name || 'New Client',
          subtotal: subtotal,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          status: 'pending',
          payment_status: 'unpaid',
          items: [{ description: 'Products/Services', quantity, rate, amount: subtotal }]
        };

        const { data, error } = await supabase.from('sales_orders').insert([orderData]).select().single();
        if (error) throw error;
        result = data;
        recordType = 'sales_order';
        recordData = orderData;
        message = `✅ Sales Order ${orderData.order_number} created for ${orderData.client_name} - ₹${totalAmount.toLocaleString('en-IN')}`;
        break;
      }

      case 'create_purchase_order': {
        const today = new Date().toISOString().split('T')[0];
        const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const quantity = parsed.data.quantity || 1;
        const rate = parsed.data.amount ? parsed.data.amount / quantity : 0;
        const subtotal = quantity * rate;
        const taxAmount = subtotal * 0.18;
        const totalAmount = subtotal + taxAmount;

        const orderData = {
          user_id: userId,
          order_number: generateNumber('PO'),
          order_date: today,
          due_date: dueDate,
          vendor_name: parsed.data.vendor_name || 'New Vendor',
          subtotal: subtotal,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          status: 'pending',
          payment_status: 'unpaid',
          items: [{ description: 'Products/Services', quantity, rate, amount: subtotal }]
        };

        const { data, error } = await supabase.from('purchase_orders').insert([orderData]).select().single();
        if (error) throw error;
        result = data;
        recordType = 'purchase_order';
        recordData = orderData;
        message = `✅ Purchase Order ${orderData.order_number} created for ${orderData.vendor_name} - ₹${totalAmount.toLocaleString('en-IN')}`;
        break;
      }

      case 'create_inventory': {
        if (!parsed.data.product_name) {
          return new Response(JSON.stringify({
            success: false,
            message: "Please specify the product name. Example: 'Add inventory item named Laptop at ₹50000 with 10 units'"
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const sku = parsed.data.sku || `SKU-${Date.now().toString(36).toUpperCase()}`;
        const inventoryData = {
          user_id: userId,
          product_name: parsed.data.product_name,
          sku: sku,
          category: 'General',
          type: 'Product',
          selling_price: parsed.data.selling_price || 0,
          stock_quantity: parsed.data.stock_quantity || 0,
          reorder_level: 10
        };

        const { data, error } = await supabase.from('inventory').insert([inventoryData]).select().single();
        if (error) {
          if (error.code === '23505') {
            return new Response(JSON.stringify({
              success: false, message: `An item with this SKU already exists. Use a different SKU.`
            }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          throw error;
        }
        result = data;
        recordType = 'inventory';
        recordData = inventoryData;
        message = `✅ Inventory item "${inventoryData.product_name}" added - ${inventoryData.stock_quantity} units @ ₹${inventoryData.selling_price.toLocaleString('en-IN')}`;
        break;
      }

      case 'create_journal': {
        if (!parsed.data.amount) {
          return new Response(JSON.stringify({
            success: false,
            message: "Please specify the amount. Example: 'Record a journal entry for rent paid ₹10,000 via bank'"
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const today = new Date().toISOString().split('T')[0];
        const narration = parsed.data.narration || `${parsed.data.type === 'income' ? 'Income' : 'Expense'} entry`;
        const amount = parsed.data.amount;

        const journalData = {
          user_id: userId,
          journal_number: generateNumber('JV'),
          journal_date: today,
          narration: `${narration}${parsed.data.payment_mode ? ` via ${parsed.data.payment_mode}` : ''}`,
          total_debit: amount,
          total_credit: amount,
          status: 'posted'
        };

        const { data, error } = await supabase.from('journals').insert([journalData]).select().single();
        if (error) throw error;
        result = data;
        recordType = 'journal';
        recordData = journalData;
        message = `✅ Journal ${journalData.journal_number} recorded - ${narration} ₹${amount.toLocaleString('en-IN')}${parsed.data.payment_mode ? ` via ${parsed.data.payment_mode}` : ''}`;
        break;
      }

      case 'create_quotation': {
        const today = new Date().toISOString().split('T')[0];
        const quantity = parsed.data.quantity || 1;
        const rate = parsed.data.rate || parsed.data.amount || 0;
        const subtotal = quantity * rate;
        const taxAmount = subtotal * 0.18;
        const totalAmount = subtotal + taxAmount;

        const quotationData = {
          user_id: userId,
          quotation_number: generateNumber('QT'),
          quotation_date: today,
          client_name: parsed.data.client_name || 'New Client',
          subtotal: subtotal,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          status: 'pending',
          validity_period: 30,
          items: [{ description: 'Products/Services', quantity: quantity, rate: rate, amount: subtotal }]
        };

        const { data, error } = await supabase.from('quotations').insert([quotationData]).select().single();
        if (error) throw error;
        result = data;
        recordType = 'quotation';
        recordData = quotationData;
        message = `✅ Quotation ${quotationData.quotation_number} created - ${quantity} units @ ₹${rate.toLocaleString('en-IN')} = ₹${totalAmount.toLocaleString('en-IN')} (incl. GST)`;
        break;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message,
      recordType,
      recordId: result?.id,
      data: recordData
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[AI-Command] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
