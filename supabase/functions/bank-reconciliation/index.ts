import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { rawContent, fileType, bankTransactions, ledgerEntries, action } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // ACTION 1: Parse raw file content into structured transactions
    if (action === "parse") {
      const parsePrompt = `You are a bank statement parser. You will receive raw text content from a bank statement (CSV or PDF text).

Your job is to intelligently identify the columns/fields regardless of the bank format. Different banks use different column names:
- Date columns: "Date", "Txn Date", "Transaction Date", "Value Date", "Value Dt", "Post Date", etc.
- Description columns: "Narration", "Description", "Particulars", "Details", "Remarks", "Transaction Details", etc.
- Deposit columns: "Credit", "Deposit", "Deposit Amt", "Cr", "Credit Amount", etc.
- Withdrawal columns: "Debit", "Withdrawal", "Withdrawal Amt", "Dr", "Debit Amount", etc.
- Balance columns: "Balance", "Closing Balance", "Running Balance", "Available Balance", etc.
- Reference columns: "Ref No", "Chq/Ref No", "UTR", "Transaction ID", "Reference Number", etc.

Some banks use a single "Amount" column with separate Dr/Cr indicator. Some have combined debit/credit in one column with +/- signs.

For PDF statements, the data may be in tabular format without clear delimiters — use your intelligence to identify rows and columns.

IMPORTANT: Parse ALL transactions. Do NOT skip any rows. Extract every single transaction from the statement.

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "bankName": "detected bank name or 'Unknown'",
  "detectedColumns": {
    "date": "original column name found",
    "description": "original column name found",
    "deposit": "original column name found",
    "withdrawal": "original column name found",
    "balance": "original column name found or null",
    "reference": "original column name found or null"
  },
  "transactions": [
    {
      "date": "DD/MM/YYYY or as found",
      "description": "transaction description",
      "deposits": 0,
      "withdrawals": 0,
      "balance": 0,
      "reference": "ref number or null"
    }
  ]
}

Rules:
- Amounts must be numbers (no currency symbols, no commas)
- Keep original date format as found in the statement
- If a transaction has no deposit, set deposits to 0
- If a transaction has no withdrawal, set withdrawals to 0
- Skip header rows, footer rows, and summary rows
- Include ALL data rows as transactions`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: parsePrompt },
            { role: "user", content: `Here is the raw bank statement content (${fileType} format):\n\n${rawContent}` },
          ],
          stream: false,
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limited. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402) return new Response(JSON.stringify({ error: "Credits exhausted. Add funds in Settings > Workspace > Usage." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const t = await response.text();
        console.error("Parse AI error:", status, t);
        return new Response(JSON.stringify({ error: "AI parsing failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      let parsed;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: "Could not parse AI response" };
      } catch {
        parsed = { rawResponse: content, error: "Failed to parse structured response" };
      }

      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ACTION 2: Reconcile parsed transactions with ledger
    if (action === "reconcile") {
      const reconcilePrompt = `You are an AI-powered bank reconciliation assistant for an Indian accounting system.

Your task is to reconcile bank transactions with ledger entries.

Rules for matching:
- Match transactions ONLY if: amount is exactly the same, date is exactly the same, and description clearly matches.
- Do NOT guess or force matches.
- Mark matched transactions clearly.
- For unmatched transactions, classify the reason into one of: "Bank charges", "Interest", "Deposit in transit", "Unpresented cheque", "Direct credit/debit", "Other".
- For unmatched items, suggest creating ledger entries (the user will approve).

Return ONLY valid JSON (no markdown) in this exact structure:
{
  "matched": [
    {
      "bankTransaction": { "date": "...", "description": "...", "amount": 0, "type": "deposit|withdrawal" },
      "ledgerEntry": { "date": "...", "narration": "...", "debit": 0, "credit": 0 },
      "matchConfidence": "exact"
    }
  ],
  "unmatchedBank": [
    {
      "date": "...",
      "description": "...",
      "amount": 0,
      "type": "deposit|withdrawal",
      "reason": "Bank charges|Interest|Deposit in transit|Unpresented cheque|Direct credit/debit|Other",
      "suggestedLedgerEntry": {
        "accountName": "...",
        "debit": 0,
        "credit": 0,
        "narration": "..."
      }
    }
  ],
  "unmatchedLedger": [
    {
      "date": "...",
      "narration": "...",
      "debit": 0,
      "credit": 0,
      "reason": "Unpresented cheque|Deposit in transit|Other"
    }
  ],
  "summary": {
    "totalBankTransactions": 0,
    "totalLedgerEntries": 0,
    "matchedCount": 0,
    "unmatchedBankCount": 0,
    "unmatchedLedgerCount": 0,
    "bankBalance": 0,
    "ledgerBalance": 0,
    "difference": 0
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
            { role: "system", content: reconcilePrompt },
            { role: "user", content: userPrompt },
          ],
          stream: false,
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limited. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402) return new Response(JSON.stringify({ error: "Credits exhausted. Add funds." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const t = await response.text();
        console.error("Reconcile AI error:", status, t);
        return new Response(JSON.stringify({ error: "AI reconciliation failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      let reconciliation;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        reconciliation = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: "Could not parse AI response" };
      } catch {
        reconciliation = { rawResponse: content, error: "Failed to parse structured response" };
      }

      return new Response(JSON.stringify(reconciliation), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use 'parse' or 'reconcile'." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("bank-reconciliation error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
