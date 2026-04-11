-- Link expenses to projects
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_name TEXT;

-- Link recurring expenses to projects
ALTER TABLE recurring_expenses
  ADD COLUMN IF NOT EXISTS project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_name TEXT;

-- Partial payment support on invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) DEFAULT 0;

-- Indexes for project expense lookups
CREATE INDEX IF NOT EXISTS idx_expenses_project_id ON expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_project_id ON recurring_expenses(project_id);
