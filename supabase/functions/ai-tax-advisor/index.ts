import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a senior Indian tax consultant and CA (Chartered Accountant) with 20+ years of experience. You specialize in:
1. Income Tax Act 1961 - all sections including 80C, 80D, 80G, 35, 43B, 36, 32
2. GST Act 2017 - registration, filing (GSTR-1, 3B, 9), ITC rules, RCM
3. TDS/TCS compliance - sections 194A to 194T, Form 26AS reconciliation

IMPORTANT: Respond ONLY with valid JSON. No markdown wrapping.

When analyzing financial data, provide:
- Specific section references with amounts
- Actionable recommendations with deadlines
- Risk assessment for non-compliance
- Potential savings calculations

Use FY 2024-25 tax slabs (New Regime):
- Up to ₹3L: 0%
- ₹3L-₹7L: 5%
- ₹7L-₹10L: 10%
- ₹10L-₹12L: 15%
- ₹12L-₹15L: 20%
- Above ₹15L: 30%
- Surcharge: 10% if > ₹50L, 15% if > ₹1Cr
- Cess: 4%`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, financialData, financialYear, language } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let userPrompt = "";
    const langNote = language === 'hi' 
      ? '\n\nIMPORTANT: Respond in Hindi (Devanagari script) but keep section numbers, amounts, and technical terms in English.'
      : '';

    if (type === "tax_saving") {
      userPrompt = `Analyze this business financial data and provide tax-saving recommendations under Indian Income Tax Act 1961.${langNote}

Financial Data: ${JSON.stringify(financialData)}
Financial Year: ${financialYear}

Respond in this exact JSON:
{
  "deductions": [{"section": "Section X", "title": "...", "description": "...", "eligible_amount": 0, "max_limit": 0, "applicable": true, "recommendation": "...", "documentation_required": ["..."]}],
  "suggestions": [{"category": "...", "title": "...", "description": "...", "potential_savings": 0, "implementation_steps": ["..."], "priority": "high|medium|low", "deadline": "..."}],
  "tax_calculation": {"gross_income": 0, "total_deductions": 0, "taxable_income": 0, "tax_liability": 0, "effective_tax_rate": 0, "tax_breakdown": {"income_tax": 0, "surcharge": 0, "cess": 0, "total": 0}},
  "insights": "...",
  "compliance_notes": ["..."]
}`;
    } else if (type === "gst_guidance") {
      userPrompt = `Provide GST filing guidance based on this business data.${langNote}

Financial Data: ${JSON.stringify(financialData)}
Financial Year: ${financialYear}

Respond in this exact JSON:
{
  "gst_summary": {"total_output_gst": 0, "total_input_gst": 0, "net_gst_payable": 0, "itc_available": 0, "rcm_liability": 0},
  "filing_checklist": [{"return_type": "GSTR-1|GSTR-3B|GSTR-9", "due_date": "...", "status": "pending|filed|overdue", "action_items": ["..."]}],
  "itc_recommendations": [{"description": "...", "amount": 0, "section": "...", "action": "..."}],
  "rcm_transactions": [{"description": "...", "amount": 0, "gst_rate": 0, "section": "..."}],
  "compliance_risks": [{"risk": "...", "severity": "high|medium|low", "mitigation": "..."}],
  "insights": "..."
}`;
    } else if (type === "tds_alerts") {
      userPrompt = `Analyze TDS compliance for this business data and flag issues.${langNote}

Financial Data: ${JSON.stringify(financialData)}
Financial Year: ${financialYear}

Respond in this exact JSON:
{
  "tds_summary": {"total_tds_deducted": 0, "total_tds_deposited": 0, "pending_deposit": 0, "next_due_date": "..."},
  "compliance_alerts": [{"section": "194X", "description": "...", "severity": "critical|warning|info", "amount": 0, "due_date": "...", "action_required": "..."}],
  "missed_deductions": [{"transaction_type": "...", "vendor": "...", "amount": 0, "applicable_section": "...", "tds_rate": 0, "tds_amount": 0}],
  "form_filing_status": [{"form": "26Q|24Q|27Q", "quarter": "Q1|Q2|Q3|Q4", "due_date": "...", "status": "filed|pending|overdue"}],
  "recommendations": [{"title": "...", "description": "...", "priority": "high|medium|low"}],
  "insights": "..."
}`;
    } else {
      return new Response(JSON.stringify({ error: "Invalid type. Use: tax_saving, gst_guidance, tds_alerts" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";

    // Clean markdown wrapping
    content = content.trim();
    if (content.startsWith("```json")) content = content.slice(7);
    if (content.startsWith("```")) content = content.slice(3);
    if (content.endsWith("```")) content = content.slice(0, -3);
    content = content.trim();

    try {
      const parsed = JSON.parse(content);
      return new Response(JSON.stringify({ success: true, data: parsed, type }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch {
      console.error("JSON parse error, returning raw");
      return new Response(JSON.stringify({ success: true, data: { insights: content }, type }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("ai-tax-advisor error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
