-- ============================================================
-- MINIMAL FIX SCRIPT
-- Run this in Supabase SQL Editor → it only fixes what's broken.
-- It does NOT drop or recreate your existing tables.
-- ============================================================


-- ============================================================
-- FIX 1: Helper function to avoid RLS recursion on public.users
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_family_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT family_id FROM public.users WHERE id = auth.uid();
$$;


-- ============================================================
-- FIX 2: Signup trigger — syncs new auth user into public.users
-- (SECURITY DEFINER bypasses RLS so the INSERT always works)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.families (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  join_code TEXT UNIQUE,
  avatar_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.families(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Member';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT now();

CREATE OR REPLACE FUNCTION public.sync_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_role TEXT;
  selected_name TEXT;
BEGIN
  selected_role := CASE
    WHEN lower(COALESCE(NEW.raw_user_meta_data ->> 'role', 'Member')) = 'admin' THEN 'Admin'
    ELSE 'Member'
  END;

  selected_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    NEW.email,
    ''
  );

  INSERT INTO public.users (id, email, full_name, display_name, role, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    selected_name,
    selected_name,
    selected_role,
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(NULLIF(public.users.full_name, ''), EXCLUDED.full_name),
    display_name = COALESCE(NULLIF(public.users.display_name, ''), EXCLUDED.display_name),
    role = COALESCE(public.users.role, EXCLUDED.role);

  RETURN NEW;
END;
$$;

-- Drop old trigger (if any) and recreate
DROP TRIGGER IF EXISTS auth_user_created ON auth.users;
CREATE TRIGGER auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile();

-- Backfill any existing auth users who are missing a public.users row
INSERT INTO public.users (id, email, full_name, display_name, role, created_at)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', email, ''),
  COALESCE(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', email, ''),
  CASE WHEN lower(COALESCE(raw_user_meta_data ->> 'role', 'Member')) = 'admin' THEN 'Admin' ELSE 'Member' END,
  COALESCE(created_at, now())
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.users)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- FIX 3: RLS Policies on public.users
-- (Old policies may block inserts — replace them all)
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read profiles in their family" ON public.users;
DROP POLICY IF EXISTS "Allow users to update their own profile"       ON public.users;
DROP POLICY IF EXISTS "Allow users to insert their own profile"       ON public.users;

-- Users can always read their own row and family members
CREATE POLICY "users_select"
  ON public.users FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR family_id = public.get_my_family_id());

-- Users can only insert their OWN row
CREATE POLICY "users_insert"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Users can only update their OWN row
CREATE POLICY "users_update"
  ON public.users FOR UPDATE
  TO authenticated
  USING (id = auth.uid());


-- ============================================================
-- FIX 4: RLS Policies on public.families
-- (Authenticated users must be able to INSERT a new family)
-- ============================================================
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to create families" ON public.families;
DROP POLICY IF EXISTS "Allow members to view their family"           ON public.families;
DROP POLICY IF EXISTS "Allow family admins to update their family"   ON public.families;

CREATE POLICY "families_insert"
  ON public.families FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "families_select"
  ON public.families FOR SELECT
  TO authenticated
  USING (id = public.get_my_family_id() OR created_by = auth.uid());

CREATE POLICY "families_update"
  ON public.families FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());


-- ============================================================
-- FIX 5: Create categories table (if it doesn't exist yet)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id         UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id  UUID    NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  icon       TEXT    DEFAULT '📁',
  color      TEXT    DEFAULT '#6B7280',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(family_id, name)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_select" ON public.categories;
DROP POLICY IF EXISTS "categories_all"    ON public.categories;

CREATE POLICY "categories_select"
  ON public.categories FOR SELECT
  TO authenticated
  USING (family_id = public.get_my_family_id());

-- Admins can insert/update/delete categories
CREATE POLICY "categories_all"
  ON public.categories FOR ALL
  TO authenticated
  USING (family_id = public.get_my_family_id());

-- Auto-create default categories when a new family is created
CREATE OR REPLACE FUNCTION public.create_default_categories()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.categories (family_id, name, icon, color) VALUES
    (NEW.id, 'Groceries',      '🛒', '#EF4444'),
    (NEW.id, 'Utilities',      '💡', '#F59E0B'),
    (NEW.id, 'Transportation', '🚗', '#3B82F6'),
    (NEW.id, 'Entertainment',  '🎬', '#8B5CF6'),
    (NEW.id, 'Health',         '🏥', '#EC4899'),
    (NEW.id, 'Dining',         '🍕', '#F97316'),
    (NEW.id, 'Shopping',       '👕', '#06B6D4'),
    (NEW.id, 'Other',          '📌', '#6B7280')
  ON CONFLICT (family_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_default_categories_trigger ON public.families;
CREATE TRIGGER create_default_categories_trigger
  AFTER INSERT ON public.families
  FOR EACH ROW EXECUTE FUNCTION public.create_default_categories();


-- ============================================================
-- FIX 6: Add missing columns to existing public.bills table
-- ============================================================
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS ocr_text          TEXT;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS status            TEXT DEFAULT 'pending';
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS category_id       UUID REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS extracted_amount  DECIMAL(12, 2);
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS extracted_date    DATE;

-- RLS on bills
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bills_select" ON public.bills;
DROP POLICY IF EXISTS "bills_insert" ON public.bills;
DROP POLICY IF EXISTS "bills_update" ON public.bills;
DROP POLICY IF EXISTS "bills_delete" ON public.bills;

CREATE POLICY "bills_select"
  ON public.bills FOR SELECT TO authenticated
  USING (family_id = public.get_my_family_id());

CREATE POLICY "bills_insert"
  ON public.bills FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND family_id = public.get_my_family_id());

CREATE POLICY "bills_update"
  ON public.bills FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR family_id = public.get_my_family_id());

CREATE POLICY "bills_delete"
  ON public.bills FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR family_id = public.get_my_family_id());


-- ============================================================
-- FIX 7: Create expenses table (if it doesn't exist yet)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id       UUID    NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id         UUID    NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
  bill_id         BIGINT  REFERENCES public.bills(id)             ON DELETE CASCADE,
  category_id     UUID    REFERENCES public.categories(id)        ON DELETE SET NULL,
  amount          DECIMAL(12, 2) NOT NULL,
  currency        TEXT    DEFAULT 'USD',
  description     TEXT,
  expense_date    DATE    NOT NULL,
  ocr_text        TEXT,
  ocr_confidence  DECIMAL(3, 2),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_family_id     ON public.expenses(family_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id       ON public.expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id   ON public.expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date  ON public.expenses(expense_date);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expenses_select" ON public.expenses;
DROP POLICY IF EXISTS "expenses_insert" ON public.expenses;
DROP POLICY IF EXISTS "expenses_update" ON public.expenses;
DROP POLICY IF EXISTS "expenses_delete" ON public.expenses;

CREATE POLICY "expenses_select"
  ON public.expenses FOR SELECT TO authenticated
  USING (family_id = public.get_my_family_id());

CREATE POLICY "expenses_insert"
  ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND family_id = public.get_my_family_id());

CREATE POLICY "expenses_update"
  ON public.expenses FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR family_id = public.get_my_family_id());

CREATE POLICY "expenses_delete"
  ON public.expenses FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR family_id = public.get_my_family_id());


-- ============================================================
-- FIX 8: Storage Buckets for bill uploads & family avatars
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('bills',          'bills',          true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('family-avatars', 'family-avatars', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "storage_bills_insert"         ON storage.objects;
DROP POLICY IF EXISTS "storage_bills_select"         ON storage.objects;
DROP POLICY IF EXISTS "storage_family_avatars_insert" ON storage.objects;
DROP POLICY IF EXISTS "storage_family_avatars_select" ON storage.objects;

CREATE POLICY "storage_bills_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bills');

CREATE POLICY "storage_bills_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bills');

CREATE POLICY "storage_family_avatars_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'family-avatars');

CREATE POLICY "storage_family_avatars_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'family-avatars');
