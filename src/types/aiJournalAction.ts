// Types for the journal-grounded AI command pipeline.
//
// The AI Command Bar parses free-text into a *proposed* double-entry journal
// instead of an intent label. The proposal is validated against the user's
// live COA, run through a shadow-poster for impact preview, then either
// auto-executed (high confidence) or shown to the user for confirmation.

import type { AccountType, SourceType, TaxType } from '@/utils/journalEngine';

/** A single Dr/Cr line in a proposed journal — references a real account_id. */
export interface ProposedJournalLine {
  account_id: string;
  account_code?: string;
  account_name?: string;
  account_type?: AccountType;
  debit: number;
  credit: number;
  line_narration?: string;
  vendor_id?: string | null;
  customer_id?: string | null;
  cost_center_id?: string | null;
  tax_type?: TaxType | null;
}

/** A complete proposed journal, ready to be posted via postJournal. */
export interface ProposedJournal {
  date: string;               // YYYY-MM-DD
  narration: string;
  source_type: SourceType;
  idempotency_key?: string | null;
  lines: ProposedJournalLine[];
}

/** Outcome of validating a proposed journal against the COA + balance rules. */
export interface JournalValidation {
  ok: boolean;
  totalDebit: number;
  totalCredit: number;
  errors: string[];
  warnings: string[];
}

/** Per-account TB delta + grouped financial-statement impact. */
export interface JournalImpact {
  tb: Array<{
    account_id: string;
    account_code?: string;
    account_name?: string;
    account_type?: AccountType;
    delta: number;            // signed (positive = balance up for normal-side type)
    debit: number;
    credit: number;
  }>;
  pl: {
    incomeDelta: number;
    expenseDelta: number;
    profitDelta: number;
  };
  bs: {
    assetsDelta: number;
    liabilitiesDelta: number;
    equityDelta: number;
  };
  cashDelta: number;
  arDelta: number;
  apDelta: number;
}

/** What the journal-grounded LLM returns. */
export interface JournalParseResult {
  proposal: ProposedJournal;
  confidence: number;         // 0..1
  explanation: string;        // 1-2 sentences in plain English
  unresolvedEntities: string[]; // e.g. ["client name 'Joe Smith' not in COA"]
}

/** Handle returned after executing a proposed journal — supports one-tap undo. */
export interface ReversalHandle {
  journal_id: string;
  source_type: SourceType;
  posted_at: string;
  reversed: boolean;
  reversal_journal_id?: string;
}

/** The full record we attach to a chat message for the journal-grounded path. */
export interface AIJournalAction {
  id: string;
  proposal: ProposedJournal;
  validation: JournalValidation;
  impact: JournalImpact;
  confidence: number;
  explanation: string;
  status: 'pending' | 'executing' | 'posted' | 'reversed' | 'cancelled' | 'failed';
  reversal?: ReversalHandle;
  error?: string;
}

/** Slim COA snapshot we ship to the LLM as grounding context. */
export interface CoaSnapshotAccount {
  id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  account_group?: string;
  account_subgroup?: string;
}
