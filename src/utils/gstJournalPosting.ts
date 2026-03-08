import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';

/**
 * Posts a purchase bill to the ledger with RCM and ITC logic.
 * 
 * RCM (Reverse Charge): GST is self-assessed by buyer → Dr RCM Input Tax, Cr RCM Tax Liability
 * ITC Eligible: GST goes to Input Tax Credit ledger (claimable)
 * ITC Ineligible: GST added to expense cost (not claimable)
 */
export const postPurchaseBillToLedger = async (
  userId: string,
  bill: {
    id: string;
    bill_date: string;
    vendor_name: string;
    amount: number;
    gst_amount: number;
    total_amount: number;
    is_rcm: boolean;
    itc_eligible: boolean;
    payment_mode?: string;
  }
) => {
  const normalizedUserId = normalizeUserId(userId);

  // Get or create accounts
  const purchaseAccount = await getOrCreateAccount(normalizedUserId, 'Expense', 'Purchase Expense');
  const bankAccount = await getOrCreateAccount(normalizedUserId, 'Asset', 'Bank Account');

  const lines: { account_id: string; debit?: number; credit?: number; line_narration?: string }[] = [];

  if (bill.is_rcm) {
    // RCM: Buyer self-assesses GST
    const rcmLiabilityAccount = await getOrCreateAccount(normalizedUserId, 'Liability', 'RCM Tax Liability');

    if (bill.itc_eligible) {
      // ITC eligible: GST goes to Input Tax Credit
      const itcAccount = await getOrCreateAccount(normalizedUserId, 'Asset', 'Input Tax Credit');
      // Dr Purchase Expense (taxable value)
      lines.push({ account_id: purchaseAccount.id, debit: bill.amount, line_narration: `Purchase from ${bill.vendor_name}` });
      // Dr Input Tax Credit (GST)
      lines.push({ account_id: itcAccount.id, debit: bill.gst_amount, line_narration: 'RCM - ITC claimed' });
      // Cr RCM Tax Liability (GST)
      lines.push({ account_id: rcmLiabilityAccount.id, credit: bill.gst_amount, line_narration: 'RCM GST liability' });
      // Cr Bank (taxable value only, GST self-assessed)
      lines.push({ account_id: bankAccount.id, credit: bill.amount, line_narration: `Payment to ${bill.vendor_name}` });
    } else {
      // ITC ineligible: GST added to cost
      // Dr Purchase Expense (taxable + GST)
      lines.push({ account_id: purchaseAccount.id, debit: bill.amount + bill.gst_amount, line_narration: `Purchase from ${bill.vendor_name} (GST added to cost)` });
      // Cr RCM Tax Liability (GST)
      lines.push({ account_id: rcmLiabilityAccount.id, credit: bill.gst_amount, line_narration: 'RCM GST liability' });
      // Cr Bank (taxable value only)
      lines.push({ account_id: bankAccount.id, credit: bill.amount, line_narration: `Payment to ${bill.vendor_name}` });
    }
  } else {
    // Normal (non-RCM): Vendor charges GST
    if (bill.itc_eligible) {
      const itcAccount = await getOrCreateAccount(normalizedUserId, 'Asset', 'Input Tax Credit');
      // Dr Purchase Expense
      lines.push({ account_id: purchaseAccount.id, debit: bill.amount, line_narration: `Purchase from ${bill.vendor_name}` });
      // Dr Input Tax Credit
      lines.push({ account_id: itcAccount.id, debit: bill.gst_amount, line_narration: 'Input GST - ITC claimed' });
      // Cr Bank (full amount)
      lines.push({ account_id: bankAccount.id, credit: bill.total_amount, line_narration: `Payment to ${bill.vendor_name}` });
    } else {
      // ITC ineligible: GST added to cost
      // Dr Purchase Expense (taxable + GST)
      lines.push({ account_id: purchaseAccount.id, debit: bill.total_amount, line_narration: `Purchase from ${bill.vendor_name} (GST added to cost)` });
      // Cr Bank
      lines.push({ account_id: bankAccount.id, credit: bill.total_amount, line_narration: `Payment to ${bill.vendor_name}` });
    }
  }

  // Create journal
  const journalNumber = await generateJournalNumber(normalizedUserId, bill.bill_date);
  const { data: journal, error: journalError } = await supabase
    .from('journals')
    .insert({
      user_id: normalizedUserId,
      journal_date: bill.bill_date,
      narration: `Purchase Bill - ${bill.vendor_name}${bill.is_rcm ? ' (RCM)' : ''}`,
      status: 'posted',
      journal_number: journalNumber,
    })
    .select()
    .single();

  if (journalError) throw journalError;

  // Insert journal lines
  const journalLinesData = lines.map(line => ({
    journal_id: journal.id,
    account_id: line.account_id,
    debit: line.debit || null,
    credit: line.credit || null,
    line_narration: line.line_narration,
  }));

  const { error: linesError } = await supabase.from('journal_lines').insert(journalLinesData);
  if (linesError) throw linesError;

  return journal;
};

async function getOrCreateAccount(userId: string, accountType: string, accountName: string) {
  const { data: existing } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('account_type', accountType)
    .ilike('account_name', `%${accountName}%`)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (existing) return existing;

  const prefix = { Asset: '1', Liability: '2', Equity: '3', Income: '4', Expense: '5' }[accountType] || '9';
  const { data: lastAcc } = await supabase
    .from('accounts')
    .select('account_code')
    .eq('user_id', userId)
    .like('account_code', `${prefix}%`)
    .order('account_code', { ascending: false })
    .limit(1);

  const nextNum = lastAcc && lastAcc.length > 0 ? (parseInt(lastAcc[0].account_code.substring(1)) || 0) + 1 : 1;
  const accountCode = `${prefix}${String(nextNum).padStart(3, '0')}`;

  const { data: newAccount, error } = await supabase
    .from('accounts')
    .insert({ user_id: userId, account_code: accountCode, account_name: accountName, account_type: accountType, opening_balance: 0, is_active: true })
    .select()
    .single();

  if (error) throw error;
  return newAccount;
}

async function generateJournalNumber(userId: string, journalDate: string): Promise<string> {
  const year = new Date(journalDate).getFullYear();
  const { data: journals } = await supabase
    .from('journals')
    .select('journal_number')
    .eq('user_id', userId)
    .like('journal_number', `JV/${year}/%`)
    .order('journal_number', { ascending: false })
    .limit(1);

  let nextNumber = 1;
  if (journals && journals.length > 0) {
    const match = journals[0].journal_number.match(/JV\/\d+\/(\d+)/);
    if (match) nextNumber = parseInt(match[1]) + 1;
  }
  return `JV/${year}/${String(nextNumber).padStart(4, '0')}`;
}
