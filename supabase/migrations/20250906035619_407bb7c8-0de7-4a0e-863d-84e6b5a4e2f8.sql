-- Add onboarding_completed flag to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_users_onboarding_completed ON public.users(onboarding_completed);

-- Update any existing users to have onboarding_completed = true (optional, for existing users)
-- UPDATE public.users SET onboarding_completed = true WHERE onboarding_completed IS NULL;