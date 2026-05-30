// supabase/functions/ai-financial-review/index.ts
// LLM-powered financial review. Takes Schedule III BS, P&L, CFS, ratios + the
// rules-engine findings, calls the AI gateway, returns structured findings +
// executive summary + markdown commentary, then persists everything to the
// ai_review_runs / ai_findings tables via persist_llm_review RPC.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a senior Chartered Accountant and financial analyst with 20+ years of experience reviewing Indian SME and corporate financials filed under Schedule III of the Companies Act, 2013.

You will be given a complete set of financial statements (Balance Sheet, P&L, Cash Flow, Ratios) plus any deterministic rules-engine findings already raised. Your job is to add the human-level judgment that the rules engine cannot:

- Identify trends and inter-statement inconsistencies (e.g. growing receivables with shrinking sales).
- Flag disclosures that *should* be in Notes to Accounts based on what the numbers reveal (Section 22 MSME, contingent liabilities, related-party, going-concern).
- Score audit risk for each major Schedule III area.
- Suggest concrete corrective actions a CA would write in a management letter.

CRITICAL RULES:
1. Respond with VALID JSON only — no markdown wrapping, no preamble.
2. Use Indian conventions: ₹ for currency, lakhs/crores in narrative, FY format "2025-26".
3. Cite specific Schedule III line codes (BS.CA.3, PL.E.6, etc.) when referencing numbers.
4. Each finding must have actionable suggested_action — not platitudes.
5. Severity tiers: critical (blocks audit sign-off), high (requires disclosure), medium (worth investigating), low (informational), info (positive observation).

JSON SHAPE — adhere exactly:
{
  "executive_summary": "2-3 sentence top-of-mind summary for the founder/CFO.",
  "narrative_commentary": "Markdown — 200-400 words. Sections: ## Headline observations / ## Working capital / ## Capital structure / ## Audit-readiness. Use ### subheadings and bullet lists.",
  "findings": [
    {
      "category": "anomaly|disclosure|ratio|compliance|audit",
      "severity": "critical|high|medium|low|info",
      "rule_code": "LLM_<UPPER_SNAKE>",
      "title": "Short headline (max 12 words)",
      "body": "1-2 sentence explanation with the relevant numbers.",
      "related_line": "BS.X.Y or PL.X.Y (optional)",
      "metric_value": 0,
      "metric_unit": "% | ₹ | x | days (optional)",
      "suggested_action": "Specific next step — what to do, who acts, by when."
    }
  ]
}`;

interface ReviewInput {
  userId: string;
  fiscalYear: string;
  bs: unknown;        // get_schedule_iii_balance_sheet output
  pl: unknown;        // get_schedule_iii_profit_loss output
  cfs: unknown;       // get_cash_flow_statement output
  ratios: unknown;    // get_financial_ratios output
  integrity?: unknown;
  rulesFindings?: unknown[]; // findings already raised by detect_financial_anomalies
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as ReviewInput;
    const { userId, fiscalYear, bs, pl, cfs, ratios, integrity, rulesFindings } = body;

    if (!userId || !fiscalYear) {
      return new Response(JSON.stringify({ error: "userId and fiscalYear are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI key not configured (LOVABLE_API_KEY)" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userPrompt = `Review the following financial statements and produce structured findings + commentary.

Fiscal Year: ${fiscalYear}

Balance Sheet (Schedule III, as-of FY end):
${JSON.stringify(bs)}

Profit & Loss (Schedule III, full FY):
${JSON.stringify(pl)}

Cash Flow Statement (indirect method):
${JSON.stringify(cfs)}

Financial Ratios:
${JSON.stringify(ratios)}

Trial Balance / Schedule III Integrity:
${JSON.stringify(integrity ?? {})}

Rules-engine findings already raised (do NOT duplicate — augment with context, trends, and audit-level judgement):
${JSON.stringify(rulesFindings ?? [])}

Return the JSON described in the system prompt — nothing else.`;

    const model = "google/gemini-3-flash-preview";

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4096,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI gateway error", status: aiResp.status }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    let content: string = aiJson.choices?.[0]?.message?.content ?? "";
    content = content.trim();
    if (content.startsWith("```json")) content = content.slice(7);
    if (content.startsWith("```"))     content = content.slice(3);
    if (content.endsWith("```"))       content = content.slice(0, -3);
    content = content.trim();

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("LLM did not return parseable JSON:", content.slice(0, 500));
      return new Response(JSON.stringify({
        error: "AI returned non-JSON response",
        raw: content.slice(0, 2000),
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Attach metadata + persist via RPC
    const payload = {
      ...parsed,
      provider: "lovable",
      model,
      usage: {
        prompt_tokens:     aiJson.usage?.prompt_tokens ?? null,
        completion_tokens: aiJson.usage?.completion_tokens ?? null,
        cache_read_tokens: aiJson.usage?.cache_read_input_tokens
                        ?? aiJson.usage?.prompt_tokens_details?.cached_tokens
                        ?? null,
      },
    };

    const SUPABASE_URL              = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      // Still return the parsed payload so the client can render even if persistence fails
      console.warn("Supabase env not configured — skipping persistence");
      return new Response(JSON.stringify({ success: true, data: payload, persisted: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: persistRes, error: persistErr } = await supabase.rpc("persist_llm_review", {
      p_user_id: userId,
      p_fiscal_year: fiscalYear,
      p_payload: payload,
    });
    if (persistErr) {
      console.error("persist_llm_review error:", persistErr);
      // Don't fail the request — return the LLM output anyway
      return new Response(JSON.stringify({
        success: true, data: payload, persisted: false, persistError: persistErr.message,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      success: true,
      data: { ...payload, run_id: persistRes?.run_id ?? null },
      persisted: true,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("ai-financial-review fatal error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message ?? "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
