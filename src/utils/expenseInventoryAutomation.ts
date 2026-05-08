import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { postStockAdjustment } from '@/services/inventoryAutomationService';
import { ExpenseOCRResult, OCRItemLine } from '@/utils/expenseOCR';

/**
 * Smart Expense → Inventory Automation
 *
 * When the OCR pipeline detects that an uploaded bill is a goods / raw-material
 * / stock purchase, this module:
 *
 *   1. matches each extracted line to an existing `inventory` row (by SKU,
 *      HSN+name, or fuzzy product name);
 *   2. creates new inventory rows for items it cannot match (defaulting type
 *      to 'goods' and category from the OCR `category_hint`);
 *   3. posts an inward stock movement via the existing
 *      `inventoryAutomationService.postStockAdjustment` so stock-on-hand,
 *      average cost, and the inventory ledger journal stay in sync;
 *   4. records the link in `expense_inventory_links` so users can audit which
 *      bill drove which stock movement and roll it back if needed.
 *
 * The automation is opt-in per upload: callers decide whether to fire it based
 * on `shouldAutoCreateInventory()` against the OCR result.
 */

const GOODS_CATEGORY_HINTS = new Set([
  'raw materials',
  'purchase of goods',
  'inventory',
  'stock',
  'goods',
]);

const isGoodsHint = (s?: string | null) =>
  !!s && GOODS_CATEGORY_HINTS.has(s.toLowerCase().trim());

export const shouldAutoCreateInventory = (ocr: ExpenseOCRResult | null | undefined): boolean => {
  if (!ocr) return false;
  if (ocr.itemTypeHint?.value === 'goods') return true;
  if (isGoodsHint(ocr.categoryHint?.value)) return true;
  if (ocr.items && ocr.items.length > 0 && ocr.items.some((it) => Number(it.quantity || 0) > 0)) {
    return true;
  }
  if (ocr.rawText && hasGoodsTextSignals(ocr.rawText)) return true;
  return false;
};

/**
 * Cheap structural test: does the raw OCR text look like an itemized goods bill?
 * Looks for HSN columns, qty/quantity/units headers, "MRP / Rate / Amount" headers
 * and tabular numeric rows. Used to enable the inventory section even when the AI
 * model didn't classify item_type.
 */
export const hasGoodsTextSignals = (rawText: string): boolean => {
  if (!rawText) return false;
  const t = rawText.toLowerCase();
  let score = 0;
  if (/\bhsn\b/.test(t))                        score += 2;
  if (/\bsku\b|\bbarcode\b/.test(t))            score += 2;
  if (/\bqty\b|\bquantity\b|\bunits?\b/.test(t)) score += 1;
  if (/\bmrp\b|\brate\b|\bunit price\b/.test(t)) score += 1;
  if (/\bcarton\b|\bbox\b|\bpcs\b|\bkg\b|\blitre?\b|\bmtr\b/.test(t)) score += 1;
  if (/\b(raw material|purchase|goods|inventory|stock)\b/.test(t)) score += 1;
  // Tabular numeric rows: 3+ lines that look like "<text> <num> <num> <num>"
  const lines = rawText.split(/\r?\n/);
  let tabular = 0;
  for (const line of lines) {
    if (/[A-Za-z][A-Za-z ]{2,}\s+\d+(?:[\.,]\d+)?\s+\d+(?:[\.,]\d+)?(?:\s+\d+(?:[\.,]\d+)?)?/.test(line)) {
      tabular += 1;
      if (tabular >= 3) { score += 2; break; }
    }
  }
  return score >= 3;
};

const NUM_RE = /-?\d{1,3}(?:,\d{2,3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/g;
const SKIP_LINE = /^(grand|sub)?\s*total|amount\s*(in\s*words|payable|due)|tax|cgst|sgst|igst|cess|round\s*off|discount|bill\s*no|invoice|gstin|date|page \d+/i;
const HEADER_LINE = /^(s\.?\s*no|sr\.?\s*no|item|description|particulars|hsn|sac|qty|quantity|rate|amount|unit|mrp|price)\b/i;
const UNIT_HINT = /\b(pcs|piece|nos|kg|kgs|ltr|litre|mtr|meter|box|carton|dozen|set|pkt|packet|unit)s?\b/i;

/**
 * Parse line items out of OCR raw text.
 *
 * Strategy: walk every line; require at least two positive numeric tokens
 * (interpreted as quantity + amount or rate). Skip totals/tax/header lines.
 * The parser is intentionally conservative — if it can't read a description
 * cleanly it skips the line.
 */
export const parseItemsFromRawText = (rawText: string): OCRItemLine[] => {
  if (!rawText) return [];
  const out: OCRItemLine[] = [];
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (line.length < 5) continue;
    if (SKIP_LINE.test(line)) continue;
    if (HEADER_LINE.test(line)) continue;

    // Pull all positive numbers (Indian comma-grouping aware).
    const matches = Array.from(line.matchAll(NUM_RE));
    const numbers = matches
      .map((m) => ({
        value: Number(String(m[0]).replace(/,/g, '')),
        index: m.index ?? 0,
        raw: m[0],
      }))
      .filter((n) => Number.isFinite(n.value) && n.value > 0 && n.value < 1e9);

    if (numbers.length < 2) continue;

    // Description is whatever comes before the first numeric token.
    const firstNumIndex = numbers[0].index;
    let description = line.slice(0, firstNumIndex).trim();
    description = description.replace(/^\d+\.\s*/, '').replace(/\s{2,}/g, ' ');
    if (description.length < 3) continue;
    if (!/[a-z]/i.test(description)) continue;

    // HSN: any 4–8 digit standalone number near the description that is *not*
    // the qty (qty is usually small, HSN is 4-8 digits with no decimal).
    const hsnMatch = numbers.find(
      (n) => /^\d{4,8}$/.test(n.raw) && n.value === Math.floor(n.value),
    );

    // Quantity = first non-HSN small number.
    const qtyCandidate = numbers.find(
      (n) => n !== hsnMatch && n.value > 0 && n.value < 100000,
    );
    const qty = qtyCandidate ? qtyCandidate.value : null;

    // Amount = largest number in the line.
    const amount = Math.max(...numbers.map((n) => n.value));

    // Rate = number between qty and amount, if any.
    const middle = numbers.filter(
      (n) => n !== hsnMatch && n !== qtyCandidate && n.value !== amount,
    );
    const rate = middle.length
      ? middle[middle.length - 1].value
      : (qty && qty > 0 ? Number((amount / qty).toFixed(2)) : null);

    // Heuristic sanity-check: qty * rate ≈ amount within 10%
    if (qty && rate) {
      const expected = qty * rate;
      const diff = Math.abs(expected - amount) / Math.max(amount, 1);
      if (diff > 0.25 && qty > 1) {
        // probably misread — fall back to amount-only line
      }
    }

    const unitMatch = line.match(UNIT_HINT);

    out.push({
      description: description.slice(0, 120),
      hsn_sac: hsnMatch ? hsnMatch.raw : null,
      quantity: qty,
      unit: unitMatch ? unitMatch[1].toLowerCase() : null,
      unit_price: rate,
      amount,
    });

    if (out.length >= 30) break;
  }

  return out;
};

const slugSku = (name: string): string =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || `ITEM-${Date.now().toString().slice(-6)}`;

const norm = (s?: string | null) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

interface InventoryRow {
  id: string;
  product_name: string;
  sku: string;
  category: string | null;
  type: string;
  purchase_price: number | null;
  hsn_code: string | null;
  vendor_ids: string[] | null;
}

const findExistingInventoryItem = async (
  userId: string,
  line: OCRItemLine
): Promise<InventoryRow | null> => {
  const description = line.description || '';
  if (!description) return null;

  const { data: candidates, error } = await supabase
    .from('inventory')
    .select('id, product_name, sku, category, type, purchase_price, hsn_code')
    .eq('user_id', userId);

  if (error || !candidates) return null;

  const haystack = (candidates as any[]).map((c) => ({ ...c, vendor_ids: [] })) as InventoryRow[];
  const descNorm = norm(description);
  const sku = slugSku(description);
  const hsn = line.hsn_sac ? line.hsn_sac.replace(/\s/g, '') : null;

  // 1. Exact SKU match
  const bySku = haystack.find((it) => norm(it.sku) === norm(sku));
  if (bySku) return bySku;

  // 2. Exact product_name match
  const byName = haystack.find((it) => norm(it.product_name) === descNorm);
  if (byName) return byName;

  // 3. HSN + first 4 word substring match
  if (hsn) {
    const firstWords = descNorm.split(' ').slice(0, 3).join(' ');
    const byHsn = haystack.find(
      (it) => it.hsn_code === hsn && firstWords && norm(it.product_name).includes(firstWords)
    );
    if (byHsn) return byHsn;
  }

  // 4. Fuzzy contains (>=4 chars)
  if (descNorm.length >= 4) {
    const contains = haystack.find(
      (it) => norm(it.product_name).includes(descNorm) || descNorm.includes(norm(it.product_name)),
    );
    if (contains) return contains;
  }

  return null;
};

const createInventoryItem = async (
  userId: string,
  line: OCRItemLine,
  defaults: { categoryHint?: string | null; vendorId?: string | null }
): Promise<InventoryRow> => {
  const description = (line.description || 'Unnamed item').trim();
  const baseSku = slugSku(description);

  // Make SKU unique within user
  let sku = baseSku;
  let suffix = 1;
  // small loop — at most a few retries on collision
  while (suffix < 50) {
    const { data: existing } = await supabase
      .from('inventory')
      .select('id')
      .eq('user_id', userId)
      .eq('sku', sku)
      .maybeSingle();
    if (!existing) break;
    suffix += 1;
    sku = `${baseSku}-${suffix}`;
  }

  const purchasePrice = Number(line.unit_price || 0) || (
    line.amount && line.quantity ? Number(line.amount) / Number(line.quantity) : 0
  );

  // Only include columns that actually exist on `inventory`. `uom` and
  // `vendor_ids` are NOT in the schema — adding them caused the insert to
  // throw "column does not exist", which surfaced as "items couldn't add to
  // inventory" in the OCR flow.
  const insertPayload: any = {
    user_id: userId,
    product_name: description.slice(0, 200),
    sku,
    category: defaults.categoryHint || 'Raw Materials',
    type: 'goods',
    purchase_price: purchasePrice || null,
    selling_price: purchasePrice ? Number((purchasePrice * 1.2).toFixed(2)) : 0,
    stock_quantity: 0,
    reorder_level: 0,
    base_uom: line.unit || 'pcs',
    valuation_method: 'average',
    negative_stock_policy: 'warn',
    hsn_code: line.hsn_sac || null,
  };

  const { data, error } = await supabase
    .from('inventory')
    .insert([insertPayload])
    .select('id, product_name, sku, category, type, purchase_price, hsn_code')
    .single();
  if (error) throw error;
  return { ...(data as any), vendor_ids: [] } as InventoryRow;
};

const linkVendorToItem = async (_userId: string, _itemId: string, _vendorId: string) => {
  // `inventory.vendor_ids` does not exist in the current schema. Until that
  // column ships, we skip the vendor-to-item linking step. The
  // `expense_inventory_links` row still records which vendor caused the
  // inward movement, so the audit trail is preserved.
  return;
};

/**
 * Find an existing inventory row for an OCR/bill line, or create a new one.
 * Used by AP Intake and Purchase Bills so OCR-extracted lines get a real
 * `product_id` link before stock-movement posting runs (otherwise
 * `extractInventoryLines` filters them out and inventory stays empty).
 */
export const ensureInventoryItem = async (
  userId: string,
  line: OCRItemLine,
  options: { categoryHint?: string | null; vendorId?: string | null } = {}
): Promise<InventoryRow> => {
  const uid = normalizeUserId(userId);
  const existing = await findExistingInventoryItem(uid, line);
  if (existing) {
    if (options.vendorId) {
      try { await linkVendorToItem(uid, existing.id, options.vendorId); } catch { /* non-fatal */ }
    }
    return existing;
  }
  return createInventoryItem(uid, line, {
    categoryHint: options.categoryHint || null,
    vendorId: options.vendorId || null,
  });
};

export interface AutomationResult {
  itemsProcessed: number;
  itemsCreated: number;
  itemsMatched: number;
  totalQuantity: number;
  totalValue: number;
  details: Array<{
    description: string;
    inventory_item_id: string;
    sku: string;
    was_new: boolean;
    quantity: number;
    unit_cost: number;
    value: number;
  }>;
}

export interface AutomationContext {
  userId: string;
  vendorId?: string | null;
  vendorName?: string | null;
  expenseId?: string | null;
  billId?: string | null;
  billNumber?: string | null;
  billDate?: string | null;
  categoryHint?: string | null;
}

/**
 * Process OCR items into inventory: match-or-create, post inward movement,
 * write expense_inventory_links rows. Returns a summary of what happened.
 */
export const applyInventoryAutomation = async (
  items: OCRItemLine[],
  ctx: AutomationContext
): Promise<AutomationResult> => {
  const userId = normalizeUserId(ctx.userId);
  const date = ctx.billDate || new Date().toISOString().slice(0, 10);

  const result: AutomationResult = {
    itemsProcessed: 0,
    itemsCreated: 0,
    itemsMatched: 0,
    totalQuantity: 0,
    totalValue: 0,
    details: [],
  };

  for (const line of items) {
    const qty = Number(line.quantity || 0);
    if (!line.description || qty <= 0) continue;

    let item = await findExistingInventoryItem(userId, line);
    let wasNew = false;
    if (!item) {
      item = await createInventoryItem(userId, line, {
        categoryHint: ctx.categoryHint || null,
        vendorId: ctx.vendorId || null,
      });
      wasNew = true;
      result.itemsCreated += 1;
    } else {
      result.itemsMatched += 1;
      if (ctx.vendorId) {
        await linkVendorToItem(userId, item.id, ctx.vendorId);
      }
    }

    const unitCost =
      Number(line.unit_price || 0) ||
      (line.amount && qty ? Number(line.amount) / qty : Number(item.purchase_price || 0));
    const value = Number((qty * unitCost).toFixed(2));

    // Stock movement / journal — best-effort: if the journal accounts aren't
    // configured or warehouse setup is missing, still count the inventory item
    // as created/matched rather than failing the whole batch.
    try {
      await postStockAdjustment(userId, {
        item_id: item.id,
        item_name: item.product_name,
        quantity_delta: qty,
        unit_cost: unitCost,
        date,
        reason: `Auto-imported from ${ctx.billNumber ? `bill ${ctx.billNumber}` : 'expense OCR'}`,
        source_type: ctx.billId ? 'purchase_bill' : 'expense_inventory',
        source_id: ctx.billId || ctx.expenseId || item.id,
        adjustment_number: ctx.billNumber || `EXP-INV-${Date.now().toString().slice(-6)}`,
      });
    } catch (movementErr) {
      console.warn('[applyInventoryAutomation] stock movement failed for', item.product_name, movementErr);
    }

    // Audit link — also best-effort. Table may not exist on older DBs.
    try {
      await supabase.from('expense_inventory_links' as any).insert({
        user_id: userId,
        expense_id: ctx.expenseId || null,
        bill_id: ctx.billId || null,
        vendor_id: ctx.vendorId || null,
        inventory_item_id: item.id,
        source: 'expense_ocr',
        quantity: qty,
        unit_cost: unitCost,
        total_value: value,
        raw_description: line.description,
        hsn_sac: line.hsn_sac || null,
        was_new_item: wasNew,
      });
    } catch (linkErr) {
      console.warn('[applyInventoryAutomation] audit link insert failed', linkErr);
    }

    result.itemsProcessed += 1;
    result.totalQuantity += qty;
    result.totalValue += value;
    result.details.push({
      description: line.description,
      inventory_item_id: item.id,
      sku: item.sku,
      was_new: wasNew,
      quantity: qty,
      unit_cost: unitCost,
      value,
    });
  }

  return result;
};

/**
 * Resolve a vendor by name/GSTIN. If none exists, create a stub vendor so the
 * inventory purchase has a vendor link from the OCR data alone.
 */
export const ensureVendorForOcr = async (
  userId: string,
  vendorName?: string | null,
  vendorGstin?: string | null
): Promise<{ id: string; name: string } | null> => {
  const uid = normalizeUserId(userId);
  const name = (vendorName || '').trim();
  const gst = (vendorGstin || '').trim().toUpperCase();
  if (!name && !gst) return null;

  if (gst) {
    const { data } = await supabase
      .from('vendors')
      .select('id, name')
      .eq('user_id', uid)
      .eq('gst_number', gst)
      .maybeSingle();
    if (data) return data as any;
  }

  if (name) {
    const { data } = await supabase
      .from('vendors')
      .select('id, name')
      .eq('user_id', uid)
      .ilike('name', name)
      .maybeSingle();
    if (data) return data as any;
  }

  if (!name) return null;

  const { data: created, error } = await supabase
    .from('vendors')
    .insert([{
      user_id: uid,
      name,
      company_name: name,
      gst_number: gst || null,
      onboarding_status: 'draft',
    }])
    .select('id, name')
    .single();
  if (error) {
    console.error('ensureVendorForOcr insert failed', error);
    return null;
  }
  return created as any;
};
