// ════════════════════════════════════════════════════════════════════════════
// Tool-Calling Agent
//
// An iterative loop on top of Gemini Flash that lets the model plan and execute
// multi-step commands by calling real app actions as tools. Each turn:
//
//   1. Send conversation + tool declarations to Gemini.
//   2. If the model emits tool calls, execute them via the injected registry.
//   3. Send tool results back; repeat until the model returns text-only or we
//      hit the iteration budget.
//
// The registry is injected by the caller (AICommandBar) so tools stay closed
// over `user`, `toast`, `navigate`, query invalidation, etc. without this
// module needing to know about React.
// ════════════════════════════════════════════════════════════════════════════

import {
  buildAgentHistory,
  geminiAgentTurn,
  isGeminiConfigured,
  type GeminiContent,
  type GeminiFunctionDeclaration,
  type GeminiToolCall,
  type GeminiToolResult,
} from '@/lib/gemini';

export type AgentToolName =
  | 'create_invoice'
  | 'create_sales_order'
  | 'create_purchase_order'
  | 'create_bill'
  | 'create_expense'
  | 'create_client'
  | 'create_vendor'
  | 'create_inventory'
  | 'record_payment'
  | 'check_stock'
  | 'create_quotation'
  | 'create_payment_link'
  | 'list_clients'
  | 'list_vendors'
  | 'list_inventory_items'
  | 'get_overdue_invoices'
  | 'get_business_snapshot'
  | 'post_journal_from_text'
  | 'navigate'
  | 'final_answer';

export interface AgentToolExecutionResult {
  ok: boolean;
  /** Short human-readable summary the model can read on the next turn. */
  summary: string;
  /** Optional structured payload — included verbatim in the model response. */
  data?: Record<string, unknown>;
  /** When the tool created a record, the UI can deep-link to it. */
  recordType?: string;
  recordId?: string;
}

export type AgentToolHandler = (
  args: Record<string, unknown>,
) => Promise<AgentToolExecutionResult>;

export type AgentToolRegistry = Partial<Record<AgentToolName, AgentToolHandler>>;

export type AgentStepKind = 'tool_call' | 'tool_result' | 'message' | 'error';

export interface AgentStep {
  kind: AgentStepKind;
  tool?: AgentToolName;
  args?: Record<string, unknown>;
  result?: AgentToolExecutionResult;
  message?: string;
}

export interface RunAgentArgs {
  prompt: string;
  tools: AgentToolRegistry;
  /** Streaming callback for each step. */
  onStep?: (step: AgentStep) => void;
  /** Conversation history shown to the model as context. */
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
  /** Per-call business snapshot the model can lean on without calling tools. */
  businessContext?: string;
  /** Maximum agent turns before forcing a stop. Default 6. */
  maxTurns?: number;
  signal?: AbortSignal;
}

export interface RunAgentResult {
  /** Final text reply for the user. */
  message: string;
  /** All steps taken — useful for debug panels. */
  steps: AgentStep[];
  /** Set when at least one tool created a record. */
  createdRecords: { recordType: string; recordId: string }[];
  finishReason?: string;
  hitTurnLimit: boolean;
}

// ── Tool declarations (sent to Gemini every turn) ─────────────────────────────
const TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: 'create_invoice',
    description:
      'Create a sales invoice billed to a CLIENT. Use only when the user wants an outgoing invoice. The freeform `prompt` is parsed downstream against the chart of accounts.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'A canonical English instruction including client name, amount in rupees, and GST rate if relevant. Example: "Create invoice for ABC Traders for ₹50000 + 18% GST".',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'create_bill',
    description: 'Record an incoming bill from a VENDOR (purchase bill). Not for sales.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Canonical English instruction including vendor name, amount, GST, and payment mode if mentioned.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'create_expense',
    description: 'Record a business expense. Use for small spends without a formal GST invoice.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Canonical instruction including amount, category, and payment mode.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'create_sales_order',
    description: 'Create a sales order document (pre-invoice commitment to sell).',
    parameters: {
      type: 'object',
      properties: { prompt: { type: 'string' } },
      required: ['prompt'],
    },
  },
  {
    name: 'create_purchase_order',
    description: 'Create a purchase order to a vendor (pre-bill commitment to buy).',
    parameters: {
      type: 'object',
      properties: { prompt: { type: 'string' } },
      required: ['prompt'],
    },
  },
  {
    name: 'create_quotation',
    description: 'Create a quotation/estimate for a prospect (pre-invoice).',
    parameters: {
      type: 'object',
      properties: { prompt: { type: 'string' } },
      required: ['prompt'],
    },
  },
  {
    name: 'create_client',
    description:
      'Add a CLIENT (customer) record. Use when the user wants to register a new buyer, NOT a transaction.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Canonical instruction with the client name, optionally phone, email, GSTIN, address.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'create_vendor',
    description: 'Add a VENDOR (supplier) record. Not for a transaction.',
    parameters: {
      type: 'object',
      properties: { prompt: { type: 'string' } },
      required: ['prompt'],
    },
  },
  {
    name: 'create_inventory',
    description: 'Add a product/item to the inventory master.',
    parameters: {
      type: 'object',
      properties: { prompt: { type: 'string' } },
      required: ['prompt'],
    },
  },
  {
    name: 'record_payment',
    description: 'Record a payment received from a client or made to a vendor.',
    parameters: {
      type: 'object',
      properties: { prompt: { type: 'string' } },
      required: ['prompt'],
    },
  },
  {
    name: 'check_stock',
    description: 'Query inventory levels for a product.',
    parameters: {
      type: 'object',
      properties: { prompt: { type: 'string' } },
      required: ['prompt'],
    },
  },
  {
    name: 'create_payment_link',
    description: 'Generate a shareable payment URL for a client.',
    parameters: {
      type: 'object',
      properties: { prompt: { type: 'string' } },
      required: ['prompt'],
    },
  },
  {
    name: 'post_journal_from_text',
    description:
      'Parse a freeform finance command into a balanced double-entry journal and post it. Use for transactional commands that mix multiple legs (e.g. "Bought laptop ₹80k via HDFC, 18% GST, capital asset"). Prefer this when the user describes a real ledger movement.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The user-style instruction describing the transaction.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'list_clients',
    description:
      'Return a short list of the most recent client names. Use this when the user mentions a partial or ambiguous client name and you need to disambiguate before creating an invoice.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Optional case-insensitive substring to filter by.',
        },
        limit: { type: 'number', description: 'Max results, default 10.' },
      },
    },
  },
  {
    name: 'list_vendors',
    description: 'Return a short list of vendor names, optionally filtered by substring.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'list_inventory_items',
    description: 'Return inventory items with current stock, optionally filtered.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'get_overdue_invoices',
    description: 'Return a short list of overdue invoices (number, client, amount, days overdue).',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number' } },
    },
  },
  {
    name: 'get_business_snapshot',
    description:
      'Return a JSON summary of the business: counts of clients/vendors, pending invoices, revenue, expenses, top client. Cheap to call.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'navigate',
    description: 'Open an app page. Use when the user just wants to view something, not act on it.',
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description:
            'Plain-English page name (e.g. "dashboard", "invoices", "chart of accounts").',
        },
      },
      required: ['target'],
    },
  },
  {
    name: 'final_answer',
    description:
      'Use this when no further tool calls are needed and you want to reply in plain text. The `message` is shown verbatim to the user.',
    parameters: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
  },
];

const SYSTEM_INSTRUCTION = `You are the agentic assistant inside Aczen BillEase, an Indian SMB finance/accounting product.

You translate user requests into TOOL CALLS that perform real actions in the app. You can chain multiple tools across turns to satisfy compound requests like "Add client X then invoice them ₹50000".

OPERATING RULES:
- ALWAYS prefer calling a tool over describing what you would do. If the user wants something done, do it.
- For transactional finance commands (bills, invoices, payments, expenses mixing GST/bank legs), prefer "post_journal_from_text" — it produces a balanced double-entry posting against the user's real chart of accounts.
- For simple object creation (a client, a vendor, an inventory item) use the dedicated tool.
- When a name is ambiguous, call list_clients / list_vendors / list_inventory_items FIRST to disambiguate, then proceed.
- After a tool succeeds, decide whether more steps are needed. If not, call "final_answer" with a short confirmation. Never leave a request half done.
- If the user is only asking a question (no action implied), answer via "final_answer" without other tool calls.
- Indian numbering: 5k=5000, 1.5L/1.5 lakh=150000, 2cr/2 crore=20000000. Default GST is 18 when GST is mentioned without a number.
- NEVER invent client names, amounts, GSTINs, or account IDs. If you don't have the data, ask via "final_answer" instead of guessing.
- Stay concise. Tool-call args should be the canonical instruction the downstream parser needs — not a long story.`;

// ── Main runner ───────────────────────────────────────────────────────────────
export const isAgentAvailable = isGeminiConfigured;

export const runAgent = async (args: RunAgentArgs): Promise<RunAgentResult> => {
  if (!isGeminiConfigured()) {
    throw new Error('Gemini API key missing. Set VITE_GEMINI_API_KEY in .env and restart the dev server.');
  }
  const maxTurns = args.maxTurns ?? 6;
  const steps: AgentStep[] = [];
  const createdRecords: { recordType: string; recordId: string }[] = [];

  // Seed history with conversation context (so follow-ups remember prior turns).
  const seedParts: GeminiContent[] = [];
  if (args.conversationHistory && args.conversationHistory.length > 0) {
    for (const m of args.conversationHistory) {
      seedParts.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      });
    }
  }

  // Prepend business context as a synthetic user note if present.
  const composedPrompt = args.businessContext
    ? `BUSINESS CONTEXT (for grounding, do not echo back):\n${args.businessContext}\n\nUSER REQUEST:\n${args.prompt}`
    : args.prompt;

  let history: GeminiContent[] = [...seedParts, ...buildAgentHistory(composedPrompt)];
  let pendingResults: GeminiToolResult[] = [];
  let finalMessage = '';
  let finishReason: string | undefined;
  let hitTurnLimit = false;

  for (let turn = 0; turn < maxTurns; turn++) {
    const result = await geminiAgentTurn({
      history,
      toolResults: pendingResults,
      tools: TOOL_DECLARATIONS,
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.2,
      maxTokens: 1200,
      signal: args.signal,
    });

    history = result.history;
    pendingResults = [];
    finishReason = result.finishReason;

    // Model returned plain text and no tool calls → done.
    if (result.toolCalls.length === 0) {
      finalMessage = result.content || finalMessage;
      if (finalMessage) {
        steps.push({ kind: 'message', message: finalMessage });
        args.onStep?.({ kind: 'message', message: finalMessage });
      }
      break;
    }

    // Execute each tool call sequentially. Order matters for chained operations.
    for (const call of result.toolCalls) {
      // Short-circuit: final_answer is a synthetic tool used to deliver text.
      if (call.name === 'final_answer') {
        const msg = typeof call.args?.message === 'string' ? call.args.message : '';
        finalMessage = msg;
        steps.push({ kind: 'message', message: msg });
        args.onStep?.({ kind: 'message', message: msg });
        // No result needs returning — break out.
        return {
          message: finalMessage,
          steps,
          createdRecords,
          finishReason,
          hitTurnLimit: false,
        };
      }

      steps.push({ kind: 'tool_call', tool: call.name as AgentToolName, args: call.args });
      args.onStep?.({ kind: 'tool_call', tool: call.name as AgentToolName, args: call.args });

      const handler = args.tools[call.name as AgentToolName];
      let execResult: AgentToolExecutionResult;
      if (!handler) {
        execResult = {
          ok: false,
          summary: `Tool "${call.name}" is not available in this context.`,
        };
      } else {
        try {
          execResult = await handler(call.args);
        } catch (err) {
          execResult = {
            ok: false,
            summary: `Tool "${call.name}" threw: ${(err as Error)?.message || String(err)}`,
          };
        }
      }

      steps.push({ kind: 'tool_result', tool: call.name as AgentToolName, result: execResult });
      args.onStep?.({ kind: 'tool_result', tool: call.name as AgentToolName, result: execResult });

      if (execResult.recordType && execResult.recordId) {
        createdRecords.push({ recordType: execResult.recordType, recordId: execResult.recordId });
      }

      pendingResults.push(toolResultToGemini(call, execResult));
    }

    if (turn === maxTurns - 1) {
      hitTurnLimit = true;
    }
  }

  if (!finalMessage) {
    finalMessage = hitTurnLimit
      ? 'Reached the maximum number of steps without a final answer. The work above may be partially complete.'
      : 'Done.';
    steps.push({ kind: 'message', message: finalMessage });
    args.onStep?.({ kind: 'message', message: finalMessage });
  }

  return { message: finalMessage, steps, createdRecords, finishReason, hitTurnLimit };
};

const toolResultToGemini = (
  call: GeminiToolCall,
  result: AgentToolExecutionResult,
): GeminiToolResult => ({
  name: call.name,
  response: {
    ok: result.ok,
    summary: result.summary,
    ...(result.data || {}),
    ...(result.recordType ? { recordType: result.recordType } : {}),
    ...(result.recordId ? { recordId: result.recordId } : {}),
  },
});

export type { GeminiToolCall };
