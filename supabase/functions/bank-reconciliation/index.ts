import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { bankTransactions, ledgerEntries } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are an AI-powered bank reconciliation assistant for an Indian accounting system.

Your task is to reconcile bank transactions with ledger entries.

Rules for matching:
- Match transactions ONLY if: amount is exactly the same, date is exactly the same, and description clearly matches.
- Do NOT guess or force matches.
- Mark matched transactions clearly.
- For unmatched transactions, classify the reason into one of: "Bank charges", "Interest", "Deposit in transit", "Unpresented cheque", "Direct credit/debit", "Other".
- For unmatched items, suggest creating ledger entries (the user will approve).

Return a JSON response using this exact structure (no markdown, just raw JSON):
{
  "matched": [
    {
      "bankTransaction": { "date": "...", "description": "...", "amount": ..., "type": "deposit|withdrawal" },
      "ledgerEntry": { "date": "...", "narration": "...", "debit": ..., "credit": ... },
      "matchConfidence": "exact"
    }
  ],
  "unmatchedBank": [
    {
      "date": "...",
      "description": "...",
      "amount": ...,
      "type": "deposit|withdrawal",
      "reason": "Bank charges|Interest|Deposit in transit|Unpresented cheque|Direct credit/debit|Other",
      "suggestedLedgerEntry": {
        "accountName": "...",
        "debit": ...,
        "credit": ...,
        "narration": "..."
      }
    }
  ],
  "unmatchedLedger": [
    {
      "date": "...",
      "narration": "...",
      "debit": ...,
      "credit": ...,
      "reason": "Unpresented cheque|Deposit in transit|Other"
    }
  ],
  "summary": {
    "totalBankTransactions": ...,
    "totalLedgerEntries": ...,
    "matchedCount": ...,
    "unmatchedBankCount": ...,
    "unmatchedLedgerCount": ...,
    "bankBalance": ...,
    "ledgerBalance": ...,
    "difference": ...
  }
}`;

    const userPrompt = `Bank Transactions:\n${JSON.stringify(bankTransactions, null, 2)}\n\nLedger Entries:\n${JSON.stringify(ledgerEntries, null, 2)}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Try to parse JSON from the response
    let reconciliation;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      reconciliation = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: "Could not parse AI response" };
    } catch {
      reconciliation = { rawResponse: content, error: "Failed to parse structured response" };
    }

    return new Response(JSON.stringify(reconciliation), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("bank-reconciliation error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
