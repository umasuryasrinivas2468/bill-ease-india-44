// ════════════════════════════════════════════════════════════════════════════
// Inventory → Fixed Asset Conversion (Module 23, Phase 9)
//
// Transfers N units of an inventory item out of stock and capitalizes them
// as one fixed asset. Used when a unit originally meant for resale is kept
// for in-house use (e.g. laptop in stock → office laptop).
//
// Flow:
//   1. Validate inventory has >= qty in stock.
//   2. Read average_cost to fix the conversion value (qty × avg_cost).
//   3. Insert inventory_movements (movement_type='adjustment_out',
//      source_type='asset_conversion'). The DB trigger
//      `inventory_movement_refresh_rollup` decrements stock_quantity and
//      recomputes stock_value automatically — no manual update needed.
//   4. Create fixed_assets row via createFixedAsset(post_journal=false),
//      tagged with source_type='inventory' + source_inventory_item_id/qty.
//   5. Post a single conversion journal:
//        Dr Fixed Asset — <asset_code> — <name>
//        Cr Inventory Asset
//      (no GST leg — GST was already booked on the original purchase bill).
//   6. Patch the asset with `source_inventory_movement_id` and
//      `reclassification_journal_id` for traceability.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import {
  getOrCreateAccount,
  postJournal,
  STANDARD_ACCOUNTS,
  type JournalLineInput,
} from '@/utils/journalEngine';
import type {
  CreateAssetInput,
  FixedAsset,
  DepreciationMethod,
} from '@/types/fixedAssets';
import { createFixedAsset } from './fixedAssetService';

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

// ── Public shapes ──────────────────────────────────────────────────────────
export interface InventoryItemSnapshot {
  id: string;
  product_name: string;
  sku?: string | null;
  unit?: string | null;
  stock_quantity: number;
  average_cost: number;
  stock_value: number;
}

export interface ConvertInventoryToAssetInput {
  item_id: string;
  quantity: number;
  conversion_date?: string;          // defaults to today
  asset_name?: string;               // defaults to item.product_name
  asset_description?: string;
  category_id?: string;
  useful_life_years?: number;
  depreciation_method?: DepreciationMethod;
  depreciation_rate?: number;
  salvage_value?: number;
  location?: string;
  branch_id?: string;
  cost_center_id?: string;
  custodian?: string;
  serial_number?: string;
  notes?: string;
  /** Override the unit cost (defaults to inventory.average_cost). Used when the
   *  user wants to value the conversion at a specific batch cost. */
  unit_cost_override?: number;
  warehouse_id?: string;
}

export interface ConvertInventoryToAssetResult {
  asset: FixedAsset;
  movement_id: string;
  conversion_journal_id: string;
  capitalized_value: number;
  schedule_rows: number;
}

// ── Public reads ───────────────────────────────────────────────────────────
export const getInventoryItemSnapshot = async (
  userId: string,
  itemId: string,
): Promise<InventoryItemSnapshot | null> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('inventory' as any)
    .select('id, product_name, sku, unit, stock_quantity, average_cost, stock_value')
    .eq('user_id', uid)
    .eq('id', itemId)
    .maybeSingle();
  if (error) throw error;
  return (data as InventoryItemSnapshot) || null;
};

// ── Main conversion ────────────────────────────────────────────────────────
export const convertInventoryToAsset = async (
  userId: string,
  input: ConvertInventoryToAssetInput,
): Promise<ConvertInventoryToAssetResult> => {
  const uid = normalizeUserId(userId);
  const qty = Number(input.quantity || 0);
  if (qty <= 0) throw new Error('Quantity must be greater than zero.');

  const item = await getInventoryItemSnapshot(uid, input.item_id);
  if (!item) throw new Error('Inventory item not found.');

  const availableQty = Number(item.stock_quantity || 0);
  if (availableQty < qty) {
    throw new Error(
      `Insufficient stock — only ${availableQty} ${item.unit || 'units'} of ${item.product_name} available.`,
    );
  }

  const unitCost = round4(
    input.unit_cost_override != null
      ? Number(input.unit_cost_override)
      : Number(item.average_cost || 0),
  );
  const capitalizedValue = round2(unitCost * qty);
  if (capitalizedValue <= 0) {
    throw new Error('Conversion value is zero — item has no average cost. Set unit_cost_override.');
  }

  const conversionDate = input.conversion_date || new Date().toISOString().slice(0, 10);

  // 1. Insert the stock-out movement first. The rollup trigger updates
  //    inventory.stock_quantity + stock_value atomically.
  const { data: movementRow, error: mErr } = await supabase
    .from('inventory_movements' as any)
    .insert({
      user_id: uid,
      item_id: item.id,
      warehouse_id: input.warehouse_id || null,
      movement_type: 'adjustment_out',
      source_type: 'asset_conversion',
      source_id: null,
      source_number: null,
      movement_date: conversionDate,
      quantity_out: qty,
      unit_cost: unitCost,
      value_out: capitalizedValue,
      notes: `Converted to fixed asset — ${input.asset_name || item.product_name}`,
    })
    .select('id')
    .single();
  if (mErr) throw mErr;
  const movementId = (movementRow as any).id as string;

  // 2. Create the fixed_assets row (per-asset COA accounts + schedule, but
  //    no purchase journal — we post our own conversion journal below).
  const createInput: CreateAssetInput = {
    name: input.asset_name || item.product_name,
    description: input.asset_description || `Capitalized from inventory: ${item.product_name}${qty !== 1 ? ` (×${qty})` : ''}`,
    purchase_value: capitalizedValue,
    gst_amount: 0,  // GST was booked on original inward
    itc_eligible: true,
    purchase_date: conversionDate,
    category_id: input.category_id,
    useful_life_years: input.useful_life_years,
    depreciation_method: input.depreciation_method,
    depreciation_rate: input.depreciation_rate,
    salvage_value: input.salvage_value,
    location: input.location,
    branch_id: input.branch_id,
    cost_center_id: input.cost_center_id,
    custodian: input.custodian,
    serial_number: input.serial_number,
    source_type: 'inventory',
    source_id: item.id,
    notes: input.notes || `Inventory→Asset: ${qty} ${item.unit || 'unit(s)'} of ${item.product_name} @ ${unitCost.toFixed(2)}`,
    post_journal: false,
  };

  let createResult;
  try {
    createResult = await createFixedAsset(uid, createInput);
  } catch (err) {
    // Roll back the inventory movement if asset creation fails.
    await supabase.from('inventory_movements' as any).delete().eq('id', movementId);
    throw err;
  }
  const asset = createResult.asset;

  // 3. Post the conversion journal:
  //    Dr Fixed Asset (per-asset leaf)   Cr Inventory Asset
  const inventoryAccountId = await getOrCreateAccount(
    uid,
    STANDARD_ACCOUNTS.INVENTORY.name,
    'Asset',
  );

  const lines: JournalLineInput[] = [
    {
      account_id: asset.asset_account_id!,
      debit: capitalizedValue,
      credit: 0,
      line_narration: `Capitalize ${asset.asset_code} from inventory: ${item.product_name}`,
      cost_center_id: input.cost_center_id || null,
      branch_id: input.branch_id || null,
    },
    {
      account_id: inventoryAccountId,
      debit: 0,
      credit: capitalizedValue,
      line_narration: `Issue ${qty} ${item.unit || 'unit(s)'} of ${item.product_name} for asset use`,
    },
  ];

  const journalId = await postJournal({
    user_id: uid,
    date: conversionDate,
    narration: `Inventory → Fixed Asset: ${asset.asset_code} (${qty} × ${item.product_name})`,
    source_type: 'inventory_to_asset',
    source_id: asset.id,
    idempotency_key: `inventory_to_asset:${asset.id}`,
    lines,
  });

  // 4. Patch the asset with the linkage IDs.
  await supabase
    .from('fixed_assets' as any)
    .update({
      source_inventory_item_id: item.id,
      source_inventory_qty: qty,
      source_inventory_movement_id: movementId,
      reclassification_journal_id: journalId,
    })
    .eq('user_id', uid)
    .eq('id', asset.id);

  // Replace the auto-logged 'purchase' transaction with an explicit
  // 'capitalization' one pointing to our conversion journal.
  await supabase
    .from('asset_transactions' as any)
    .update({
      transaction_type: 'capitalization',
      journal_id: journalId,
      notes: `Capitalized from inventory ${item.product_name} (${qty} × ${unitCost.toFixed(2)})`,
    })
    .eq('user_id', uid)
    .eq('asset_id', asset.id)
    .eq('transaction_type', 'purchase');

  return {
    asset,
    movement_id: movementId,
    conversion_journal_id: journalId,
    capitalized_value: capitalizedValue,
    schedule_rows: createResult.scheduleRows,
  };
};
