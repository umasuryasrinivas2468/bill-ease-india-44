import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { postExpense } from './journalEngine';

/**
 * Posts an expense to the ledger.
 *
 * Routes through the central engine so the journal carries source_type='expense',
 * source_id, vendor_id, cost_center_id sub-ledger tags, and (importantly)
 * uses Accounts Payable for credit-mode expenses instead of crediting Bank
 * directly — the previous implementation treated every expense as paid in
 * cash, which broke the AP balance for vendor expenses on credit.
 */
export const postExpenseToLedger = async (
  userId: string,
  expense: {
    id: string;
    expense_date: string;
    vendor_name: string;
    vendor_id?: string;
    category_name: string;
    amount: number;
    tax_amount: number;
    payment_mode: string;
    description: string;
    tds_amount?: number;
    is_rcm?: boolean;
    itc_eligible?: boolean;
    cost_center_id?: string;
    project_id?: string;
    branch_id?: string;
  }
) => {
  const normalizedUserId = normalizeUserId(userId);

  const journalId = await postExpense(normalizedUserId, {
    expense_id: expense.id,
    expense_date: expense.expense_date,
    vendor_name: expense.vendor_name,
    vendor_id: expense.vendor_id,
    category_name: expense.category_name,
    amount: Number(expense.amount || 0),
    tax_amount: Number(expense.tax_amount || 0),
    tds_amount: Number(expense.tds_amount || 0),
    payment_mode: expense.payment_mode,
    description: expense.description,
    is_rcm: expense.is_rcm,
    itc_eligible: expense.itc_eligible,
    cost_center_id: expense.cost_center_id,
    project_id: expense.project_id,
    branch_id: expense.branch_id,
  });

  // Mark the expense as posted and link to the journal so the UI can
  // drill back. journal_id column already exists from the legacy schema.
  const { error: updateError } = await supabase
    .from('expenses')
    .update({ posted_to_ledger: true, journal_id: journalId, status: 'posted' })
    .eq('id', expense.id);
  if (updateError) throw updateError;

  return { id: journalId };
};

// Legacy types preserved for any consumers that imported them.
export interface JournalEntry {
  user_id: string;
  journal_date: string;
  narration: string;
  status: 'draft' | 'posted' | 'void';
  lines: JournalLine[];
}

export interface JournalLine {
  account_id: string;
  debit?: number;
  credit?: number;
  line_narration?: string;
}

export interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
}
