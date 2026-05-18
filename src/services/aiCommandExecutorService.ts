// ════════════════════════════════════════════════════════════════════════════
// Feature 2: Confidence-Gated Executor + Paired Reversal Handle
//
// Wraps postJournal with a confidence policy and returns a ReversalHandle.
// The handle is stored on the chat message so a single tap can undo the
// action via the existing reverse_journal RPC — which atomically writes a
// paired reversal journal and links it to the original via reverses_journal_id.
//
// Policy:
//   confidence ≥ AUTO_THRESHOLD (0.85)  → execute immediately, show "Posted • Undo"
//   AUTO ≥ confidence ≥ MANUAL (0.5)    → block on user confirmation
//   confidence < MANUAL                  → refuse to execute, ask user to clarify
//
// All thresholds tunable via VITE_AI_AUTO_THRESHOLD / VITE_AI_MANUAL_THRESHOLD.
// ════════════════════════════════════════════════════════════════════════════

import { normalizeUserId } from '@/lib/userUtils';
import { postJournal, reverseJournal, type JournalLineInput } from '@/utils/journalEngine';
import type { JournalValidation, ProposedJournal, ReversalHandle } from '@/types/aiJournalAction';

const envNumber = (key: string, fallback: number) => {
  const raw = (import.meta.env[key as keyof ImportMetaEnv] as string | undefined) || '';
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : fallback;
};

export const AUTO_EXECUTE_THRESHOLD = envNumber('VITE_AI_AUTO_THRESHOLD', 0.85);
export const MANUAL_CONFIRM_THRESHOLD = envNumber('VITE_AI_MANUAL_THRESHOLD', 0.5);

export type ExecutionPolicy = 'auto_execute' | 'require_confirmation' | 'refuse';

export const decidePolicy = (
  confidence: number,
  validation: JournalValidation,
): ExecutionPolicy => {
  if (!validation.ok) return 'refuse';
  if (confidence >= AUTO_EXECUTE_THRESHOLD) return 'auto_execute';
  if (confidence >= MANUAL_CONFIRM_THRESHOLD) return 'require_confirmation';
  return 'refuse';
};

/** Convert a ProposedJournal into the journalEngine's JournalLineInput[] shape. */
const toEngineLines = (proposal: ProposedJournal): JournalLineInput[] =>
  proposal.lines.map((l) => ({
    account_id: l.account_id,
    debit: l.debit || 0,
    credit: l.credit || 0,
    line_narration: l.line_narration || null,
    vendor_id: l.vendor_id ?? null,
    customer_id: l.customer_id ?? null,
    cost_center_id: l.cost_center_id ?? null,
    tax_type: l.tax_type ?? null,
  }));

const buildIdempotencyKey = (proposal: ProposedJournal): string => {
  const hashSource = JSON.stringify({
    d: proposal.date,
    n: proposal.narration,
    s: proposal.source_type,
    l: proposal.lines.map((l) => [l.account_id, l.debit, l.credit]),
  });
  // FNV-1a 32-bit — good enough for an idempotency key (collisions only matter
  // if the SAME proposal is replayed; we want exactly that to be deduped).
  let h = 0x811c9dc5;
  for (let i = 0; i < hashSource.length; i++) {
    h ^= hashSource.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return `ai_journal:${h.toString(16)}`;
};

/** Posts the proposed journal and returns a reversal handle. */
export const executeProposedJournal = async (
  userId: string,
  proposal: ProposedJournal,
): Promise<ReversalHandle> => {
  const uid = normalizeUserId(userId);
  const idempotencyKey = proposal.idempotency_key || buildIdempotencyKey(proposal);

  const journalId = await postJournal({
    user_id: uid,
    date: proposal.date,
    narration: proposal.narration,
    source_type: proposal.source_type,
    idempotency_key: idempotencyKey,
    lines: toEngineLines(proposal),
  });

  return {
    journal_id: journalId,
    source_type: proposal.source_type,
    posted_at: new Date().toISOString(),
    reversed: false,
  };
};

/** Atomically reverses an executed journal. Idempotent — safe to call twice. */
export const reverseExecutedJournal = async (
  handle: ReversalHandle,
  opts?: { reason?: string },
): Promise<ReversalHandle> => {
  if (handle.reversed && handle.reversal_journal_id) return handle;
  const reversalJournalId = await reverseJournal(handle.journal_id, {
    date: new Date().toISOString().slice(0, 10),
    reason: opts?.reason || 'Reversed via AI command bar undo',
  });
  return {
    ...handle,
    reversed: true,
    reversal_journal_id: reversalJournalId,
  };
};
