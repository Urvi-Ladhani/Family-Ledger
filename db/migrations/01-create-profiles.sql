-- Creates a simple `profiles` table and a trigger to sync auth.users on signup

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  display_name text,
  email text,
  family_id uuid REFERENCES families(id) ON DELETE SET NULL,
  family_role text DEFAULT 'member' CHECK (family_role IN ('member','admin')),
  created_at timestamp with time zone DEFAULT now()
);

-- Insert existing auth users into profiles if missing (be careful in production)
INSERT INTO public.profiles (id, email, created_at)
SELECT u.id, u.email, now()
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

-- Trigger function to sync on new auth.users
CREATE OR REPLACE FUNCTION public.sync_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta ->> 'full_name', NULL), now())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_profile();
