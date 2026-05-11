import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';
import {
  computeReorderSuggestions,
  detectAbnormalMovements,
  detectDuplicateItems,
  detectValuationDrift,
} from '@/services/inventoryForecastService';

export interface ReconciliationRow {
  user_id: string;
  subledger_value: number | null;
  item_count: number | null;
  gl_value: number | null;
  variance: number | null;
  status: 'reconciled' | 'minor_drift' | 'investigate' | null;
}

export interface HsnSummaryRow {
  user_id: string;
  hsn_sac: string;
  qty_out: number;
  taxable_out: number;
  gst_out: number;
  qty_in: number;
  taxable_in: number;
  gst_in: number;
}

export interface KpiRow {
  user_id: string;
  item_id: string;
  product_name: string;
  sku: string | null;
  category: string | null;
  stock_quantity: number;
  average_cost: number;
  stock_value: number;
  reorder_level: number;
  cogs_last_90: number;
  qty_sold_last_90: number;
  revenue_last_90: number;
  gross_margin_last_90: number;
  gmroi_last_90: number | null;
  days_of_inventory: number | null;
  turnover_last_90: number | null;
  last_movement_date: string | null;
  movement_class: 'fast' | 'normal' | 'slow' | 'dead';
}

export interface MovementLedgerRow {
  id: string;
  user_id: string;
  item_id: string;
  product_name: string;
  movement_date: string;
  movement_type: string;
  source_type: string;
  source_id: string | null;
  source_number: string | null;
  party_name: string | null;
  quantity_in: number;
  quantity_out: number;
  value_in: number;
  value_out: number;
  cogs_amount: number;
  unit_cost: number;
  warehouse_name: string | null;
  notes: string | null;
  running_qty: number;
  running_value: number;
}

export const useInventoryReconciliation = () => {
  const { user } = useUser();
  const uid = user ? normalizeUserId(user.id) : null;
  return useQuery<ReconciliationRow | null>({
    queryKey: ['inventory-reconciliation', uid],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('v_inventory_gl_reconciliation' as any)
        .select('*')
        .eq('user_id', uid!)
        .maybeSingle();
      if (error) throw error;
      return (data as any) as ReconciliationRow | null;
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useHsnSummary = () => {
  const { user } = useUser();
  const uid = user ? normalizeUserId(user.id) : null;
  return useQuery<HsnSummaryRow[]>({
    queryKey: ['hsn-summary', uid],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('v_hsn_summary' as any)
        .select('*')
        .eq('user_id', uid!);
      if (error) throw error;
      return (data || []) as HsnSummaryRow[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useInventoryKpi = () => {
  const { user } = useUser();
  const uid = user ? normalizeUserId(user.id) : null;
  return useQuery<KpiRow[]>({
    queryKey: ['inventory-kpi', uid],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('v_inventory_kpi' as any)
        .select('*')
        .eq('user_id', uid!)
        .order('revenue_last_90', { ascending: false });
      if (error) throw error;
      return (data || []) as KpiRow[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useItemMovementLedger = (itemId: string | null) => {
  const { user } = useUser();
  const uid = user ? normalizeUserId(user.id) : null;
  return useQuery<MovementLedgerRow[]>({
    queryKey: ['item-movement-ledger', uid, itemId],
    queryFn: async () => {
      if (!user || !itemId) return [];
      const { data, error } = await supabase
        .from('v_item_movement_ledger' as any)
        .select('*')
        .eq('user_id', uid!)
        .eq('item_id', itemId)
        .order('movement_date', { ascending: true });
      if (error) throw error;
      return (data || []) as MovementLedgerRow[];
    },
    enabled: !!user && !!itemId,
  });
};

export const useReorderSuggestions = () => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['reorder-suggestions', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');
      return computeReorderSuggestions(user.id);
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useInventoryAnomalies = () => {
  const { user } = useUser();
  const uid = user ? normalizeUserId(user.id) : null;
  return useQuery({
    queryKey: ['inventory-anomalies', uid],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('inventory_anomalies' as any)
        .select('*')
        .eq('user_id', uid!)
        .eq('is_resolved', false)
        .order('detected_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useRunInventoryDetectors = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const [abnormal, dupes, drift] = await Promise.all([
        detectAbnormalMovements(user.id),
        detectDuplicateItems(user.id),
        detectValuationDrift(user.id),
      ]);
      return { abnormalCount: abnormal, duplicateGroups: dupes.length, valuation: drift };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-anomalies'] });
      qc.invalidateQueries({ queryKey: ['inventory-reconciliation'] });
    },
  });
};
