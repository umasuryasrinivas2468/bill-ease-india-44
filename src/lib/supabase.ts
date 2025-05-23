
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yhvvmcxdiqyxzdqvxyfe.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlodnZtY3hkaXF5eHpkcXZ4eWZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5ODg0MTMsImV4cCI6MjA2MzU2NDQxM30.kAmJQt-wE2_6bIf1-eyDngWf3eP3FTZrs9nbxpmEYlo';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
