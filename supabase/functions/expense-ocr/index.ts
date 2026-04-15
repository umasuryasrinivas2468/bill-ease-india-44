import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXTRACTION_PROMPT = `You are an expert Indian accountant. Carefully read the ENTIRE document — every page, every section — and extract expense fields.

Return ONLY valid JSON:

{
  "vendor_name": "string or null",
  "bill_number": "string or null",
  "expense_date": "YYYY-MM-DD or null",
  "base_amount": number or null,
  "tax_amount": number or null,
  "total_amount": number or null,
  "gst_number": "string or null (15-char GSTIN)",
  "payment_mode": "cash|bank|credit_card|debit_card|upi|cheque or null",
  "category_hint": "one of: Office Rent, Office Supplies, Utilities, Communication, Printing & Stationery, Repairs & Maintenance, Insurance, Software & Subscriptions, Fuel & Transportation, Travel & Accommodation, Advertising & Marketing, Entertainment, Raw Materials, Purchase of Goods, Freight & Cartage, Professional Fees, Miscellaneous — or null",
  "raw_text": "full readable text from document (include ALL text you can read)"
}

Rules:
- Read ALL pages of the document thoroughly before extracting.
- Indian amounts in INR. Parse 1,23,456.78 correctly.
- If CGST + SGST found separately, sum them for tax_amount.
- Dates: convert DD/MM/YYYY or DD-MMM-YYYY to YYYY-MM-DD.
- If base_amount missing: base_amount = total_amount - tax_amount.
- Return ONLY JSON, no markdown, no explanation.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { fileBase64, mimeType } = await req.json();

    if (!fileBase64 || !mimeType) {
      throw new Error("fileBase64 and mimeType are required");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Validate base64 size (approx file size) — reject files over 15 MB
    const approxBytes = (fileBase64.length * 3) / 4;
    const MAX_FILE_SIZE = 15 * 1024 * 1024;
    if (approxBytes > MAX_FILE_SIZE) {
      throw new Error(
        "File is too large (over 15 MB). Please upload a smaller or compressed file."
      );
    }

    const isPdf = mimeType === "application/pdf";
    console.log(
      "[Expense-OCR] Processing document, mimeType:",
      mimeType,
      "size ~",
      Math.round(approxBytes / 1024),
      "KB",
      isPdf ? "(PDF)" : "(Image)"
    );

    // Build the user content parts
    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: EXTRACTION_PROMPT },
    ];

    if (isPdf) {
      // For PDFs, use inline_data format which Gemini handles natively
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:application/pdf;base64,${fileBase64}`,
        },
      });
    } else {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${mimeType};base64,${fileBase64}`,
        },
      });
    }

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: userContent,
            },
          ],
          temperature: 0.1,
          max_tokens: 8192,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Expense-OCR] AI error:", response.status, errorText);
      if (response.status === 429) {
        throw new Error("Rate limit exceeded. Please try again in a moment.");
      }
      if (response.status === 413) {
        throw new Error(
          "File is too large for the AI service. Please upload a smaller or compressed file."
        );
      }
      throw new Error(`AI service error: ${response.status}`);
    }

    const result = await response.json();
    const finishReason = result.choices?.[0]?.finish_reason;
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Empty response from AI — the document may be unreadable or corrupted.");
    }

    console.log("[Expense-OCR] Raw AI response length:", content.length, "finish_reason:", finishReason);

    // Parse JSON from response (may be wrapped in markdown)
    let jsonStr = content.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(jsonStr);
    } catch {
      // Response may have been truncated — attempt to salvage by closing the JSON
      console.warn("[Expense-OCR] JSON parse failed, attempting to repair truncated response");
      let repaired = jsonStr;
      // Close any open string
      const quoteCount = (repaired.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) repaired += '"';
      // Close open object
      if (!repaired.trimEnd().endsWith("}")) repaired += "}";
      try {
        extracted = JSON.parse(repaired);
      } catch {
        console.error("[Expense-OCR] Could not parse AI response:", jsonStr.slice(0, 500));
        throw new Error(
          "Could not parse the AI response. The document may be too complex — try a clearer photo or a single-page scan."
        );
      }
    }

    return new Response(JSON.stringify({ success: true, data: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[Expense-OCR] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
