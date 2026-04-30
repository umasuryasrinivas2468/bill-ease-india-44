import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const buildPrompt = (gstNumber: string, country: string) => `You are an expert assistant for ${country === "singapore" ? "Singaporean" : "Indian"} business registration records.

Look up the business registered under the following GST identifier and return its details. Respond with a SINGLE valid JSON object matching the exact schema below. No markdown, no commentary, no code fences.

GST / Tax Identifier: ${gstNumber}
Country: ${country}

Schema:
{
  "found": boolean,
  "businessName": "string or null — legal/registered trade name of the business",
  "address": "string or null — full street address line (door no, street, locality)",
  "city": "string or null",
  "state": "string or null — full state name (not code)",
  "pincode": "string or null — 6-digit Indian PIN or Singapore postal code"
}

Rules:
- If you do NOT know this specific identifier with high confidence, set "found": false and ALL other fields to null. Do NOT fabricate or guess details.
- For Indian GSTINs (15 chars), the first 2 digits are the state code — you may use this to derive the state field, but only if you also know the business itself.
- Indian state codes: 01=Jammu & Kashmir, 02=Himachal Pradesh, 03=Punjab, 04=Chandigarh, 05=Uttarakhand, 06=Haryana, 07=Delhi, 08=Rajasthan, 09=Uttar Pradesh, 10=Bihar, 11=Sikkim, 12=Arunachal Pradesh, 13=Nagaland, 14=Manipur, 15=Mizoram, 16=Tripura, 17=Meghalaya, 18=Assam, 19=West Bengal, 20=Jharkhand, 21=Odisha, 22=Chhattisgarh, 23=Madhya Pradesh, 24=Gujarat, 27=Maharashtra, 29=Karnataka, 32=Kerala, 33=Tamil Nadu, 36=Telangana, 37=Andhra Pradesh.
- Return ONLY the JSON object.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { gstNumber, country = "india" } = await req.json();

    if (!gstNumber || typeof gstNumber !== "string") {
      throw new Error("gstNumber is required");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const cleaned = gstNumber.trim().toUpperCase();
    console.log("[GST-Lookup-Gemini] Querying:", cleaned, "country:", country);

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
            { role: "user", content: buildPrompt(cleaned, country) },
          ],
          temperature: 0.1,
          max_tokens: 1024,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[GST-Lookup-Gemini] AI error:", response.status, errorText);
      if (response.status === 429) {
        throw new Error("Rate limit exceeded. Please try again in a moment.");
      }
      throw new Error(`AI service error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from AI");
    }

    let jsonStr = content.trim();
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) jsonStr = fence[1].trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("[GST-Lookup-Gemini] JSON parse failed:", jsonStr.slice(0, 300));
      throw new Error("Could not parse the AI response.");
    }

    return new Response(JSON.stringify({ success: true, data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[GST-Lookup-Gemini] Error:", error);
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
