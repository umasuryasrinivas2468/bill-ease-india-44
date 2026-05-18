// ════════════════════════════════════════════════════════════════════════════
// Feature 1: Journal-Grounded NL Parser
//
// Takes a free-text command (e.g. "Bill from ABC Supplies for ₹50,000 + 18%
// GST, paid via HDFC") and asks Claude Opus 4 to emit a fully-formed
// double-entry journal — line-by-line Dr/Cr against the user's actual COA
// account_ids.
//
// The model is constrained by:
//   1. A live slice of the user's leaf accounts (id + code + name + type).
//   2. The whitelisted source_type vocabulary.
//   3. A strict JSON output contract.
//
// After parsing, the result is validated:
//   - balance to within ±0.01
//   - every account_id exists, is active, and is a leaf
//   - source_type is in the allowed list
//
// If validation fails, a single repair pass asks the model to fix only the
// flagged problems. This is much more reliable than guessing intents.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { isOpenRouterConfigured, openRouterJSON } from '@/lib/openrouter';
import type { SourceType } from '@/utils/journalEngine';
import type {
  CoaSnapshotAccount,
  JournalParseResult,
  JournalValidation,
  ProposedJournal,
  ProposedJournalLine,
} from '@/types/aiJournalAction';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// Cache the COA snapshot per (user, refreshKey) for the duration of an open
// command-bar session so each keystroke doesn't re-query Supabase.
const COA_CACHE = new Map<string, { fetchedAt: number; accounts: CoaSnapshotAccount[] }>();
const COA_TTL_MS = 60_000;

export const loadCoaSnapshot = async (userId: string): Promise<CoaSnapshotAccount[]> => {
  const uid = normalizeUserId(userId);
  const cached = COA_CACHE.get(uid);
  if (cached && Date.now() - cached.fetchedAt < COA_TTL_MS) {
    return cached.accounts;
  }
  const { data, error } = await supabase
    .from('accounts')
    .select('id, account_code, account_name, account_type, account_group, account_subgroup, is_group, is_active')
    .eq('user_id', uid)
    .eq('is_active', true)
    .eq('is_group', false)               // leaf-only
    .order('account_code');
  if (error) throw error;
  const accounts = (data || []).map((r: any) => ({
    id: r.id,
    account_code: r.account_code,
    account_name: r.account_name,
    account_type: r.account_type,
    account_group: r.account_group || undefined,
    account_subgroup: r.account_subgroup || undefined,
  })) as CoaSnapshotAccount[];
  COA_CACHE.set(uid, { fetchedAt: Date.now(), accounts });
  return accounts;
};

export const invalidateCoaSnapshot = (userId: string) => {
  COA_CACHE.delete(normalizeUserId(userId));
};

const ALLOWED_SOURCE_TYPES: SourceType[] = [
  'invoice', 'bill', 'expense', 'payment', 'payment_received',
  'cash_memo', 'advance', 'customer_advance', 'credit_note',
  'asset_purchase' as SourceType, 'loan_disbursement' as SourceType, 'loan_emi' as SourceType,
  'inventory_adjustment', 'manual',
];

// ── Validation ──────────────────────────────────────────────────────────────
export const validateProposedJournal = (
  proposal: ProposedJournal,
  coa: CoaSnapshotAccount[],
): JournalValidation => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byId = new Map(coa.map((a) => [a.id, a]));

  if (!proposal || !Array.isArray(proposal.lines) || proposal.lines.length < 2) {
    errors.push('Journal must contain at least two lines (one Dr and one Cr).');
  }
  if (!proposal.date || !/^\d{4}-\d{2}-\d{2}$/.test(proposal.date)) {
    errors.push('Invalid or missing journal date (expected YYYY-MM-DD).');
  }
  if (!proposal.narration || proposal.narration.trim().length === 0) {
    errors.push('Narration is required.');
  }
  if (!ALLOWED_SOURCE_TYPES.includes(proposal.source_type)) {
    warnings.push(`source_type "${proposal.source_type}" is non-standard — defaulting to "manual".`);
  }

  let totalDebit = 0;
  let totalCredit = 0;
  for (let i = 0; i < (proposal.lines || []).length; i++) {
    const line = proposal.lines[i];
    const ref = `line ${i + 1}`;
    const account = byId.get(line.account_id);
    if (!account) {
      errors.push(`${ref}: account_id ${line.account_id} is not a known leaf account.`);
      continue;
    }
    const dr = Number(line.debit || 0);
    const cr = Number(line.credit || 0);
    if (dr < 0 || cr < 0) errors.push(`${ref}: negative amounts are not allowed.`);
    if (dr > 0 && cr > 0) errors.push(`${ref}: a single line cannot have both a debit and a credit.`);
    if (dr === 0 && cr === 0) errors.push(`${ref}: zero-amount line.`);
    totalDebit += dr;
    totalCredit += cr;
  }

  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    errors.push(`Unbalanced journal: debits ₹${totalDebit.toFixed(2)} ≠ credits ₹${totalCredit.toFixed(2)}.`);
  }
  if (totalDebit === 0 && totalCredit === 0) {
    errors.push('Journal has zero total — nothing to post.');
  }

  return { ok: errors.length === 0, totalDebit, totalCredit, errors, warnings };
};

// ── Prompt builders ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the journal-grounded parser for Aczen BillEase, an Indian SMB accounting product.

Your job: read ONE free-text command and emit a STRICT JSON object describing the double-entry journal it represents — using ONLY account_ids from the user's live Chart of Accounts (COA) provided below.

You MUST NOT invent account_ids. If no account fits, emit confidence < 0.4 and list the missing entity under "unresolvedEntities".

Output JSON shape:
{
  "proposal": {
    "date": "YYYY-MM-DD",                  // use today's date if user did not state one
    "narration": "<one-line summary>",
    "source_type": "<one of: invoice|bill|expense|payment|payment_received|cash_memo|advance|customer_advance|credit_note|asset_purchase|loan_disbursement|loan_emi|inventory_adjustment|manual>",
    "lines": [
      {
        "account_id": "<uuid from COA>",
        "debit":  <number, 0 if credit line>,
        "credit": <number, 0 if debit line>,
        "line_narration": "<short>"
      }
    ]
  },
  "confidence": <0..1>,
  "explanation": "<plain-English one-line description of what this journal does>",
  "unresolvedEntities": [ "<entity name>"... ]
}

CRITICAL RULES:
- Total debits MUST equal total credits to the rupee.
- Each line has EXACTLY one of debit OR credit > 0. Never both, never both zero.
- account_id values MUST appear verbatim in the COA list. Copy them exactly.
- Use Indian-shorthand numerics: 5k=5000, 1.5L=150000, 2cr=20000000.
- GST inference: if the user mentions GST, split CGST+SGST when same-state, else IGST. Default 18% unless stated otherwise.
- ITC eligibility: for ASSET purchases, Input GST is a separate Dr line (ITC eligible). For BLOCKED categories (motor vehicles), add GST to the asset cost.
- For "paid via bank/HDFC/cash" — credit the matching bank/cash account directly (no AP).
- For "on credit" / "bill" / "invoice" — use AP / AR as the counterparty leg.
- If the user is just asking a question (not requesting a posting), set confidence < 0.4 and leave lines empty.
- DO NOT include markdown, commentary, or any text outside the JSON object.`;

const buildUserPrompt = (
  prompt: string,
  coa: CoaSnapshotAccount[],
  today: string,
): string => {
  // Compact the COA into a tight, model-friendly table.
  const coaText = coa
    .map((a) => `  ${a.id} | ${a.account_code} | ${a.account_type} | ${a.account_name}${a.account_subgroup ? ` (${a.account_subgroup})` : ''}`)
    .join('\n');
  return `TODAY: ${today}

USER COMMAND: ${JSON.stringify(prompt)}

CHART OF ACCOUNTS (leaf accounts only, format: id | code | type | name):
${coaText}

Return the JSON object now.`;
};

// ── Main entry point ────────────────────────────────────────────────────────
export interface ParseJournalArgs {
  userId: string;
  prompt: string;
  signal?: AbortSignal;
}

export const parseJournalFromText = async (
  args: ParseJournalArgs,
): Promise<{ result: JournalParseResult; validation: JournalValidation } | null> => {
  if (!isOpenRouterConfigured()) {
    throw new Error('OpenRouter API key missing. Set VITE_OPENROUTER_API_KEY in .env and restart the dev server.');
  }
  const trimmed = args.prompt.trim();
  if (!trimmed) return null;

  const today = new Date().toISOString().slice(0, 10);
  const coa = await loadCoaSnapshot(args.userId);
  if (coa.length === 0) {
    throw new Error('Chart of Accounts has no leaf accounts yet. Open Accounting → Chart of Accounts (or create one invoice/bill the regular way) to seed it.');
  }

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: buildUserPrompt(trimmed, coa, today) },
  ];

  // Let OpenRouter errors propagate — the AI Command Bar shows them inline so
  // misconfigurations (bad key, unknown model, rate limit) are diagnosable
  // without DevTools.
  let parsed: JournalParseResult = await openRouterJSON<JournalParseResult>({
    messages,
    temperature: 0.1,
    maxTokens: 1200,
    signal: args.signal,
  });

  if (!parsed || !parsed.proposal) {
    throw new Error('OpenRouter returned a response that did not parse as a journal proposal.');
  }

  // Decorate lines with denormalised account info for downstream display.
  const byId = new Map(coa.map((a) => [a.id, a]));
  const lines: ProposedJournalLine[] = (parsed.proposal.lines || []).map((l) => {
    const acc = byId.get(l.account_id);
    return {
      account_id: l.account_id,
      account_code: acc?.account_code,
      account_name: acc?.account_name,
      account_type: acc?.account_type,
      debit: round2(l.debit),
      credit: round2(l.credit),
      line_narration: l.line_narration,
    };
  });
  parsed.proposal.lines = lines;

  let validation = validateProposedJournal(parsed.proposal, coa);

  // Single repair attempt if validation failed.
  if (!validation.ok) {
    const repairPrompt = `The previous JSON failed validation:
${validation.errors.map((e) => `- ${e}`).join('\n')}

Fix ONLY these issues. Return the corrected JSON with the same shape. Do not change valid lines.`;
    try {
      const repaired = await openRouterJSON<JournalParseResult>({
        messages: [
          ...messages,
          { role: 'assistant' as const, content: JSON.stringify(parsed) },
          { role: 'user' as const, content: repairPrompt },
        ],
        temperature: 0.0,
        maxTokens: 1200,
        signal: args.signal,
      });
      if (repaired && repaired.proposal) {
        const repairedLines: ProposedJournalLine[] = (repaired.proposal.lines || []).map((l) => {
          const acc = byId.get(l.account_id);
          return {
            account_id: l.account_id,
            account_code: acc?.account_code,
            account_name: acc?.account_name,
            account_type: acc?.account_type,
            debit: round2(l.debit),
            credit: round2(l.credit),
            line_narration: l.line_narration,
          };
        });
        repaired.proposal.lines = repairedLines;
        const revalidation = validateProposedJournal(repaired.proposal, coa);
        if (revalidation.ok) {
          parsed = repaired;
          validation = revalidation;
        } else {
          validation = revalidation;
        }
      }
    } catch (err) {
      console.warn('[aiJournalParser] repair pass failed', err);
    }
  }

  // Clamp confidence and never trust > 0.95 without validation passing.
  parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
  if (!validation.ok) parsed.confidence = Math.min(parsed.confidence, 0.5);

  return { result: parsed, validation };
};
