// ════════════════════════════════════════════════════════════════════════════
// Feature 3: Shadow Posting / Financial-Statement Impact Preview
//
// Pure (no-DB) calculator that takes a proposed journal + the user's COA
// snapshot and returns the exact delta the journal would have on:
//   - Trial balance (per account, with normal-side semantics)
//   - P&L (income / expense / profit)
//   - Balance sheet (assets / liabilities / equity)
//   - Cash & bank
//   - Receivables (Accounts Receivable family)
//   - Payables   (Accounts Payable family)
//
// This is the "preview before posting" surface that drives the confirmation
// card in the AI command bar. Because it's deterministic and local, it
// renders instantly even while the LLM is still streaming the proposal.
//
// Normal-side convention:
//   Asset / Expense  → debit increases balance
//   Liability / Equity / Income → credit increases balance
// ════════════════════════════════════════════════════════════════════════════

import type { AccountType } from '@/utils/journalEngine';
import type {
  CoaSnapshotAccount,
  JournalImpact,
  ProposedJournal,
} from '@/types/aiJournalAction';

const normalSideIsDebit = (t?: AccountType): boolean =>
  t === 'Asset' || t === 'Expense';

const round2 = (n: number) => Math.round(n * 100) / 100;

// Heuristic detectors — match by code prefix (preferred) or name keywords.
const isCashOrBank = (a: CoaSnapshotAccount): boolean => {
  const code = a.account_code || '';
  const name = (a.account_name || '').toLowerCase();
  if (a.account_type !== 'Asset') return false;
  if (code.startsWith('1010') || code.startsWith('1020') || code.startsWith('1030')) return true;
  return /\b(cash|bank|petty cash|cash in hand|hdfc|icici|sbi|axis|kotak)\b/.test(name);
};

const isReceivable = (a: CoaSnapshotAccount): boolean => {
  const code = a.account_code || '';
  const name = (a.account_name || '').toLowerCase();
  if (a.account_type !== 'Asset') return false;
  if (code.startsWith('1170') || code === '1170') return true;
  return /\b(accounts receivable|sundry debtor|trade receivable|customer .*receivable)\b/.test(name);
};

const isPayable = (a: CoaSnapshotAccount): boolean => {
  const code = a.account_code || '';
  const name = (a.account_name || '').toLowerCase();
  if (a.account_type !== 'Liability') return false;
  if (code.startsWith('2160') || code === '2160') return true;
  return /\b(accounts payable|sundry creditor|trade payable|vendor .*payable)\b/.test(name);
};

/** The core shadow-posting engine. Pure, deterministic, no IO. */
export const computeJournalImpact = (
  proposal: ProposedJournal,
  coa: CoaSnapshotAccount[],
): JournalImpact => {
  const byId = new Map(coa.map((a) => [a.id, a]));

  const tb: JournalImpact['tb'] = [];
  let incomeDelta = 0;
  let expenseDelta = 0;
  let assetsDelta = 0;
  let liabilitiesDelta = 0;
  let equityDelta = 0;
  let cashDelta = 0;
  let arDelta = 0;
  let apDelta = 0;

  for (const line of proposal.lines || []) {
    const acc = byId.get(line.account_id);
    if (!acc) continue;
    const dr = Number(line.debit || 0);
    const cr = Number(line.credit || 0);
    // Signed delta: positive when the account's normal-side balance increases.
    const delta = normalSideIsDebit(acc.account_type) ? (dr - cr) : (cr - dr);

    tb.push({
      account_id: acc.id,
      account_code: acc.account_code,
      account_name: acc.account_name,
      account_type: acc.account_type,
      delta: round2(delta),
      debit: round2(dr),
      credit: round2(cr),
    });

    switch (acc.account_type) {
      case 'Asset':     assetsDelta      += delta; break;
      case 'Liability': liabilitiesDelta += delta; break;
      case 'Equity':    equityDelta      += delta; break;
      case 'Income':    incomeDelta      += delta; break;
      case 'Expense':   expenseDelta     += delta; break;
    }

    if (isCashOrBank(acc)) cashDelta += delta;
    if (isReceivable(acc)) arDelta += delta;
    if (isPayable(acc))    apDelta += delta;
  }

  return {
    tb,
    pl: {
      incomeDelta:  round2(incomeDelta),
      expenseDelta: round2(expenseDelta),
      profitDelta:  round2(incomeDelta - expenseDelta),
    },
    bs: {
      assetsDelta:      round2(assetsDelta),
      liabilitiesDelta: round2(liabilitiesDelta),
      equityDelta:      round2(equityDelta),
    },
    cashDelta: round2(cashDelta),
    arDelta:   round2(arDelta),
    apDelta:   round2(apDelta),
  };
};

/** Convenience: short, human-readable summary used in the chat preview. */
export const summariseImpact = (impact: JournalImpact): string => {
  const parts: string[] = [];
  if (Math.abs(impact.cashDelta) > 0.01) {
    parts.push(`Cash ${impact.cashDelta >= 0 ? '+' : ''}₹${Math.abs(impact.cashDelta).toLocaleString('en-IN')}`);
  }
  if (Math.abs(impact.arDelta) > 0.01) {
    parts.push(`AR ${impact.arDelta >= 0 ? '+' : ''}₹${Math.abs(impact.arDelta).toLocaleString('en-IN')}`);
  }
  if (Math.abs(impact.apDelta) > 0.01) {
    parts.push(`AP ${impact.apDelta >= 0 ? '+' : ''}₹${Math.abs(impact.apDelta).toLocaleString('en-IN')}`);
  }
  if (Math.abs(impact.pl.profitDelta) > 0.01) {
    parts.push(`Profit ${impact.pl.profitDelta >= 0 ? '+' : ''}₹${Math.abs(impact.pl.profitDelta).toLocaleString('en-IN')}`);
  }
  return parts.join(' • ') || 'No statement-level impact';
};
