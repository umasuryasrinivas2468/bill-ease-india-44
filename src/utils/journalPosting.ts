import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';

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

/**
 * Posts an expense to the ledger by creating journal entries
 */
export const postExpenseToLedger = async (
  userId: string,
  expense: {
    id: string;
    expense_date: string;
    vendor_name: string;
    category_name: string;
    amount: number;
    tax_amount: number;
    payment_mode: string;
    description: string;
    tds_amount?: number;
  }
) => {
  try {
    const normalizedUserId = normalizeUserId(userId);

    // 1. Get or create expense account for the category
    let expenseAccount = await getOrCreateExpenseAccount(normalizedUserId, expense.category_name);
    
    // 2. Get payment account based on payment mode
    let paymentAccount = await getOrCreatePaymentAccount(normalizedUserId, expense.payment_mode);

    // 3. Get or create tax account if there's tax amount
    let taxAccount = null;
    if (expense.tax_amount > 0) {
      taxAccount = await getOrCreateTaxAccount(normalizedUserId);
    }

    // 4. Create journal entry
    const journalEntry: JournalEntry = {
      user_id: normalizedUserId,
      journal_date: expense.expense_date,
      narration: `${expense.description} - ${expense.vendor_name}`,
      status: 'posted',
      lines: []
    };

    const tdsAmount = Number(expense.tds_amount || 0);

    // Debit: Expense Account (gross amount without TDS)
    journalEntry.lines.push({
      account_id: expenseAccount.id,
      debit: expense.amount,
      line_narration: `${expense.category_name} expense`
    });

    // Debit: Tax Account (if applicable)
    if (expense.tax_amount > 0 && taxAccount) {
      journalEntry.lines.push({
        account_id: taxAccount.id,
        debit: expense.tax_amount,
        line_narration: 'Input tax on expense'
      });
    }

    // Calculate net payment that will go out of bank/cash = amount + tax - tds
    const netPayment = Math.round((expense.amount + expense.tax_amount - tdsAmount) * 100) / 100;

    // Credit: Payment Account (Cash/Bank) for net payable
    journalEntry.lines.push({
      account_id: paymentAccount.id,
      credit: netPayment,
      line_narration: `Payment via ${expense.payment_mode}`
    });

    // If TDS applies, credit TDS Payable account
    if (tdsAmount > 0) {
      const tdsPayableAccount = await getOrCreateTdsPayableAccount(normalizedUserId);
      journalEntry.lines.push({
        account_id: tdsPayableAccount.id,
        credit: tdsAmount,
        line_narration: 'TDS deducted on payment'
      });
    }

    // 5. Save journal entry
    const { data: journal, error: journalError } = await supabase
      .from('journals')
      .insert({
        user_id: normalizedUserId,
        journal_date: journalEntry.journal_date,
        narration: journalEntry.narration,
        status: journalEntry.status,
        journal_number: await generateJournalNumber(normalizedUserId, expense.expense_date)
      })
      .select()
      .single();

    if (journalError) throw journalError;

    // 6. Save journal lines
    const journalLinesData = journalEntry.lines.map(line => ({
      journal_id: journal.id,
      account_id: line.account_id,
      debit: line.debit || null,
      credit: line.credit || null,
      line_narration: line.line_narration
    }));

    const { error: linesError } = await supabase
      .from('journal_lines')
      .insert(journalLinesData);

    if (linesError) throw linesError;

    // 7. Update expense to mark as posted
    const { error: updateError } = await supabase
      .from('expenses')
      .update({
        posted_to_ledger: true,
        journal_id: journal.id,
        status: 'posted'
      })
      .eq('id', expense.id);

    if (updateError) throw updateError;

    return journal;

  } catch (error) {
    console.error('Error posting expense to ledger:', error);
    throw error;
  }
};

/**
 * Get or create expense account for a specific category
 */
const getOrCreateExpenseAccount = async (userId: string, categoryName: string): Promise<Account> => {
  // First try to find existing account
  const { data: existingAccount } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('account_type', 'Expense')
    .ilike('account_name', `%${categoryName}%`)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (existingAccount) {
    return existingAccount;
  }

  // Create new expense account
  const accountCode = await generateAccountCode(userId, 'Expense');
  const { data: newAccount, error } = await supabase
    .from('accounts')
    .insert({
      user_id: userId,
      account_code: accountCode,
      account_name: `${categoryName} Expense`,
      account_type: 'Expense',
      opening_balance: 0,
      is_active: true
    })
    .select()
    .single();

  if (error) throw error;
  return newAccount;
};

/**
 * Get or create payment account based on payment mode
 */
const getOrCreatePaymentAccount = async (userId: string, paymentMode: string): Promise<Account> => {
  const accountNameMap = {
    cash: 'Cash Account',
    bank: 'Bank Account',
    credit_card: 'Credit Card Account',
    debit_card: 'Bank Account',
    upi: 'Bank Account',
    cheque: 'Bank Account'
  };

  const accountName = accountNameMap[paymentMode as keyof typeof accountNameMap] || 'Bank Account';
  
  // Try to find existing account
  const { data: existingAccount } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('account_type', 'Asset')
    .ilike('account_name', `%${accountName}%`)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (existingAccount) {
    return existingAccount;
  }

  // Create new payment account
  const accountCode = await generateAccountCode(userId, 'Asset');
  const { data: newAccount, error } = await supabase
    .from('accounts')
    .insert({
      user_id: userId,
      account_code: accountCode,
      account_name: accountName,
      account_type: 'Asset',
      opening_balance: 0,
      is_active: true
    })
    .select()
    .single();

  if (error) throw error;
  return newAccount;
};

/**
 * Get or create tax account for input tax
 */
const getOrCreateTaxAccount = async (userId: string): Promise<Account> => {
  // Try to find existing tax account
  const { data: existingAccount } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('account_type', 'Asset')
    .ilike('account_name', '%input%tax%')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (existingAccount) {
    return existingAccount;
  }

  // Create new tax account
  const accountCode = await generateAccountCode(userId, 'Asset');
  const { data: newAccount, error } = await supabase
    .from('accounts')
    .insert({
      user_id: userId,
      account_code: accountCode,
      account_name: 'Input Tax Account',
      account_type: 'Asset',
      opening_balance: 0,
      is_active: true
    })
    .select()
    .single();

  if (error) throw error;
  return newAccount;
};

/**
 * Generate account code for new accounts
 */
const generateAccountCode = async (userId: string, accountType: string): Promise<string> => {
  const typePrefix = {
    'Asset': '1',
    'Liability': '2',
    'Equity': '3',
    'Income': '4',
    'Expense': '5'
  };

  const prefix = typePrefix[accountType as keyof typeof typePrefix] || '9';
  
  // Get next sequence number
  const { data: accounts } = await supabase
    .from('accounts')
    .select('account_code')
    .eq('user_id', userId)
    .like('account_code', `${prefix}%`)
    .order('account_code', { ascending: false })
    .limit(1);

  let nextNumber = 1;
  if (accounts && accounts.length > 0) {
    const lastCode = accounts[0].account_code;
    const lastNumber = parseInt(lastCode.substring(1)) || 0;
    nextNumber = lastNumber + 1;
  }

  return `${prefix}${String(nextNumber).padStart(3, '0')}`;
};

/**
 * Generate journal number
 */
const generateJournalNumber = async (userId: string, journalDate: string): Promise<string> => {
  const year = new Date(journalDate).getFullYear();
  
  // Get next sequence number for this year
  const { data: journals } = await supabase
    .from('journals')
    .select('journal_number')
    .eq('user_id', userId)
    .like('journal_number', `JV/${year}/%`)
    .order('journal_number', { ascending: false })
    .limit(1);

  let nextNumber = 1;
  if (journals && journals.length > 0) {
    const lastNumber = journals[0].journal_number;
    const match = lastNumber.match(/JV\/\d+\/(\d+)/);
    if (match) {
      nextNumber = parseInt(match[1]) + 1;
    }
  }

  return `JV/${year}/${String(nextNumber).padStart(4, '0')}`;
};

/**
 * Get or create TDS Payable liability account
 */
const getOrCreateTdsPayableAccount = async (userId: string): Promise<Account> => {
  // Try to find existing TDS Payable account
  const { data: existingAccount } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('account_type', 'Liability')
    .ilike('account_name', '%TDS Payable%')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (existingAccount) return existingAccount;

  // Create TDS Payable account
  const accountCode = await generateAccountCode(userId, 'Liability');
  const { data: newAccount, error } = await supabase
    .from('accounts')
    .insert({
      user_id: userId,
      account_code: accountCode,
      account_name: 'TDS Payable',
      account_type: 'Liability',
      opening_balance: 0,
      is_active: true
    })
    .select()
    .single();

  if (error) throw error;
  return newAccount;
};