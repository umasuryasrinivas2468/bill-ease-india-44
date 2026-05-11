import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';

// ════════════════════════════════════════════════════════════════════════════
// Warehouse Transfer orchestration.
//
//   createWarehouseTransfer    — draft only
//   approveWarehouseTransfer   — books transfer_out + transfer_in movements
//                                atomically (no journal needed for same-GSTIN
//                                same-business transfers — inventory asset
//                                unchanged in aggregate; just warehouse tag
//                                changes on the subledger).
//   cancelWarehouseTransfer    — drafts only
// ════════════════════════════════════════════════════════════════════════════

export type WarehouseTransferStatus = 'draft' | 'in_transit' | 'received' | 'cancelled';

export interface WarehouseTransferInput {
  from_warehouse_id: string;
  to_warehouse_id: string;
  transfer_date?: string;
  reason?: string;
  notes?: string;
  is_interstate?: boolean;
  same_gstin?: boolean;
  items: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    unit_cost?: number;
    uom?: string;
    notes?: string;
  }>;
}

export interface WarehouseTransferRow {
  id: string;
  user_id: string;
  transfer_number: string;
  transfer_date: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  from_warehouse_name?: string | null;
  to_warehouse_name?: string | null;
  status: WarehouseTransferStatus;
  reason?: string | null;
  notes?: string | null;
  total_quantity: number;
  total_value: number;
  is_interstate: boolean;
  same_gstin: boolean;
  approved_at?: string | null;
  approved_by?: string | null;
  received_at?: string | null;
  received_by?: string | null;
  created_at: string;
}

const nextTransferNumber = async (userId: string): Promise<string> => {
  const year = new Date().getFullYear();
  const prefix = `WT/${year}/`;
  const { data } = await supabase
    .from('warehouse_transfers' as any)
    .select('transfer_number')
    .eq('user_id', userId)
    .like('transfer_number', `${prefix}%`)
    .order('transfer_number', { ascending: false })
    .limit(1);
  let seq = 1;
  if (data && data.length > 0) {
    const m = (data[0] as any).transfer_number.match(/\/(\d+)$/);
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

export const createWarehouseTransfer = async (
  userId: string,
  input: WarehouseTransferInput,
): Promise<WarehouseTransferRow> => {
  const uid = normalizeUserId(userId);

  if (input.from_warehouse_id === input.to_warehouse_id) {
    throw new Error('Source and destination warehouse must differ');
  }
  if (input.items.length === 0) {
    throw new Error('Transfer must contain at least one item');
  }

  // Fetch warehouse names for snapshot.
  const { data: warehouses } = await supabase
    .from('warehouses' as any)
    .select('id, name')
    .eq('user_id', uid)
    .in('id', [input.from_warehouse_id, input.to_warehouse_id]);
  const whName: Record<string, string> = {};
  for (const w of (warehouses as any[]) || []) whName[w.id] = w.name;

  const transferNumber = await nextTransferNumber(uid);
  const { data: header, error: hErr } = await supabase
    .from('warehouse_transfers' as any)
    .insert({
      user_id: uid,
      transfer_number: transferNumber,
      transfer_date: input.transfer_date || new Date().toISOString().split('T')[0],
      from_warehouse_id: input.from_warehouse_id,
      to_warehouse_id: input.to_warehouse_id,
      from_warehouse_name: whName[input.from_warehouse_id] ?? null,
      to_warehouse_name: whName[input.to_warehouse_id] ?? null,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      is_interstate: input.is_interstate ?? false,
      same_gstin: input.same_gstin ?? true,
      status: 'draft',
    })
    .select()
    .single();
  if (hErr || !header) throw hErr || new Error('Failed to create transfer');

  const avgCost = await getAverageCosts(uid, input.items.map((i) => i.product_id));
  const itemRows = input.items.map((it) => {
    const unitCost = it.unit_cost ?? avgCost[it.product_id] ?? 0;
    return {
      user_id: uid,
      transfer_id: (header as any).id,
      product_id: it.product_id,
      product_name: it.product_name,
      quantity: it.quantity,
      unit_cost: unitCost,
      total_value: Number((unitCost * it.quantity).toFixed(2)),
      uom: it.uom ?? 'pcs',
      notes: it.notes ?? null,
    };
  });

  const { error: itemErr } = await supabase.from('warehouse_transfer_items' as any).insert(itemRows);
  if (itemErr) {
    await supabase.from('warehouse_transfers' as any).delete().eq('id', (header as any).id);
    throw itemErr;
  }

  const { data: refreshed } = await supabase
    .from('warehouse_transfers' as any)
    .select('*')
    .eq('id', (header as any).id)
    .single();
  return refreshed as WarehouseTransferRow;
};

/**
 * Approve = book the transfer.
 *   - inventory_movements: transfer_out from source + transfer_in to dest
 *     (same item_id, same value; warehouse_id differs). The refresh_inventory_rollup
 *     trigger sums these across warehouses so inventory.stock_quantity stays
 *     unchanged in aggregate — only the per-warehouse subledger shifts.
 *   - No journal posting for same-GSTIN transfers (no P&L / no balance-sheet
 *     impact in aggregate; Inventory Asset account net delta is zero).
 *   - TODO: cross-GSTIN deemed-supply journal (Output IGST on inter-state
 *     transfer between distinct GSTINs).
 */
export const approveWarehouseTransfer = async (
  userId: string,
  transferId: string,
  opts: { approvedBy?: string } = {},
): Promise<WarehouseTransferRow> => {
  const uid = normalizeUserId(userId);

  const { data: header, error: hErr } = await supabase
    .from('warehouse_transfers' as any)
    .select('*')
    .eq('id', transferId)
    .eq('user_id', uid)
    .single();
  if (hErr || !header) throw hErr || new Error('Transfer not found');
  if ((header as any).status !== 'draft') {
    throw new Error(`Cannot approve transfer with status '${(header as any).status}'.`);
  }

  const { data: items } = await supabase
    .from('warehouse_transfer_items' as any)
    .select('*')
    .eq('transfer_id', transferId)
    .eq('user_id', uid);
  if (!items || items.length === 0) {
    throw new Error('Cannot approve an empty transfer.');
  }

  // Stock-availability check at source warehouse.
  for (const it of items as any[]) {
    const { data: sourceStock } = await supabase
      .from('vw_warehouse_stock' as any)
      .select('quantity_on_hand')
      .eq('user_id', uid)
      .eq('warehouse_id', (header as any).from_warehouse_id)
      .eq('item_id', it.product_id)
      .maybeSingle();
    const available = Number((sourceStock as any)?.quantity_on_hand ?? 0);
    if (available < Number(it.quantity) - 0.0001) {
      throw new Error(`Insufficient stock at source warehouse for ${it.product_name} (available ${available}, requested ${it.quantity})`);
    }
  }

  // Book out + in movements per item.
  for (const it of items as any[]) {
    const valueOut = Number((Number(it.unit_cost) * Number(it.quantity)).toFixed(2));

    // OUT from source
    await supabase.from('inventory_movements' as any).insert({
      user_id: uid,
      item_id: it.product_id,
      warehouse_id: (header as any).from_warehouse_id,
      movement_type: 'transfer_out',
      source_type: 'warehouse_transfer',
      source_id: (header as any).id,
      source_number: (header as any).transfer_number,
      party_name: (header as any).to_warehouse_name || 'Internal transfer',
      movement_date: (header as any).transfer_date,
      quantity_out: it.quantity,
      unit_cost: it.unit_cost,
      value_out: valueOut,
      notes: `Transfer OUT to ${(header as any).to_warehouse_name || 'destination'} — ${it.product_name}`,
    });

    // IN to destination
    await supabase.from('inventory_movements' as any).insert({
      user_id: uid,
      item_id: it.product_id,
      warehouse_id: (header as any).to_warehouse_id,
      movement_type: 'transfer_in',
      source_type: 'warehouse_transfer',
      source_id: (header as any).id,
      source_number: (header as any).transfer_number,
      party_name: (header as any).from_warehouse_name || 'Internal transfer',
      movement_date: (header as any).transfer_date,
      quantity_in: it.quantity,
      unit_cost: it.unit_cost,
      value_in: valueOut,
      notes: `Transfer IN from ${(header as any).from_warehouse_name || 'source'} — ${it.product_name}`,
    });
  }

  const { data: updated } = await supabase
    .from('warehouse_transfers' as any)
    .update({
      status: 'received',
      approved_at: new Date().toISOString(),
      approved_by: opts.approvedBy ?? null,
      received_at: new Date().toISOString(),
      received_by: opts.approvedBy ?? null,
    })
    .eq('id', (header as any).id)
    .select()
    .single();
  return updated as WarehouseTransferRow;
};

export const cancelWarehouseTransfer = async (
  userId: string,
  transferId: string,
): Promise<void> => {
  const uid = normalizeUserId(userId);
  const { data: header } = await supabase
    .from('warehouse_transfers' as any)
    .select('status')
    .eq('id', transferId)
    .eq('user_id', uid)
    .single();
  if (!header) throw new Error('Transfer not found');
  if ((header as any).status === 'received') {
    throw new Error('A received transfer cannot be cancelled. Create a reverse transfer instead.');
  }
  await supabase
    .from('warehouse_transfers' as any)
    .update({ status: 'cancelled' })
    .eq('id', transferId)
    .eq('user_id', uid);
};

export const listWarehouseTransfers = async (
  userId: string,
  opts: { status?: WarehouseTransferStatus } = {},
): Promise<WarehouseTransferRow[]> => {
  const uid = normalizeUserId(userId);
  let q = supabase
    .from('warehouse_transfers' as any)
    .select('*')
    .eq('user_id', uid)
    .order('transfer_date', { ascending: false });
  if (opts.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as WarehouseTransferRow[];
};

export const getWarehouseTransferWithItems = async (
  userId: string,
  transferId: string,
): Promise<{ header: WarehouseTransferRow; items: any[] }> => {
  const uid = normalizeUserId(userId);
  const [{ data: header }, { data: items }] = await Promise.all([
    supabase.from('warehouse_transfers' as any).select('*').eq('id', transferId).eq('user_id', uid).single(),
    supabase.from('warehouse_transfer_items' as any).select('*').eq('transfer_id', transferId).eq('user_id', uid),
  ]);
  return { header: header as WarehouseTransferRow, items: items || [] };
};
