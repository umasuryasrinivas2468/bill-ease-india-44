import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Bill OCR — sister function to expense-ocr but tailored to vendor bills,
// which need line-item extraction (qty / rate / tax) for inventory + ITC.
const EXTRACTION_PROMPT = `You are an expert Indian accountant. Read the ENTIRE vendor invoice / purchase bill carefully and extract structured data for Accounts Payable booking.

Return ONLY valid JSON in this exact shape:

{
  "vendor_name": "string or null",
  "vendor_gstin": "15-char GSTIN or null",
  "vendor_address": "string or null",
  "vendor_state": "Indian state name or null",
  "buyer_gstin": "buyer's GSTIN if visible or null",
  "buyer_state": "Indian state name or null (place of supply)",
  "bill_number": "string or null",
  "bill_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "po_number": "string or null",
  "currency": "INR by default",
  "is_rcm": "true if document mentions reverse charge / RCM / 'tax payable by recipient', else false",
  "items": [
    {
      "description": "string",
      "hsn_sac": "HSN/SAC code or null",
      "quantity": number,
      "rate": number,
      "tax_rate": number,
      "amount": number
    }
  ],
  "taxable_amount": number or null,
  "cgst_amount": number or null,
  "sgst_amount": number or null,
  "igst_amount": number or null,
  "cess_amount": number or null,
  "tcs_amount": number or null,
  "tds_amount": number or null,
  "round_off": number or null,
  "total_amount": number or null,
  "amount_in_words": "string or null",
  "raw_text": "complete readable text from the document"
}

Rules:
- Indian INR formatting: "1,23,456.78" → 123456.78
- Dates DD/MM/YYYY or DD-MMM-YYYY → YYYY-MM-DD
- If only CGST + SGST visible → intra-state. If only IGST → inter-state.
- For multi-line bills, return each line in items[]; tax_rate is per line if visible.
- If only a total tax is visible (no CGST/SGST/IGST split), put it in cgst_amount + sgst_amount halves only when intra-state can be confirmed; otherwise in igst_amount.
- "Tax payable by recipient" / "Reverse charge applicable" / "RCM" → is_rcm = true.
- If anything is unclear, return null for that field rather than guessing.
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

    const approxBytes = (fileBase64.length * 3) / 4;
    const MAX_FILE_SIZE = 15 * 1024 * 1024;
    if (approxBytes > MAX_FILE_SIZE) {
      throw new Error("File is too large (over 15 MB). Please upload a smaller or compressed file.");
    }

    const isPdf = mimeType === "application/pdf";
    console.log("[Bill-OCR] Processing", mimeType, "~", Math.round(approxBytes / 1024), "KB", isPdf ? "(PDF)" : "(Image)");

    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: EXTRACTION_PROMPT },
    ];
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${isPdf ? "application/pdf" : mimeType};base64,${fileBase64}` },
    });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: userContent }],
        temperature: 0.1,
        max_tokens: 12288,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Bill-OCR] AI error:", response.status, errorText);
      if (response.status === 429) throw new Error("Rate limit exceeded. Please try again in a moment.");
      if (response.status === 413) throw new Error("File is too large for the AI service.");
      throw new Error(`AI service error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from AI — the document may be unreadable or corrupted.");

    let jsonStr = content.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(jsonStr);
    } catch {
      // Repair-attempt on truncation
      let repaired = jsonStr;
      const quoteCount = (repaired.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) repaired += '"';
      if (!repaired.trimEnd().endsWith("}")) repaired += "}";
      try {
        extracted = JSON.parse(repaired);
      } catch {
        console.error("[Bill-OCR] Could not parse:", jsonStr.slice(0, 500));
        throw new Error("Could not parse the AI response. Try a clearer scan of the bill.");
      }
    }

    return new Response(JSON.stringify({ success: true, data: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[Bill-OCR] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
