// ════════════════════════════════════════════════════════════════════════════
// AI Smart Features (Module 16) — heuristic insight engine
//
// Pure read-only. Pulls from existing tables + Phase 7 views and produces
// explainable signals. No machine-learning — rule-based thresholds, fast
// enough to run on each dashboard load.
//
// Detectors:
//   - Idle asset detection         no transactions in 6 months + no active allocation
//   - Replacement candidate         accum dep >= 80% of cost AND running cost >= 30% book
//   - Maintenance overspend         per-asset cost-to-book > 50%
//   - Liability stress              breached covenant OR D/E > 2.5 OR current ratio < 1
//   - Depreciation anomaly          posted period count mismatch from planned schedule
//   - Covenant risk                 overdue check OR pending high-cadence covenant
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { getNetWorthSnapshot } from '@/services/liabilityExtensionsService';
import type {
  AssetInsight,
  InsightSeverity,
  InsightsSummary,
  InsightCategory,
} from '@/types/aiInsights';

const today = () => new Date().toISOString().slice(0, 10);
const monthsAgo = (n: number): string => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
};
const round = (n: number, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

const emptySummary = (): InsightsSummary => ({
  total: 0,
  by_severity: { info: 0, warning: 0, critical: 0 },
  by_category: {
    utilization: 0,
    idle_asset: 0,
    replacement_candidate: 0,
    liability_stress: 0,
    depreciation_anomaly: 0,
    covenant_risk: 0,
    maintenance_overspend: 0,
  },
  insights: [],
});

export const generateInsights = async (userId: string): Promise<InsightsSummary> => {
  const uid = normalizeUserId(userId);
  const insights: AssetInsight[] = [];

  // ── Source data ─────────────────────────────────────────────────────────
  const [
    { data: roiData },
    { data: assetTxn },
    { data: allocs },
    { data: schedule },
    { data: covenants },
    networth,
  ] = await Promise.all([
    supabase.from('v_asset_roi').select('*').eq('user_id', uid),
    supabase.from('asset_transactions')
      .select('asset_id, transaction_date')
      .eq('user_id', uid)
      .gte('transaction_date', monthsAgo(6)),
    supabase.from('asset_allocations')
      .select('asset_id, status')
      .eq('user_id', uid)
      .in('status', ['active', 'overdue']),
    supabase.from('asset_depreciation_schedule')
      .select('asset_id, status')
      .eq('user_id', uid),
    supabase.from('v_covenants_enriched').select('*').eq('user_id', uid),
    getNetWorthSnapshot(uid).catch(() => null),
  ]);

  const roi = (roiData || []) as any[];
  const activeAllocSet = new Set(((allocs || []) as any[]).map((a) => a.asset_id));
  const recentTxnSet = new Set(((assetTxn || []) as any[]).map((t) => t.asset_id));

  // Per-asset depreciation schedule counts
  const depMap = new Map<string, { planned: number; posted: number; skipped: number }>();
  for (const r of (schedule || []) as any[]) {
    const m = depMap.get(r.asset_id) || { planned: 0, posted: 0, skipped: 0 };
    if (r.status === 'planned') m.planned++;
    else if (r.status === 'posted') m.posted++;
    else if (r.status === 'skipped') m.skipped++;
    depMap.set(r.asset_id, m);
  }

  // ── Detectors ───────────────────────────────────────────────────────────

  // Idle assets
  for (const a of roi) {
    if (a.asset_status !== 'active') continue;
    if (recentTxnSet.has(a.asset_id)) continue;
    if (activeAllocSet.has(a.asset_id)) continue;
    if (Number(a.book_value || 0) < 1000) continue; // skip immaterial
    insights.push({
      id: `idle_asset:${a.asset_id}`,
      category: 'idle_asset',
      severity: 'warning',
      title: `${a.asset_code} idle — no activity in 6 months`,
      detail: `${a.asset_name} hasn't had any transactions or active allocation in the last 6 months. Book value ₹${round(a.book_value).toLocaleString('en-IN')} sitting idle.`,
      score: Math.min(100, 40 + Math.floor(Number(a.book_value) / 50000)),
      entity_type: 'fixed_asset',
      entity_id: a.asset_id,
      entity_label: `${a.asset_code} — ${a.asset_name}`,
      evidence: {
        book_value: round(a.book_value),
        last_recent_txn: 'none in 180 days',
        active_allocation: false,
      },
      recommended_action: 'Reassign, sell, or rent to recover capital tied up.',
    });
  }

  // Replacement candidates
  for (const a of roi) {
    if (a.asset_status !== 'active') continue;
    const dep = Number(a.depreciation_to_date || 0);
    const cost = Number(a.capitalised_value || 0);
    const running = Number(a.maintenance_spend || 0) + Number(a.insurance_spend || 0);
    if (cost === 0) continue;
    const depRatio = dep / cost;
    const runRatio = a.book_value > 0 ? running / Number(a.book_value) : Infinity;
    if (depRatio >= 0.8 && runRatio >= 0.3) {
      insights.push({
        id: `replacement_candidate:${a.asset_id}`,
        category: 'replacement_candidate',
        severity: 'warning',
        title: `${a.asset_code} likely replacement candidate`,
        detail: `${(depRatio * 100).toFixed(0)}% depreciated and running cost is ${(runRatio * 100).toFixed(0)}% of book value — likely past optimal replacement point.`,
        score: Math.min(100, Math.round((depRatio * 50) + (runRatio * 50))),
        entity_type: 'fixed_asset',
        entity_id: a.asset_id,
        entity_label: `${a.asset_code} — ${a.asset_name}`,
        evidence: {
          depreciation_ratio: round(depRatio, 3),
          cost_to_book_ratio: round(runRatio, 3),
          lifetime_running_cost: round(running),
          book_value: round(a.book_value),
        },
        recommended_action: 'Evaluate replacement to lower TCO and downtime risk.',
      });
    }
  }

  // Maintenance overspend
  for (const a of roi) {
    if (a.asset_status !== 'active') continue;
    const ratio = a.cost_to_book_ratio != null ? Number(a.cost_to_book_ratio) : null;
    if (ratio === null) continue;
    if (ratio > 0.5) {
      insights.push({
        id: `maintenance_overspend:${a.asset_id}`,
        category: 'maintenance_overspend',
        severity: ratio > 1 ? 'critical' : 'warning',
        title: `${a.asset_code} maintenance overspend`,
        detail: `Lifetime maintenance + insurance is ${(ratio * 100).toFixed(0)}% of current book value. Investigate root cause.`,
        score: Math.min(100, Math.round(ratio * 60)),
        entity_type: 'fixed_asset',
        entity_id: a.asset_id,
        entity_label: `${a.asset_code} — ${a.asset_name}`,
        evidence: {
          cost_to_book_ratio: round(ratio, 3),
          maintenance_spend: round(a.maintenance_spend),
          insurance_spend: round(a.insurance_spend),
          book_value: round(a.book_value),
        },
        recommended_action: 'Audit vendor contracts; consider replacement.',
      });
    }
  }

  // Depreciation anomaly (large skipped count, or planned still pending after end of life)
  for (const a of roi) {
    if (a.asset_status !== 'active') continue;
    const dm = depMap.get(a.asset_id);
    if (!dm) continue;
    if (dm.skipped > 0 && dm.skipped >= dm.posted) {
      insights.push({
        id: `depreciation_anomaly:${a.asset_id}`,
        category: 'depreciation_anomaly',
        severity: 'warning',
        title: `${a.asset_code} depreciation gaps`,
        detail: `${dm.skipped} skipped periods vs ${dm.posted} posted — schedule may be out of sync with the asset's real status.`,
        score: 30 + dm.skipped * 2,
        entity_type: 'fixed_asset',
        entity_id: a.asset_id,
        entity_label: `${a.asset_code} — ${a.asset_name}`,
        evidence: { posted: dm.posted, planned: dm.planned, skipped: dm.skipped },
        recommended_action: 'Regenerate the depreciation schedule or post pending periods.',
      });
    }
  }

  // Covenant risk (breached + overdue)
  for (const c of (covenants || []) as any[]) {
    if (!c.is_active) continue;
    if (c.latest_status === 'breached') {
      insights.push({
        id: `covenant_risk:${c.id}:breached`,
        category: 'covenant_risk',
        severity: 'critical',
        title: `Covenant breached: ${c.title}`,
        detail: `${c.liability_name} covenant flagged as breached at last check on ${c.latest_check_date || 'unknown date'}.`,
        score: 95,
        entity_type: 'covenant',
        entity_id: c.id,
        entity_label: c.title,
        evidence: {
          latest_status: c.latest_status,
          latest_check_date: c.latest_check_date || null,
          metric: c.metric || null,
          threshold: c.threshold_value || null,
        },
        recommended_action: 'Contact lender. Provide rectification plan or seek waiver.',
      });
    } else if (c.next_check_due && c.next_check_due < today()) {
      insights.push({
        id: `covenant_risk:${c.id}:overdue`,
        category: 'covenant_risk',
        severity: 'warning',
        title: `Overdue covenant check: ${c.title}`,
        detail: `${c.liability_name} compliance check was due on ${c.next_check_due}.`,
        score: 60,
        entity_type: 'covenant',
        entity_id: c.id,
        entity_label: c.title,
        evidence: { next_check_due: c.next_check_due, latest_status: c.latest_status || null },
        recommended_action: 'Run the check and record evidence to avoid lender escalation.',
      });
    }
  }

  // Liability stress signal (org-wide)
  if (networth) {
    const flags: string[] = [];
    if (networth.debt_to_equity !== null && networth.debt_to_equity !== undefined && networth.debt_to_equity > 2.5) {
      flags.push(`Debt-to-Equity ${networth.debt_to_equity.toFixed(2)}`);
    }
    if (networth.current_ratio !== null && networth.current_ratio !== undefined && networth.current_ratio < 1) {
      flags.push(`Current ratio ${networth.current_ratio.toFixed(2)}`);
    }
    if (networth.leverage_ratio !== null && networth.leverage_ratio !== undefined && networth.leverage_ratio > 0.75) {
      flags.push(`Leverage ${(networth.leverage_ratio * 100).toFixed(0)}%`);
    }
    if (flags.length > 0) {
      insights.push({
        id: `liability_stress:org`,
        category: 'liability_stress',
        severity: flags.length >= 2 ? 'critical' : 'warning',
        title: `Liability stress detected (${flags.length} signal${flags.length > 1 ? 's' : ''})`,
        detail: `Solvency ratios flagged: ${flags.join(' · ')}.`,
        score: 70 + flags.length * 10,
        entity_type: 'liability',
        entity_id: '__org__',
        entity_label: 'Org-wide',
        evidence: {
          debt_to_equity: networth.debt_to_equity ?? null,
          current_ratio: networth.current_ratio ?? null,
          leverage_ratio: networth.leverage_ratio ?? null,
        },
        recommended_action: 'Trim discretionary CapEx, consolidate high-cost debt, accelerate receivables.',
      });
    }
  }

  // ── Summarise ───────────────────────────────────────────────────────────
  const summary = emptySummary();
  for (const ins of insights) {
    summary.total++;
    summary.by_severity[ins.severity]++;
    summary.by_category[ins.category]++;
  }
  // sort by severity then score desc
  const sevWeight: Record<InsightSeverity, number> = { critical: 100, warning: 50, info: 10 };
  insights.sort((a, b) => sevWeight[b.severity] - sevWeight[a.severity] || b.score - a.score);
  summary.insights = insights;
  return summary;
};
