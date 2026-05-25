// ════════════════════════════════════════════════════════════════════════════
// Smart Automation Hub (Module 24, Phase 9)
//
// Aggregates business alerts across the Asset/Liability ERP into a single
// normalized BusinessAlert[] feed. Each underlying subsystem (maintenance,
// AMC, warranty, policy, EMI, covenant) keeps its own data; this service
// only flattens + tags + sorts them.
//
// Two new alert categories are sourced directly from the v_idle_assets and
// v_duplicate_assets views shipped in the same migration.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import {
  listDueMaintenanceAlerts,
  listAmcExpiringAlerts,
} from './assetMaintenanceService';
import {
  listWarrantyExpiryAlerts,
  listPolicyExpiryAlerts,
} from './assetCoverageService';
import { listUpcomingEmis } from './liabilityService';
import { listCovenants } from './liabilityExtensionsService';

// ── Public shapes ──────────────────────────────────────────────────────────
export type AlertCategory =
  | 'maintenance'
  | 'amc'
  | 'warranty'
  | 'policy'
  | 'emi'
  | 'covenant'
  | 'idle'
  | 'duplicate';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface BusinessAlert {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  description: string;
  due_date?: string | null;
  days_until_due?: number | null;
  is_overdue: boolean;
  amount?: number | null;
  link?: string;
  asset_id?: string | null;
  asset_code?: string | null;
  liability_id?: string | null;
}

export interface IdleAssetRow {
  user_id: string;
  asset_id: string;
  asset_code: string;
  name: string;
  category_name: string | null;
  book_value: number;
  location: string | null;
  branch_id: string | null;
  custodian: string | null;
  status: string;
  capitalised_on: string | null;
  last_active_on: string | null;
  effective_last_active_on: string | null;
  idle_days: number;
}

export interface DuplicateAssetRow {
  user_id: string;
  asset_id: string;
  asset_code: string;
  name: string;
  category_name: string | null;
  book_value: number;
  match_type: 'serial_number' | 'name_category';
  match_value: string;
  sibling_count: number;
}

// ── Underlying read helpers ────────────────────────────────────────────────
export const listIdleAssets = async (
  userId: string,
  thresholdDays = 180,
): Promise<IdleAssetRow[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('v_idle_assets' as any)
    .select('*')
    .eq('user_id', uid)
    .gte('idle_days', thresholdDays)
    .order('idle_days', { ascending: false });
  if (error) throw error;
  return (data || []) as IdleAssetRow[];
};

export const listDuplicateAssets = async (
  userId: string,
): Promise<DuplicateAssetRow[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('v_duplicate_assets' as any)
    .select('*')
    .eq('user_id', uid)
    .order('match_type')
    .order('match_value');
  if (error) throw error;
  return (data || []) as DuplicateAssetRow[];
};

// ── Severity rules ─────────────────────────────────────────────────────────
// Anything overdue is critical. Inside 7d is warning. Else info.
const severityFromDays = (days: number, overdue: boolean): AlertSeverity => {
  if (overdue) return 'critical';
  if (days <= 7) return 'warning';
  return 'info';
};

// ── Aggregator options ─────────────────────────────────────────────────────
export interface AutomationHubOptions {
  /** Look-ahead horizon for time-based alerts (maintenance, EMI, expiry). Default 30. */
  withinDays?: number;
  /** Idle threshold in days. Default 180. */
  idleThresholdDays?: number;
  /** Category filter — if set, only return alerts in this set. */
  categories?: AlertCategory[];
}

// ── Main aggregator ────────────────────────────────────────────────────────
export const listAllAlerts = async (
  userId: string,
  options: AutomationHubOptions = {},
): Promise<BusinessAlert[]> => {
  const uid = normalizeUserId(userId);
  const within = options.withinDays ?? 30;
  const idleThreshold = options.idleThresholdDays ?? 180;
  const filterSet = options.categories ? new Set(options.categories) : null;
  const wants = (c: AlertCategory) => !filterSet || filterSet.has(c);

  // Fan out in parallel — each underlying service is best-effort; a single
  // subsystem failure shouldn't black out the entire hub. Promise.allSettled
  // keeps us resilient.
  const [
    maintRes,
    amcRes,
    warrantyRes,
    policyRes,
    emiRes,
    covenantsRes,
    idleRes,
    dupRes,
  ] = await Promise.allSettled([
    wants('maintenance')  ? listDueMaintenanceAlerts(uid, within)    : Promise.resolve([]),
    wants('amc')          ? listAmcExpiringAlerts(uid, within)       : Promise.resolve([]),
    wants('warranty')     ? listWarrantyExpiryAlerts(uid, within)    : Promise.resolve([]),
    wants('policy')       ? listPolicyExpiryAlerts(uid, within)      : Promise.resolve([]),
    wants('emi')          ? listUpcomingEmis(uid, within)            : Promise.resolve([]),
    wants('covenant')     ? listCovenants(uid)                       : Promise.resolve([]),
    wants('idle')         ? listIdleAssets(uid, idleThreshold)       : Promise.resolve([]),
    wants('duplicate')    ? listDuplicateAssets(uid)                 : Promise.resolve([]),
  ]);

  const safe = <T>(r: PromiseSettledResult<T>): T | T[] =>
    r.status === 'fulfilled' ? r.value : ([] as unknown as T);

  const out: BusinessAlert[] = [];

  // Maintenance schedules
  for (const m of (safe(maintRes) as any[]) || []) {
    out.push({
      id: `maint:${m.schedule.id}`,
      category: 'maintenance',
      severity: severityFromDays(m.days_until_due, m.is_overdue),
      title: `${m.schedule.maintenance_type || 'Maintenance'} due — ${m.asset_name}`,
      description: m.is_overdue
        ? `Overdue by ${Math.abs(m.days_until_due)} day${Math.abs(m.days_until_due) === 1 ? '' : 's'}`
        : `Due in ${m.days_until_due} day${m.days_until_due === 1 ? '' : 's'}`,
      due_date: m.schedule.next_due_date,
      days_until_due: m.days_until_due,
      is_overdue: m.is_overdue,
      amount: m.schedule.estimated_cost ?? null,
      link: `/assets/${m.schedule.asset_id}`,
      asset_id: m.schedule.asset_id,
      asset_code: m.asset_code,
    });
  }

  // AMC expirations
  for (const a of (safe(amcRes) as any[]) || []) {
    out.push({
      id: `amc:${a.schedule.id}`,
      category: 'amc',
      severity: severityFromDays(a.days_until_expiry, a.is_expired),
      title: `AMC ${a.is_expired ? 'expired' : 'expiring'} — ${a.asset_name}`,
      description: a.is_expired
        ? `Expired ${Math.abs(a.days_until_expiry)} day${Math.abs(a.days_until_expiry) === 1 ? '' : 's'} ago`
        : `Expires in ${a.days_until_expiry} day${a.days_until_expiry === 1 ? '' : 's'}`,
      due_date: a.schedule.amc_end_date,
      days_until_due: a.days_until_expiry,
      is_overdue: a.is_expired,
      amount: a.schedule.amc_cost ?? null,
      link: `/assets/${a.schedule.asset_id}`,
      asset_id: a.schedule.asset_id,
      asset_code: a.asset_code,
    });
  }

  // Warranty expirations
  for (const w of (safe(warrantyRes) as any[]) || []) {
    out.push({
      id: `warranty:${w.warranty.id}`,
      category: 'warranty',
      severity: severityFromDays(w.days_until_expiry, w.is_expired),
      title: `Warranty ${w.is_expired ? 'expired' : 'expiring'} — ${w.asset_name}`,
      description: w.is_expired
        ? `Expired ${Math.abs(w.days_until_expiry)} day${Math.abs(w.days_until_expiry) === 1 ? '' : 's'} ago`
        : `Expires in ${w.days_until_expiry} day${w.days_until_expiry === 1 ? '' : 's'}`,
      due_date: w.warranty.warranty_end_date,
      days_until_due: w.days_until_expiry,
      is_overdue: w.is_expired,
      link: `/assets/${w.warranty.asset_id}`,
      asset_id: w.warranty.asset_id,
      asset_code: w.asset_code,
    });
  }

  // Insurance policy expirations
  for (const p of (safe(policyRes) as any[]) || []) {
    out.push({
      id: `policy:${p.policy.id}`,
      category: 'policy',
      severity: severityFromDays(p.days_until_expiry, p.is_expired),
      title: `Policy ${p.is_expired ? 'expired' : 'expiring'} — ${p.asset_name}`,
      description: p.is_expired
        ? `Expired ${Math.abs(p.days_until_expiry)} day${Math.abs(p.days_until_expiry) === 1 ? '' : 's'} ago`
        : `Expires in ${p.days_until_expiry} day${p.days_until_expiry === 1 ? '' : 's'}`,
      due_date: p.policy.policy_end_date,
      days_until_due: p.days_until_expiry,
      is_overdue: p.is_expired,
      amount: p.policy.premium_amount ?? null,
      link: `/assets/${p.policy.asset_id}`,
      asset_id: p.policy.asset_id,
      asset_code: p.asset_code,
    });
  }

  // Upcoming EMIs
  const todayIso = new Date().toISOString().slice(0, 10);
  for (const e of (safe(emiRes) as any[]) || []) {
    const days = Math.round((new Date(e.due_date).getTime() - new Date(todayIso).getTime()) / 86400000);
    const overdue = days < 0;
    out.push({
      id: `emi:${e.liability_id}:${e.emi_number}`,
      category: 'emi',
      severity: severityFromDays(days, overdue),
      title: `EMI #${e.emi_number} — ${e.liability_name}`,
      description: `${e.lender_name || 'Lender'} — Principal ${e.principal_component.toLocaleString('en-IN')}, Interest ${e.interest_component.toLocaleString('en-IN')}`,
      due_date: e.due_date,
      days_until_due: days,
      is_overdue: overdue,
      amount: Number(e.principal_component || 0) + Number(e.interest_component || 0),
      link: `/liabilities/${e.liability_id}`,
      liability_id: e.liability_id,
    });
  }

  // Breached covenants — surface only the ones currently in breach or with a
  // check due within the horizon.
  for (const c of (safe(covenantsRes) as any[]) || []) {
    const latestStatus: string | null = c.latest_status || null;
    const dueDate: string | null = c.next_check_due || null;
    const daysUntil = dueDate
      ? Math.round((new Date(dueDate).getTime() - new Date(todayIso).getTime()) / 86400000)
      : null;
    const isBreached = latestStatus === 'breached';
    const checkDueSoon = daysUntil !== null && daysUntil <= within;

    if (!isBreached && !checkDueSoon) continue;

    out.push({
      id: `covenant:${c.id}`,
      category: 'covenant',
      severity: isBreached ? 'critical' : (daysUntil !== null && daysUntil <= 0 ? 'critical' : (daysUntil !== null && daysUntil <= 7 ? 'warning' : 'info')),
      title: isBreached
        ? `Covenant breached — ${c.covenant_name || c.metric}`
        : `Covenant check due — ${c.covenant_name || c.metric}`,
      description: `${c.liability_name}${c.lender_name ? ' · ' + c.lender_name : ''} · ${c.metric} ${c.operator} ${c.threshold}`,
      due_date: dueDate,
      days_until_due: daysUntil,
      is_overdue: (daysUntil !== null && daysUntil < 0) || isBreached,
      link: `/liabilities/${c.liability_id}`,
      liability_id: c.liability_id,
    });
  }

  // Idle assets
  for (const i of (safe(idleRes) as IdleAssetRow[]) || []) {
    const sev: AlertSeverity =
      i.idle_days >= 365 ? 'critical' :
      i.idle_days >= 270 ? 'warning' :
      'info';
    out.push({
      id: `idle:${i.asset_id}`,
      category: 'idle',
      severity: sev,
      title: `Idle ${i.idle_days} days — ${i.name}`,
      description: `Last activity ${i.effective_last_active_on || 'never'}${i.location ? ' · ' + i.location : ''}${i.custodian ? ' · ' + i.custodian : ''}`,
      due_date: null,
      days_until_due: null,
      is_overdue: false,
      amount: i.book_value,
      link: `/assets/${i.asset_id}`,
      asset_id: i.asset_id,
      asset_code: i.asset_code,
    });
  }

  // Duplicate assets — group siblings so the alert is per-cluster rather than
  // per-asset. The first asset_id we see for a (match_type, match_value) tuple
  // anchors the alert link; the description lists the rest.
  const dupClusters = new Map<string, DuplicateAssetRow[]>();
  for (const d of (safe(dupRes) as DuplicateAssetRow[]) || []) {
    const key = `${d.match_type}|${d.match_value}`;
    const arr = dupClusters.get(key) || [];
    arr.push(d);
    dupClusters.set(key, arr);
  }
  for (const [key, cluster] of dupClusters.entries()) {
    const [first, ...rest] = cluster;
    out.push({
      id: `duplicate:${key}`,
      category: 'duplicate',
      severity: 'warning',
      title: first.match_type === 'serial_number'
        ? `Duplicate serial number "${first.match_value}"`
        : `Duplicate asset name — ${first.name}`,
      description: `${cluster.length} assets share this ${first.match_type === 'serial_number' ? 'serial' : 'name+category'}: ${cluster.map(c => c.asset_code).join(', ')}`,
      due_date: null,
      days_until_due: null,
      is_overdue: false,
      amount: cluster.reduce((s, c) => s + Number(c.book_value || 0), 0),
      link: `/assets/${first.asset_id}`,
      asset_id: first.asset_id,
      asset_code: first.asset_code,
    });
    void rest;
  }

  // Sort: overdue first → by severity (crit/warn/info) → by due date ASC → by id
  const sevRank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  out.sort((a, b) => {
    if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
    if (sevRank[a.severity] !== sevRank[b.severity]) return sevRank[a.severity] - sevRank[b.severity];
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return a.id.localeCompare(b.id);
  });

  return out;
};

// ── Counts summary for dashboard cards ─────────────────────────────────────
export interface AlertCounts {
  total: number;
  critical: number;
  warning: number;
  info: number;
  by_category: Record<AlertCategory, number>;
}

export const summarizeAlerts = (alerts: BusinessAlert[]): AlertCounts => {
  const counts: AlertCounts = {
    total: alerts.length,
    critical: 0,
    warning: 0,
    info: 0,
    by_category: {
      maintenance: 0, amc: 0, warranty: 0, policy: 0,
      emi: 0, covenant: 0, idle: 0, duplicate: 0,
    },
  };
  for (const a of alerts) {
    counts[a.severity]++;
    counts.by_category[a.category]++;
  }
  return counts;
};
