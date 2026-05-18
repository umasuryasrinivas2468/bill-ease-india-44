// Live, context-aware suggestion engine for the AI Command Bar.
//
// Given partial input + a slim slice of the user's real business data, asks
// Claude Opus 4 (via OpenRouter) for:
//   - 2-4 fully-formed command suggestions tailored to the moment
//   - a one-line "preview" of what the current input is about to do
//
// Designed to be called from a debounced effect (300-400ms). Returns null on
// any failure so the UI can quietly degrade to static examples.

import { isOpenRouterConfigured, openRouterJSON } from '@/lib/openrouter';

export interface BusinessSnapshot {
  businessName?: string;
  clientsCount?: number;
  vendorsCount?: number;
  pendingInvoices?: number;
  overdueInvoices?: Array<{ number: string; client: string; amount: number; daysOverdue: number }>;
  recentClients?: string[];
  recentVendors?: string[];
  lowStockItems?: Array<{ name: string; quantity: number }>;
  topClient?: { name: string; revenue: number } | null;
  totalRevenue?: number;
  totalExpenses?: number;
}

export interface SmartSuggestion {
  text: string;
  /** Short tag rendered as a chip label (e.g. "Invoice", "Payment"). */
  tag?: string;
  /** Optional one-line rationale shown on hover/expand. */
  reason?: string;
}

export interface SuggestionsResult {
  suggestions: SmartSuggestion[];
  /** Plain-English summary of what the current input would do, e.g.
   *  "Invoice • ABC Traders • ₹25,000 • 18% GST". Empty string when nothing
   *  meaningful was detected. */
  preview: string;
}

const SUGGESTIONS_SYSTEM_PROMPT = `You are the predictive assistant for Aczen BillEase, an Indian SMB finance product.

You receive:
  1. The user's PARTIAL TYPING (may be empty)
  2. A BUSINESS SNAPSHOT with their real data

You return STRICT JSON only:
{
  "suggestions": [
    { "text": "<full ready-to-run command>", "tag": "<short label>", "reason": "<one-line why>" }
  ],
  "preview": "<plain-English one-liner of what the current input would do, or empty string>"
}

Rules:
- 2 to 4 suggestions, each immediately executable (full sentences, real names, real numbers).
- When partial input exists: complete or correct it 2-4 different plausible ways. Preserve the user's intent.
- When partial input is empty: surface high-value next actions from the snapshot (overdue invoices, low stock, top client follow-ups). Never invent data — only use names/numbers present in the snapshot.
- "tag" must be one of: "Invoice", "Bill", "Expense", "Payment", "Quote", "Client", "Vendor", "Stock", "Order", "Navigate", "Ask".
- "preview" only when the partial input has a clear, actionable shape. Format: "Intent • Entity • ₹Amount • details". Otherwise return empty string.
- Use Indian number formatting (₹, lakh, crore).
- No emojis, no markdown.
- Return ONLY the JSON object.`;

const buildUserPrompt = (partial: string, snapshot: BusinessSnapshot): string => {
  // Keep snapshot small — only the fields the LLM actually needs.
  const slim = {
    businessName: snapshot.businessName,
    clientsCount: snapshot.clientsCount,
    vendorsCount: snapshot.vendorsCount,
    pendingInvoices: snapshot.pendingInvoices,
    overdueInvoices: (snapshot.overdueInvoices || []).slice(0, 5),
    recentClients: (snapshot.recentClients || []).slice(0, 6),
    recentVendors: (snapshot.recentVendors || []).slice(0, 5),
    lowStockItems: (snapshot.lowStockItems || []).slice(0, 5),
    topClient: snapshot.topClient || null,
    totalRevenue: snapshot.totalRevenue,
    totalExpenses: snapshot.totalExpenses,
  };

  return `PARTIAL TYPING: ${partial ? JSON.stringify(partial) : '""'}

BUSINESS SNAPSHOT:
${JSON.stringify(slim, null, 2)}

Return the JSON now.`;
};

export const fetchSmartSuggestions = async (
  partial: string,
  snapshot: BusinessSnapshot,
  signal?: AbortSignal,
): Promise<SuggestionsResult | null> => {
  if (!isOpenRouterConfigured()) return null;
  try {
    const parsed = await openRouterJSON<SuggestionsResult>({
      messages: [
        { role: 'system', content: SUGGESTIONS_SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(partial.trim(), snapshot) },
      ],
      // A fast cheaper model is fine here — accuracy comes from the snapshot
      // grounding, not raw reasoning power. Falls back to env default if unset.
      model:
        (import.meta.env.VITE_OPENROUTER_SUGGESTIONS_MODEL as string) ||
        'anthropic/claude-sonnet-4',
      temperature: 0.3,
      maxTokens: 500,
      signal,
    });

    if (!parsed || !Array.isArray(parsed.suggestions)) return null;
    const suggestions = parsed.suggestions
      .filter((s) => s && typeof s.text === 'string' && s.text.trim().length > 0)
      .slice(0, 4)
      .map((s) => ({
        text: s.text.trim(),
        tag: typeof s.tag === 'string' ? s.tag.trim().slice(0, 16) : undefined,
        reason: typeof s.reason === 'string' ? s.reason.trim() : undefined,
      }));

    return {
      suggestions,
      preview: typeof parsed.preview === 'string' ? parsed.preview.trim() : '',
    };
  } catch (err) {
    console.warn('[aiCommandSuggestionsService] suggestions failed:', err);
    return null;
  }
};

export const isSuggestionsAvailable = isOpenRouterConfigured;
