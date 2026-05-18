// Uses OpenRouter (Claude Opus 4 by default) to classify a free-text command
// from the AI Command Bar into one of the app's known intents, and to normalize
// the prompt into a canonical form that the existing regex extractors can parse
// reliably.
//
// This is an accuracy upgrade over pure regex intent detection — it handles
// fuzzy phrasing, typos, code-switching (e.g. Hinglish), and varied word order.

import { isOpenRouterConfigured, openRouterJSON } from '@/lib/openrouter';

export type AICommandIntent =
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
  | 'navigate'
  | 'answer'
  | 'unknown';

export interface ParsedCommand {
  intent: AICommandIntent;
  /** Canonical rewrite of the prompt — feeds the existing regex extractors. */
  normalizedPrompt: string;
  /** Optional pre-extracted fields. Use only if non-empty. */
  fields: {
    clientName?: string;
    vendorName?: string;
    productName?: string;
    amount?: number;
    gstRate?: number;
    quantity?: number;
    email?: string;
    phone?: string;
    gstNumber?: string;
    address?: string;
    description?: string;
    category?: string;
    paymentMode?: string;
    date?: string;
    navigationTarget?: string;
  };
  confidence: number; // 0..1
}

const INTENT_VOCAB: AICommandIntent[] = [
  'create_invoice',
  'create_sales_order',
  'create_purchase_order',
  'create_bill',
  'create_expense',
  'create_client',
  'create_vendor',
  'create_inventory',
  'record_payment',
  'check_stock',
  'create_quotation',
  'create_payment_link',
  'navigate',
  'answer',
  'unknown',
];

const SYSTEM_PROMPT = `You are the intent parser for Aczen BillEase, a finance/accounting product for Indian SMBs.

Your job: read a single user command and return STRICT JSON describing what they want to do.

ALLOWED INTENTS (use EXACTLY one of these strings):
${INTENT_VOCAB.map((i) => `- ${i}`).join('\n')}

Intent guidance:
- "create_invoice": user wants to bill a CLIENT (outgoing sales invoice).
- "create_bill": user wants to record an incoming bill from a VENDOR.
- "create_sales_order" / "create_purchase_order": order documents, not invoices.
- "create_expense": personal/business spend; no GST invoice required.
- "create_client" / "create_vendor": add a contact, NOT a transaction.
- "create_inventory": add a product/item to stock master.
- "record_payment": mark a payment received or made.
- "check_stock": query inventory levels.
- "create_quotation": send a quote/estimate (pre-invoice).
- "create_payment_link": generate a shareable payment URL.
- "navigate": user only wants to open a page ("go to dashboard", "show invoices").
- "answer": user is asking a question, not requesting an action.
- "unknown": fall back when nothing fits — DO NOT GUESS.

Output JSON shape (no markdown, no commentary):
{
  "intent": "<one of the allowed intents>",
  "normalizedPrompt": "<canonical English rewrite suitable for downstream parsers>",
  "fields": {
    "clientName"?: string,
    "vendorName"?: string,
    "productName"?: string,
    "amount"?: number,        // rupees as integer; convert "5k"=5000, "1.2 lakh"=120000, "2 cr"=20000000
    "gstRate"?: number,       // one of 0,3,5,12,18,28
    "quantity"?: number,
    "email"?: string,
    "phone"?: string,         // 10-digit Indian mobile
    "gstNumber"?: string,     // 15-char GSTIN
    "address"?: string,
    "description"?: string,
    "category"?: string,      // expense category (Travel, Food, Office, Rent, ...)
    "paymentMode"?: string,   // 'upi' | 'cash' | 'cheque' | 'credit_card' | 'bank'
    "date"?: string,          // YYYY-MM-DD
    "navigationTarget"?: string // page name when intent==navigate
  },
  "confidence": <0.0 to 1.0>
}

Rules:
- ONLY include a key in "fields" if the user clearly stated/implied it. Never invent values.
- Always include a "normalizedPrompt". Even if confidence is low, rewrite cleanly.
- "normalizedPrompt" MUST start with a clear action verb when an action is intended ("Create invoice for ...", "Record payment of ...").
- For Indian shorthand: 5k=5000, 1.5L/1.5 lakh=150000, 2cr/2 crore=20000000.
- Default GST to 18 only if the user mentions GST without a number; otherwise omit gstRate.
- Confidence: 0.9+ for unambiguous commands, 0.5-0.8 for plausible parses, <0.5 for guesses (prefer "unknown").

Return ONLY the JSON object.`;

export const parseCommandWithLLM = async (
  prompt: string,
  signal?: AbortSignal,
): Promise<ParsedCommand | null> => {
  if (!isOpenRouterConfigured()) return null;
  const trimmed = prompt.trim();
  if (!trimmed) return null;

  try {
    const parsed = await openRouterJSON<ParsedCommand>({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: trimmed },
      ],
      temperature: 0.1,
      maxTokens: 600,
      signal,
    });

    if (!parsed || typeof parsed !== 'object') return null;
    if (!INTENT_VOCAB.includes(parsed.intent)) {
      parsed.intent = 'unknown';
    }
    if (typeof parsed.normalizedPrompt !== 'string' || !parsed.normalizedPrompt.trim()) {
      parsed.normalizedPrompt = trimmed;
    }
    if (typeof parsed.confidence !== 'number' || Number.isNaN(parsed.confidence)) {
      parsed.confidence = 0.5;
    }
    parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));
    parsed.fields = parsed.fields && typeof parsed.fields === 'object' ? parsed.fields : {};
    return parsed;
  } catch (err) {
    // Never block the command bar on LLM failure — caller falls back to regex.
    console.warn('[aiCommandIntentService] OpenRouter parse failed:', err);
    return null;
  }
};

export const isLLMIntentAvailable = isOpenRouterConfigured;
