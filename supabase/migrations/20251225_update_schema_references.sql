-- 1. Update Profiles Table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Sync existing emails from auth.users (One-time sync)
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id;

-- 2. Update Posts Foreign Key
-- First drop existing constraint if it exists (name might vary, so we try standard names)
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_author_id_fkey;

-- Add new constraint referencing profiles
ALTER TABLE public.posts
ADD CONSTRAINT posts_author_id_fkey
FOREIGN KEY (author_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;

-- 3. Update Comments Foreign Key
ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;

ALTER TABLE public.comments
ADD CONSTRAINT comments_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;

-- 4. Create/Update Trigger to keep email in sync for new users
-- Function to handle new user insertion/updates
CREATE OR REPLACE FUNCTION public.handle_user_update_email()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if profile exists
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
      UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
  ELSE
      -- Optional: Insert if missing (though usually handled by handle_new_user)
      INSERT INTO public.profiles (id, email, full_name, avatar_url)
      VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users update
DROP TRIGGER IF EXISTS on_auth_user_email_update ON auth.users;
CREATE TRIGGER on_auth_user_email_update
AFTER UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_user_update_email();

-- Ensure we have a trigger for INSERT on auth.users to populate profiles with email if not already there
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id, 
    NEW.email, 
    NEW.raw_user_meta_data->>'full_name', 
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email; -- Update if exists
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if trigger exists before creating to avoid duplication errors or conflicts
-- We'll replace it.
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();
