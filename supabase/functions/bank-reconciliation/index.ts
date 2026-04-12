import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PARSE_PROMPT = `You are an expert bank statement parser for Indian banks.

The input is extracted text from a bank statement (PDF or CSV). The text may have columns laid out side-by-side separated by spaces. You must intelligently identify and parse ALL transaction rows.

EXTRACT these fields for every transaction:
- date: transaction date — keep original format (DD/MM/YYYY, DD-MM-YYYY, etc.)
- description: the full narration / particulars / transaction description
- deposits: the credit/deposit amount as a plain number (0 if this row is a debit/withdrawal)
- withdrawals: the debit/withdrawal amount as a plain number (0 if this row is a credit/deposit)
- balance: the running/closing balance as a plain number (0 if not shown)
- reference: cheque no / UTR / Ref no / transaction ID (null if absent)

ALSO detect:
- bankName: name of the bank (SBI, HDFC, ICICI, Axis, Kotak, PNB, etc. or "Unknown")
- detectedColumns: the actual header names found for each field

COLUMN NAMES vary by bank:
- Date: "Date", "Txn Date", "Transaction Date", "Value Date", "Value Dt", "Post Date", "Posting Date"
- Description: "Narration", "Description", "Particulars", "Details", "Remarks", "Transaction Details", "Transaction Remarks"
- Deposits/Credit: "Credit", "Deposit", "Cr Amount", "Cr", "Credit Amount", "Deposit Amt"
- Withdrawals/Debit: "Debit", "Withdrawal", "Dr Amount", "Dr", "Debit Amount", "Withdrawal Amt"
- Balance: "Balance", "Closing Balance", "Running Balance", "Available Balance", "Bal"
- Reference: "Ref No", "Chq/Ref No", "UTR No", "Transaction ID", "Reference Number", "Ref"

CRITICAL RULES:
1. Parse EVERY transaction row without skipping any
2. If the bank uses a single "Amount" column with a separate "Dr/Cr" or "Type" indicator, put the amount in deposits (if Cr) or withdrawals (if Dr)
3. Strip all currency symbols (₹, Rs, INR) and comma separators before storing amounts — store as plain number e.g. 1,23,456.78 → 123456.78
4. Skip header rows, opening balance rows, closing balance rows, and footer/summary rows
5. For PDF text input the columns may be space-separated — use context to identify values

Return ONLY valid JSON — no markdown code fences, no explanation text, nothing before or after the JSON object:
{
  "bankName": "detected bank name or Unknown",
  "detectedColumns": {
    "date": "actual column header text",
    "description": "actual column header text",
    "deposit": "actual column header text",
    "withdrawal": "actual column header text",
    "balance": "actual column header text or null",
    "reference": "actual column header text or null"
  },
  "transactions": [
    {
      "date": "original date string",
      "description": "full transaction description",
      "deposits": 0,
      "withdrawals": 0,
      "balance": 0,
      "reference": null
    }
  ]
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { rawContent, base64Content, fileType, bankTransactions, ledgerEntries, action } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    // ─── ACTION: PARSE ───────────────────────────────────────────────────────────
    if (action === "parse") {
      let aiContent = "";

      // ── PDF path: use Gemini's native document understanding ─────────────────
      if (fileType === "pdf" && base64Content) {
        if (GEMINI_API_KEY) {
          // Best: Google Generative Language API with inline PDF
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    {
                      inlineData: {
                        mimeType: "application/pdf",
                        data: base64Content,
                      },
                    },
                    { text: PARSE_PROMPT + "\n\nParse all transactions from the attached PDF bank statement." },
                  ],
                }],
                generationConfig: { temperature: 0 },
              }),
            }
          );

          if (!response.ok) {
            const errText = await response.text();
            console.error("Gemini native API error:", response.status, errText);
            return new Response(
              JSON.stringify({ error: `Gemini API error (${response.status}). Check GEMINI_API_KEY in Supabase secrets.` }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const data = await response.json();
          aiContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

        } else if (LOVABLE_API_KEY) {
          // Fallback: Lovable gateway with multimodal PDF (Gemini vision format)
          const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.0-flash",
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: PARSE_PROMPT },
                    {
                      type: "image_url",
                      image_url: { url: `data:application/pdf;base64,${base64Content}` },
                    },
                  ],
                },
              ],
              stream: false,
            }),
          });

          if (!response.ok) {
            const status = response.status;
            const errText = await response.text();
            console.error("Lovable gateway PDF error:", status, errText);
            if (status === 429) return new Response(JSON.stringify({ error: "Rate limited. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            if (status === 402) return new Response(JSON.stringify({ error: "Credits exhausted. Add funds in Settings > Workspace > Usage." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            return new Response(
              JSON.stringify({ error: "PDF parsing failed. For best results, add GEMINI_API_KEY to Supabase Edge Function secrets (get one free at aistudio.google.com)." }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const data = await response.json();
          aiContent = data.choices?.[0]?.message?.content || "";

        } else {
          return new Response(
            JSON.stringify({ error: "No API key configured. Add GEMINI_API_KEY or LOVABLE_API_KEY to Supabase Edge Function secrets." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

      // ── CSV / text path: use Lovable gateway ─────────────────────────────────
      } else if (rawContent) {
        if (!LOVABLE_API_KEY) {
          return new Response(JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: PARSE_PROMPT },
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
        aiContent = data.choices?.[0]?.message?.content || "";

      } else {
        return new Response(JSON.stringify({ error: "No content provided. Send base64Content for PDFs or rawContent for CSV." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Parse JSON from AI response ───────────────────────────────────────────
      let parsed: Record<string, unknown>;
      try {
        const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: "Could not extract JSON from AI response" };
      } catch {
        parsed = { rawResponse: aiContent, error: "Failed to parse structured response from AI" };
      }

      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── ACTION: RECONCILE ───────────────────────────────────────────────────────
    if (action === "reconcile") {
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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
          model: "google/gemini-2.5-flash",
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
      let reconciliation: Record<string, unknown>;
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
