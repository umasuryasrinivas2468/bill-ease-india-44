-- ════════════════════════════════════════════════════════════════════════════
-- Wire up the two asset lifecycle events that were posting no journal:
--   * Allocation returns marked 'damaged' (partial impairment)
--   * Allocation returns marked 'lost'     (full write-off)
--   * Audit findings marked 'missing'      (full write-off on resolution)
--
-- Schema-side, this just adds a journal_id column on asset_allocations so the
-- service layer can stamp the posted journal back onto the allocation row.
-- (asset_audit_findings already has resolution_action / resolution_ref_id;
-- we reuse those — no new column needed.)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE asset_allocations
  ADD COLUMN IF NOT EXISTS journal_id UUID;

CREATE INDEX IF NOT EXISTS idx_alloc_journal
  ON asset_allocations(journal_id)
  WHERE journal_id IS NOT NULL;
