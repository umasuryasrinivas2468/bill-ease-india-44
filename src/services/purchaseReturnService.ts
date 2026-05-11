import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import {
  postDebitNote,
  postPurchaseInventoryReversal,
} from '@/utils/journalEngine';

// ════════════════════════════════════════════════════════════════════════════
// Purchase Return orchestration. Mirror of salesReturnService.
//
//   createPurchaseReturn(...)   — writes draft purchase_return + items
//   approvePurchaseReturn(id)   — full transition:
//                                   inventory_movements (purchase_return)
//                                   debit_note auto-issue (+ journal)
//                                   inventory ledger reversal journal
//                                   bill allocation (outcome='adjustment')
//   cancelPurchaseReturn(id)    — drafts only
// ════════════════════════════════════════════════════════════════════════════

export type PurchaseReturnCondition = 'defective' | 'damaged' | 'wrong_item' | 'excess' | 'expired' | 'other';
export type PurchaseReturnOutcome = 'refund' | 'adjustment' | 'replacement';
export type PurchaseReturnStatus = 'draft' | 'approved' | 'cancelled';

export interface PurchaseReturnInput {
  bill_id: string;
  return_date?: string;
  reason?: string;
  notes?: string;
  outcome?: PurchaseReturnOutcome;
  items: Array<{
    product_id: string | null;
    product_name: string;
    hsn_sac?: string;
    quantity: number;
    rate: number;
    gst_rate: number;
    uom?: string;
    condition: PurchaseReturnCondition;
    bill_line_key?: string;
    notes?: string;
  }>;
}

export interface PurchaseReturnRow {
  id: string;
  user_id: string;
  return_number: string;
  return_date: string;
  bill_id: string;
  bill_number: string;
  vendor_id?: string | null;
  vendor_name: string;
  vendor_email?: string | null;
  vendor_gst?: string | null;
  vendor_address?: string | null;
  return_type: 'full' | 'partial' | 'item_wise';
  status: PurchaseReturnStatus;
  outcome: PurchaseReturnOutcome;
  subtotal: number;
  gst_amount: number;
  total_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  intra_state: boolean;
  place_of_supply?: string | null;
  reason?: string | null;
  notes?: string | null;
  debit_note_id?: string | null;
  inventory_reduced: number;
  approved_at?: string | null;
  approved_by?: string | null;
  created_at: string;
}

// ── helpers ────────────────────────────────────────────────────────────────

const nextReturnNumber = async (userId: string): Promise<string> => {
  const year = new Date().getFullYear();
  const prefix = `PR/${year}/`;
  const { data } = await supabase
    .from('purchase_returns' as any)
    .select('return_number')
    .eq('user_id', userId)
    .like('return_number', `${prefix}%`)
    .order('return_number', { ascending: false })
    .limit(1);

  let seq = 1;
  if (data && data.length > 0) {
    const m = (data[0] as any).return_number.match(/\/(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

const nextDebitNoteNumber = async (userId: string): Promise<string> => {
  const year = new Date().getFullYear();
  const prefix = `DN/${year}/`;
  const { data } = await supabase
    .from('debit_notes' as any)
    .select('debit_note_number')
    .eq('user_id', userId)
    .like('debit_note_number', `${prefix}%`)
    .order('debit_note_number', { ascending: false })
    .limit(1);

  let seq = 1;
  if (data && data.length > 0) {
    const m = (data[0] as any).debit_note_number.match(/\/(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

const computeReturnType = (
  itemsReturned: PurchaseReturnInput['items'],
  billItems: any[],
): 'full' | 'partial' | 'item_wise' => {
  const billQtyByProduct = new Map<string, number>();
  for (const li of billItems || []) {
    const pid = li?.product_id || li?.inventory_item_id || li?.item_id;
    if (!pid) continue;
    billQtyByProduct.set(pid, (billQtyByProduct.get(pid) || 0) + Number(li.quantity || 0));
  }
  const returnQtyByProduct = new Map<string, number>();
  for (const ri of itemsReturned) {
    if (!ri.product_id) continue;
    returnQtyByProduct.set(ri.product_id, (returnQtyByProduct.get(ri.product_id) || 0) + Number(ri.quantity || 0));
  }
  if (billQtyByProduct.size === 0) return 'item_wise';

  let isFull = true;
  for (const [pid, purchased] of billQtyByProduct.entries()) {
    const returned = returnQtyByProduct.get(pid) || 0;
    if (Math.abs(returned - purchased) > 0.0001) { isFull = false; break; }
  }
  if (isFull && returnQtyByProduct.size === billQtyByProduct.size) return 'full';
  return itemsReturned.length === 1 ? 'item_wise' : 'partial';
};

const getInventoryAverageCost = async (
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
  const { data: existing } = await supabase
    .from('warehouses' as any)
    .select('id')
    .eq('user_id', userId)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();
  if ((existing as any)?.id) return (existing as any).id;
  const { data: created } = await supabase
    .from('warehouses' as any)
    .insert({ user_id: userId, name: 'Main Warehouse', code: 'MAIN', is_default: true })
    .select('id')
    .single();
  return (created as any)?.id ?? null;
};

// ── public API ─────────────────────────────────────────────────────────────

export const createPurchaseReturn = async (
  userId: string,
  input: PurchaseReturnInput,
): Promise<PurchaseReturnRow> => {
  const uid = normalizeUserId(userId);

  const { data: bill, error: bErr } = await supabase
    .from('purchase_bills')
    .select('id, bill_number, vendor_id, vendor_name, vendor_email, vendor_gst_number, vendor_address, items')
    .eq('id', input.bill_id)
    .eq('user_id', uid)
    .single();
  if (bErr || !bill) throw new Error(bErr?.message || 'Bill not found');

  const billItems = (bill as any).items ?? [];
  const returnType = computeReturnType(input.items, billItems);

  const returnNumber = await nextReturnNumber(uid);
  const { data: header, error: hErr } = await supabase
    .from('purchase_returns' as any)
    .insert({
      user_id: uid,
      return_number: returnNumber,
      return_date: input.return_date || new Date().toISOString().split('T')[0],
      bill_id: (bill as any).id,
      bill_number: (bill as any).bill_number,
      vendor_id: (bill as any).vendor_id ?? null,
      vendor_name: (bill as any).vendor_name,
      vendor_email: (bill as any).vendor_email ?? null,
      vendor_gst: (bill as any).vendor_gst_number ?? null,
      vendor_address: (bill as any).vendor_address ?? null,
      return_type: returnType,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      outcome: input.outcome ?? 'adjustment',
      status: 'draft',
      intra_state: true,
    })
    .select()
    .single();
  if (hErr || !header) throw hErr || new Error('Failed to create purchase return');

  const itemRows = input.items.map((it) => {
    const amount = Number((it.quantity * it.rate).toFixed(2));
    const gstAmount = Number((amount * (it.gst_rate || 0) / 100).toFixed(2));
    return {
      user_id: uid,
      return_id: (header as any).id,
      product_id: it.product_id,
      product_name: it.product_name,
      hsn_sac: it.hsn_sac ?? null,
      quantity: it.quantity,
      rate: it.rate,
      amount,
      gst_rate: it.gst_rate,
      gst_amount: gstAmount,
      total_amount: Number((amount + gstAmount).toFixed(2)),
      uom: it.uom ?? 'pcs',
      condition: it.condition,
      bill_line_key: it.bill_line_key ?? null,
      notes: it.notes ?? null,
    };
  });

  const { error: itemErr } = await supabase.from('purchase_return_items' as any).insert(itemRows);
  if (itemErr) {
    await supabase.from('purchase_returns' as any).delete().eq('id', (header as any).id);
    throw itemErr;
  }

  const { data: refreshed } = await supabase
    .from('purchase_returns' as any)
    .select('*')
    .eq('id', (header as any).id)
    .single();
  return refreshed as PurchaseReturnRow;
};

/**
 * Approve a draft purchase return:
 *   - Insert inventory movement (quantity_out, value_out) using average_cost
 *   - Auto-issue debit note linked to the return
 *   - Post debit note journal (Dr AP, Cr Purchase Returns + Cr ITC reversal)
 *   - Post inventory ledger reversal (Dr Purchase Returns, Cr Inventory) — only
 *     when the bill carried inventory (i.e. inventory was added on purchase).
 *   - If outcome='adjustment' and bill has outstanding balance, allocate the
 *     debit note against the bill via allocate_payment_to_bills RPC.
 */
export const approvePurchaseReturn = async (
  userId: string,
  returnId: string,
  opts: { approvedBy?: string } = {},
): Promise<PurchaseReturnRow> => {
  const uid = normalizeUserId(userId);

  const { data: header, error: hErr } = await supabase
    .from('purchase_returns' as any)
    .select('*')
    .eq('id', returnId)
    .eq('user_id', uid)
    .single();
  if (hErr || !header) throw hErr || new Error('Purchase return not found');
  if ((header as any).status !== 'draft') {
    throw new Error(`Cannot approve return with status '${(header as any).status}'.`);
  }

  const { data: items, error: iErr } = await supabase
    .from('purchase_return_items' as any)
    .select('*')
    .eq('return_id', returnId)
    .eq('user_id', uid);
  if (iErr) throw iErr;
  if (!items || items.length === 0) {
    throw new Error('Cannot approve an empty purchase return.');
  }

  const itemsRows = items as any[];
  const productIds = itemsRows.map((r) => r.product_id).filter(Boolean);
  const avgCostByPid = await getInventoryAverageCost(uid, productIds);
  const warehouseId = await ensureDefaultWarehouse(uid);

  // 1. Inventory outward (purchase_return) — reduces stock + valuation.
  let inventoryReduced = 0;
  for (const it of itemsRows) {
    if (!it.product_id) continue;
    const unitCost = avgCostByPid[it.product_id] ?? Number(it.rate || 0);
    const valueOut = Number((unitCost * Number(it.quantity)).toFixed(2));
    if (valueOut <= 0) continue;
    inventoryReduced += valueOut;

    await supabase.from('inventory_movements' as any).insert({
      user_id: uid,
      item_id: it.product_id,
      warehouse_id: warehouseId,
      movement_type: 'purchase_return',
      source_type: 'purchase_return',
      source_id: (header as any).id,
      source_number: (header as any).return_number,
      party_id: (header as any).vendor_id,
      party_name: (header as any).vendor_name,
      movement_date: (header as any).return_date,
      quantity_out: it.quantity,
      unit_cost: unitCost,
      value_out: valueOut,
      notes: `Return to vendor ${(header as any).return_number} — ${it.product_name}`,
    });
  }

  // 2. Auto-issue Debit Note.
  const debitNoteNumber = await nextDebitNoteNumber(uid);
  const { data: debitNote, error: dnErr } = await supabase
    .from('debit_notes' as any)
    .insert({
      user_id: uid,
      debit_note_number: debitNoteNumber,
      original_bill_id: (header as any).bill_id,
      vendor_id: (header as any).vendor_id,
      vendor_name: (header as any).vendor_name,
      vendor_email: (header as any).vendor_email,
      vendor_gst_number: (header as any).vendor_gst,
      vendor_address: (header as any).vendor_address,
      amount: (header as any).subtotal,
      gst_amount: (header as any).gst_amount,
      total_amount: (header as any).total_amount,
      debit_note_date: (header as any).return_date,
      reason: (header as any).reason || `Purchase return ${(header as any).return_number}`,
      items: itemsRows.map((it) => ({
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: it.quantity,
        rate: it.rate,
        amount: it.amount,
        gst_rate: it.gst_rate,
        gst_amount: it.gst_amount,
        condition: it.condition,
      })),
      status: 'issued',
      return_id: (header as any).id,
      outcome: (header as any).outcome,
      utilized_amount: 0,
      intra_state: (header as any).intra_state,
      cgst_amount: (header as any).cgst_amount,
      sgst_amount: (header as any).sgst_amount,
      igst_amount: (header as any).igst_amount,
      place_of_supply: (header as any).place_of_supply,
    })
    .select()
    .single();
  if (dnErr || !debitNote) throw dnErr || new Error('Failed to create debit note');

  // 3. Post debit-note journal: Dr AP, Cr Purchase Returns + Cr ITC reversal.
  await postDebitNote(uid, {
    debit_note_id: (debitNote as any).id,
    debit_note_number: (debitNote as any).debit_note_number,
    debit_note_date: (debitNote as any).debit_note_date,
    vendor_name: (header as any).vendor_name,
    vendor_id: (header as any).vendor_id ?? undefined,
    original_bill_number: (header as any).bill_number,
    amount: (header as any).subtotal,
    gst_amount: (header as any).gst_amount,
    total_amount: (header as any).total_amount,
    gst_split: (header as any).intra_state
      ? { cgst: (header as any).cgst_amount, sgst: (header as any).sgst_amount }
      : { igst: (header as any).igst_amount },
  });

  // 4. Inventory ledger reversal for inventory value going back to vendor.
  if (inventoryReduced > 0) {
    await postPurchaseInventoryReversal(uid, {
      return_id: (header as any).id,
      document_number: (header as any).return_number,
      date: (header as any).return_date,
      vendor_name: (header as any).vendor_name,
      vendor_id: (header as any).vendor_id ?? undefined,
      inventory_value: inventoryReduced,
    });
  }

  // 5. If outcome='adjustment' and bill has outstanding, settle against bill.
  if ((header as any).outcome === 'adjustment') {
    const { data: bill } = await supabase
      .from('purchase_bills')
      .select('id, total_amount, paid_amount')
      .eq('id', (header as any).bill_id)
      .eq('user_id', uid)
      .single();
    if (bill) {
      const outstanding = Math.max(
        Number((bill as any).total_amount) - Number((bill as any).paid_amount || 0),
        0,
      );
      const applyAmount = Math.min(outstanding, Number((header as any).total_amount));
      if (applyAmount > 0) {
        await supabase.rpc('allocate_payment_to_bills', {
          p_user_id: uid,
          p_source_type: 'debit_note',
          p_source_id: (debitNote as any).id,
          p_vendor_id: (header as any).vendor_id ?? null,
          p_allocations: [{ bill_id: (header as any).bill_id, amount: applyAmount }],
          p_date: (header as any).return_date,
        });
      }
    }
  }

  // 6. Finalize the header.
  const { data: updated } = await supabase
    .from('purchase_returns' as any)
    .update({
      status: 'approved',
      debit_note_id: (debitNote as any).id,
      inventory_reduced: Number(inventoryReduced.toFixed(2)),
      approved_at: new Date().toISOString(),
      approved_by: opts.approvedBy ?? null,
    })
    .eq('id', (header as any).id)
    .select()
    .single();
  return updated as PurchaseReturnRow;
};

export const cancelPurchaseReturn = async (
  userId: string,
  returnId: string,
): Promise<void> => {
  const uid = normalizeUserId(userId);
  const { data: header } = await supabase
    .from('purchase_returns' as any)
    .select('status')
    .eq('id', returnId)
    .eq('user_id', uid)
    .single();
  if (!header) throw new Error('Purchase return not found');
  if ((header as any).status === 'approved') {
    throw new Error('Approved returns cannot be cancelled. Reverse the linked journals instead.');
  }
  await supabase
    .from('purchase_returns' as any)
    .update({ status: 'cancelled' })
    .eq('id', returnId)
    .eq('user_id', uid);
};

export const listPurchaseReturns = async (
  userId: string,
  opts: { billId?: string; status?: PurchaseReturnStatus } = {},
): Promise<PurchaseReturnRow[]> => {
  const uid = normalizeUserId(userId);
  let q = supabase
    .from('purchase_returns' as any)
    .select('*')
    .eq('user_id', uid)
    .order('return_date', { ascending: false });
  if (opts.billId) q = q.eq('bill_id', opts.billId);
  if (opts.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as PurchaseReturnRow[];
};

export const getPurchaseReturnWithItems = async (
  userId: string,
  returnId: string,
): Promise<{ header: PurchaseReturnRow; items: any[] }> => {
  const uid = normalizeUserId(userId);
  const [{ data: header }, { data: items }] = await Promise.all([
    supabase.from('purchase_returns' as any).select('*').eq('id', returnId).eq('user_id', uid).single(),
    supabase.from('purchase_return_items' as any).select('*').eq('return_id', returnId).eq('user_id', uid),
  ]);
  return { header: header as PurchaseReturnRow, items: items || [] };
};

export const getReturnedQuantitiesByBill = async (
  userId: string,
  billId: string,
): Promise<Record<string, number>> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('purchase_return_items' as any)
    .select('product_id, quantity, purchase_returns!inner(bill_id, status)')
    .eq('user_id', uid)
    .eq('purchase_returns.bill_id', billId)
    .neq('purchase_returns.status', 'cancelled');
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const row of (data as any[]) || []) {
    const pid = row.product_id;
    if (!pid) continue;
    out[pid] = (out[pid] || 0) + Number(row.quantity || 0);
  }
  return out;
};
