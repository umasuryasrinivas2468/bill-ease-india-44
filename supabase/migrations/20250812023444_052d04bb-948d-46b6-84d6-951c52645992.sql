
-- Enable Row Level Security on all tables that have policies but RLS disabled
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

-- Update RLS policies to use Clerk JWT claims consistently
-- Fix the user_id references to work with Clerk authentication
DROP POLICY IF EXISTS "Users can only see their own reports" ON public.reports;
CREATE POLICY "Users can only see their own reports" ON public.reports
  FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

DROP POLICY IF EXISTS "Users can view their own data" ON public.users;
DROP POLICY IF EXISTS "Users can update their own data" ON public.users;
DROP POLICY IF EXISTS "Allow user creation" ON public.users;
CREATE POLICY "Users can view their own data" ON public.users
  FOR SELECT USING (clerk_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
CREATE POLICY "Users can update their own data" ON public.users
  FOR UPDATE USING (clerk_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
CREATE POLICY "Allow user creation" ON public.users
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can only see their own invoices" ON public.invoices;
CREATE POLICY "Users can only see their own invoices" ON public.invoices
  FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

DROP POLICY IF EXISTS "Users can only see their own business assets" ON public.business_assets;
CREATE POLICY "Users can only see their own business assets" ON public.business_assets
  FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

DROP POLICY IF EXISTS "Users can only see their own bank details" ON public.bank_details;
CREATE POLICY "Users can only see their own bank details" ON public.bank_details
  FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

DROP POLICY IF EXISTS "Users can only see their own business profile" ON public.business_profiles;
CREATE POLICY "Users can only see their own business profile" ON public.business_profiles
  FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

DROP POLICY IF EXISTS "Users can only see their own clients" ON public.clients;
CREATE POLICY "Users can only see their own clients" ON public.clients
  FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

DROP POLICY IF EXISTS "Users can only see their own documents" ON public.processed_documents;
CREATE POLICY "Users can only see their own documents" ON public.processed_documents
  FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

DROP POLICY IF EXISTS "Users can only see their own payment reminders" ON public.payment_reminders;
CREATE POLICY "Users can only see their own payment reminders" ON public.payment_reminders
  FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

-- Update user_apps and reminder_responses policies to use proper Clerk user ID references
DROP POLICY IF EXISTS "Users can view their own installed apps" ON public.user_apps;
DROP POLICY IF EXISTS "Users can install apps" ON public.user_apps;
DROP POLICY IF EXISTS "Users can update their installed apps" ON public.user_apps;
DROP POLICY IF EXISTS "Users can uninstall their apps" ON public.user_apps;
CREATE POLICY "Users can view their own installed apps" ON public.user_apps
  FOR SELECT USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
CREATE POLICY "Users can install apps" ON public.user_apps
  FOR INSERT WITH CHECK (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
CREATE POLICY "Users can update their installed apps" ON public.user_apps
  FOR UPDATE USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
CREATE POLICY "Users can uninstall their apps" ON public.user_apps
  FOR DELETE USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
