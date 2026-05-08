import { supabase } from '@/lib/supabase';

/**
 * Bill classification engine — Brief item #1.
 *
 * Given a bill line, decide whether it represents:
 *   • inventory  — goods that go into stock (Dr Inventory Asset)
 *   • expense    — operational spend (Dr Expense, hits P&L immediately)
 *   • asset      — capital purchase (Dr Fixed Asset, depreciated over time)
 *   • prepaid    — paid in advance, recognized over future periods (Dr Prepaid)
 *
 * Decision flow (first match wins):
 *   1. Caller-supplied __classification on the line (manual override)
 *   2. bill_classification_rules row matching item HSN, item name, category, vendor
 *   3. inventory.type === 'goods' for the item → 'inventory'
 *   4. inventory.type === 'service' → 'expense'
 *   5. Vendor history (most-common past classification for this vendor)
 *   6. Default: 'expense'
 */

export type LineClassification = 'inventory' | 'expense' | 'asset' | 'prepaid';

export interface BillLineForClassify {
  id?: string;
  product_id?: string | null;
  inventory_item_id?: string | null;
  item_id?: string | null;
  description?: string;
  item_details?: string;
  product_name?: string;
  category?: string;
  hsn_sac?: string;
  amount?: number;
  __classification?: LineClassification;
}

export interface ClassificationContext {
  user_id: string;
  vendor_id?: string | null;
  // Pre-fetched maps to avoid n+1 round-trips when classifying many lines at once.
  inventoryTypeById?: Record<string, 'goods' | 'service'>;
  vendorHistory?: Record<string, LineClassification>; // keyed by vendor_id
  rules?: ClassificationRule[];
}

export interface ClassificationRule {
  match_type: 'vendor' | 'category' | 'hsn' | 'item_name' | 'item_type';
  match_value: string;
  classification: LineClassification;
  priority: number;
}

const lineItemId = (line: BillLineForClassify) =>
  line.product_id || line.inventory_item_id || line.item_id || null;

const lineNorm = (s?: string | null) => (s || '').toLowerCase().trim();

const matchRule = (line: BillLineForClassify, vendorId: string | null | undefined, rule: ClassificationRule): boolean => {
  switch (rule.match_type) {
    case 'vendor':    return !!vendorId && vendorId === rule.match_value;
    case 'category':  return lineNorm(line.category) === lineNorm(rule.match_value);
    case 'hsn':       return lineNorm(line.hsn_sac) === lineNorm(rule.match_value);
    case 'item_name': return lineNorm(line.description || line.item_details || line.product_name).includes(lineNorm(rule.match_value));
    case 'item_type': return false; // resolved against inventory.type at classify time
    default:          return false;
  }
};

/** Pre-fetch everything the classifier needs for a single bill's worth of lines. */
export const buildClassificationContext = async (
  userId: string,
  lines: BillLineForClassify[],
  vendorId?: string | null
): Promise<ClassificationContext> => {
  // 1. Rules (highest priority first)
  const { data: rules } = await supabase
    .from('bill_classification_rules' as any)
    .select('match_type, match_value, classification, priority')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('priority', { ascending: false });

  // 2. Inventory types for any items referenced in the lines
  const itemIds = Array.from(new Set(lines.map(lineItemId).filter(Boolean) as string[]));
  let inventoryTypeById: Record<string, 'goods' | 'service'> = {};
  if (itemIds.length > 0) {
    const { data: items } = await supabase
      .from('inventory')
      .select('id, type')
      .eq('user_id', userId)
      .in('id', itemIds);
    inventoryTypeById = Object.fromEntries(
      (items || []).map((i: any) => [i.id, i.type as 'goods' | 'service'])
    );
  }

  // 3. Most common classification for this vendor in the last 6 months
  let vendorHistory: Record<string, LineClassification> = {};
  if (vendorId) {
    const { data: history } = await supabase
      .from('v_vendor_classification_history' as any)
      .select('vendor_id, classification, rank')
      .eq('user_id', userId)
      .eq('vendor_id', vendorId)
      .eq('rank', 1)
      .maybeSingle();
    if (history?.classification) {
      // The view stores 'goods'/'expense'/'mixed' (header-level). Map to line-level.
      const mapped: Record<string, LineClassification> = {
        goods:    'inventory',
        expense:  'expense',
        asset:    'asset',
        prepaid:  'prepaid',
      };
      vendorHistory[vendorId] = mapped[history.classification] || 'expense';
    }
  }

  return { user_id: userId, vendor_id: vendorId, inventoryTypeById, vendorHistory, rules: (rules as ClassificationRule[]) || [] };
};

export const classifyLine = (
  line: BillLineForClassify,
  ctx: ClassificationContext
): LineClassification => {
  // 1. Manual override always wins.
  if (line.__classification) return line.__classification;

  // 2. Rule match (highest priority first; ctx.rules is already sorted desc).
  for (const rule of ctx.rules || []) {
    if (matchRule(line, ctx.vendor_id, rule)) return rule.classification;
  }

  // 3. Inventory.type lookup
  const itemId = lineItemId(line);
  if (itemId && ctx.inventoryTypeById?.[itemId]) {
    return ctx.inventoryTypeById[itemId] === 'goods' ? 'inventory' : 'expense';
  }

  // 4. Vendor history
  if (ctx.vendor_id && ctx.vendorHistory?.[ctx.vendor_id]) {
    return ctx.vendorHistory[ctx.vendor_id];
  }

  // 5. Default
  return 'expense';
};

/** Classify all lines on a bill in one pass. Returns the lines with __classification set. */
export const classifyBillLines = async (
  userId: string,
  vendorId: string | null | undefined,
  lines: BillLineForClassify[]
): Promise<{ lines: (BillLineForClassify & { __classification: LineClassification })[]; header: 'goods' | 'expense' | 'mixed' | 'asset' | 'prepaid' }> => {
  const ctx = await buildClassificationContext(userId, lines, vendorId);
  const classified = lines.map(line => ({ ...line, __classification: classifyLine(line, ctx) }));

  // Header classification: roll up line classifications into one of
  // goods (all inventory), expense (all expense), asset / prepaid, or mixed.
  const distinct = new Set(classified.map(l => l.__classification));
  let header: 'goods' | 'expense' | 'mixed' | 'asset' | 'prepaid';
  if (distinct.size > 1) {
    header = 'mixed';
  } else {
    const only = [...distinct][0];
    header = only === 'inventory' ? 'goods' : only;
  }

  return { lines: classified, header };
};

/** Persist a manual classification as a rule so future bills auto-learn. */
export const saveClassificationRule = async (
  userId: string,
  rule: { match_type: ClassificationRule['match_type']; match_value: string; classification: LineClassification; priority?: number }
) => {
  const { error } = await supabase
    .from('bill_classification_rules' as any)
    .upsert({
      user_id: userId,
      match_type: rule.match_type,
      match_value: rule.match_value,
      classification: rule.classification,
      priority: rule.priority ?? 100,
      is_active: true,
    }, { onConflict: 'user_id,match_type,match_value,is_active' });
  if (error) throw error;
};

/** Sum line amounts grouped by classification — used to populate the bill's
 *  asset_amount / prepaid_amount columns and to drive the journal posting
 *  (inventory_amount goes to Dr Inventory; the rest to Dr Expense / Asset / Prepaid). */
export const sumByClassification = (
  lines: (BillLineForClassify & { __classification: LineClassification })[]
): Record<LineClassification, number> => {
  const totals: Record<LineClassification, number> = { inventory: 0, expense: 0, asset: 0, prepaid: 0 };
  for (const line of lines) {
    totals[line.__classification] += Number(line.amount || 0);
  }
  return totals;
};
