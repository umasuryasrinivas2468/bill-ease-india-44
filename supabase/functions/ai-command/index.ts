import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedCommand {
  action: 'create_invoice' | 'create_client' | 'create_journal' | 'create_quotation' | 'unknown';
  data: Record<string, any>;
  confidence: number;
}

function parseCommand(prompt: string): ParsedCommand {
  const lower = prompt.toLowerCase().trim();
  
  // Invoice patterns
  if (lower.includes('invoice') || lower.includes('bill')) {
    const data: Record<string, any> = {};
    
    // Extract client name - look for "for [name]" pattern
    const forMatch = prompt.match(/(?:for|to)\s+([A-Za-z0-9\s&]+?)(?:\s+(?:for|of|worth|amount|₹|\$|rs|inr|with|at)|$)/i);
    if (forMatch) {
      data.client_name = forMatch[1].trim();
    }
    
    // Extract amount - look for currency patterns
    const amountMatch = prompt.match(/(?:₹|rs\.?|inr|rupees?|\$)?\s*([0-9,]+(?:\.[0-9]+)?)\s*(?:₹|rs\.?|inr|rupees?|\$)?/i);
    if (amountMatch) {
      data.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }
    
    // Check for GST
    data.include_gst = lower.includes('gst') || lower.includes('tax');
    
    // Extract items if mentioned
    const itemsMatch = prompt.match(/(\d+)\s*(?:units?|items?|pieces?|pcs?|qty)/i);
    if (itemsMatch) {
      data.quantity = parseInt(itemsMatch[1]);
    }
    
    return { action: 'create_invoice', data, confidence: 0.85 };
  }
  
  // Client patterns
  if (lower.includes('client') || lower.includes('customer') || lower.includes('party')) {
    const data: Record<string, any> = {};
    
    // Extract client name - look for "named [name]" or "called [name]" or just after "client"
    const namedMatch = prompt.match(/(?:named?|called?)\s+([A-Za-z0-9\s&]+?)(?:\s+(?:from|in|at|with|email|phone)|$)/i);
    if (namedMatch) {
      data.name = namedMatch[1].trim();
    } else {
      // Try to find name after "add a client" or similar
      const clientMatch = prompt.match(/(?:add|create|new)\s+(?:a\s+)?(?:client|customer|party)\s+([A-Za-z0-9\s&]+?)(?:\s+(?:from|in|at|with|email|phone)|$)/i);
      if (clientMatch) {
        data.name = clientMatch[1].trim();
      }
    }
    
    // Extract location/address
    const fromMatch = prompt.match(/(?:from|in|at)\s+([A-Za-z\s]+?)(?:\s+(?:with|email|phone)|$)/i);
    if (fromMatch) {
      data.address = fromMatch[1].trim();
    }
    
    // Extract email
    const emailMatch = prompt.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      data.email = emailMatch[1];
    }
    
    // Extract phone
    const phoneMatch = prompt.match(/(?:phone|mobile|contact|call)\s*:?\s*([0-9+\-\s]{10,})/i);
    if (phoneMatch) {
      data.phone = phoneMatch[1].trim();
    }
    
    // Extract GST number
    const gstMatch = prompt.match(/(?:gst|gstin)\s*:?\s*([0-9A-Z]{15})/i);
    if (gstMatch) {
      data.gst_number = gstMatch[1].toUpperCase();
    }
    
    return { action: 'create_client', data, confidence: 0.85 };
  }
  
  // Journal entry patterns
  if (lower.includes('journal') || lower.includes('entry') || lower.includes('record') || lower.includes('expense') || lower.includes('payment')) {
    const data: Record<string, any> = {};
    
    // Extract narration/description
    const forMatch = prompt.match(/(?:for|entry\s+for)\s+([a-zA-Z\s]+?)(?:\s+(?:₹|rs|inr|of|worth|amount|paid|received|via|through|by))/i);
    if (forMatch) {
      data.narration = forMatch[1].trim();
    }
    
    // Extract amount
    const amountMatch = prompt.match(/(?:₹|rs\.?|inr|rupees?|\$)?\s*([0-9,]+(?:\.[0-9]+)?)\s*(?:₹|rs\.?|inr|rupees?|\$)?/i);
    if (amountMatch) {
      data.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }
    
    // Determine payment mode
    if (lower.includes('bank') || lower.includes('transfer') || lower.includes('neft') || lower.includes('rtgs') || lower.includes('imps')) {
      data.payment_mode = 'bank';
    } else if (lower.includes('cash')) {
      data.payment_mode = 'cash';
    } else if (lower.includes('upi') || lower.includes('gpay') || lower.includes('phonepe') || lower.includes('paytm')) {
      data.payment_mode = 'upi';
    } else if (lower.includes('cheque') || lower.includes('check')) {
      data.payment_mode = 'cheque';
    }
    
    // Determine if it's an expense or income
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
    
    // Extract client name
    const forMatch = prompt.match(/(?:for|to)\s+([A-Za-z0-9\s&]+?)(?:\s+(?:for|of|worth|amount|₹|\$|rs|inr|with|at)|$)/i);
    if (forMatch) {
      data.client_name = forMatch[1].trim();
    }
    
    // Extract quantity and rate
    const qtyMatch = prompt.match(/(\d+)\s*(?:units?|items?|pieces?|pcs?|qty)/i);
    if (qtyMatch) {
      data.quantity = parseInt(qtyMatch[1]);
    }
    
    const rateMatch = prompt.match(/(?:at|@|rate)\s*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]+)?)\s*(?:each|per|\/)?/i);
    if (rateMatch) {
      data.rate = parseFloat(rateMatch[1].replace(/,/g, ''));
    }
    
    // Extract total amount if specified directly
    const amountMatch = prompt.match(/(?:₹|rs\.?|inr|rupees?|\$)?\s*([0-9,]+(?:\.[0-9]+)?)\s*(?:₹|rs\.?|inr|rupees?|\$)?/i);
    if (amountMatch && !data.rate) {
      data.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }
    
    return { action: 'create_quotation', data, confidence: 0.85 };
  }
  
  return { action: 'unknown', data: {}, confidence: 0 };
}

function generateInvoiceNumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `INV-${year}${month}-${random}`;
}

function generateQuotationNumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `QT-${year}${month}-${random}`;
}

function generateJournalNumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `JV-${year}${month}-${random}`;
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

    // Parse the command
    const parsed = parseCommand(prompt);
    console.log('[AI-Command] Parsed command:', parsed);

    if (parsed.action === 'unknown') {
      return new Response(JSON.stringify({
        success: false,
        message: "I couldn't understand that command. Try commands like:\n• Create an invoice for [client] for ₹[amount]\n• Add a client named [name] from [city]\n• Record a journal entry for [description] ₹[amount]\n• Create a quotation for [quantity] units at ₹[rate] each"
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
          invoice_number: generateInvoiceNumber(),
          invoice_date: today,
          due_date: dueDate,
          client_name: parsed.data.client_name || 'New Client',
          amount: amount,
          gst_amount: gstAmount,
          gst_rate: gstRate * 100,
          total_amount: totalAmount,
          status: 'draft',
          items: [{
            description: 'Services/Products',
            quantity: parsed.data.quantity || 1,
            rate: amount / (parsed.data.quantity || 1),
            amount: amount
          }]
        };

        const { data, error } = await supabase
          .from('invoices')
          .insert([invoiceData])
          .select()
          .single();

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
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const clientData = {
          user_id: userId,
          name: parsed.data.name,
          email: parsed.data.email || null,
          phone: parsed.data.phone || null,
          address: parsed.data.address || null,
          gst_number: parsed.data.gst_number || null
        };

        const { data, error } = await supabase
          .from('clients')
          .insert([clientData])
          .select()
          .single();

        if (error) {
          if (error.message.includes('duplicate') || error.code === '23505') {
            return new Response(JSON.stringify({
              success: false,
              message: `A client named "${parsed.data.name}" already exists.`
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          throw error;
        }

        result = data;
        recordType = 'client';
        recordData = clientData;
        message = `✅ Client "${clientData.name}" added${clientData.address ? ` from ${clientData.address}` : ''}`;
        break;
      }

      case 'create_journal': {
        if (!parsed.data.amount) {
          return new Response(JSON.stringify({
            success: false,
            message: "Please specify the amount. Example: 'Record a journal entry for rent paid ₹10,000 via bank'"
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const today = new Date().toISOString().split('T')[0];
        const narration = parsed.data.narration || `${parsed.data.type === 'income' ? 'Income' : 'Expense'} entry`;
        const amount = parsed.data.amount;

        // Create journal with balanced entry
        const journalData = {
          user_id: userId,
          journal_number: generateJournalNumber(),
          journal_date: today,
          narration: `${narration}${parsed.data.payment_mode ? ` via ${parsed.data.payment_mode}` : ''}`,
          total_debit: amount,
          total_credit: amount,
          status: 'posted'
        };

        const { data: journal, error: journalError } = await supabase
          .from('journals')
          .insert([journalData])
          .select()
          .single();

        if (journalError) throw journalError;

        result = journal;
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
        const taxAmount = subtotal * 0.18; // Default 18% GST
        const totalAmount = subtotal + taxAmount;

        const quotationData = {
          user_id: userId,
          quotation_number: generateQuotationNumber(),
          quotation_date: today,
          client_name: parsed.data.client_name || 'New Client',
          subtotal: subtotal,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          status: 'draft',
          validity_period: 30,
          items: [{
            description: 'Products/Services',
            quantity: quantity,
            rate: rate,
            amount: subtotal
          }]
        };

        const { data, error } = await supabase
          .from('quotations')
          .insert([quotationData])
          .select()
          .single();

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
