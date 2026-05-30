-- ============================================================================
-- PHASE 16 — LLM-DRIVEN AI COMMENTARY
-- ----------------------------------------------------------------------------
-- Adds executive_summary + commentary columns to ai_review_runs so an Edge
-- Function (ai-financial-review) can persist LLM-generated narrative + the
-- per-finding insights it produces.
-- ============================================================================

ALTER TABLE ai_review_runs
  ADD COLUMN IF NOT EXISTS executive_summary  TEXT,
  ADD COLUMN IF NOT EXISTS narrative_commentary TEXT,    -- markdown
  ADD COLUMN IF NOT EXISTS prompt_tokens      INT,
  ADD COLUMN IF NOT EXISTS completion_tokens  INT,
  ADD COLUMN IF NOT EXISTS cache_read_tokens  INT,
  ADD COLUMN IF NOT EXISTS llm_provider       TEXT,      -- 'lovable','anthropic','openai'
  ADD COLUMN IF NOT EXISTS llm_model          TEXT;      -- 'google/gemini-3-flash-preview', etc.

-- ── RPC: persist a complete LLM run + findings in one shot ─────────────────
-- Called by the Edge Function with a JSON payload like:
--   { executive_summary, narrative_commentary, findings: [...], usage: {...} }
CREATE OR REPLACE FUNCTION persist_llm_review(
  p_user_id      TEXT,
  p_fiscal_year  TEXT,
  p_payload      JSONB
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_run_id     UUID;
  v_findings   JSONB := COALESCE(p_payload -> 'findings', '[]'::jsonb);
  v_usage      JSONB := COALESCE(p_payload -> 'usage',    '{}'::jsonb);
  v_count      INT := 0;
  v_finding    JSONB;
BEGIN
  -- Create the run
  INSERT INTO ai_review_runs (
    user_id, fiscal_year, scope, kind,
    model_name, llm_provider, llm_model,
    executive_summary, narrative_commentary,
    prompt_tokens, completion_tokens, cache_read_tokens,
    status, completed_at, total_findings
  ) VALUES (
    p_user_id, p_fiscal_year, 'full_review', 'llm',
    p_payload ->> 'model',
    p_payload ->> 'provider',
    p_payload ->> 'model',
    p_payload ->> 'executive_summary',
    p_payload ->> 'narrative_commentary',
    NULLIF(v_usage ->> 'prompt_tokens',     '')::INT,
    NULLIF(v_usage ->> 'completion_tokens', '')::INT,
    NULLIF(v_usage ->> 'cache_read_tokens', '')::INT,
    'completed', NOW(),
    COALESCE(jsonb_array_length(v_findings), 0)
  )
  RETURNING id INTO v_run_id;

  -- Insert each finding
  FOR v_finding IN SELECT * FROM jsonb_array_elements(v_findings)
  LOOP
    INSERT INTO ai_findings (
      user_id, run_id, category, severity, rule_code,
      title, body, related_line, metric_value, metric_unit, suggested_action
    ) VALUES (
      p_user_id,
      v_run_id,
      COALESCE(v_finding ->> 'category', 'anomaly'),
      COALESCE(v_finding ->> 'severity', 'info'),
      COALESCE(v_finding ->> 'rule_code', 'LLM_INSIGHT'),
      COALESCE(v_finding ->> 'title', '(untitled)'),
      v_finding ->> 'body',
      v_finding ->> 'related_line',
      NULLIF(v_finding ->> 'metric_value', '')::NUMERIC,
      v_finding ->> 'metric_unit',
      v_finding ->> 'suggested_action'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'run_id',          v_run_id,
    'findings_count',  v_count,
    'executive_summary', p_payload ->> 'executive_summary'
  );
END;
$$;

-- ── Latest LLM commentary for a user/fy (for UI initial load) ──────────────
CREATE OR REPLACE FUNCTION get_latest_llm_review(p_user_id TEXT, p_fiscal_year TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_run RECORD;
  v_findings JSONB;
BEGIN
  SELECT id, executive_summary, narrative_commentary, completed_at,
         total_findings, llm_provider, llm_model,
         prompt_tokens, completion_tokens, cache_read_tokens
    INTO v_run
    FROM ai_review_runs
   WHERE user_id = p_user_id
     AND fiscal_year = p_fiscal_year
     AND kind = 'llm'
     AND status = 'completed'
   ORDER BY completed_at DESC NULLS LAST
   LIMIT 1;

  IF v_run.id IS NULL THEN
    RETURN jsonb_build_object('has_review', FALSE);
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY
                            CASE f.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                                            WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
                            f.created_at DESC), '[]'::jsonb)
    INTO v_findings
    FROM ai_findings f
   WHERE f.user_id = p_user_id AND f.run_id = v_run.id;

  RETURN jsonb_build_object(
    'has_review',          TRUE,
    'run_id',              v_run.id,
    'completed_at',        v_run.completed_at,
    'executive_summary',   v_run.executive_summary,
    'narrative_commentary',v_run.narrative_commentary,
    'total_findings',      v_run.total_findings,
    'llm_provider',        v_run.llm_provider,
    'llm_model',           v_run.llm_model,
    'usage',               jsonb_build_object(
                             'prompt_tokens', v_run.prompt_tokens,
                             'completion_tokens', v_run.completion_tokens,
                             'cache_read_tokens', v_run.cache_read_tokens
                           ),
    'findings',            v_findings
  );
END;
$$;

GRANT EXECUTE ON FUNCTION persist_llm_review(TEXT, TEXT, JSONB)       TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_latest_llm_review(TEXT, TEXT)           TO authenticated, anon;
