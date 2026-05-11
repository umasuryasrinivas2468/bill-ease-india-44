import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';

// ════════════════════════════════════════════════════════════════════════════
// Inventory Forecast / Smart-automation scaffolding.
//
// Today: simple moving-average reorder calculation + heuristic anomaly
// detection. The DB tables (inventory_forecasts, inventory_anomalies) are
// designed so an ML implementation can later replace the in-process maths
// without changing the consumer hooks/UI.
//
//   computeReorderSuggestions(userId)
//   detectAbnormalMovements(userId)
//   detectDuplicateItems(userId)
//   detectValuationDrift(userId)
// ════════════════════════════════════════════════════════════════════════════

export interface ReorderSuggestion {
  item_id: string;
  product_name: string;
  sku?: string | null;
  stock_quantity: number;
  reorder_level: number;
  avg_daily_demand: number;
  lead_time_days: number;
  safety_stock: number;
  reorder_point: number;
  suggested_reorder_qty: number;
  confidence: number;
}

/**
 * Moving-average reorder calc using the last 60 days of outward movements.
 *   avg_daily_demand   = qty_sold / 60
 *   safety_stock       = 1 stddev of daily demand × sqrt(lead_time)
 *   reorder_point      = avg_daily_demand × lead_time + safety_stock
 *   suggested_reorder  = max(reorder_point × 2 - stock_qty, 0)
 *
 * Persists results to `inventory_forecasts` so the UI can show "last
 * suggestion at T".
 */
export const computeReorderSuggestions = async (
  userId: string,
  opts: { lead_time_days?: number; window_days?: number } = {},
): Promise<ReorderSuggestion[]> => {
  const uid = normalizeUserId(userId);
  const window = opts.window_days ?? 60;
  const leadTime = opts.lead_time_days ?? 7;
  const since = new Date(Date.now() - window * 86400_000).toISOString().split('T')[0];

  // Pull goods items + their last `window` days of outward movements.
  const [{ data: items }, { data: movements }] = await Promise.all([
    supabase
      .from('inventory')
      .select('id, product_name, sku, stock_quantity, reorder_level, type')
      .eq('user_id', uid)
      .eq('type', 'goods'),
    supabase
      .from('inventory_movements' as any)
      .select('item_id, movement_date, quantity_out, movement_type')
      .eq('user_id', uid)
      .gte('movement_date', since)
      .in('movement_type', ['sale', 'purchase_return', 'adjustment_out', 'transfer_out']),
  ]);

  // Bucket movements by item then by day.
  const byItem: Record<string, number[]> = {};
  const dayKeyByDate = (s: string) => s; // already YYYY-MM-DD
  for (const m of (movements as any[]) || []) {
    const qty = Number(m.quantity_out || 0);
    if (qty <= 0) continue;
    const k = m.item_id;
    if (!byItem[k]) byItem[k] = [];
    byItem[k].push(qty);
    void dayKeyByDate(m.movement_date);
  }

  const suggestions: ReorderSuggestion[] = [];
  for (const it of (items as any[]) || []) {
    const dailySamples = byItem[it.id] ?? [];
    const total = dailySamples.reduce((s, n) => s + n, 0);
    const avgDaily = total / window;
    const mean = avgDaily;
    const variance = dailySamples.length > 0
      ? dailySamples.reduce((s, n) => s + (n - mean) ** 2, 0) / dailySamples.length
      : 0;
    const stddev = Math.sqrt(variance);
    const safety = stddev * Math.sqrt(leadTime);
    const rop = avgDaily * leadTime + safety;
    const stockQty = Number(it.stock_quantity || 0);
    const suggested = Math.max(rop * 2 - stockQty, 0);
    const confidence = Math.min(
      100,
      // More samples → higher confidence. > 30 daily samples → ~90% conf.
      Math.round((dailySamples.length / 30) * 90),
    );

    if (suggested > 0 || stockQty <= rop) {
      suggestions.push({
        item_id: it.id,
        product_name: it.product_name,
        sku: it.sku,
        stock_quantity: stockQty,
        reorder_level: Number(it.reorder_level || 0),
        avg_daily_demand: Number(avgDaily.toFixed(4)),
        lead_time_days: leadTime,
        safety_stock: Number(safety.toFixed(4)),
        reorder_point: Number(rop.toFixed(4)),
        suggested_reorder_qty: Number(suggested.toFixed(4)),
        confidence,
      });
    }
  }

  // Persist (one row per item per day; UNIQUE constraint upserts).
  if (suggestions.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    const forecasts = suggestions.map((s) => ({
      user_id: uid,
      item_id: s.item_id,
      forecast_date: today,
      method: 'moving_avg' as const,
      window_days: window,
      avg_daily_demand: s.avg_daily_demand,
      lead_time_days: s.lead_time_days,
      safety_stock: s.safety_stock,
      reorder_point: s.reorder_point,
      suggested_reorder_qty: s.suggested_reorder_qty,
      confidence: s.confidence,
    }));
    await supabase
      .from('inventory_forecasts' as any)
      .upsert(forecasts, { onConflict: 'user_id,item_id,forecast_date' });
  }

  return suggestions.sort((a, b) => b.suggested_reorder_qty - a.suggested_reorder_qty);
};

/**
 * Heuristic: a single movement > 3× the 30-day average is "abnormal".
 * Writes to `inventory_anomalies` (idempotent via item_id + date).
 */
export const detectAbnormalMovements = async (userId: string): Promise<number> => {
  const uid = normalizeUserId(userId);
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0];

  const { data: movements } = await supabase
    .from('inventory_movements' as any)
    .select('id, item_id, movement_date, quantity_in, quantity_out, value_in, value_out, source_number, source_type')
    .eq('user_id', uid)
    .gte('movement_date', since);

  // Per-item average movement magnitude.
  const byItem = new Map<string, { samples: number[]; rows: any[] }>();
  for (const m of (movements as any[]) || []) {
    const mag = Math.max(Number(m.quantity_in || 0), Number(m.quantity_out || 0));
    if (mag <= 0) continue;
    const entry = byItem.get(m.item_id) ?? { samples: [], rows: [] };
    entry.samples.push(mag);
    entry.rows.push(m);
    byItem.set(m.item_id, entry);
  }

  const anomalies: any[] = [];
  for (const [itemId, { samples, rows }] of byItem.entries()) {
    if (samples.length < 5) continue; // not enough signal
    const mean = samples.reduce((s, n) => s + n, 0) / samples.length;
    const threshold = mean * 3;
    for (const r of rows) {
      const mag = Math.max(Number(r.quantity_in || 0), Number(r.quantity_out || 0));
      if (mag > threshold) {
        anomalies.push({
          user_id: uid,
          item_id: itemId,
          anomaly_type: 'abnormal_movement',
          severity: mag > mean * 6 ? 'critical' : 'warning',
          title: `Abnormal movement on ${r.source_number || r.source_type || r.movement_date}`,
          details: {
            movement_id: r.id,
            quantity: mag,
            mean_movement: Number(mean.toFixed(2)),
            threshold,
            source_type: r.source_type,
            source_number: r.source_number,
          },
        });
      }
    }
  }

  if (anomalies.length > 0) {
    await supabase.from('inventory_anomalies' as any).insert(anomalies);
  }
  return anomalies.length;
};

/**
 * Duplicate items: same product_name (case-insensitive) or same SKU.
 * Returns groups; UI shows them so a user can merge / delete.
 */
export const detectDuplicateItems = async (userId: string): Promise<Array<{
  key: string; items: Array<{ id: string; product_name: string; sku?: string | null; stock_quantity: number }>;
}>> => {
  const uid = normalizeUserId(userId);
  const { data: items } = await supabase
    .from('inventory')
    .select('id, product_name, sku, stock_quantity')
    .eq('user_id', uid);

  const byKey = new Map<string, Array<{ id: string; product_name: string; sku?: string | null; stock_quantity: number }>>();
  for (const it of (items as any[]) || []) {
    const nameKey = `name:${(it.product_name || '').trim().toLowerCase()}`;
    const skuKey = it.sku ? `sku:${String(it.sku).trim().toLowerCase()}` : null;
    for (const k of [nameKey, skuKey].filter(Boolean) as string[]) {
      const arr = byKey.get(k) ?? [];
      arr.push({ id: it.id, product_name: it.product_name, sku: it.sku, stock_quantity: Number(it.stock_quantity || 0) });
      byKey.set(k, arr);
    }
  }

  const dupes: Array<{ key: string; items: any[] }> = [];
  for (const [key, arr] of byKey.entries()) {
    if (arr.length > 1) dupes.push({ key, items: arr });
  }

  // Record one anomaly per duplicate group.
  if (dupes.length > 0) {
    await supabase.from('inventory_anomalies' as any).insert(
      dupes.map((d) => ({
        user_id: uid,
        item_id: d.items[0].id,
        anomaly_type: 'duplicate_item',
        severity: 'warning',
        title: `Duplicate item: ${d.key}`,
        details: { matches: d.items },
      })),
    );
  }
  return dupes;
};

/**
 * Valuation drift: variance between inventory subledger and the Inventory
 * Asset GL account closing balance (v_inventory_gl_reconciliation).
 */
export const detectValuationDrift = async (userId: string): Promise<{
  subledger: number; gl: number; variance: number; status: string;
} | null> => {
  const uid = normalizeUserId(userId);
  const { data } = await supabase
    .from('v_inventory_gl_reconciliation' as any)
    .select('*')
    .eq('user_id', uid)
    .maybeSingle();
  if (!data) return null;
  const row = data as any;
  if (row.status === 'investigate') {
    await supabase.from('inventory_anomalies' as any).insert({
      user_id: uid,
      anomaly_type: 'valuation_drift',
      severity: 'critical',
      title: `Inventory subledger ↔ GL variance ₹${Math.abs(Number(row.variance || 0)).toLocaleString()}`,
      details: {
        subledger_value: row.subledger_value,
        gl_value: row.gl_value,
        variance: row.variance,
      },
    });
  }
  return {
    subledger: Number(row.subledger_value || 0),
    gl: Number(row.gl_value || 0),
    variance: Number(row.variance || 0),
    status: row.status,
  };
};
