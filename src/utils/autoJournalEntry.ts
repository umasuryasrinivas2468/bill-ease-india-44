/**
 * Auto journal entry helpers.
 *
 * This file is now a thin compatibility layer over `journalEngine.ts`:
 * the engine owns posting / balance / idempotency / sub-ledger tagging,
 * and this module preserves the existing call-site API plus a few AR-side
 * helpers (cash memo, payment link, customer advances) that aren't core AP.
 *
 * If you're adding a new posting helper, prefer the engine — these wrappers
 * exist only so existing imports keep working.
 */
import { normalizeUserId } from '@/lib/userUtils';
import {
  postPurchaseBill, postVendorPayment, postVendorAdvance, postAdvanceAdjustment,
  postInvoice, postPaymentReceived, postCogs, postInventoryAdjustment,
  postCreditNote,
  postJournal, getOrCreateAccount, STANDARD_ACCOUNTS,
  type JournalLineInput,
} from './journalEngine';

// ── Re-exports under the legacy names ──────────────────────────────────────
// Wrappers return `{ id }` so existing call sites that read `journal?.id`
// keep working. New code should call the engine functions directly.

const wrap = async (p: Promise<string | null>): Promise<{ id: string } | null> => {
  const id = await p;
  return id ? { id } : null;
};

export const postInvoiceJournal = (
  userId: string,
  invoice: { invoice_id?: string; invoice_number: string; invoice_date: string; client_name: string; customer_id?: string; amount: number; gst_amount: number; total_amount: number; cost_center_id?: string; project_id?: string; branch_id?: string; gst_split?: { cgst?: number; sgst?: number; igst?: number; cess?: number } }
) => wrap(postInvoice(userId, invoice));

export const postCreditNoteJournal = (
  userId: string,
  cn: { credit_note_id?: string; credit_note_number: string; credit_note_date: string; client_name: string; customer_id?: string; original_invoice_number?: string; amount: number; gst_amount: number; total_amount: number; cost_center_id?: string; project_id?: string; branch_id?: string; gst_split?: { cgst?: number; sgst?: number; igst?: number; cess?: number } }
) => wrap(postCreditNote(userId, cn));

export const postPaymentReceivedJournal = (
  userId: string,
  payment: { payment_id?: string; invoice_number: string; date: string; client_name: string; customer_id?: string; amount: number; payment_mode?: string }
) => wrap(postPaymentReceived(userId, payment));

export const postPurchaseBillJournal = (
  userId: string,
  bill: {
    bill_id?: string;
    bill_number: string;
    bill_date: string;
    vendor_name: string;
    vendor_id?: string;
    amount: number;
    gst_amount: number;
    total_amount: number;
    inventory_amount?: number;
    asset_amount?: number;
    prepaid_amount?: number;
    is_rcm?: boolean;
    itc_eligible?: boolean;
    cost_center_id?: string;
    project_id?: string;
    branch_id?: string;
    gst_split?: { cgst?: number; sgst?: number; igst?: number; cess?: number };
  }
) => wrap(postPurchaseBill(userId, bill));

export const postCogsJournal = (
  userId: string,
  sale: { cogs_id?: string; document_number: string; date: string; party_name: string; cogs_amount: number; customer_id?: string }
) => wrap(postCogs(userId, sale));

export const postInventoryAdjustmentJournal = (
  userId: string,
  adjustment: { adjustment_id?: string; adjustment_number: string; date: string; item_name: string; quantity_delta: number; value_delta: number; reason?: string }
) => wrap(postInventoryAdjustment(userId, adjustment));

export const postVendorPaymentJournal = (
  userId: string,
  payment: { payment_id?: string; bill_number: string; date: string; vendor_name: string; vendor_id?: string; amount: number; payment_mode?: string; cost_center_id?: string; project_id?: string; reference?: string }
) => wrap(postVendorPayment(userId, payment));

export const postVendorAdvanceJournal = (
  userId: string,
  advance: { advance_id?: string; advance_number: string; advance_date: string; vendor_name: string; vendor_id?: string; amount: number; payment_mode?: string; cost_center_id?: string; project_id?: string }
) => wrap(postVendorAdvance(userId, advance));

export const postAdvanceAdjustmentJournal = (
  userId: string,
  adjustment: { adjustment_id?: string; advance_number: string; bill_number: string; date: string; vendor_name: string; vendor_id?: string; amount: number }
) => wrap(postAdvanceAdjustment(userId, adjustment));

// ── AR-side niche helpers (built directly on the engine primitives) ────────

/**
 * Cash Memo / Instant Sale → Dr Cash/Bank, Cr Sales + Output GST.
 */
export const postCashMemoJournal = async (
  userId: string,
  sale: { memo_id?: string; memo_number: string; date: string; customer_name: string; customer_id?: string; amount: number; gst_amount: number; total_amount: number; payment_mode?: string }
) => {
  const uid = normalizeUserId(userId);
  const cashy = sale.payment_mode === 'cash' ? STANDARD_ACCOUNTS.CASH : STANDARD_ACCOUNTS.BANK;
  const payId   = await getOrCreateAccount(uid, cashy.name, 'Asset');
  const salesId = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.SALES.name, 'Income');
  const tags = { customer_id: sale.customer_id };
  const lines: JournalLineInput[] = [
    { account_id: payId,   debit:  sale.total_amount, line_narration: `Instant receipt — ${sale.memo_number}`, ...tags },
    { account_id: salesId, credit: sale.amount,       line_narration: `Cash memo sales — ${sale.memo_number}`, ...tags },
  ];
  if (sale.gst_amount > 0) {
    const gstId = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.OUTPUT_GST.name, 'Liability');
    lines.push({ account_id: gstId, credit: sale.gst_amount, line_narration: `GST on ${sale.memo_number}`, tax_type: 'output_gst', ...tags });
  }
  return postJournal({
    user_id: uid, date: sale.date,
    narration: `Cash Memo ${sale.memo_number} — ${sale.customer_name}`,
    source_type: 'cash_memo', source_id: sale.memo_id ?? null,
    lines,
  });
};

/**
 * Payment Link collected via Razorpay → Dr Bank, Cr Accounts Receivable.
 */
export const postPaymentLinkJournal = async (
  userId: string,
  payment: { payment_link_id: string; date: string; vendor_name: string; amount: number; description?: string; customer_id?: string }
) => {
  const uid = normalizeUserId(userId);
  const bankId = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.BANK.name, 'Asset');
  const arId   = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.ACCOUNTS_RECEIVABLE.name, 'Asset');
  const tags = { customer_id: payment.customer_id };
  return postJournal({
    user_id: uid, date: payment.date,
    narration: `Payment link collected — ${payment.vendor_name}${payment.description ? ' — ' + payment.description : ''}`,
    source_type: 'payment_link', source_id: null,
    idempotency_key: `payment_link:${payment.payment_link_id}`,
    lines: [
      { account_id: bankId, debit:  payment.amount, line_narration: `Razorpay collection from ${payment.vendor_name}`,                ...tags },
      { account_id: arId,   credit: payment.amount, line_narration: `Clear receivable — payment link ${payment.payment_link_id}`, ...tags },
    ],
  });
};

/**
 * Customer Advance received → Dr Bank/Cash, Cr Customer Advances (+ GST on advance if applicable).
 */
export const postCustomerAdvanceJournal = async (
  userId: string,
  advance: { advance_id?: string; customer_name: string; customer_id?: string; date: string; amount: number; payment_mode?: string; reference_number?: string; tax_amount?: number }
) => {
  const uid = normalizeUserId(userId);
  const cashy = advance.payment_mode === 'cash' ? STANDARD_ACCOUNTS.CASH : STANDARD_ACCOUNTS.BANK;
  const payId       = await getOrCreateAccount(uid, cashy.name, 'Asset');
  const advLiabId   = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.CUSTOMER_ADVANCES.name, 'Liability');
  const tags = { customer_id: advance.customer_id };

  const lines: JournalLineInput[] = [
    { account_id: payId, debit: advance.amount, line_narration: `Advance from ${advance.customer_name}${advance.reference_number ? ' — Ref: ' + advance.reference_number : ''}`, ...tags },
  ];
  const tax = Number(advance.tax_amount || 0);
  if (tax > 0) {
    const gstId = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.OUTPUT_GST_ON_ADVANCES.name, 'Liability');
    lines.push({ account_id: advLiabId, credit: advance.amount - tax, line_narration: `Customer advance — ${advance.customer_name}`,         ...tags });
    lines.push({ account_id: gstId,     credit: tax,                  line_narration: `GST on advance — ${advance.customer_name}`, tax_type: 'output_gst', ...tags });
  } else {
    lines.push({ account_id: advLiabId, credit: advance.amount,        line_narration: `Customer advance — ${advance.customer_name}`,         ...tags });
  }
  return postJournal({
    user_id: uid, date: advance.date,
    narration: `Customer Advance — ${advance.customer_name}`,
    source_type: 'customer_advance', source_id: advance.advance_id ?? null,
    lines,
  });
};

/**
 * Customer Advance Adjustment against Invoice → Dr Customer Advances, Cr AR.
 */
export const postCustomerAdvanceAdjustmentJournal = async (
  userId: string,
  adjustment: { adjustment_id?: string; customer_name: string; customer_id?: string; invoice_number: string; date: string; amount: number }
) => {
  const uid = normalizeUserId(userId);
  const advLiabId = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.CUSTOMER_ADVANCES.name, 'Liability');
  const arId      = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.ACCOUNTS_RECEIVABLE.name, 'Asset');
  const tags = { customer_id: adjustment.customer_id };
  return postJournal({
    user_id: uid, date: adjustment.date,
    narration: `Customer advance adjustment → ${adjustment.invoice_number} — ${adjustment.customer_name}`,
    source_type: 'customer_advance_adjustment', source_id: adjustment.adjustment_id ?? null,
    lines: [
      { account_id: advLiabId, debit:  adjustment.amount, line_narration: `Adjust advance — ${adjustment.customer_name}`,         ...tags },
      { account_id: arId,      credit: adjustment.amount, line_narration: `Clear receivable — ${adjustment.invoice_number}`, ...tags },
    ],
  });
};

// ── Document conversion helpers (no posting; data shape only) ──────────────

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
