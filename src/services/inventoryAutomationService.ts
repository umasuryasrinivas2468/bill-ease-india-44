import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { postCogsJournal, postInventoryAdjustmentJournal } from '@/utils/autoJournalEntry';

type ValuationMethod = 'average' | 'fifo';
type NegativeStockPolicy = 'block' | 'warn' | 'allow';
type MovementType = 'opening' | 'purchase' | 'sale' | 'sales_return' | 'purchase_return' | 'adjustment_in' | 'adjustment_out';

type InventoryLine = {
  itemId: string;
  description: string;
  quantity: number;
  unitCost: number;
  amount: number;
  batchNumber?: string | null;
  expiryDate?: string | null;
};

type InventorySettings = {
  valuation_method: ValuationMethod;
  negative_stock_policy: NegativeStockPolicy;
};

const isTaxMeta = (line: any) => Boolean(line?.__tax_meta);

const getLineItemId = (line: any): string | null =>
  line?.product_id || line?.inventory_item_id || line?.item_id || null;

const getLineDescription = (line: any): string =>
  line?.description || line?.item_details || line?.product_name || line?.name || 'Inventory item';

const getLineQuantity = (line: any): number =>
  Number(line?.quantity ?? line?.qty ?? 0) || 0;

const getLineRate = (line: any): number =>
  Number(line?.unit_cost ?? line?.purchase_price ?? line?.rate ?? line?.price ?? 0) || 0;

const getLineAmount = (line: any): number => {
  const explicit = Number(line?.amount ?? line?.total);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return getLineQuantity(line) * getLineRate(line);
};

export const extractInventoryLines = (items: any[] = []): InventoryLine[] =>
  items
    .filter((line) => line && !isTaxMeta(line))
    .map((line) => {
      const quantity = getLineQuantity(line);
      const amount = getLineAmount(line);
      const unitCost = getLineRate(line) || (quantity > 0 ? amount / quantity : 0);

      return {
        itemId: getLineItemId(line) || '',
        description: getLineDescription(line),
        quantity,
        unitCost,
        amount,
        batchNumber: line?.batch_number || line?.batchNumber || null,
        expiryDate: line?.expiry_date || line?.expiryDate || null,
      };
    })
    .filter((line) => line.itemId && line.quantity > 0);

const getInventorySettings = async (userId: string): Promise<InventorySettings> => {
  const { data } = await supabase
    .from('inventory_settings' as any)
    .select('valuation_method, negative_stock_policy')
    .eq('user_id', userId)
    .maybeSingle();

  return {
    valuation_method: (data?.valuation_method as ValuationMethod) || 'average',
    negative_stock_policy: (data?.negative_stock_policy as NegativeStockPolicy) || 'block',
  };
};

const ensureDefaultWarehouse = async (userId: string): Promise<string | null> => {
  const { data: existing } = await supabase
    .from('warehouses' as any)
    .select('id')
    .eq('user_id', userId)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from('warehouses' as any)
    .insert({ user_id: userId, name: 'Main Warehouse', code: 'MAIN', is_default: true })
    .select('id')
    .single();

  if (error) {
    console.warn('Default warehouse could not be created, continuing without warehouse:', error);
    return null;
  }

  return created.id;
};

const clearSourceMovements = async (userId: string, sourceType: string, sourceId: string) => {
  await supabase
    .from('inventory_movements' as any)
    .delete()
    .eq('user_id', userId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId);
};

const postInward = async (
  userId: string,
  line: InventoryLine,
  context: {
    sourceType: string;
    sourceId: string;
    sourceNumber: string;
    partyId?: string | null;
    partyName?: string | null;
    date: string;
    movementType?: MovementType;
    warehouseId?: string | null;
    valuationMethod: ValuationMethod;
  }
) => {
  const { data: item, error: itemError } = await supabase
    .from('inventory')
    .select('id, type')
    .eq('id', line.itemId)
    .eq('user_id', userId)
    .maybeSingle();

  if (itemError) throw itemError;
  if (!item || item.type !== 'goods') return 0;

  const valueIn = Number((line.quantity * line.unitCost).toFixed(2));
  let batchId: string | null = null;

  const { data: batch } = await supabase
    .from('inventory_batches' as any)
    .insert({
      user_id: userId,
      item_id: line.itemId,
      warehouse_id: context.warehouseId,
      batch_number: line.batchNumber,
      expiry_date: line.expiryDate,
      quantity_on_hand: line.quantity,
      unit_cost: line.unitCost,
      remaining_value: valueIn,
      source_type: context.sourceType,
      source_id: context.sourceId,
    })
    .select('id')
    .single();

  batchId = batch?.id || null;

  const { error } = await supabase.from('inventory_movements' as any).insert({
    user_id: userId,
    item_id: line.itemId,
    warehouse_id: context.warehouseId,
    batch_id: batchId,
    movement_type: context.movementType || 'purchase',
    source_type: context.sourceType,
    source_id: context.sourceId,
    source_number: context.sourceNumber,
    party_id: context.partyId || null,
    party_name: context.partyName || null,
    movement_date: context.date,
    quantity_in: line.quantity,
    unit_cost: line.unitCost,
    value_in: valueIn,
    valuation_method: context.valuationMethod,
    notes: line.description,
  });

  if (error) throw error;
  return valueIn;
};

const postOutward = async (
  userId: string,
  line: InventoryLine,
  context: {
    sourceType: string;
    sourceId: string;
    sourceNumber: string;
    partyName?: string | null;
    date: string;
    movementType?: MovementType;
    warehouseId?: string | null;
    valuationMethod: ValuationMethod;
    negativeStockPolicy: NegativeStockPolicy;
  }
) => {
  const { data: item, error: itemError } = await supabase
    .from('inventory')
    .select('id, type, product_name, stock_quantity, average_cost, purchase_price')
    .eq('id', line.itemId)
    .eq('user_id', userId)
    .maybeSingle();

  if (itemError) throw itemError;
  if (!item || item.type !== 'goods') return 0;

  const available = Number(item.stock_quantity || 0);
  if (available < line.quantity && context.negativeStockPolicy === 'block') {
    throw new Error(`Insufficient stock for ${item.product_name}. Available: ${available}, required: ${line.quantity}.`);
  }

  let remainingQty = line.quantity;
  let totalValueOut = 0;

  if (context.valuationMethod === 'fifo') {
    const { data: batches } = await supabase
      .from('inventory_batches' as any)
      .select('id, quantity_on_hand, unit_cost, remaining_value')
      .eq('user_id', userId)
      .eq('item_id', line.itemId)
      .gt('quantity_on_hand', 0)
      .order('received_date', { ascending: true })
      .order('created_at', { ascending: true });

    for (const batch of batches || []) {
      if (remainingQty <= 0) break;
      const takeQty = Math.min(remainingQty, Number(batch.quantity_on_hand || 0));
      const unitCost = Number(batch.unit_cost || 0);
      const valueOut = Number((takeQty * unitCost).toFixed(2));
      remainingQty -= takeQty;
      totalValueOut += valueOut;

      await supabase
        .from('inventory_batches' as any)
        .update({
          quantity_on_hand: Number(batch.quantity_on_hand || 0) - takeQty,
          remaining_value: Math.max(0, Number(batch.remaining_value || 0) - valueOut),
        })
        .eq('id', batch.id);

      const { error } = await supabase.from('inventory_movements' as any).insert({
        user_id: userId,
        item_id: line.itemId,
        warehouse_id: context.warehouseId,
        batch_id: batch.id,
        movement_type: context.movementType || 'sale',
        source_type: context.sourceType,
        source_id: context.sourceId,
        source_number: context.sourceNumber,
        party_name: context.partyName || null,
        movement_date: context.date,
        quantity_out: takeQty,
        unit_cost: unitCost,
        value_out: valueOut,
        cogs_amount: valueOut,
        valuation_method: context.valuationMethod,
        notes: line.description,
      });
      if (error) throw error;
    }
  }

  if (remainingQty > 0) {
    const unitCost = Number(item.average_cost || item.purchase_price || line.unitCost || 0);
    const valueOut = Number((remainingQty * unitCost).toFixed(2));
    totalValueOut += valueOut;

    const { error } = await supabase.from('inventory_movements' as any).insert({
      user_id: userId,
      item_id: line.itemId,
      warehouse_id: context.warehouseId,
      movement_type: context.movementType || 'sale',
      source_type: context.sourceType,
      source_id: context.sourceId,
      source_number: context.sourceNumber,
      party_name: context.partyName || null,
      movement_date: context.date,
      quantity_out: remainingQty,
      unit_cost: unitCost,
      value_out: valueOut,
      cogs_amount: valueOut,
      valuation_method: context.valuationMethod,
      notes: line.description,
    });
    if (error) throw error;
  }

  return Number(totalValueOut.toFixed(2));
};

export const processPurchaseBillInventory = async (
  userId: string,
  bill: {
    id: string;
    bill_number: string;
    bill_date: string;
    vendor_id?: string | null;
    vendor_name?: string | null;
    items: any[];
    source_type?: string;
  }
) => {
  const uid = normalizeUserId(userId);
  const settings = await getInventorySettings(uid);
  const warehouseId = await ensureDefaultWarehouse(uid);
  const lines = extractInventoryLines(bill.items);

  const sourceType = bill.source_type || 'purchase_bill';
  await clearSourceMovements(uid, sourceType, bill.id);

  let inventoryAmount = 0;
  for (const line of lines) {
    inventoryAmount += await postInward(uid, line, {
      sourceType,
      sourceId: bill.id,
      sourceNumber: bill.bill_number,
      partyId: bill.vendor_id || null,
      partyName: bill.vendor_name || null,
      date: bill.bill_date,
      warehouseId,
      valuationMethod: settings.valuation_method,
    });
  }

  return { inventoryAmount, movementCount: lines.length };
};

export const processSalesInventory = async (
  userId: string,
  sale: {
    id: string;
    document_number: string;
    date: string;
    party_name?: string | null;
    items: any[];
    source_type?: string;
  },
  options: { postCogs?: boolean } = {}
) => {
  const uid = normalizeUserId(userId);
  const settings = await getInventorySettings(uid);
  const warehouseId = await ensureDefaultWarehouse(uid);
  const lines = extractInventoryLines(sale.items);
  const sourceType = sale.source_type || 'invoice';

  await clearSourceMovements(uid, sourceType, sale.id);

  let cogsAmount = 0;
  for (const line of lines) {
    cogsAmount += await postOutward(uid, line, {
      sourceType,
      sourceId: sale.id,
      sourceNumber: sale.document_number,
      partyName: sale.party_name || null,
      date: sale.date,
      warehouseId,
      valuationMethod: settings.valuation_method,
      negativeStockPolicy: settings.negative_stock_policy,
    });
  }

  if (options.postCogs !== false && cogsAmount > 0) {
    await postCogsJournal(uid, {
      document_number: sale.document_number,
      date: sale.date,
      party_name: sale.party_name || 'Customer',
      cogs_amount: cogsAmount,
    });
  }

  return { cogsAmount, movementCount: lines.length };
};

export const postStockAdjustment = async (
  userId: string,
  adjustment: {
    item_id: string;
    item_name: string;
    quantity_delta: number;
    unit_cost?: number;
    date?: string;
    reason?: string;
    source_type?: string;
    source_id?: string;
    adjustment_number?: string;
    postJournal?: boolean;
  }
) => {
  const uid = normalizeUserId(userId);
  const settings = await getInventorySettings(uid);
  const warehouseId = await ensureDefaultWarehouse(uid);
  const quantityDelta = Number(adjustment.quantity_delta || 0);

  if (!quantityDelta) return { valueDelta: 0, movementCount: 0 };

  const { data: item, error: itemError } = await supabase
    .from('inventory')
    .select('id, type, product_name, stock_quantity, average_cost, purchase_price')
    .eq('id', adjustment.item_id)
    .eq('user_id', uid)
    .maybeSingle();

  if (itemError) throw itemError;
  if (!item || item.type !== 'goods') return { valueDelta: 0, movementCount: 0 };

  const date = adjustment.date || new Date().toISOString().split('T')[0];
  const sourceType = adjustment.source_type || (quantityDelta > 0 ? 'stock_adjustment_in' : 'stock_adjustment_out');
  const sourceId = adjustment.source_id || adjustment.item_id;
  const sourceNumber = adjustment.adjustment_number || `ADJ-${Date.now().toString().slice(-6)}`;
  const unitCost = Number(adjustment.unit_cost || item.average_cost || item.purchase_price || 0);

  if (quantityDelta > 0) {
    const valueIn = await postInward(uid, {
      itemId: adjustment.item_id,
      description: adjustment.reason || 'Stock adjustment',
      quantity: quantityDelta,
      unitCost,
      amount: quantityDelta * unitCost,
    }, {
      sourceType,
      sourceId,
      sourceNumber,
      partyName: 'Internal adjustment',
      date,
      movementType: adjustment.source_type === 'opening_stock' ? 'opening' : 'adjustment_in',
      warehouseId,
      valuationMethod: settings.valuation_method,
    });

    if (adjustment.postJournal !== false && valueIn > 0) {
      await postInventoryAdjustmentJournal(uid, {
        adjustment_number: sourceNumber,
        date,
        item_name: adjustment.item_name || item.product_name,
        quantity_delta: quantityDelta,
        value_delta: valueIn,
        reason: adjustment.reason || (adjustment.source_type === 'opening_stock' ? 'Opening stock' : 'Stock adjustment'),
      });
    }

    return { valueDelta: valueIn, movementCount: 1 };
  }

  const valueOut = await postOutward(uid, {
    itemId: adjustment.item_id,
    description: adjustment.reason || 'Stock adjustment',
    quantity: Math.abs(quantityDelta),
    unitCost,
    amount: Math.abs(quantityDelta) * unitCost,
  }, {
    sourceType,
    sourceId,
    sourceNumber,
    partyName: 'Internal adjustment',
    date,
    movementType: 'adjustment_out',
    warehouseId,
    valuationMethod: settings.valuation_method,
    negativeStockPolicy: settings.negative_stock_policy,
  });

  if (adjustment.postJournal !== false && valueOut > 0) {
    await postInventoryAdjustmentJournal(uid, {
      adjustment_number: sourceNumber,
      date,
      item_name: adjustment.item_name || item.product_name,
      quantity_delta: quantityDelta,
      value_delta: -valueOut,
      reason: adjustment.reason || 'Stock adjustment',
    });
  }

  return { valueDelta: -valueOut, movementCount: 1 };
};
