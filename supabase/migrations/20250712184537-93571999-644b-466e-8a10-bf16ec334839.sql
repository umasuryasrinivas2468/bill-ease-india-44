
-- Create users table for Clerk + Supabase integration
CREATE TABLE public.users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clerk_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  phone_number TEXT,
  full_name TEXT,
  is_pro BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for users to view their own data
CREATE POLICY "Users can view their own data" ON public.users
  FOR SELECT 
  USING (clerk_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'));

-- Create RLS policy for users to update their own data
CREATE POLICY "Users can update their own data" ON public.users
  FOR UPDATE 
  USING (clerk_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'));

-- Create RLS policy to allow inserting new users (needed for user creation)
CREATE POLICY "Allow user creation" ON public.users
  FOR INSERT 
  WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX idx_users_clerk_id ON public.users(clerk_id);
CREATE INDEX idx_users_email ON public.users(email);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON public.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_updated_at_column();
