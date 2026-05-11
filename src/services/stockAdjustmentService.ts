import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { postInventoryAdjustment } from '@/utils/journalEngine';

// ════════════════════════════════════════════════════════════════════════════
// Stock Adjustment orchestration.
//
//   createStockAdjustment  — draft only
//   approveStockAdjustment — books inventory_movements per line +
//                             posts a single inventory_adjustment journal
//                             for the net value delta
//   cancelStockAdjustment  — drafts only
// ════════════════════════════════════════════════════════════════════════════

export type AdjustmentLineType = 'damaged' | 'expired' | 'manual' | 'write_off' | 'found' | 'recount' | 'opening';
export type StockAdjustmentStatus = 'draft' | 'posted' | 'void';

export interface StockAdjustmentInput {
  adjustment_date?: string;
  reason: string;
  notes?: string;
  warehouse_id?: string;
  items: Array<{
    product_id: string;
    product_name: string;
    quantity_delta: number;       // signed: + = stock in, - = stock out
    unit_cost?: number;           // defaults to average_cost
    adjustment_type: AdjustmentLineType;
    notes?: string;
  }>;
}

export interface StockAdjustmentRow {
  id: string;
  user_id: string;
  adjustment_number: string;
  adjustment_date: string;
  reason?: string | null;
  status: StockAdjustmentStatus;
  total_value_delta: number;
  approved_at?: string | null;
  approved_by?: string | null;
  journal_id?: string | null;
  created_at: string;
}

const nextAdjustmentNumber = async (userId: string): Promise<string> => {
  const year = new Date().getFullYear();
  const prefix = `ADJ/${year}/`;
  const { data } = await supabase
    .from('stock_adjustments' as any)
    .select('adjustment_number')
    .eq('user_id', userId)
    .like('adjustment_number', `${prefix}%`)
    .order('adjustment_number', { ascending: false })
    .limit(1);
  let seq = 1;
  if (data && data.length > 0) {
    const m = (data[0] as any).adjustment_number.match(/\/(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

const getAverageCosts = async (
  userId: string,
  productIds: string[],
): Promise<Record<string, number>> => {
  if (productIds.length === 0) return {};
  const { data } = await supabase
    .from('inventory')
    .select('id, average_cost, purchase_price')
    .eq('user_id', userId)
    .in('id', productIds);
  const out: Record<string, number> = {};
  for (const row of data || []) {
    out[(row as any).id] = Number((row as any).average_cost ?? (row as any).purchase_price ?? 0);
  }
  return out;
};

const ensureDefaultWarehouse = async (userId: string): Promise<string | null> => {
  const { data } = await supabase
    .from('warehouses' as any)
    .select('id')
    .eq('user_id', userId)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();
  return (data as any)?.id ?? null;
};

export const createStockAdjustment = async (
  userId: string,
  input: StockAdjustmentInput,
): Promise<StockAdjustmentRow> => {
  const uid = normalizeUserId(userId);
  if (input.items.length === 0) throw new Error('Adjustment must contain at least one line');
  if (!input.reason?.trim()) throw new Error('Reason is required');

  const number = await nextAdjustmentNumber(uid);
  const { data: header, error: hErr } = await supabase
    .from('stock_adjustments' as any)
    .insert({
      user_id: uid,
      adjustment_number: number,
      adjustment_date: input.adjustment_date || new Date().toISOString().split('T')[0],
      reason: input.reason,
      status: 'draft',
      items: [],
    })
    .select()
    .single();
  if (hErr || !header) throw hErr || new Error('Failed to create adjustment');

  const avgCost = await getAverageCosts(uid, input.items.map((i) => i.product_id));
  const warehouseId = input.warehouse_id ?? (await ensureDefaultWarehouse(uid));

  const itemRows = input.items.map((it) => {
    const unitCost = Number(it.unit_cost ?? avgCost[it.product_id] ?? 0);
    const valueDelta = Number((unitCost * it.quantity_delta).toFixed(2));
    return {
      user_id: uid,
      adjustment_id: (header as any).id,
      product_id: it.product_id,
      product_name: it.product_name,
      warehouse_id: warehouseId,
      quantity_delta: it.quantity_delta,
      unit_cost: unitCost,
      value_delta: valueDelta,
      adjustment_type: it.adjustment_type,
      notes: it.notes ?? null,
    };
  });

  const { error: itemErr } = await supabase.from('stock_adjustment_items' as any).insert(itemRows);
  if (itemErr) {
    await supabase.from('stock_adjustments' as any).delete().eq('id', (header as any).id);
    throw itemErr;
  }

  const { data: refreshed } = await supabase
    .from('stock_adjustments' as any)
    .select('*')
    .eq('id', (header as any).id)
    .single();
  return refreshed as StockAdjustmentRow;
};

/**
 * Approve = book the adjustment:
 *   - inventory_movements per line (adjustment_in or adjustment_out)
 *   - one consolidated inventory_adjustment journal for the net value delta
 *
 * If the adjustment nets to zero (e.g. recount that balances), no journal posted.
 */
export const approveStockAdjustment = async (
  userId: string,
  adjustmentId: string,
  opts: { approvedBy?: string } = {},
): Promise<StockAdjustmentRow> => {
  const uid = normalizeUserId(userId);

  const { data: header, error: hErr } = await supabase
    .from('stock_adjustments' as any)
    .select('*')
    .eq('id', adjustmentId)
    .eq('user_id', uid)
    .single();
  if (hErr || !header) throw hErr || new Error('Adjustment not found');
  if ((header as any).status !== 'draft') {
    throw new Error(`Cannot approve adjustment with status '${(header as any).status}'.`);
  }

  const { data: items } = await supabase
    .from('stock_adjustment_items' as any)
    .select('*')
    .eq('adjustment_id', adjustmentId)
    .eq('user_id', uid);
  if (!items || items.length === 0) throw new Error('Empty adjustment cannot be approved.');

  let netValueDelta = 0;
  let firstItemName = '';
  for (const it of items as any[]) {
    if (!firstItemName) firstItemName = it.product_name;
    const qty = Math.abs(Number(it.quantity_delta));
    const unitCost = Number(it.unit_cost) || 0;
    const valueDelta = Number(it.value_delta) || qty * unitCost * Math.sign(Number(it.quantity_delta));
    netValueDelta += Number(valueDelta);

    if (Number(it.quantity_delta) > 0) {
      await supabase.from('inventory_movements' as any).insert({
        user_id: uid,
        item_id: it.product_id,
        warehouse_id: it.warehouse_id,
        movement_type: 'adjustment_in',
        source_type: 'inventory_adjustment',
        source_id: (header as any).id,
        source_number: (header as any).adjustment_number,
        movement_date: (header as any).adjustment_date,
        quantity_in: qty,
        unit_cost: unitCost,
        value_in: Math.abs(valueDelta),
        notes: `${it.adjustment_type} — ${it.product_name}`,
      });
    } else if (Number(it.quantity_delta) < 0) {
      await supabase.from('inventory_movements' as any).insert({
        user_id: uid,
        item_id: it.product_id,
        warehouse_id: it.warehouse_id,
        movement_type: 'adjustment_out',
        source_type: 'inventory_adjustment',
        source_id: (header as any).id,
        source_number: (header as any).adjustment_number,
        movement_date: (header as any).adjustment_date,
        quantity_out: qty,
        unit_cost: unitCost,
        value_out: Math.abs(valueDelta),
        notes: `${it.adjustment_type} — ${it.product_name}`,
      });
    }
  }

  // Single consolidated journal for the net value delta.
  let journalId: string | null = null;
  if (Math.abs(netValueDelta) > 0.01) {
    journalId = await postInventoryAdjustment(uid, {
      adjustment_id: (header as any).id,
      adjustment_number: (header as any).adjustment_number,
      date: (header as any).adjustment_date,
      item_name: firstItemName || 'Stock adjustment',
      value_delta: netValueDelta,
      reason: (header as any).reason || 'Stock adjustment',
    });
  }

  const { data: updated } = await supabase
    .from('stock_adjustments' as any)
    .update({
      status: 'posted',
      approved_at: new Date().toISOString(),
      approved_by: opts.approvedBy ?? null,
      journal_id: journalId,
    })
    .eq('id', (header as any).id)
    .select()
    .single();
  return updated as StockAdjustmentRow;
};

export const cancelStockAdjustment = async (
  userId: string,
  adjustmentId: string,
): Promise<void> => {
  const uid = normalizeUserId(userId);
  const { data: header } = await supabase
    .from('stock_adjustments' as any)
    .select('status')
    .eq('id', adjustmentId)
    .eq('user_id', uid)
    .single();
  if (!header) throw new Error('Adjustment not found');
  if ((header as any).status === 'posted') {
    throw new Error('Posted adjustments cannot be cancelled. Create a reversing adjustment instead.');
  }
  await supabase
    .from('stock_adjustments' as any)
    .update({ status: 'void' })
    .eq('id', adjustmentId)
    .eq('user_id', uid);
};

export const listStockAdjustments = async (
  userId: string,
  opts: { status?: StockAdjustmentStatus } = {},
): Promise<StockAdjustmentRow[]> => {
  const uid = normalizeUserId(userId);
  let q = supabase
    .from('stock_adjustments' as any)
    .select('*')
    .eq('user_id', uid)
    .order('adjustment_date', { ascending: false });
  if (opts.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as StockAdjustmentRow[];
};

export const getStockAdjustmentWithItems = async (
  userId: string,
  adjustmentId: string,
): Promise<{ header: StockAdjustmentRow; items: any[] }> => {
  const uid = normalizeUserId(userId);
  const [{ data: header }, { data: items }] = await Promise.all([
    supabase.from('stock_adjustments' as any).select('*').eq('id', adjustmentId).eq('user_id', uid).single(),
    supabase.from('stock_adjustment_items' as any).select('*').eq('adjustment_id', adjustmentId).eq('user_id', uid),
  ]);
  return { header: header as StockAdjustmentRow, items: items || [] };
};
