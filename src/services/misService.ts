// ════════════════════════════════════════════════════════════════════════════
// MIS Service (Module 15) + CFO Snapshot (Module 20)
//
// Read-only aggregations over fixed_assets, asset_maintenance_records,
// asset_insurance_policies, liabilities, liability_covenants, lease_contracts,
// cwip_projects, loan_emi_schedule. No journal posting — pure reporting.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { getNetWorthSnapshot } from '@/services/liabilityExtensionsService';
import type {
  AssetByBranch,
  AssetByCostCenter,
  AssetByDepartment,
  AssetRoiRow,
  CfoIntelligence,
  CfoSnapshot,
  LiabilityByLender,
} from '@/types/mis';

// ── Module 15 ───────────────────────────────────────────────────────────────
export const listAssetByBranch = async (userId: string): Promise<AssetByBranch[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('v_asset_by_branch')
    .select('*')
    .eq('user_id', uid)
    .order('book_value', { ascending: false });
  if (error) throw error;
  return (data || []) as AssetByBranch[];
};

export const listAssetByDepartment = async (userId: string): Promise<AssetByDepartment[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('v_asset_by_department')
    .select('*')
    .eq('user_id', uid)
    .order('book_value', { ascending: false });
  if (error) throw error;
  return (data || []) as AssetByDepartment[];
};

export const listAssetByCostCenter = async (userId: string): Promise<AssetByCostCenter[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('v_asset_by_cost_center')
    .select('*')
    .eq('user_id', uid)
    .order('book_value', { ascending: false });
  if (error) throw error;
  return (data || []) as AssetByCostCenter[];
};

export const listLiabilityByLender = async (userId: string): Promise<LiabilityByLender[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('v_liability_by_lender')
    .select('*')
    .eq('user_id', uid)
    .order('outstanding_total', { ascending: false });
  if (error) throw error;
  return (data || []) as LiabilityByLender[];
};

export const listAssetRoi = async (userId: string): Promise<AssetRoiRow[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('v_asset_roi')
    .select('*')
    .eq('user_id', uid)
    .order('net_running_cost', { ascending: false });
  if (error) throw error;
  return (data || []) as AssetRoiRow[];
};

// ── Module 20: CFO snapshot ─────────────────────────────────────────────────
export const getCfoSnapshot = async (userId: string): Promise<CfoSnapshot> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('v_cfo_snapshot')
    .select('*')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return {
      user_id: uid,
      active_assets: 0,
      fixed_assets_value: 0,
      lifetime_depreciation: 0,
      active_cwip_count: 0,
      cwip_balance: 0,
      active_lease_count: 0,
      lease_liability: 0,
      rou_asset_value: 0,
      active_loan_count: 0,
      loan_outstanding: 0,
      interest_payable: 0,
      active_covenants: 0,
      overdue_covenants: 0,
      breached_covenants: 0,
      emis_due_30d: 0,
      emi_outflow_30d: 0,
      maintenance_spend_30d: 0,
    };
  }
  return data as CfoSnapshot;
};

/** Combines CFO snapshot + net worth + risk flags into a single CFO-grade view. */
export const getCfoIntelligence = async (userId: string): Promise<CfoIntelligence> => {
  const [snap, networth] = await Promise.all([
    getCfoSnapshot(userId),
    getNetWorthSnapshot(userId),
  ]);

  // Best-effort balance-sheet roll-up. fixed_assets_value already excludes ROU,
  // so add cwip_balance and rou_asset_value on top.
  const total_assets_book = round2(
    snap.fixed_assets_value +
    snap.cwip_balance +
    snap.rou_asset_value +
    (networth.current_assets || 0),
  );
  const total_liabilities_book = round2(
    snap.loan_outstanding +
    snap.lease_liability +
    snap.interest_payable +
    // AP is currently lumped into networth.current_liabilities via Phase 6
    Math.max(0, (networth.current_liabilities || 0) - snap.loan_outstanding),
  );
  const estimated_net_worth = round2(total_assets_book - total_liabilities_book);

  const risk_flags: string[] = [];
  if (snap.breached_covenants > 0) {
    risk_flags.push(`${snap.breached_covenants} covenant${snap.breached_covenants > 1 ? 's' : ''} breached`);
  }
  if (snap.overdue_covenants > 0) {
    risk_flags.push(`${snap.overdue_covenants} overdue covenant check${snap.overdue_covenants > 1 ? 's' : ''}`);
  }
  if (networth.debt_to_equity !== null && networth.debt_to_equity !== undefined && networth.debt_to_equity > 2) {
    risk_flags.push(`Debt-to-Equity ${networth.debt_to_equity.toFixed(2)} > 2`);
  }
  if (networth.current_ratio !== null && networth.current_ratio !== undefined && networth.current_ratio < 1) {
    risk_flags.push(`Current ratio ${networth.current_ratio.toFixed(2)} < 1 (illiquidity risk)`);
  }
  if (networth.leverage_ratio !== null && networth.leverage_ratio !== undefined && networth.leverage_ratio > 0.7) {
    risk_flags.push(`Leverage ${(networth.leverage_ratio * 100).toFixed(0)}% > 70%`);
  }
  if (snap.emi_outflow_30d > total_assets_book * 0.1) {
    risk_flags.push(`30-day EMI outflow (${formatInr(snap.emi_outflow_30d)}) > 10% of total assets`);
  }

  return {
    ...snap,
    total_assets_book,
    total_liabilities_book,
    estimated_net_worth,
    risk_flags,
  };
};

// ── helpers ─────────────────────────────────────────────────────────────────
const round2 = (n: number) => Math.round(n * 100) / 100;
const formatInr = (n: number) =>
  '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n));
