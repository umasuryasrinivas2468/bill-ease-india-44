import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const prompts: Record<string, (metrics: string, inventory: string) => { system: string; user: string }> = {
  overview: (metrics, inventory) => ({
    system: "You are an expert inventory analyst for an Indian SMB. Return concise, actionable insights using markdown with sections: ## Summary, ## Risks, ## Opportunities, ## Recommended Actions, ## Priority Products",
    user: `Metrics: ${metrics}\nInventory: ${inventory}`,
  }),
  demand: (metrics, inventory) => ({
    system: "You are an inventory demand analyst for an Indian SMB. Predict demand patterns using markdown with sections: ## Demand Analysis (HIGH/MEDIUM/LOW by category), ## Seasonal Trends (Indian festivals, monsoon, tax season), ## Demand Alerts (stockout risks & overstocked items), ## Recommended Stock Levels",
    user: `Metrics: ${metrics}\nInventory: ${inventory}`,
  }),
  forecast: (metrics, inventory) => ({
    system: "You are a supply chain forecasting expert for an Indian SMB. Provide 30/60/90 day forecast using markdown with sections: ## 30-Day Forecast (stockout risks, reorder quantities), ## 60-Day Outlook (stock health, capital needs), ## 90-Day Strategic View (trends, opportunities), ## Cash Flow Impact (restocking costs, revenue at risk), ## Supplier Recommendations",
    user: `Metrics: ${metrics}\nInventory: ${inventory}`,
  }),
  suggestions: (metrics, inventory) => ({
    system: "You are an inventory optimization consultant for an Indian SMB. Provide product-specific suggestions using markdown with sections: ## Pricing Optimization (low margin <15%, high margin, bundles), ## Product Mix Suggestions (expand, discontinue, complementary), ## Inventory Efficiency (dead stock, fast movers, ABC analysis), ## Action Items (top 5 prioritized)",
    user: `Metrics: ${metrics}\nInventory: ${inventory}`,
  }),
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, metrics, inventory } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const promptFn = prompts[type];
    if (!promptFn) throw new Error(`Unknown analysis type: ${type}`);

    const { system, user } = promptFn(metrics, inventory);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.4,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", status, text);
      throw new Error(`AI service error (${status})`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ result: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("inventory-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
