import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { ExpenseOCRResult } from '@/utils/expenseOCR';
import { POMatchResult } from '@/lib/poMatcher';
import { ensureVendorForOcr } from '@/utils/expenseInventoryAutomation';

export interface CreateExpenseWithLiabilitiesArgs {
  userId: string;
  ocr: ExpenseOCRResult;
  match: POMatchResult;
  /** Default category to use when categoryHint is missing. */
  fallbackCategory?: string;
  /** Override the bill attachment URL if known. */
  billAttachmentUrl?: string;
}

export interface CreateExpenseWithLiabilitiesResult {
  expenseId: string;
  vendorId: string | null;
  liabilityIds: string[];
  poId: string | null;
  matchStatus: 'unlinked' | 'matched' | 'partial' | 'conflict';
}

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const computeMatchStatus = (match: POMatchResult): 'unlinked' | 'matched' | 'partial' | 'conflict' => {
  if (!match.po) return 'unlinked';
  if (match.confidence === 'low') return 'conflict';
  const hasUnmatched = match.lineMatches.some((m) => m.poLineIndex === null);
  const stillOpen = match.remainingOpenLines.some((l) => l.openQty > 0);
  if (hasUnmatched) return 'conflict';
  if (stillOpen) return 'partial';
  return 'matched';
};

/**
 * Creates an expense row and the corresponding vendor_liabilities ledger rows
 * for the OCR'd invoice. When a PO match is present, line-item liabilities
 * are linked back to the PO line so partial deliveries roll up correctly.
 *
 * No DB transaction is available from the JS client — the writer runs
 * inserts sequentially and rolls back the expense (best-effort) if liability
 * inserts fail, so callers see a clean error.
 */
export const createExpenseWithLiabilities = async (
  args: CreateExpenseWithLiabilitiesArgs,
): Promise<CreateExpenseWithLiabilitiesResult> => {
  const { userId, ocr, match, fallbackCategory = 'Miscellaneous', billAttachmentUrl } = args;
  const normalizedUserId = normalizeUserId(userId);

  const vendor = await ensureVendorForOcr(
    userId,
    ocr.vendorName?.value || match.po?.vendor_name || null,
    ocr.gstNumber?.value || null,
  );

  const expenseDate = ocr.expenseDate?.value || new Date().toISOString().split('T')[0];
  const totalAmount = num(ocr.totalAmount?.value);
  const taxAmount = num(ocr.taxAmount?.value);
  const baseAmount = num(ocr.amount?.value, Math.max(totalAmount - taxAmount, 0));
  const matchStatus = computeMatchStatus(match);

  const expensePayload = {
    user_id: normalizedUserId,
    vendor_id: vendor?.id ?? null,
    vendor_name: vendor?.name || ocr.vendorName?.value || 'Scanned Vendor',
    expense_date: expenseDate,
    category_name: ocr.categoryHint?.value || fallbackCategory,
    description: `Invoice ${ocr.billNumber?.value || ''}`.trim() || 'OCR-captured invoice',
    amount: baseAmount,
    tax_amount: taxAmount,
    total_amount: totalAmount > 0 ? totalAmount : baseAmount + taxAmount,
    payment_mode: (ocr.paymentMode?.value as 'cash' | 'bank' | 'credit_card' | 'debit_card' | 'upi' | 'cheque') || 'bank',
    bill_number: ocr.billNumber?.value || null,
    bill_attachment_url: billAttachmentUrl || null,
    notes: ocr.notes || null,
    po_id: match.po?.id ?? null,
    po_number: match.po?.order_number ?? ocr.poNumber?.value ?? null,
    po_match_status: matchStatus,
    po_match_confidence: match.po ? match.confidence : null,
    status: 'pending' as const,
  };

  const { data: expenseRow, error: expenseError } = await supabase
    .from('expenses')
    .insert(expensePayload)
    .select('id')
    .single();

  if (expenseError || !expenseRow) {
    throw new Error(expenseError?.message || 'Failed to create expense from OCR.');
  }
  const expenseId = expenseRow.id as string;

  // Build liability rows. One row per OCR line item; aggregate fallback when
  // OCR didn't return line items.
  const dueDate = match.po?.due_date || null;
  type LiabilityInsert = {
    user_id: string;
    vendor_id: string | null;
    vendor_name: string;
    expense_id: string;
    bill_number: string | null;
    po_id: string | null;
    po_number: string | null;
    po_line_index: number | null;
    product_description: string | null;
    quantity: number;
    unit_price: number;
    amount: number;
    tax_amount: number;
    total_amount: number;
    due_date: string | null;
    source: 'invoice_match' | 'direct_invoice' | 'manual';
  };

  const inserts: LiabilityInsert[] = [];
  const baseRow = {
    user_id: normalizedUserId,
    vendor_id: vendor?.id ?? null,
    vendor_name: expensePayload.vendor_name,
    expense_id: expenseId,
    bill_number: expensePayload.bill_number,
    po_id: match.po?.id ?? null,
    po_number: match.po?.order_number ?? null,
    due_date: dueDate,
    source: (match.po ? 'invoice_match' : 'direct_invoice') as 'invoice_match' | 'direct_invoice',
  };

  if (match.lineMatches.length > 0 && (ocr.items?.length ?? 0) > 0) {
    const items = ocr.items || [];
    const totalLineAmount = items.reduce((sum, it) => sum + num(it.amount), 0) || 1;
    const taxPerRupee = totalLineAmount > 0 ? taxAmount / totalLineAmount : 0;

    match.lineMatches.forEach((lm) => {
      const it = items[lm.invoiceItemIndex];
      if (!it) return;
      const lineBase = num(it.amount);
      const lineTax = lineBase * taxPerRupee;
      const lineTotal = lineBase + lineTax;
      inserts.push({
        ...baseRow,
        po_line_index: lm.poLineIndex,
        product_description: it.description,
        quantity: num(it.quantity),
        unit_price: num(it.unit_price),
        amount: Number(lineBase.toFixed(2)),
        tax_amount: Number(lineTax.toFixed(2)),
        total_amount: Number(lineTotal.toFixed(2)),
      });
    });
  }

  // Fallback: single aggregate row when no line items extracted
  if (inserts.length === 0) {
    inserts.push({
      ...baseRow,
      po_line_index: null,
      product_description: ocr.billNumber?.value
        ? `Invoice ${ocr.billNumber.value}`
        : 'Invoice',
      quantity: 1,
      unit_price: baseAmount,
      amount: baseAmount,
      tax_amount: taxAmount,
      total_amount: expensePayload.total_amount,
    });
  }

  const { data: liabilityRows, error: liabError } = await supabase
    .from('vendor_liabilities')
    .insert(inserts)
    .select('id');

  if (liabError) {
    // Best-effort rollback so we don't leave an orphan expense
    await supabase.from('expenses').delete().eq('id', expenseId);
    throw new Error(`Failed to create vendor liabilities: ${liabError.message}`);
  }

  return {
    expenseId,
    vendorId: vendor?.id ?? null,
    liabilityIds: (liabilityRows || []).map((r) => r.id as string),
    poId: match.po?.id ?? null,
    matchStatus,
  };
};
