import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const app = new Hono();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ─── Tool Definitions ───────────────────────────────────────────────

interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
}

const TOOLS: ToolDef[] = [
  {
    name: "analyze_data",
    description:
      "Analyze financial or business data. Returns summary statistics, trends, and insights.",
    input_schema: {
      type: "object",
      properties: {
        data_type: {
          type: "string",
          enum: ["invoices", "expenses", "revenue", "inventory"],
          description: "The type of data to analyze",
        },
        period: {
          type: "string",
          enum: ["daily", "weekly", "monthly", "quarterly", "yearly"],
          description: "The time period for the analysis",
        },
        metrics: {
          type: "array",
          items: { type: "string" },
          description: "Specific metrics to calculate (e.g. total, average, growth_rate)",
        },
      },
      required: ["data_type", "period"],
    },
    output_schema: {
      type: "object",
      properties: {
        data_type: { type: "string" },
        period: { type: "string" },
        summary: { type: "object" },
        insights: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "generate_report",
    description:
      "Generate a structured business report (GST, P&L, balance sheet, tax summary, etc.).",
    input_schema: {
      type: "object",
      properties: {
        report_type: {
          type: "string",
          enum: ["gst_summary", "profit_loss", "balance_sheet", "tax_summary", "cash_flow"],
          description: "Type of report to generate",
        },
        financial_year: {
          type: "string",
          description: "Financial year, e.g. 2024-25",
        },
        format: {
          type: "string",
          enum: ["json", "summary"],
          description: "Output format",
        },
      },
      required: ["report_type", "financial_year"],
    },
    output_schema: {
      type: "object",
      properties: {
        report_type: { type: "string" },
        financial_year: { type: "string" },
        generated_at: { type: "string" },
        data: { type: "object" },
      },
    },
  },
  {
    name: "automate_task",
    description:
      "Automate a recurring business task such as sending reminders, reconciling entries, or generating recurring invoices.",
    input_schema: {
      type: "object",
      properties: {
        task_type: {
          type: "string",
          enum: [
            "send_payment_reminder",
            "reconcile_bank_entries",
            "generate_recurring_invoices",
            "update_overdue_status",
          ],
          description: "The type of task to automate",
        },
        parameters: {
          type: "object",
          description: "Task-specific parameters",
        },
      },
      required: ["task_type"],
    },
    output_schema: {
      type: "object",
      properties: {
        task_type: { type: "string" },
        status: { type: "string" },
        result: { type: "object" },
      },
    },
  },
];

// ─── Tool Handlers ──────────────────────────────────────────────────

function handleAnalyzeData(args: Record<string, unknown>) {
  const dataType = args.data_type as string;
  const period = args.period as string;
  const metrics = (args.metrics as string[]) || ["total", "average", "count"];

  const mockData: Record<string, Record<string, unknown>> = {
    invoices: {
      total_count: 142,
      total_amount: 2847500.0,
      average_amount: 20052.82,
      paid_count: 118,
      pending_count: 19,
      overdue_count: 5,
      collection_rate: 83.1,
      growth_rate: 12.5,
    },
    expenses: {
      total_count: 89,
      total_amount: 1245300.0,
      average_amount: 13992.13,
      top_category: "Office Rent",
      categories_count: 12,
      growth_rate: -3.2,
    },
    revenue: {
      gross_revenue: 2847500.0,
      net_revenue: 2412000.0,
      gst_collected: 435500.0,
      growth_rate: 15.8,
      profit_margin: 34.2,
    },
    inventory: {
      total_items: 256,
      total_value: 1890000.0,
      low_stock_items: 12,
      out_of_stock: 3,
      turnover_rate: 4.2,
    },
  };

  return {
    data_type: dataType,
    period,
    metrics_requested: metrics,
    summary: mockData[dataType] || {},
    insights: [
      `${dataType} analysis for ${period} period completed successfully.`,
      `Growth rate trend is ${(mockData[dataType]?.growth_rate as number) > 0 ? "positive" : "negative"}.`,
      `Recommended action: Review ${dataType} with highest variance.`,
    ],
    analyzed_at: new Date().toISOString(),
  };
}

function handleGenerateReport(args: Record<string, unknown>) {
  const reportType = args.report_type as string;
  const fy = args.financial_year as string;

  const reports: Record<string, Record<string, unknown>> = {
    gst_summary: {
      total_taxable_value: 2412000,
      cgst: 217125,
      sgst: 217125,
      igst: 0,
      total_gst: 434250,
      input_tax_credit: 198500,
      net_gst_payable: 235750,
      filing_status: { gstr1: "filed", gstr3b: "filed" },
    },
    profit_loss: {
      revenue: 2847500,
      cost_of_goods_sold: 1245300,
      gross_profit: 1602200,
      operating_expenses: 856000,
      operating_profit: 746200,
      other_income: 32000,
      net_profit_before_tax: 778200,
      tax_provision: 201932,
      net_profit_after_tax: 576268,
    },
    balance_sheet: {
      assets: { current: 1890000, fixed: 2450000, total: 4340000 },
      liabilities: { current: 980000, long_term: 1200000, total: 2180000 },
      equity: { share_capital: 1000000, reserves: 1160000, total: 2160000 },
    },
    tax_summary: {
      gross_income: 2847500,
      total_deductions: 485000,
      taxable_income: 2362500,
      tax_liability: 614250,
      tds_paid: 412318,
      advance_tax_paid: 150000,
      tax_remaining: 51932,
    },
    cash_flow: {
      operating: 892000,
      investing: -450000,
      financing: -200000,
      net_change: 242000,
      opening_balance: 1580000,
      closing_balance: 1822000,
    },
  };

  return {
    report_type: reportType,
    financial_year: fy,
    generated_at: new Date().toISOString(),
    currency: "INR",
    data: reports[reportType] || {},
    disclaimer: "This is an auto-generated report. Please verify with your CA.",
  };
}

function handleAutomateTask(args: Record<string, unknown>) {
  const taskType = args.task_type as string;

  const results: Record<string, Record<string, unknown>> = {
    send_payment_reminder: {
      reminders_sent: 5,
      total_overdue_amount: 187500,
      clients_notified: ["Client A", "Client B", "Client C", "Client D", "Client E"],
      next_reminder_date: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
    },
    reconcile_bank_entries: {
      total_entries_processed: 48,
      matched: 41,
      unmatched: 7,
      match_rate: 85.4,
      discrepancies: [
        { date: "2025-01-15", amount: 12500, status: "pending_review" },
      ],
    },
    generate_recurring_invoices: {
      invoices_generated: 8,
      total_amount: 324000,
      next_generation_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
    },
    update_overdue_status: {
      invoices_updated: 5,
      total_overdue_amount: 187500,
      oldest_overdue_days: 45,
    },
  };

  return {
    task_type: taskType,
    status: "completed",
    executed_at: new Date().toISOString(),
    result: results[taskType] || {},
  };
}

const toolHandlers: Record<string, (args: Record<string, unknown>) => unknown> = {
  analyze_data: handleAnalyzeData,
  generate_report: handleGenerateReport,
  automate_task: handleAutomateTask,
};

// ─── Auth helper ────────────────────────────────────────────────────

function authenticate(req: Request): boolean {
  const apiKey = req.headers.get("x-api-key");
  const authHeader = req.headers.get("authorization");

  // Accept x-api-key matching the Supabase anon key
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (apiKey && apiKey === anonKey) return true;

  // Accept any Bearer token (JWT)
  if (authHeader?.startsWith("Bearer ")) return true;

  return false;
}

// ─── Supabase client for logging ────────────────────────────────────

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function logToolUsage(
  toolName: string,
  input: unknown,
  output: unknown,
) {
  try {
    const sb = getSupabaseAdmin();
    await sb.from("mcp_tool_usage_logs").insert({
      tool_name: toolName,
      input: input,
      output: output,
    });
  } catch (e) {
    console.error("Failed to log tool usage:", e);
  }
}

// ─── Validation helper ─────────────────────────────────────────────

function validateInput(
  args: Record<string, unknown>,
  schema: Record<string, unknown>,
): string | null {
  const required = (schema.required as string[]) || [];
  for (const field of required) {
    if (args[field] === undefined || args[field] === null) {
      return `Missing required field: ${field}`;
    }
  }
  const props = schema.properties as Record<string, Record<string, unknown>>;
  if (props) {
    for (const [key, def] of Object.entries(props)) {
      if (args[key] !== undefined && def.enum) {
        const allowed = def.enum as string[];
        if (!allowed.includes(args[key] as string)) {
          return `Invalid value for ${key}. Allowed: ${allowed.join(", ")}`;
        }
      }
    }
  }
  return null;
}

// ─── Routes ─────────────────────────────────────────────────────────

// CORS preflight
app.options("/*", (c) => new Response(null, { headers: corsHeaders }));

// GET /tools — list available tools (MCP-compatible)
app.get("/aczen-mcp/tools", (c) => {
  return c.json(
    {
      tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
        output_schema: t.output_schema,
      })),
      // OpenAI function-calling compatible format
      functions: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      })),
      // Anthropic tool_use compatible format
      anthropic_tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })),
    },
    200,
    corsHeaders,
  );
});

// POST /call — execute a tool
app.post("/aczen-mcp/call", async (c) => {
  if (!authenticate(c.req.raw)) {
    return c.json(
      { error: "Unauthorized. Provide x-api-key or Authorization Bearer token." },
      401,
      corsHeaders,
    );
  }

  let body: { tool_name?: string; arguments?: Record<string, unknown> };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400, corsHeaders);
  }

  const toolName = body.tool_name;
  const args = body.arguments || {};

  if (!toolName) {
    return c.json({ error: "Missing tool_name" }, 400, corsHeaders);
  }

  const toolDef = TOOLS.find((t) => t.name === toolName);
  if (!toolDef) {
    return c.json(
      { error: `Unknown tool: ${toolName}. Available: ${TOOLS.map((t) => t.name).join(", ")}` },
      404,
      corsHeaders,
    );
  }

  // Validate
  const validationError = validateInput(args, toolDef.input_schema);
  if (validationError) {
    return c.json({ error: validationError }, 400, corsHeaders);
  }

  const handler = toolHandlers[toolName];
  const result = handler(args);

  // Log async — don't block response
  logToolUsage(toolName, args, result);

  // Return in a universal format
  return c.json(
    {
      // MCP format
      tool_name: toolName,
      result,
      // Anthropic-compatible content block
      content: [{ type: "text", text: JSON.stringify(result) }],
      // metadata
      status: "success",
      timestamp: new Date().toISOString(),
    },
    200,
    corsHeaders,
  );
});

// Health check
app.get("/aczen-mcp", (c) =>
  c.json(
    {
      service: "Aczen MCP Server",
      version: "1.0.0",
      status: "healthy",
      endpoints: {
        list_tools: "GET /aczen-mcp/tools",
        call_tool: "POST /aczen-mcp/call",
      },
    },
    200,
    corsHeaders,
  ),
);

Deno.serve(app.fetch);
