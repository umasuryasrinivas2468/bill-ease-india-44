CREATE TABLE IF NOT EXISTS mcp_tool_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name text NOT NULL,
  input jsonb,
  output jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcp_logs_tool_name ON mcp_tool_usage_logs(tool_name);
CREATE INDEX idx_mcp_logs_created_at ON mcp_tool_usage_logs(created_at DESC);

ALTER TABLE mcp_tool_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage mcp logs"
  ON mcp_tool_usage_logs FOR ALL
  USING (true)
  WITH CHECK (true);
