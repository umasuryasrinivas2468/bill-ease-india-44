import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import {
  postCreditNote,
  postCogsReversal,
  postInventoryAdjustment,
} from '@/utils/journalEngine';

// ════════════════════════════════════════════════════════════════════════════
// Sales Return orchestration.
//
//   createSalesReturn(...)   — writes draft sales_return + items
//   approveSalesReturn(id)   — full transition:
//                                  inventory_movements (sales_return)
//                                  credit_note auto-issue (+ journal)
//                                  COGS reversal journal
//                                  damaged/scrap write-off journal
//                                  AR allocation (outcome='adjustment')
//   cancelSalesReturn(id)    — only allowed on draft / pre-approval state
//
// All money flows through the journal engine — no direct ledger writes here.
// ════════════════════════════════════════════════════════════════════════════

export type ReturnCondition = 'restockable' | 'damaged' | 'scrap';
export type ReturnOutcome = 'refund' | 'adjustment' | 'replacement';
export type ReturnStatus = 'draft' | 'approved' | 'cancelled';

export interface SalesReturnInput {
  invoice_id: string;
  return_date?: string;            // defaults to today
  reason?: string;
  notes?: string;
  outcome?: ReturnOutcome;         // defaults to 'adjustment'
  items: Array<{
    product_id: string | null;
    product_name: string;
    hsn_sac?: string;
    quantity: number;
    rate: number;
    gst_rate: number;
    uom?: string;
    condition: ReturnCondition;
    invoice_line_key?: string;
    notes?: string;
  }>;
}

export interface SalesReturnRow {
  id: string;
  user_id: string;
  return_number: string;
  return_date: string;
  invoice_id: string;
  invoice_number: string;
  customer_id?: string | null;
  customer_name: string;
  customer_email?: string | null;
  customer_gst?: string | null;
  customer_address?: string | null;
  return_type: 'full' | 'partial' | 'item_wise';
  status: ReturnStatus;
  outcome: ReturnOutcome;
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
  credit_note_id?: string | null;
  cogs_reversed: number;
  approved_at?: string | null;
  approved_by?: string | null;
  created_at: string;
}

// ── helpers ────────────────────────────────────────────────────────────────

const nextReturnNumber = async (userId: string): Promise<string> => {
  const year = new Date().getFullYear();
  const prefix = `SR/${year}/`;
  const { data } = await supabase
    .from('sales_returns' as any)
    .select('return_number')
    .eq('user_id', userId)
    .like('return_number', `${prefix}%`)
    .order('return_number', { ascending: false })
    .limit(1);

  let seq = 1;
  if (data && data.length > 0) {
    const m = data[0].return_number.match(/\/(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

const nextCreditNoteNumber = async (userId: string): Promise<string> => {
  const year = new Date().getFullYear();
  const prefix = `CN/${year}/`;
  const { data } = await supabase
    .from('credit_notes' as any)
    .select('credit_note_number')
    .eq('user_id', userId)
    .like('credit_note_number', `${prefix}%`)
    .order('credit_note_number', { ascending: false })
    .limit(1);

  let seq = 1;
  if (data && data.length > 0) {
    const m = data[0].credit_note_number.match(/\/(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

const computeReturnType = (
  itemsReturned: SalesReturnInput['items'],
  invoiceItems: any[],
): 'full' | 'partial' | 'item_wise' => {
  // 'full' if every invoice line is being returned at its full quantity.
  const invoiceQtyByProduct = new Map<string, number>();
  for (const li of invoiceItems || []) {
    const pid = li?.product_id;
    if (!pid) continue;
    invoiceQtyByProduct.set(pid, (invoiceQtyByProduct.get(pid) || 0) + Number(li.quantity || 0));
  }
  const returnQtyByProduct = new Map<string, number>();
  for (const ri of itemsReturned) {
    if (!ri.product_id) continue;
    returnQtyByProduct.set(ri.product_id, (returnQtyByProduct.get(ri.product_id) || 0) + Number(ri.quantity || 0));
  }
  if (invoiceQtyByProduct.size === 0) return 'item_wise';

  let isFull = true;
  for (const [pid, sold] of invoiceQtyByProduct.entries()) {
    const returned = returnQtyByProduct.get(pid) || 0;
    if (Math.abs(returned - sold) > 0.0001) { isFull = false; break; }
  }
  if (isFull && returnQtyByProduct.size === invoiceQtyByProduct.size) return 'full';
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

/**
 * Create a draft sales return.  No financial effects until approveSalesReturn.
 */
export const createSalesReturn = async (
  userId: string,
  input: SalesReturnInput,
): Promise<SalesReturnRow> => {
  const uid = normalizeUserId(userId);

  // 1. Pull the invoice for snapshot fields + intra_state context.
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, client_name, client_email, client_gst_number, client_address, customer_id, items, items_with_product_id, intra_state, place_of_supply')
    .eq('id', input.invoice_id)
    .eq('user_id', uid)
    .single();
  if (invErr || !invoice) throw new Error(invErr?.message || 'Invoice not found');

  const invoiceItems = (invoice as any).items_with_product_id?.length
    ? (invoice as any).items_with_product_id
    : (invoice as any).items ?? [];

  const returnType = computeReturnType(input.items, invoiceItems);

  // 2. Header insert.
  const returnNumber = await nextReturnNumber(uid);
  const { data: header, error: hErr } = await supabase
    .from('sales_returns' as any)
    .insert({
      user_id: uid,
      return_number: returnNumber,
      return_date: input.return_date || new Date().toISOString().split('T')[0],
      invoice_id: invoice.id,
      invoice_number: (invoice as any).invoice_number,
      customer_id: (invoice as any).customer_id ?? null,
      customer_name: (invoice as any).client_name,
      customer_email: (invoice as any).client_email ?? null,
      customer_gst: (invoice as any).client_gst_number ?? null,
      customer_address: (invoice as any).client_address ?? null,
      return_type: returnType,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      outcome: input.outcome ?? 'adjustment',
      status: 'draft',
      intra_state: (invoice as any).intra_state ?? true,
      place_of_supply: (invoice as any).place_of_supply ?? null,
    })
    .select()
    .single();
  if (hErr || !header) throw hErr || new Error('Failed to create sales return');

  // 3. Item inserts. The check_sales_return_quantity trigger will enforce
  //    that we don't exceed the original invoice quantity.
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
      invoice_line_key: it.invoice_line_key ?? null,
      notes: it.notes ?? null,
    };
  });

  const { error: itemErr } = await supabase.from('sales_return_items' as any).insert(itemRows);
  if (itemErr) {
    // Roll back the header — items couldn't all insert (qty validation, etc).
    await supabase.from('sales_returns' as any).delete().eq('id', (header as any).id);
    throw itemErr;
  }

  // 4. Re-fetch the header to pick up roll-up totals.
  const { data: refreshed } = await supabase
    .from('sales_returns' as any)
    .select('*')
    .eq('id', (header as any).id)
    .single();
  return refreshed as SalesReturnRow;
};

/**
 * Approve a draft sales return:
 *   - Insert inventory movements (restockable → in; damaged/scrap → no in).
 *   - Auto-issue credit note (with journal: Sales Returns Dr + GST Dr + AR Cr).
 *   - Post COGS reversal journal for restockable value.
 *   - Post damaged/scrap write-off journal (Inventory Adjustments Dr / COGS Cr).
 *   - If outcome='adjustment' and the invoice still has outstanding balance,
 *     allocate the credit against the invoice via ar_payment_allocations.
 */
export const approveSalesReturn = async (
  userId: string,
  returnId: string,
  opts: { approvedBy?: string } = {},
): Promise<SalesReturnRow> => {
  const uid = normalizeUserId(userId);

  const { data: header, error: hErr } = await supabase
    .from('sales_returns' as any)
    .select('*')
    .eq('id', returnId)
    .eq('user_id', uid)
    .single();
  if (hErr || !header) throw hErr || new Error('Sales return not found');
  if ((header as any).status !== 'draft') {
    throw new Error(`Cannot approve return with status '${(header as any).status}'.`);
  }

  const { data: items, error: iErr } = await supabase
    .from('sales_return_items' as any)
    .select('*')
    .eq('return_id', returnId)
    .eq('user_id', uid);
  if (iErr) throw iErr;
  if (!items || items.length === 0) {
    throw new Error('Cannot approve an empty sales return.');
  }

  const itemsRows = items as any[];
  const productIds = itemsRows.map((r) => r.product_id).filter(Boolean);
  const avgCostByPid = await getInventoryAverageCost(uid, productIds);
  const warehouseId = await ensureDefaultWarehouse(uid);

  // 1. Inventory movements + value bookkeeping
  let restockableValue = 0;
  let writeOffValue = 0;
  const writeOffItems: { name: string; value: number; condition: ReturnCondition }[] = [];

  for (const it of itemsRows) {
    const unitCost = it.product_id ? (avgCostByPid[it.product_id] ?? 0) : 0;
    const valueIn = Number((unitCost * Number(it.quantity)).toFixed(2));

    if (it.condition === 'restockable') {
      restockableValue += valueIn;

      // Stock back in. The refresh_inventory_rollup trigger updates
      // inventory.stock_quantity + stock_value automatically.
      if (it.product_id && unitCost > 0) {
        await supabase.from('inventory_movements' as any).insert({
          user_id: uid,
          item_id: it.product_id,
          warehouse_id: warehouseId,
          movement_type: 'sales_return',
          source_type: 'sales_return',
          source_id: (header as any).id,
          source_number: (header as any).return_number,
          party_name: (header as any).customer_name,
          movement_date: (header as any).return_date,
          quantity_in: it.quantity,
          unit_cost: unitCost,
          value_in: valueIn,
          notes: `Restock from return ${(header as any).return_number} — ${it.product_name}`,
        });
      }
    } else {
      // damaged / scrap → do NOT restore physical stock, but still need to
      // reverse the original COGS and book the loss to Inventory Adjustments.
      writeOffValue += valueIn;
      if (valueIn > 0) {
        writeOffItems.push({ name: it.product_name, value: valueIn, condition: it.condition });
      }
    }
  }

  // 2. Auto-issue Credit Note.
  const creditNoteNumber = await nextCreditNoteNumber(uid);
  const { data: creditNote, error: cnErr } = await supabase
    .from('credit_notes' as any)
    .insert({
      user_id: uid,
      credit_note_number: creditNoteNumber,
      original_invoice_id: (header as any).invoice_id,
      client_name: (header as any).customer_name,
      client_email: (header as any).customer_email,
      client_gst_number: (header as any).customer_gst,
      client_address: (header as any).customer_address,
      amount: (header as any).subtotal,
      gst_amount: (header as any).gst_amount,
      total_amount: (header as any).total_amount,
      credit_note_date: (header as any).return_date,
      reason: (header as any).reason || `Sales return ${(header as any).return_number}`,
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
      customer_id: (header as any).customer_id,
      return_id: (header as any).id,
      outcome: (header as any).outcome,
      utilized_amount: 0,
    })
    .select()
    .single();
  if (cnErr || !creditNote) throw cnErr || new Error('Failed to create credit note');

  // 3. Post credit-note journal: Sales Returns Dr + GST Dr + AR Cr.
  await postCreditNote(uid, {
    credit_note_id: (creditNote as any).id,
    credit_note_number: (creditNote as any).credit_note_number,
    credit_note_date: (creditNote as any).credit_note_date,
    client_name: (header as any).customer_name,
    customer_id: (header as any).customer_id ?? undefined,
    original_invoice_number: (header as any).invoice_number,
    amount: (header as any).subtotal,
    gst_amount: (header as any).gst_amount,
    total_amount: (header as any).total_amount,
    gst_split: (header as any).intra_state
      ? { cgst: (header as any).cgst_amount, sgst: (header as any).sgst_amount }
      : { igst: (header as any).igst_amount },
  });

  // 4. COGS reversal — for the FULL cost basis of returned goods (restockable
  //    + damaged + scrap). Journal: Dr Inventory, Cr COGS. The P&L credit a
  //    customer receives must be offset by reversing the original cost.
  const totalCogsReversal = restockableValue + writeOffValue;
  if (totalCogsReversal > 0) {
    await postCogsReversal(uid, {
      return_id: (header as any).id,
      document_number: (header as any).return_number,
      date: (header as any).return_date,
      party_name: (header as any).customer_name,
      cogs_amount: totalCogsReversal,
      customer_id: (header as any).customer_id ?? undefined,
    });
  }

  // 5. Damaged / scrap → write-off journal (Dr Inventory Adjustments,
  //    Cr Inventory). The COGS reversal in step 4 brought inventory back up
  //    on the ledger; this immediately writes it back down with the loss
  //    booked to Inventory Adjustments. (No inventory_movement is created
  //    for damaged/scrap, so the subledger stays unchanged.)
  for (const wo of writeOffItems) {
    await postInventoryAdjustment(uid, {
      adjustment_id: `${(header as any).id}:${wo.name}`.slice(0, 36),
      adjustment_number: `${(header as any).return_number}-${wo.condition.toUpperCase()}`,
      date: (header as any).return_date,
      item_name: wo.name,
      value_delta: -wo.value,
      reason: `Sales return — ${wo.condition} write-off`,
    });
  }

  // 6. If outcome='adjustment' and invoice has outstanding balance, allocate
  //    the credit against the invoice automatically.
  let appliedToInvoice = 0;
  if ((header as any).outcome === 'adjustment') {
    const { data: inv } = await supabase
      .from('invoices')
      .select('id, total_amount, paid_amount')
      .eq('id', (header as any).invoice_id)
      .eq('user_id', uid)
      .single();
    if (inv) {
      const outstanding = Math.max(
        Number((inv as any).total_amount) - Number((inv as any).paid_amount || 0),
        0,
      );
      appliedToInvoice = Math.min(outstanding, Number((header as any).total_amount));
      if (appliedToInvoice > 0) {
        await supabase.rpc('allocate_payment_to_invoices', {
          p_user_id: uid,
          p_source_type: 'credit_note',
          p_source_id: (creditNote as any).id,
          p_customer_id: (header as any).customer_id ?? null,
          p_allocations: [{ invoice_id: (header as any).invoice_id, amount: appliedToInvoice }],
          p_date: (header as any).return_date,
        });
      }
    }
  }

  // 7. Finalize the header.
  const { data: updated } = await supabase
    .from('sales_returns' as any)
    .update({
      status: 'approved',
      credit_note_id: (creditNote as any).id,
      cogs_reversed: Number((restockableValue + writeOffValue).toFixed(2)),
      approved_at: new Date().toISOString(),
      approved_by: opts.approvedBy ?? null,
    })
    .eq('id', (header as any).id)
    .select()
    .single();
  return updated as SalesReturnRow;
};

/**
 * Cancel a draft sales return. Approved returns must be reversed via a
 * separate flow (reverseJournal on each linked journal) — not exposed here.
 */
export const cancelSalesReturn = async (
  userId: string,
  returnId: string,
): Promise<void> => {
  const uid = normalizeUserId(userId);
  const { data: header } = await supabase
    .from('sales_returns' as any)
    .select('status')
    .eq('id', returnId)
    .eq('user_id', uid)
    .single();
  if (!header) throw new Error('Sales return not found');
  if ((header as any).status === 'approved') {
    throw new Error('Approved returns cannot be cancelled. Reverse the linked journals instead.');
  }
  await supabase
    .from('sales_returns' as any)
    .update({ status: 'cancelled' })
    .eq('id', returnId)
    .eq('user_id', uid);
};

/**
 * List sales returns for the current user. Optional filter by invoice.
 */
export const listSalesReturns = async (
  userId: string,
  opts: { invoiceId?: string; status?: ReturnStatus } = {},
): Promise<SalesReturnRow[]> => {
  const uid = normalizeUserId(userId);
  let q = supabase
    .from('sales_returns' as any)
    .select('*')
    .eq('user_id', uid)
    .order('return_date', { ascending: false });
  if (opts.invoiceId) q = q.eq('invoice_id', opts.invoiceId);
  if (opts.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as SalesReturnRow[];
};

export const getSalesReturnWithItems = async (
  userId: string,
  returnId: string,
): Promise<{ header: SalesReturnRow; items: any[] }> => {
  const uid = normalizeUserId(userId);
  const [{ data: header }, { data: items }] = await Promise.all([
    supabase.from('sales_returns' as any).select('*').eq('id', returnId).eq('user_id', uid).single(),
    supabase.from('sales_return_items' as any).select('*').eq('return_id', returnId).eq('user_id', uid),
  ]);
  return { header: header as SalesReturnRow, items: items || [] };
};

/**
 * Compute the per-product quantity already returned for a given invoice,
 * so the UI can pre-fill remaining returnable quantities.
 */
export const getReturnedQuantitiesByInvoice = async (
  userId: string,
  invoiceId: string,
): Promise<Record<string, number>> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('sales_return_items' as any)
    .select('product_id, quantity, sales_returns!inner(invoice_id, status)')
    .eq('user_id', uid)
    .eq('sales_returns.invoice_id', invoiceId)
    .neq('sales_returns.status', 'cancelled');
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const row of (data as any[]) || []) {
    const pid = row.product_id;
    if (!pid) continue;
    out[pid] = (out[pid] || 0) + Number(row.quantity || 0);
  }
  return out;
};
