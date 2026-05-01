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
 * Purchase Bill -> Debit Inventory Asset/Purchase Expense + Input GST, Credit Accounts Payable
 */
export const postPurchaseBillJournal = async (
  userId: string,
  bill: {
    bill_number: string;
    bill_date: string;
    vendor_name: string;
    amount: number;
    gst_amount: number;
    total_amount: number;
    inventory_amount?: number;
  }
) => {
  const uid = normalizeUserId(userId);
  const purchaseId = await getOrCreateAccount(uid, 'Purchase Account', 'Expense');
  const inventoryId = bill.inventory_amount && bill.inventory_amount > 0
    ? await getOrCreateAccount(uid, 'Inventory Asset', 'Asset')
    : null;
  const apId = await getOrCreateAccount(uid, 'Accounts Payable', 'Liability');
  const purchaseExpense = Math.max(0, bill.amount - Number(bill.inventory_amount || 0));

  const lines: JournalLineInput[] = [];

  if (inventoryId && bill.inventory_amount && bill.inventory_amount > 0) {
    lines.push({
      account_id: inventoryId,
      debit: bill.inventory_amount,
      credit: 0,
      line_narration: `Inventory inward - ${bill.bill_number}`,
    });
  }

  if (purchaseExpense > 0) {
    lines.push({
      account_id: purchaseId,
      debit: purchaseExpense,
      credit: 0,
      line_narration: `Purchase expense - ${bill.bill_number}`,
    });
  }

  lines.push({
    account_id: apId,
    debit: 0,
    credit: bill.total_amount,
    line_narration: `Payable to ${bill.vendor_name} - ${bill.bill_number}`,
  });

  if (bill.gst_amount > 0) {
    const inputGstId = await getOrCreateAccount(uid, 'Input Tax Credit', 'Asset');
    lines.push({ account_id: inputGstId, debit: bill.gst_amount, credit: 0, line_narration: `Input GST – ${bill.bill_number}` });
  }

  return createJournal(uid, bill.bill_date, `Purchase Bill ${bill.bill_number} – ${bill.vendor_name}`, lines);
};

/**
 * Inventory outward valuation -> Debit COGS, Credit Inventory Asset
 */
export const postCogsJournal = async (
  userId: string,
  sale: { document_number: string; date: string; party_name: string; cogs_amount: number }
) => {
  const uid = normalizeUserId(userId);
  if (!sale.cogs_amount || sale.cogs_amount <= 0) return null;

  const cogsId = await getOrCreateAccount(uid, 'Cost of Goods Sold', 'Expense');
  const inventoryId = await getOrCreateAccount(uid, 'Inventory Asset', 'Asset');

  return createJournal(uid, sale.date, `COGS - ${sale.document_number} - ${sale.party_name}`, [
    { account_id: cogsId, debit: sale.cogs_amount, credit: 0, line_narration: `COGS for ${sale.document_number}` },
    { account_id: inventoryId, debit: 0, credit: sale.cogs_amount, line_narration: `Inventory issued for ${sale.document_number}` },
  ]);
};

/**
 * Stock opening/adjustment valuation.
 * Positive adjustments debit Inventory Asset; negative adjustments credit Inventory Asset.
 */
export const postInventoryAdjustmentJournal = async (
  userId: string,
  adjustment: {
    adjustment_number: string;
    date: string;
    item_name: string;
    quantity_delta: number;
    value_delta: number;
    reason?: string;
  }
) => {
  const uid = normalizeUserId(userId);
  const value = Math.abs(Number(adjustment.value_delta || 0));
  if (!value) return null;

  const inventoryId = await getOrCreateAccount(uid, 'Inventory Asset', 'Asset');
  const adjustmentId = await getOrCreateAccount(uid, 'Inventory Adjustments', 'Expense');
  const narration = `${adjustment.reason || 'Inventory adjustment'} - ${adjustment.adjustment_number} - ${adjustment.item_name}`;

  if (adjustment.value_delta > 0) {
    return createJournal(uid, adjustment.date, narration, [
      { account_id: inventoryId, debit: value, credit: 0, line_narration: `Inventory increased - ${adjustment.item_name}` },
      { account_id: adjustmentId, debit: 0, credit: value, line_narration: `Adjustment offset - ${adjustment.adjustment_number}` },
    ]);
  }

  return createJournal(uid, adjustment.date, narration, [
    { account_id: adjustmentId, debit: value, credit: 0, line_narration: `Inventory write-off - ${adjustment.item_name}` },
    { account_id: inventoryId, debit: 0, credit: value, line_narration: `Inventory reduced - ${adjustment.item_name}` },
  ]);
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
 * Vendor Advance → Debit Vendor Advance (Asset), Credit Bank/Cash
 */
export const postVendorAdvanceJournal = async (
  userId: string,
  advance: { advance_number: string; advance_date: string; vendor_name: string; amount: number; payment_mode?: string }
) => {
  const uid = normalizeUserId(userId);
  const advanceAccId = await getOrCreateAccount(uid, 'Vendor Advances', 'Asset');
  const bankName = advance.payment_mode === 'cash' ? 'Cash Account' : 'Bank Account';
  const bankId = await getOrCreateAccount(uid, bankName, 'Asset');

  return createJournal(uid, advance.advance_date, `Vendor Advance ${advance.advance_number} – ${advance.vendor_name}`, [
    { account_id: advanceAccId, debit: advance.amount, credit: 0, line_narration: `Advance to ${advance.vendor_name} – ${advance.advance_number}` },
    { account_id: bankId, debit: 0, credit: advance.amount, line_narration: `Payment for advance – ${advance.advance_number}` },
  ]);
};

/**
 * Advance Adjustment against bill → Debit Accounts Payable, Credit Vendor Advance
 */
export const postAdvanceAdjustmentJournal = async (
  userId: string,
  adjustment: { advance_number: string; bill_number: string; date: string; vendor_name: string; amount: number }
) => {
  const uid = normalizeUserId(userId);
  const apId = await getOrCreateAccount(uid, 'Accounts Payable', 'Liability');
  const advanceAccId = await getOrCreateAccount(uid, 'Vendor Advances', 'Asset');

  return createJournal(uid, adjustment.date, `Advance adjustment ${adjustment.advance_number} → ${adjustment.bill_number} – ${adjustment.vendor_name}`, [
    { account_id: apId, debit: adjustment.amount, credit: 0, line_narration: `Adjust payable – ${adjustment.bill_number}` },
    { account_id: advanceAccId, debit: 0, credit: adjustment.amount, line_narration: `Adjust advance – ${adjustment.advance_number}` },
  ]);
};

/**
 * Payment Link collected via Razorpay → Debit Bank, Credit Accounts Receivable
 */
export const postPaymentLinkJournal = async (
  userId: string,
  payment: {
    payment_link_id: string;
    date: string;
    vendor_name: string;
    amount: number;
    description?: string;
  }
) => {
  const uid = normalizeUserId(userId);
  const bankId = await getOrCreateAccount(uid, 'Bank Account', 'Asset');
  const arId = await getOrCreateAccount(uid, 'Accounts Receivable', 'Asset');

  return createJournal(
    uid,
    payment.date,
    `Payment link collected – ${payment.vendor_name}${payment.description ? ' – ' + payment.description : ''}`,
    [
      { account_id: bankId, debit: payment.amount, credit: 0, line_narration: `Razorpay collection from ${payment.vendor_name}` },
      { account_id: arId, debit: 0, credit: payment.amount, line_narration: `Clear receivable – payment link ${payment.payment_link_id}` },
    ]
  );
};

/**
 * Customer Advance received → Debit Bank/Cash, Credit Customer Advances (Liability)
 */
export const postCustomerAdvanceJournal = async (
  userId: string,
  advance: {
    customer_name: string;
    date: string;
    amount: number;
    payment_mode?: string;
    reference_number?: string;
    tax_amount?: number;
  }
) => {
  const uid = normalizeUserId(userId);
  const bankName = advance.payment_mode === 'cash' ? 'Cash Account' : 'Bank Account';
  const bankId = await getOrCreateAccount(uid, bankName, 'Asset');
  const advanceLiabilityId = await getOrCreateAccount(uid, 'Customer Advances', 'Liability');

  const lines: JournalLineInput[] = [
    { account_id: bankId, debit: advance.amount, credit: 0, line_narration: `Advance from ${advance.customer_name}${advance.reference_number ? ' – Ref: ' + advance.reference_number : ''}` },
    { account_id: advanceLiabilityId, debit: 0, credit: advance.amount, line_narration: `Customer advance – ${advance.customer_name}` },
  ];

  // If GST collected on advance (GST on advance receipts)
  if (advance.tax_amount && advance.tax_amount > 0) {
    const gstId = await getOrCreateAccount(uid, 'Output GST on Advances', 'Liability');
    // Adjust: advance liability reduces by tax, GST liability added
    lines[1].credit = advance.amount - advance.tax_amount;
    lines.push({ account_id: gstId, debit: 0, credit: advance.tax_amount, line_narration: `GST on advance – ${advance.customer_name}` });
  }

  return createJournal(
    uid,
    advance.date,
    `Customer Advance – ${advance.customer_name}`,
    lines
  );
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
