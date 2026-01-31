import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ParsedCommand {
  action: string;
  recordType: string | null;
  data: Record<string, any>;
  message: string;
  isQuestion: boolean;
  isReport: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { prompt, userId } = await req.json();

    console.log("[AI-Command] Processing prompt:", prompt);
    console.log("[AI-Command] User ID:", userId);

    const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
    if (!MISTRAL_API_KEY) {
      throw new Error("MISTRAL_API_KEY is not configured");
    }

    // Use Mistral to parse and respond to the command
    const result = await processWithMistral(prompt, MISTRAL_API_KEY);
    console.log("[AI-Command] Result:", JSON.stringify(result));

    return new Response(
      JSON.stringify({
        success: true,
        message: result.message,
        recordType: result.recordType,
        data: result.data,
        isQuestion: result.isQuestion,
        isReport: result.isReport,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[AI-Command] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error occurred",
        error: true,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

async function processWithMistral(prompt: string, apiKey: string): Promise<ParsedCommand> {
  const systemPrompt = `You are an intelligent accounting assistant for BillEase, an Indian accounting and GST management application.

Your capabilities:
1. **CREATE RECORDS** - Parse commands to create: invoices, clients, vendors, quotations, sales orders, purchase orders, inventory items, journal entries
2. **ANSWER QUESTIONS** - Provide expert guidance on GST, TDS, accounting principles, tax compliance, and app usage
3. **GENERATE REPORTS** - Describe what reports would show (P&L, GST summary, outstanding receivables, inventory, cash flow, sales)

**Response Format** (ALWAYS respond in valid JSON):
{
  "action": "create" | "answer" | "report",
  "recordType": "invoice" | "client" | "vendor" | "quotation" | "sales_order" | "purchase_order" | "inventory" | "journal" | "report" | "answer" | null,
  "data": { 
    // For CREATE: extracted fields like clientName, vendorName, amount, items, quantity, gstNumber, etc.
    // For REPORT: reportType like "profit_loss", "gst_summary", "outstanding", "inventory", "cash_flow", "sales"
    // For ANSWER: empty object {}
  },
  "message": "Your helpful response to the user - be conversational and confirm what you understood",
  "isQuestion": true/false,
  "isReport": true/false
}

**Guidelines:**
- For CREATE commands: Extract all relevant data (names, amounts in ₹, quantities, GST numbers, emails, phones, addresses) and confirm what will be created
- For questions: Provide accurate, helpful answers about Indian GST (rates: 5%, 12%, 18%, 28%), TDS, accounting concepts
- For reports: Explain what the report shows and what insights it provides
- Always use Indian Rupees (₹) for amounts
- Be friendly and professional
- If a command is unclear, ask for clarification in your message

**Examples:**
1. "Create invoice for ABC Company for 25000 with GST" → CREATE invoice with clientName: "ABC Company", amount: 25000, includeGst: true
2. "What is GST reverse charge?" → ANSWER explaining reverse charge mechanism
3. "Show me P&L report" → REPORT with reportType: "profit_loss"
4. "Add vendor XYZ Supplies from Delhi" → CREATE vendor with name: "XYZ Supplies", city: "Delhi"
5. "Add 10 units of Laptop at 50000 to inventory" → CREATE inventory with productName: "Laptop", quantity: 10, price: 50000`;

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-medium",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1024,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[AI-Command] Mistral API error:", response.status, errorText);

    if (response.status === 429) {
      throw new Error("Rate limit exceeded. Please try again in a moment.");
    }
    if (response.status === 401) {
      throw new Error("AI service authentication failed. Please check your API key.");
    }
    if (response.status === 402) {
      throw new Error("AI service quota exceeded. Please add credits to your account.");
    }

    throw new Error(`AI service error: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No response from AI service");
  }

  console.log("[AI-Command] Raw AI response:", content);

  try {
    const parsed = JSON.parse(content);
    return {
      action: parsed.action || "answer",
      recordType: parsed.recordType || null,
      data: parsed.data || {},
      message: parsed.message || "Command processed successfully",
      isQuestion: parsed.isQuestion || parsed.action === "answer",
      isReport: parsed.isReport || parsed.action === "report",
    };
  } catch (parseError) {
    console.error("[AI-Command] Failed to parse AI response:", content);
    // If JSON parsing fails, treat it as a text response
    return {
      action: "answer",
      recordType: "answer",
      data: {},
      message: content,
      isQuestion: true,
      isReport: false,
    };
  }
}
