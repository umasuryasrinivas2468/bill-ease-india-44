-- Create AI Tax Analysis Tables
-- This creates the database tables needed for storing AI tax analysis results

-- AI Tax Analysis Results Table
CREATE TABLE IF NOT EXISTS ai_tax_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  financial_year TEXT NOT NULL,
  analysis_date DATE NOT NULL,
  financial_summary JSONB NOT NULL,
  eligible_deductions JSONB NOT NULL,
  optimization_suggestions JSONB NOT NULL,
  tax_calculation JSONB NOT NULL,
  ai_insights TEXT,
  compliance_notes JSONB,
  disclaimer TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable Row Level Security
ALTER TABLE ai_tax_analysis ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for ai_tax_analysis
CREATE POLICY "Users can only see their own AI tax analyses" ON ai_tax_analysis
  FOR ALL USING (auth.uid()::text = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_ai_tax_analysis_user_id ON ai_tax_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_tax_analysis_financial_year ON ai_tax_analysis(financial_year);
CREATE INDEX IF NOT EXISTS idx_ai_tax_analysis_analysis_date ON ai_tax_analysis(analysis_date);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_ai_tax_analysis_updated_at ON ai_tax_analysis;
CREATE TRIGGER update_ai_tax_analysis_updated_at 
  BEFORE UPDATE ON ai_tax_analysis
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ai_tax_analysis TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;