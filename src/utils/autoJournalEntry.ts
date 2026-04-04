import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';

/**
 * Centralized auto journal entry service.
 * Creates balanced double-entry journal entries for all transaction types.
 */

// ── helpers ──────────────────────────────────────────────────────────

const getOrCreateAccount = async (
  userId: string,
  accountName: string,
  accountType: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense'
): Promise<string> => {
  const { data: existing } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', userId)
    .eq('account_type', accountType)
    .ilike('account_name', `%${accountName}%`)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  // generate code
  const prefixMap: Record<string, string> = { Asset: '1', Liability: '2', Equity: '3', Income: '4', Expense: '5' };
  const prefix = prefixMap[accountType] || '9';
  const { data: last } = await supabase
    .from('accounts')
    .select('account_code')
    .eq('user_id', userId)
    .like('account_code', `${prefix}%`)
    .order('account_code', { ascending: false })
    .limit(1);
  const nextNum = last && last.length > 0 ? (parseInt(last[0].account_code.substring(1)) || 0) + 1 : 1;
  const code = `${prefix}${String(nextNum).padStart(3, '0')}`;

  const { data: created, error } = await supabase
    .from('accounts')
    .insert({ user_id: userId, account_code: code, account_name: accountName, account_type: accountType, opening_balance: 0, is_active: true })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
};

const nextJournalNumber = async (userId: string, date: string): Promise<string> => {
  const year = new Date(date).getFullYear();
  const { data } = await supabase
    .from('journals')
    .select('journal_number')
    .eq('user_id', userId)
    .like('journal_number', `JV/${year}/%`)
    .order('journal_number', { ascending: false })
    .limit(1);
  let seq = 1;
  if (data && data.length > 0) {
    const m = data[0].journal_number.match(/JV\/\d+\/(\d+)/);
    if (m) seq = parseInt(m[1]) + 1;
  }
  return `JV/${year}/${String(seq).padStart(4, '0')}`;
};

interface JournalLineInput {
  account_id: string;
  debit: number;
  credit: number;
  line_narration: string;
}

const createJournal = async (
  userId: string,
  date: string,
  narration: string,
  lines: JournalLineInput[]
) => {
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    console.error('Unbalanced journal:', { totalDebit, totalCredit, narration });
    throw new Error('Journal entry is not balanced');
  }

  const journalNumber = await nextJournalNumber(userId, date);
  const { data: journal, error } = await supabase
    .from('journals')
    .insert({
      user_id: userId,
      journal_date: date,
      journal_number: journalNumber,
      narration,
      status: 'posted',
      total_debit: Math.round(totalDebit * 100) / 100,
      total_credit: Math.round(totalCredit * 100) / 100,
    })
    .select()
    .single();
  if (error) throw error;

  const lineRows = lines.map(l => ({
    journal_id: journal.id,
    account_id: l.account_id,
    debit: l.debit || null,
    credit: l.credit || null,
    line_narration: l.line_narration,
  }));
  const { error: lineErr } = await supabase.from('journal_lines').insert(lineRows);
  if (lineErr) throw lineErr;

  return journal;
};

// ── public API ───────────────────────────────────────────────────────

/**
 * Sales Invoice created → Debit Accounts Receivable, Credit Sales Revenue + Output GST
 */
export const postInvoiceJournal = async (
  userId: string,
  invoice: { invoice_number: string; invoice_date: string; client_name: string; amount: number; gst_amount: number; total_amount: number }
) => {
  const uid = normalizeUserId(userId);
  const arId = await getOrCreateAccount(uid, 'Accounts Receivable', 'Asset');
  const salesId = await getOrCreateAccount(uid, 'Sales Revenue', 'Income');

  const lines: JournalLineInput[] = [
    { account_id: arId, debit: invoice.total_amount, credit: 0, line_narration: `Receivable from ${invoice.client_name} – ${invoice.invoice_number}` },
    { account_id: salesId, debit: 0, credit: invoice.amount, line_narration: `Sales – ${invoice.invoice_number}` },
  ];

  if (invoice.gst_amount > 0) {
    const gstId = await getOrCreateAccount(uid, 'Output GST', 'Liability');
    lines.push({ account_id: gstId, debit: 0, credit: invoice.gst_amount, line_narration: `GST on ${invoice.invoice_number}` });
  }

  return createJournal(uid, invoice.invoice_date, `Sales Invoice ${invoice.invoice_number} – ${invoice.client_name}`, lines);
};

/**
 * Payment received against invoice → Debit Bank, Credit Accounts Receivable
 */
export const postPaymentReceivedJournal = async (
  userId: string,
  payment: { invoice_number: string; date: string; client_name: string; amount: number; payment_mode?: string }
) => {
  const uid = normalizeUserId(userId);
  const bankName = payment.payment_mode === 'cash' ? 'Cash Account' : 'Bank Account';
  const bankId = await getOrCreateAccount(uid, bankName, 'Asset');
  const arId = await getOrCreateAccount(uid, 'Accounts Receivable', 'Asset');

  return createJournal(uid, payment.date, `Payment received – ${payment.invoice_number} – ${payment.client_name}`, [
    { account_id: bankId, debit: payment.amount, credit: 0, line_narration: `Receipt from ${payment.client_name}` },
    { account_id: arId, debit: 0, credit: payment.amount, line_narration: `Clear receivable – ${payment.invoice_number}` },
  ]);
};

/**
 * Cash Memo / Instant Sale → Debit Cash/Bank, Credit Sales Revenue + Output GST
 */
export const postCashMemoJournal = async (
  userId: string,
  sale: { memo_number: string; date: string; customer_name: string; amount: number; gst_amount: number; total_amount: number; payment_mode?: string }
) => {
  const uid = normalizeUserId(userId);
  const paymentAccountName = sale.payment_mode === 'cash' ? 'Cash Account' : 'Bank Account';
  const paymentAccountId = await getOrCreateAccount(uid, paymentAccountName, 'Asset');
  const salesId = await getOrCreateAccount(uid, 'Sales Revenue', 'Income');

  const lines: JournalLineInput[] = [
    { account_id: paymentAccountId, debit: sale.total_amount, credit: 0, line_narration: `Instant receipt – ${sale.memo_number}` },
    { account_id: salesId, debit: 0, credit: sale.amount, line_narration: `Cash memo sales – ${sale.memo_number}` },
  ];

  if (sale.gst_amount > 0) {
    const gstId = await getOrCreateAccount(uid, 'Output GST', 'Liability');
    lines.push({ account_id: gstId, debit: 0, credit: sale.gst_amount, line_narration: `GST on ${sale.memo_number}` });
  }

  return createJournal(uid, sale.date, `Cash Memo ${sale.memo_number} – ${sale.customer_name}`, lines);
};

/**
 * Purchase Bill → Debit Expense/Purchase + Input GST, Credit Accounts Payable
 */
export const postPurchaseBillJournal = async (
  userId: string,
  bill: { bill_number: string; bill_date: string; vendor_name: string; amount: number; gst_amount: number; total_amount: number }
) => {
  const uid = normalizeUserId(userId);
  const purchaseId = await getOrCreateAccount(uid, 'Purchase Account', 'Expense');
  const apId = await getOrCreateAccount(uid, 'Accounts Payable', 'Liability');

  const lines: JournalLineInput[] = [
    { account_id: purchaseId, debit: bill.amount, credit: 0, line_narration: `Purchase – ${bill.bill_number}` },
    { account_id: apId, debit: 0, credit: bill.total_amount, line_narration: `Payable to ${bill.vendor_name} – ${bill.bill_number}` },
  ];

  if (bill.gst_amount > 0) {
    const inputGstId = await getOrCreateAccount(uid, 'Input Tax Credit', 'Asset');
    lines.push({ account_id: inputGstId, debit: bill.gst_amount, credit: 0, line_narration: `Input GST – ${bill.bill_number}` });
  }

  return createJournal(uid, bill.bill_date, `Purchase Bill ${bill.bill_number} – ${bill.vendor_name}`, lines);
};

/**
 * Vendor payment → Debit Accounts Payable, Credit Bank
 */
export const postVendorPaymentJournal = async (
  userId: string,
  payment: { bill_number: string; date: string; vendor_name: string; amount: number; payment_mode?: string }
) => {
  const uid = normalizeUserId(userId);
  const apId = await getOrCreateAccount(uid, 'Accounts Payable', 'Liability');
  const bankName = payment.payment_mode === 'cash' ? 'Cash Account' : 'Bank Account';
  const bankId = await getOrCreateAccount(uid, bankName, 'Asset');

  return createJournal(uid, payment.date, `Vendor payment – ${payment.bill_number} – ${payment.vendor_name}`, [
    { account_id: apId, debit: payment.amount, credit: 0, line_narration: `Clear payable – ${payment.bill_number}` },
    { account_id: bankId, debit: 0, credit: payment.amount, line_narration: `Payment to ${payment.vendor_name}` },
  ]);
};

/**
 * Convert accepted Quotation → Sales Order data shape
 */
export const quotationToSalesOrderData = (
  userId: string,
  quotation: any,
  orderNumber: string
) => ({
  user_id: userId,
  order_number: orderNumber,
  client_name: quotation.client_name,
  client_email: quotation.client_email || null,
  client_phone: quotation.client_phone || null,
  client_address: quotation.client_address || null,
  order_date: new Date().toISOString().split('T')[0],
  due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  items: (quotation.items || []).map((it: any) => ({
    id: crypto.randomUUID(),
    product_id: it.product_id || undefined,
    product_name: it.name || it.product_name || it.description || '',
    quantity: Number(it.quantity) || 1,
    price: Number(it.price || it.rate) || 0,
    tax_rate: 18,
    total: (Number(it.quantity) || 1) * (Number(it.price || it.rate) || 0) * 1.18,
  })),
  subtotal: Number(quotation.subtotal) || 0,
  tax_amount: Number(quotation.tax_amount) || 0,
  total_amount: Number(quotation.total_amount) || 0,
  status: 'pending',
  payment_status: 'unpaid',
  notes: `Converted from Quotation ${quotation.quotation_number}`,
});

/**
 * Convert Sales Order → Invoice data shape
 */
export const salesOrderToInvoiceData = (
  userId: string,
  order: any,
  invoiceNumber: string
) => ({
  user_id: userId,
  invoice_number: invoiceNumber,
  client_name: order.client_name,
  client_email: order.client_email || null,
  client_address: order.client_address || null,
  invoice_date: new Date().toISOString().split('T')[0],
  due_date: order.due_date || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  items: (order.items || []).map((it: any) => ({
    description: it.product_name || it.name || '',
    product_id: it.product_id || null,
    hsn_sac: it.hsn_sac || '',
    quantity: Number(it.quantity) || 1,
    rate: Number(it.price || it.rate) || 0,
    amount: (Number(it.quantity) || 1) * (Number(it.price || it.rate) || 0),
    uom: it.uom || 'pcs',
  })),
  amount: Number(order.subtotal) || 0,
  gst_amount: Number(order.tax_amount) || 0,
  total_amount: Number(order.total_amount) || 0,
  gst_rate: 18,
  status: 'pending',
  notes: `Converted from Sales Order ${order.order_number}`,
});
