import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { ExpenseOCRResult, OCRItemLine } from '@/utils/expenseOCR';

export interface POLine {
  id?: string;
  product_id?: string;
  product_name: string;
  sku?: string;
  quantity: number;
  price: number;
  tax_rate?: number;
  total?: number;
}

export interface PORecord {
  id: string;
  user_id: string;
  order_number: string;
  vendor_id: string | null;
  vendor_name: string;
  order_date: string;
  due_date: string;
  total_amount: number;
  status: 'pending' | 'confirmed' | 'received' | 'cancelled';
  fulfillment_status?: 'open' | 'partial' | 'fulfilled' | 'short_closed' | null;
  line_fulfillment?: Array<{
    item_index: number;
    ordered_qty: number;
    invoiced_qty: number;
    status: 'open' | 'partial' | 'fulfilled';
  }> | null;
  items: POLine[];
}

export interface LineMatch {
  invoiceItemIndex: number;
  poLineIndex: number | null;
  invoiceDescription: string;
  invoiceQty: number;
  invoiceAmount: number;
  poProductName?: string;
  poRemainingQty?: number;
  similarity: number;
}

export type MatchReason =
  | 'po_number_exact'
  | 'fuzzy_vendor_amount'
  | 'fuzzy_vendor_items'
  | 'no_match';

export interface POMatchResult {
  po: PORecord | null;
  confidence: 'high' | 'medium' | 'low';
  reason: MatchReason;
  lineMatches: LineMatch[];
  /** PO lines with remaining open qty after applying these matches. */
  remainingOpenLines: Array<{
    poLineIndex: number;
    productName: string;
    orderedQty: number;
    alreadyInvoicedQty: number;
    afterThisInvoiceQty: number;
    openQty: number;
  }>;
}

const normalizeToken = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const tokenize = (s: string): string[] =>
  normalizeToken(s).split(' ').filter((t) => t.length >= 2);

/** Jaccard token overlap — cheap, robust for short product names. */
const tokenSimilarity = (a: string, b: string): number => {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersect = 0;
  ta.forEach((t) => {
    if (tb.has(t)) intersect += 1;
  });
  const union = ta.size + tb.size - intersect;
  return intersect / union;
};

const normalizePONumber = (s: string | undefined | null): string =>
  (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const fetchVendorIdByName = async (
  userId: string,
  vendorName: string | null,
  vendorGst: string | null,
): Promise<string | null> => {
  if (!vendorName && !vendorGst) return null;
  const normalizedUserId = normalizeUserId(userId);
  let q = supabase.from('vendors').select('id, vendor_name, vendor_gst').eq('user_id', normalizedUserId);
  if (vendorGst) q = q.eq('vendor_gst', vendorGst);
  const { data } = await q;
  if (data && data.length > 0) return data[0].id;
  if (vendorName) {
    const { data: byName } = await supabase
      .from('vendors')
      .select('id')
      .eq('user_id', normalizedUserId)
      .ilike('vendor_name', vendorName)
      .limit(1);
    if (byName && byName.length > 0) return byName[0].id;
  }
  return null;
};

const fetchPOByNumber = async (userId: string, poNumber: string): Promise<PORecord | null> => {
  const normalizedUserId = normalizeUserId(userId);
  const target = normalizePONumber(poNumber);
  if (!target) return null;

  const { data, error } = await supabase
    .from('purchase_orders')
    .select('id, user_id, order_number, vendor_id, vendor_name, order_date, due_date, total_amount, status, fulfillment_status, line_fulfillment, items')
    .eq('user_id', normalizedUserId)
    .neq('status', 'cancelled');
  if (error || !data) return null;

  const exact = data.find((po) => normalizePONumber(po.order_number) === target);
  return (exact as PORecord) || null;
};

const fetchOpenPOsForVendor = async (
  userId: string,
  vendorId: string,
): Promise<PORecord[]> => {
  const normalizedUserId = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('id, user_id, order_number, vendor_id, vendor_name, order_date, due_date, total_amount, status, fulfillment_status, line_fulfillment, items')
    .eq('user_id', normalizedUserId)
    .eq('vendor_id', vendorId)
    .neq('status', 'cancelled')
    .neq('fulfillment_status', 'fulfilled')
    .order('order_date', { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return data as PORecord[];
};

const remainingQtyForLine = (po: PORecord, lineIndex: number): number => {
  const ordered = Number(po.items[lineIndex]?.quantity ?? 0);
  const invoiced = Number(
    (po.line_fulfillment || []).find((f) => f.item_index === lineIndex)?.invoiced_qty ?? 0,
  );
  return Math.max(ordered - invoiced, 0);
};

const matchLines = (po: PORecord, invoiceItems: OCRItemLine[]): LineMatch[] => {
  const results: LineMatch[] = [];
  const claimed = new Set<number>();

  invoiceItems.forEach((it, idx) => {
    const desc = it.description || '';
    let bestIdx: number | null = null;
    let bestSim = 0;

    po.items.forEach((poLine, poIdx) => {
      if (claimed.has(poIdx)) return;
      const sim = tokenSimilarity(desc, poLine.product_name || '');
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = poIdx;
      }
    });

    const accepted = bestIdx !== null && bestSim >= 0.34;
    if (accepted) claimed.add(bestIdx as number);

    results.push({
      invoiceItemIndex: idx,
      poLineIndex: accepted ? bestIdx : null,
      invoiceDescription: desc,
      invoiceQty: Number(it.quantity ?? 0),
      invoiceAmount: Number(it.amount ?? 0),
      poProductName: accepted ? po.items[bestIdx as number].product_name : undefined,
      poRemainingQty: accepted ? remainingQtyForLine(po, bestIdx as number) : undefined,
      similarity: bestSim,
    });
  });

  return results;
};

const computeRemainingLines = (po: PORecord, lineMatches: LineMatch[]) =>
  po.items.map((poLine, idx) => {
    const ordered = Number(poLine.quantity ?? 0);
    const alreadyInvoiced = Number(
      (po.line_fulfillment || []).find((f) => f.item_index === idx)?.invoiced_qty ?? 0,
    );
    const thisInvoice = lineMatches
      .filter((m) => m.poLineIndex === idx)
      .reduce((sum, m) => sum + m.invoiceQty, 0);
    const after = alreadyInvoiced + thisInvoice;
    return {
      poLineIndex: idx,
      productName: poLine.product_name,
      orderedQty: ordered,
      alreadyInvoicedQty: alreadyInvoiced,
      afterThisInvoiceQty: after,
      openQty: Math.max(ordered - after, 0),
    };
  });

const amountMatches = (poTotal: number, invoiceTotal: number, tolerance = 0.02): boolean => {
  if (poTotal <= 0 || invoiceTotal <= 0) return false;
  const diff = Math.abs(poTotal - invoiceTotal) / poTotal;
  return diff <= tolerance;
};

/** Top-level: given an OCR result, find the matching PO. */
export const matchInvoiceToPO = async (
  userId: string,
  ocr: ExpenseOCRResult,
): Promise<POMatchResult> => {
  const invoiceItems = ocr.items || [];
  const invoiceTotal = Number(ocr.totalAmount?.value ?? ocr.amount?.value ?? 0);

  // 1. Exact PO number match — high confidence
  if (ocr.poNumber?.value) {
    const po = await fetchPOByNumber(userId, ocr.poNumber.value);
    if (po) {
      const lineMatches = matchLines(po, invoiceItems);
      return {
        po,
        confidence: 'high',
        reason: 'po_number_exact',
        lineMatches,
        remainingOpenLines: computeRemainingLines(po, lineMatches),
      };
    }
  }

  // 2. Fuzzy match against open POs for the OCR'd vendor
  const vendorId = await fetchVendorIdByName(
    userId,
    ocr.vendorName?.value || null,
    ocr.gstNumber?.value || null,
  );
  if (!vendorId) {
    return { po: null, confidence: 'low', reason: 'no_match', lineMatches: [], remainingOpenLines: [] };
  }

  const candidates = await fetchOpenPOsForVendor(userId, vendorId);
  if (candidates.length === 0) {
    return { po: null, confidence: 'low', reason: 'no_match', lineMatches: [], remainingOpenLines: [] };
  }

  // Score: 0.5 * line-coverage + 0.5 * amount-fit
  let best: { po: PORecord; lineMatches: LineMatch[]; score: number; amountFit: boolean } | null = null;
  for (const po of candidates) {
    const lineMatches = matchLines(po, invoiceItems);
    const matched = lineMatches.filter((m) => m.poLineIndex !== null).length;
    const coverage = invoiceItems.length === 0 ? 0 : matched / invoiceItems.length;
    const amountFit = amountMatches(po.total_amount, invoiceTotal);
    const score = 0.5 * coverage + 0.5 * (amountFit ? 1 : 0);
    if (!best || score > best.score) {
      best = { po, lineMatches, score, amountFit };
    }
  }

  if (!best || best.score < 0.34) {
    return { po: null, confidence: 'low', reason: 'no_match', lineMatches: [], remainingOpenLines: [] };
  }

  const confidence: POMatchResult['confidence'] =
    best.score >= 0.7 ? 'high' : best.score >= 0.5 ? 'medium' : 'low';

  return {
    po: best.po,
    confidence,
    reason: best.amountFit ? 'fuzzy_vendor_amount' : 'fuzzy_vendor_items',
    lineMatches: best.lineMatches,
    remainingOpenLines: computeRemainingLines(best.po, best.lineMatches),
  };
};
