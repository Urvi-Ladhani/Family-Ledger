-- Setup script to align with your existing Supabase schema
-- Run this complete script in the Supabase SQL Editor.

-- =========================================================================
-- 1. Helper function to avoid RLS recursion on public.users
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_my_family_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER -- Runs as Postgres superuser, bypassing RLS recursion
STABLE
AS $$
  SELECT family_id FROM public.users WHERE id = auth.uid();
$$;


-- =========================================================================
-- 2. Create or update families table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.families (
  id UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
  name TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  join_code TEXT,
  avatar_url TEXT,
  CONSTRAINT families_pkey PRIMARY KEY (id),
  CONSTRAINT families_join_code_key UNIQUE (join_code),
  CONSTRAINT families_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users (id)
);

-- Enable RLS on families
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid duplicates
DROP POLICY IF EXISTS "Allow authenticated users to create families" ON public.families;
DROP POLICY IF EXISTS "Allow members to view their family" ON public.families;
DROP POLICY IF EXISTS "Allow family admins to update their family" ON public.families;

-- Policies for families
CREATE POLICY "Allow authenticated users to create families"
  ON public.families FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow members to view their family"
  ON public.families FOR SELECT
  TO authenticated
  USING (id = public.get_my_family_id());

CREATE POLICY "Allow family admins to update their family"
  ON public.families FOR UPDATE
  TO authenticated
  USING (id = public.get_my_family_id() AND EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'Admin'
  ));


-- =========================================================================
-- 3. Create categories table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📁',
  color TEXT DEFAULT '#6B7280',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(family_id, name)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view categories in their family" ON public.categories;
DROP POLICY IF EXISTS "Family admins can manage categories" ON public.categories;

CREATE POLICY "Users can view categories in their family"
  ON public.categories FOR SELECT
  TO authenticated
  USING (family_id = public.get_my_family_id());

CREATE POLICY "Family admins can manage categories"
  ON public.categories FOR ALL
  TO authenticated
  USING (
    family_id = public.get_my_family_id() AND EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'Admin'
    )
  );

-- Trigger to automatically create default categories for new families
CREATE OR REPLACE FUNCTION create_default_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.categories (family_id, name, icon, color) VALUES
    (NEW.id, 'Groceries', '🛒', '#EF4444'),
    (NEW.id, 'Utilities', '💡', '#F59E0B'),
    (NEW.id, 'Transportation', '🚗', '#3B82F6'),
    (NEW.id, 'Entertainment', '🎬', '#8B5CF6'),
    (NEW.id, 'Health', '🏥', '#EC4899'),
    (NEW.id, 'Dining', '🍕', '#F97316'),
    (NEW.id, 'Shopping', '👕', '#06B6D4'),
    (NEW.id, 'Other', '📌', '#6B7280')
  ON CONFLICT (family_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_default_categories_trigger ON public.families;
CREATE TRIGGER create_default_categories_trigger
AFTER INSERT ON public.families
FOR EACH ROW
EXECUTE FUNCTION create_default_categories();


-- =========================================================================
-- 4. Alter and configure public.bills table
-- =========================================================================

-- Append missing columns to your existing bills table
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS ocr_text TEXT;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS extracted_amount DECIMAL(12, 2);
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS extracted_date DATE;

-- Enable RLS on bills
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view bills in their family" ON public.bills;
DROP POLICY IF EXISTS "Users can create bills" ON public.bills;
DROP POLICY IF EXISTS "Users can update bills, admins can update all" ON public.bills;
DROP POLICY IF EXISTS "Users can delete bills, admins can delete all" ON public.bills;

CREATE POLICY "Users can view bills in their family"
  ON public.bills FOR SELECT
  TO authenticated
  USING (family_id = public.get_my_family_id());

CREATE POLICY "Users can create bills"
  ON public.bills FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND family_id = public.get_my_family_id());

CREATE POLICY "Users can update bills, admins can update all"
  ON public.bills FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    (family_id = public.get_my_family_id() AND EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'Admin'
    ))
  );

CREATE POLICY "Users can delete bills, admins can delete all"
  ON public.bills FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    (family_id = public.get_my_family_id() AND EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'Admin'
    ))
  );


-- =========================================================================
-- 5. Create expenses table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bill_id BIGINT REFERENCES public.bills(id) ON DELETE CASCADE, -- maps to your bigint bills.id
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  amount DECIMAL(12, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  description TEXT,
  expense_date DATE NOT NULL,
  ocr_text TEXT,
  ocr_confidence DECIMAL(3, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_family_id ON expenses(family_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view expenses in their family" ON public.expenses;
DROP POLICY IF EXISTS "Users can create own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can update own expenses, admins can update all" ON public.expenses;
DROP POLICY IF EXISTS "Users can delete own expenses, admins can delete all" ON public.expenses;

CREATE POLICY "Users can view expenses in their family"
  ON public.expenses FOR SELECT
  TO authenticated
  USING (family_id = public.get_my_family_id());

CREATE POLICY "Users can create own expenses"
  ON public.expenses FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND family_id = public.get_my_family_id());

CREATE POLICY "Users can update own expenses, admins can update all"
  ON public.expenses FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    (family_id = public.get_my_family_id() AND EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'Admin'
    ))
  );

CREATE POLICY "Users can delete own expenses, admins can delete all"
  ON public.expenses FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    (family_id = public.get_my_family_id() AND EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'Admin'
    ))
  );


-- =========================================================================
-- 6. Setup Trigger & Policies for public.users
-- =========================================================================

-- Enable RLS on users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read profiles in their family" ON public.users;
DROP POLICY IF EXISTS "Allow users to update their own profile" ON public.users;
DROP POLICY IF EXISTS "Allow users to insert their own profile" ON public.users;

CREATE POLICY "Allow users to read profiles in their family"
  ON public.users FOR SELECT
  TO authenticated
  USING (family_id = public.get_my_family_id() OR id = auth.uid());

CREATE POLICY "Allow users to update their own profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Allow users to insert their own profile"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Recreate trigger function with SECURITY DEFINER to bypass RLS issues on auth signup
CREATE OR REPLACE FUNCTION public.sync_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta ->> 'full_name', NEW.email), 
    'Member'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS auth_user_created ON auth.users;
CREATE TRIGGER auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_profile();

-- Sync any existing users who didn't get a user row previously
INSERT INTO public.users (id, email, created_at)
SELECT u.id, u.email, now()
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.users p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;


-- =========================================================================
-- 7. Setup Storage Buckets & Policies
-- =========================================================================

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('bills', 'bills', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('family-avatars', 'family-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing storage policies if any
DROP POLICY IF EXISTS "Allow authenticated uploads to bills bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated select from bills bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to family-avatars bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated select from family-avatars bucket" ON storage.objects;

-- Storage policies for bills
CREATE POLICY "Allow authenticated uploads to bills bucket"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'bills');

CREATE POLICY "Allow authenticated select from bills bucket"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'bills');

-- Storage policies for family-avatars
CREATE POLICY "Allow authenticated uploads to family-avatars bucket"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'family-avatars');

CREATE POLICY "Allow authenticated select from family-avatars bucket"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'family-avatars');
