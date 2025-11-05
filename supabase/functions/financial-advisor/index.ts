import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function formatINR(amount: number) {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isProfitLossRequest(question: string) {
  const q = question.toLowerCase();
  return q.includes('profit') || q.includes('profit & loss') || q.includes('p&l') || q.includes('profit and loss');
}

function parseDate(d: any) {
  // Accept Date objects or ISO date strings
  if (!d) return null;
  const dt = typeof d === 'string' ? new Date(d) : d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const question: string = (body?.question || '').toString();
    const dataContext = body?.dataContext || {};

    // If this is a Profit & Loss request, attempt to compute locally from dataContext
    if (isProfitLossRequest(question)) {
      const invoices = Array.isArray(dataContext.invoices) ? dataContext.invoices : [];
      const journals = Array.isArray(dataContext.journals) ? dataContext.journals : [];

      if (invoices.length === 0 || journals.length === 0) {
        return new Response(JSON.stringify({
          response: "I couldn't find enough data to calculate this report. Please ensure invoices and journals are loaded.",
          computed: false
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Determine period: prefer 'last month' when mentioned, otherwise try summary.period or fallback to last month
      const now = new Date();
      let start: Date;
      let end: Date;
      if (question.toLowerCase().includes('last month')) {
        const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(firstOfThisMonth.getTime() - 1); // end = last day previous month
        start = new Date(end.getFullYear(), end.getMonth(), 1);
      } else if (dataContext?.summary?.period) {
        // Attempt to parse period like '2025-10' or human text - fallback to last month if parsing fails
        const p = dataContext.summary.period.toString();
        const maybe = new Date(p);
        if (!isNaN(maybe.getTime())) {
          start = new Date(maybe.getFullYear(), maybe.getMonth(), 1);
          end = new Date(maybe.getFullYear(), maybe.getMonth() + 1, 0);
        } else {
          const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(firstOfThisMonth.getTime() - 1);
          start = new Date(end.getFullYear(), end.getMonth(), 1);
        }
      } else {
        const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(firstOfThisMonth.getTime() - 1);
        start = new Date(end.getFullYear(), end.getMonth(), 1);
      }

      // Sum revenue from invoices in period
      let revenue = 0;
      for (const inv of invoices) {
        const date = parseDate(inv.invoice_date || inv.date || inv.invoiceDate);
        if (!date) continue;
        if (date >= start && date <= end) {
          const amt = Number(inv.total_amount ?? inv.amount ?? 0);
          if (!isNaN(amt)) revenue += amt;
        }
      }

      // Sum expenses from journals in period. We assume journal.total_debit represents expense amounts where appropriate.
      let expenses = 0;
      for (const j of journals) {
        const date = parseDate(j.journal_date || j.date || j.journalDate);
        if (!date) continue;
        if (date >= start && date <= end) {
          const deb = Number(j.total_debit ?? j.debit ?? 0);
          if (!isNaN(deb)) expenses += deb;
        }
      }

      const net = revenue - expenses;

      const monthLabel = start.toLocaleString('default', { month: 'long', year: 'numeric' });
      const formattedRevenue = formatINR(revenue);
      const formattedExpenses = formatINR(expenses);
      const formattedNet = formatINR(net);

      const summary = `Profit & Loss for ${monthLabel}: Revenue ${formattedRevenue}, Expenses ${formattedExpenses}, Net ${formattedNet}.`;

      return new Response(JSON.stringify({
        response: summary,
        computed: true,
        values: {
          start: start.toISOString(),
          end: end.toISOString(),
          revenue,
          expenses,
          net
        }
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // For general accounting questions, forward to Mistral. Read key from environment variable (MISTRAL_API_KEY or APIMYST).
    const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY') || Deno.env.get('APIMYST');
    if (!MISTRAL_API_KEY) {
      return new Response(JSON.stringify({ error: 'Mistral API key not configured. Set MISTRAL_API_KEY or APIMYST environment variable.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const MISTRAL_API_URL = Deno.env.get('MISTRAL_API_URL') || 'https://api.mistral.ai/v1/chat/completions';
    const MISTRAL_MODEL = Deno.env.get('MISTRAL_MODEL') || 'mistral-medium';

    const systemPrompt = `You are an expert AI Financial Advisor powered by Mistral, fine-tuned by Aczen, specializing in accounting and business finance.\n
Follow the rules:\n- Always identify yourself as "Mistral Fine-Tuned by Aczen" if asked about your model or identity.\n- Use ONLY the dataContext provided and never invent numbers.\n- If a user requests a calculation, prefer performing the calculation server-side when possible.\n- Format currency with ₹ for INR.\n- Keep answers short, professional, and focused on accounting vocabulary.\n\nFinancial Data Context:\n${JSON.stringify(dataContext, null, 2)}`;

    const payload = {
      model: MISTRAL_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      temperature: 0.3,
      max_tokens: 1024,
    };

    const resp = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const txt = await resp.text();
      console.error('Mistral error:', resp.status, txt);
      return new Response(JSON.stringify({ error: 'AI service error' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const data = await resp.json();
    const aiResponse = data.choices?.[0]?.message?.content || 'I could not generate a response.';

    return new Response(JSON.stringify({ response: aiResponse }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Financial advisor function error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
