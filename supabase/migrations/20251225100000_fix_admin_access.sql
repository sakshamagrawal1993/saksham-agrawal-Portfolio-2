-- Safely add is_admin column
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='is_admin') THEN 
        ALTER TABLE public.profiles ADD COLUMN is_admin boolean DEFAULT false; 
    END IF; 
END $$;

-- Update the user profile by finding the ID from auth.users
UPDATE public.profiles
SET 
  is_admin = true,
  full_name = 'Saksham Agrawal'
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'sakshamagrawal1993@gmail.com'
);
