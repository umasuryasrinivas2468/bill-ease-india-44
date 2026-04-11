-- Create bank_statements table for imported bank statements
CREATE TABLE IF NOT EXISTS bank_statements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  description TEXT NOT NULL,
  debit DECIMAL(12,2) DEFAULT 0,
  credit DECIMAL(12,2) DEFAULT 0,
  balance DECIMAL(12,2),
  status TEXT DEFAULT 'unmatched' CHECK (status IN ('matched', 'unmatched', 'partially_matched')),
  matched_journal_id UUID REFERENCES journals(id) ON DELETE SET NULL,
  file_name TEXT,
  file_import_date TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(user_id, transaction_id, transaction_date)
);

-- Create bank_statement_reconciliation table for tracking reconciliation
CREATE TABLE IF NOT EXISTS bank_statement_reconciliation (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  bank_statement_id UUID REFERENCES bank_statements(id) ON DELETE CASCADE,
  journal_id UUID REFERENCES journals(id) ON DELETE CASCADE,
  match_score DECIMAL(3,2), -- Score from 0 to 1 indicating quality of match
  match_type TEXT NOT NULL CHECK (match_type IN ('exact', 'fuzzy', 'manual')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(bank_statement_id, journal_id)
);

-- Create journal_approval_workflow table for approval process
CREATE TABLE IF NOT EXISTS journal_approval_workflow (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  journal_id UUID REFERENCES journals(id) ON DELETE CASCADE,
  bank_statement_id UUID REFERENCES bank_statements(id) ON DELETE CASCADE,
  approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  created_from_bank_statement BOOLEAN DEFAULT false,
  approved_by TEXT,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable Row Level Security
ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_reconciliation ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_approval_workflow ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for bank_statements
CREATE POLICY "Users can only see their own bank statements" ON bank_statements
  FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

-- Create RLS policies for bank_statement_reconciliation
CREATE POLICY "Users can only see their own reconciliation data" ON bank_statement_reconciliation
  FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

-- Create RLS policies for journal_approval_workflow
CREATE POLICY "Users can only see their own approval workflow" ON journal_approval_workflow
  FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bank_statements_user_id ON bank_statements(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_date ON bank_statements(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bank_statements_status ON bank_statements(status);
CREATE INDEX IF NOT EXISTS idx_bank_statements_transaction_id ON bank_statements(transaction_id);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_user_id ON bank_statement_reconciliation(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_approval_user_id ON journal_approval_workflow(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_approval_status ON journal_approval_workflow(approval_status);

-- Create triggers for updated_at
CREATE TRIGGER update_bank_statements_updated_at BEFORE UPDATE ON bank_statements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_journal_approval_updated_at BEFORE UPDATE ON journal_approval_workflow
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate match score between bank statement and journal
CREATE OR REPLACE FUNCTION calculate_match_score(
  p_amount DECIMAL(12,2),
  p_date DATE,
  p_description TEXT,
  p_journal_amount DECIMAL(12,2),
  p_journal_date DATE,
  p_journal_narration TEXT
)
RETURNS DECIMAL(3,2) AS $$
DECLARE
  date_score DECIMAL(3,2) := 0;
  amount_score DECIMAL(3,2) := 0;
  description_score DECIMAL(3,2) := 0;
  final_score DECIMAL(3,2) := 0;
BEGIN
  -- Date matching (within ±2 days)
  IF ABS(EXTRACT(DAYS FROM (p_date - p_journal_date))) <= 2 THEN
    date_score := 1.0 - (ABS(EXTRACT(DAYS FROM (p_date - p_journal_date))) / 2.0);
  END IF;
  
  -- Amount matching (exact match)
  IF ABS(p_amount - p_journal_amount) < 0.01 THEN
    amount_score := 1.0;
  END IF;
  
  -- Description similarity (basic fuzzy matching)
  IF LENGTH(p_description) > 0 AND LENGTH(p_journal_narration) > 0 THEN
    -- Simple word matching - can be enhanced with more sophisticated algorithms
    IF LOWER(p_description) LIKE '%' || LOWER(p_journal_narration) || '%' OR 
       LOWER(p_journal_narration) LIKE '%' || LOWER(p_description) || '%' THEN
      description_score := 0.5;
    END IF;
  END IF;
  
  -- Calculate weighted final score (amount: 50%, date: 30%, description: 20%)
  final_score := (amount_score * 0.5) + (date_score * 0.3) + (description_score * 0.2);
  
  RETURN final_score;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-match bank statements with journals
CREATE OR REPLACE FUNCTION auto_match_bank_statements(p_user_id TEXT)
RETURNS TABLE(matched_count INTEGER, partially_matched_count INTEGER) AS $$
DECLARE
  stmt_record RECORD;
  journal_record RECORD;
  match_score DECIMAL(3,2);
  matched_count INTEGER := 0;
  partially_matched_count INTEGER := 0;
BEGIN
  -- Loop through unmatched bank statements
  FOR stmt_record IN 
    SELECT * FROM bank_statements 
    WHERE user_id = p_user_id AND status = 'unmatched'
  LOOP
    -- Find potential journal matches
    FOR journal_record IN 
      SELECT j.*, 
        CASE 
          WHEN stmt_record.debit > 0 THEN stmt_record.debit
          ELSE stmt_record.credit
        END as statement_amount
      FROM journals j
      WHERE j.user_id = p_user_id 
        AND j.status = 'posted'
        AND ABS(j.total_debit - 
          CASE 
            WHEN stmt_record.debit > 0 THEN stmt_record.debit
            ELSE stmt_record.credit
          END) < 0.01
        AND ABS(EXTRACT(DAYS FROM (stmt_record.transaction_date - j.journal_date))) <= 2
        AND NOT EXISTS (
          SELECT 1 FROM bank_statement_reconciliation bsr 
          WHERE bsr.journal_id = j.id
        )
      ORDER BY ABS(EXTRACT(DAYS FROM (stmt_record.transaction_date - j.journal_date)))
      LIMIT 1
    LOOP
      -- Calculate match score
      SELECT calculate_match_score(
        CASE WHEN stmt_record.debit > 0 THEN stmt_record.debit ELSE stmt_record.credit END,
        stmt_record.transaction_date,
        stmt_record.description,
        journal_record.total_debit,
        journal_record.journal_date,
        journal_record.narration
      ) INTO match_score;
      
      -- If good match, create reconciliation record
      IF match_score >= 0.7 THEN
        INSERT INTO bank_statement_reconciliation 
          (user_id, bank_statement_id, journal_id, match_score, match_type)
        VALUES 
          (p_user_id, stmt_record.id, journal_record.id, match_score, 'exact');
        
        UPDATE bank_statements 
        SET status = 'matched', matched_journal_id = journal_record.id
        WHERE id = stmt_record.id;
        
        matched_count := matched_count + 1;
        
      ELSIF match_score >= 0.4 THEN
        INSERT INTO bank_statement_reconciliation 
          (user_id, bank_statement_id, journal_id, match_score, match_type)
        VALUES 
          (p_user_id, stmt_record.id, journal_record.id, match_score, 'fuzzy');
        
        UPDATE bank_statements 
        SET status = 'partially_matched'
        WHERE id = stmt_record.id;
        
        partially_matched_count := partially_matched_count + 1;
      END IF;
      
      EXIT; -- Only match with first suitable journal
    END LOOP;
  END LOOP;
  
  RETURN QUERY SELECT matched_count, partially_matched_count;
END;
$$ LANGUAGE plpgsql;