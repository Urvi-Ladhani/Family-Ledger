-- Supabase Database Setup & Migration Script
-- Run this complete script in the Supabase SQL Editor to set up all tables, triggers, policies, and storage buckets.

-- =========================================================================
-- 1. Create families table if not exists
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.families (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  join_code TEXT UNIQUE,
  avatar_url TEXT,
  created_by UUID, -- references auth.users(id) if needed, but keeping simple
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on families
ALTER TABLE families ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid duplicates
DROP POLICY IF EXISTS "Allow authenticated users to create families" ON families;
DROP POLICY IF EXISTS "Allow members to view their family" ON families;
DROP POLICY IF EXISTS "Allow family admins to update their family" ON families;

-- Policies for families
CREATE POLICY "Allow authenticated users to create families"
  ON families FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow members to view their family"
  ON families FOR SELECT
  TO authenticated
  USING (id IN (SELECT family_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Allow family admins to update their family"
  ON families FOR UPDATE
  TO authenticated
  USING (id IN (SELECT family_id FROM public.profiles WHERE id = auth.uid() AND family_role = 'admin'));


-- =========================================================================
-- 2. Create profiles table if not exists & setup trigger
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  display_name TEXT,
  email TEXT,
  family_id UUID REFERENCES families(id) ON DELETE SET NULL,
  family_role TEXT DEFAULT 'member' CHECK (family_role IN ('member','admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read profiles in their family" ON profiles;
DROP POLICY IF EXISTS "Allow users to update their own profile" ON profiles;
DROP POLICY IF EXISTS "Allow users to insert their own profile" ON profiles;

CREATE POLICY "Allow users to read profiles in their family"
  ON profiles FOR SELECT
  TO authenticated
  USING (family_id IN (SELECT family_id FROM public.profiles WHERE id = auth.uid()) OR id = auth.uid());

CREATE POLICY "Allow users to update their own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Allow users to insert their own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Recreate trigger function with SECURITY DEFINER to bypass RLS issues on auth signup
CREATE OR REPLACE FUNCTION public.sync_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta ->> 'full_name', NEW.email), 
    now()
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

-- Sync any existing users who didn't get a profile row previously
INSERT INTO public.profiles (id, email, created_at)
SELECT u.id, u.email, now()
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;


-- =========================================================================
-- 3. Create categories table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📁',
  color TEXT DEFAULT '#6B7280',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(family_id, name)
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view categories in their family" ON categories;
DROP POLICY IF EXISTS "Family admins can manage categories" ON categories;

CREATE POLICY "Users can view categories in their family"
  ON categories FOR SELECT
  TO authenticated
  USING (family_id IN (
    SELECT family_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Family admins can manage categories"
  ON categories FOR ALL
  TO authenticated
  USING (
    family_id IN (
      SELECT family_id FROM public.profiles WHERE id = auth.uid() AND family_role = 'admin'
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

DROP TRIGGER IF EXISTS create_default_categories_trigger ON families;
CREATE TRIGGER create_default_categories_trigger
AFTER INSERT ON families
FOR EACH ROW
EXECUTE FUNCTION create_default_categories();


-- =========================================================================
-- 4. Re-create bills table to ensure all fields are present
-- =========================================================================
DROP TABLE IF EXISTS public.bills CASCADE;

CREATE TABLE public.bills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_url TEXT NOT NULL,
  ocr_text TEXT,
  status TEXT DEFAULT 'pending',
  parse_status TEXT DEFAULT 'PENDING' CHECK (parse_status IN ('PENDING', 'ANALYZING', 'OCR_DONE', 'CATEGORIZED', 'FAILED')),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  extracted_amount DECIMAL(12, 2),
  extracted_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view bills in their family" ON bills;
DROP POLICY IF EXISTS "Users can create bills" ON bills;
DROP POLICY IF EXISTS "Users can update bills, admins can update all" ON bills;
DROP POLICY IF EXISTS "Users can delete bills, admins can delete all" ON bills;

CREATE POLICY "Users can view bills in their family"
  ON bills FOR SELECT
  TO authenticated
  USING (family_id IN (
    SELECT family_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can create bills"
  ON bills FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND family_id IN (
    SELECT family_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update bills, admins can update all"
  ON bills FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    family_id IN (
      SELECT family_id FROM public.profiles WHERE id = auth.uid() AND family_role = 'admin'
    )
  );

CREATE POLICY "Users can delete bills, admins can delete all"
  ON bills FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    family_id IN (
      SELECT family_id FROM public.profiles WHERE id = auth.uid() AND family_role = 'admin'
    )
  );


-- =========================================================================
-- 5. Create expenses table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bill_id UUID REFERENCES bills(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
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

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view expenses in their family" ON expenses;
DROP POLICY IF EXISTS "Users can create own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can update own expenses, admins can update all" ON expenses;
DROP POLICY IF EXISTS "Users can delete own expenses, admins can delete all" ON expenses;

CREATE POLICY "Users can view expenses in their family"
  ON expenses FOR SELECT
  TO authenticated
  USING (family_id IN (
    SELECT family_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can create own expenses"
  ON expenses FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND family_id IN (
    SELECT family_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update own expenses, admins can update all"
  ON expenses FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    family_id IN (
      SELECT family_id FROM public.profiles WHERE id = auth.uid() AND family_role = 'admin'
    )
  );

CREATE POLICY "Users can delete own expenses, admins can delete all"
  ON expenses FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    family_id IN (
      SELECT family_id FROM public.profiles WHERE id = auth.uid() AND family_role = 'admin'
    )
  );


-- =========================================================================
-- 6. Setup Storage Buckets & Policies
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
