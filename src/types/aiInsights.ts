// Rule-based AI Insights (Module 16).
// These are heuristic detectors, not ML — they produce explainable signals
// that surface in the CFO dashboard and a dedicated /insights page.

export type InsightSeverity = 'info' | 'warning' | 'critical';
export type InsightCategory =
  | 'utilization'
  | 'idle_asset'
  | 'replacement_candidate'
  | 'liability_stress'
  | 'depreciation_anomaly'
  | 'covenant_risk'
  | 'maintenance_overspend';

export interface AssetInsight {
  id: string;            // synthetic — `category:entity_id`
  category: InsightCategory;
  severity: InsightSeverity;
  title: string;
  detail: string;
  // Numeric signal for sorting
  score: number;          // 0-100, higher = more urgent
  entity_type: 'fixed_asset' | 'liability' | 'covenant';
  entity_id: string;
  entity_label: string;
  evidence: Record<string, number | string | null>;
  recommended_action?: string;
}

export interface InsightsSummary {
  total: number;
  by_severity: Record<InsightSeverity, number>;
  by_category: Record<InsightCategory, number>;
  insights: AssetInsight[];
}
