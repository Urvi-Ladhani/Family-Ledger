# Supabase Database Schema Setup

Run these SQL commands in your Supabase dashboard (SQL Editor) to set up the required tables:

## 1. Add user_role to users table
```sql
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'member' CHECK (role IN ('member', 'admin'));
ALTER TABLE users ADD COLUMN family_role TEXT DEFAULT 'member' CHECK (family_role IN ('member', 'admin'));
```

## 2. Create categories table
```sql
CREATE TABLE categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📁',
  color TEXT DEFAULT '#6B7280',
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(family_id, name)
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view categories in their family"
  ON categories FOR SELECT
  USING (family_id IN (
    SELECT family_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Family admins can manage categories"
  ON categories FOR ALL
  USING (
    family_id IN (
      SELECT family_id FROM users WHERE id = auth.uid() AND family_role = 'admin'
    )
  );
```

## 3. Create expenses table
```sql
CREATE TABLE expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bill_id UUID REFERENCES bills(id) ON DELETE CASCADE,
  
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  
  amount DECIMAL(12, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  description TEXT,
  
  expense_date DATE NOT NULL,
  uploaded_at TIMESTAMP DEFAULT now(),
  
  ocr_text TEXT,
  ocr_confidence DECIMAL(3, 2),
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_expenses_family_id ON expenses(family_id);
CREATE INDEX idx_expenses_user_id ON expenses(user_id);
CREATE INDEX idx_expenses_category_id ON expenses(category_id);
CREATE INDEX idx_expenses_expense_date ON expenses(expense_date);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view expenses in their family"
  ON expenses FOR SELECT
  USING (family_id IN (
    SELECT family_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can create own expenses"
  ON expenses FOR INSERT
  WITH CHECK (user_id = auth.uid() AND family_id IN (
    SELECT family_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update own expenses, admins can update all"
  ON expenses FOR UPDATE
  USING (
    user_id = auth.uid() OR
    family_id IN (
      SELECT family_id FROM users WHERE id = auth.uid() AND family_role = 'admin'
    )
  );

CREATE POLICY "Users can delete own expenses, admins can delete all"
  ON expenses FOR DELETE
  USING (
    user_id = auth.uid() OR
    family_id IN (
      SELECT family_id FROM users WHERE id = auth.uid() AND family_role = 'admin'
    )
  );
```

## 4. Add default categories for new families
```sql
CREATE OR REPLACE FUNCTION create_default_categories()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO categories (family_id, name, icon, color) VALUES
    (NEW.id, 'Groceries', '🛒', '#EF4444'),
    (NEW.id, 'Utilities', '💡', '#F59E0B'),
    (NEW.id, 'Transportation', '🚗', '#3B82F6'),
    (NEW.id, 'Entertainment', '🎬', '#8B5CF6'),
    (NEW.id, 'Health', '🏥', '#EC4899'),
    (NEW.id, 'Dining', '🍕', '#F97316'),
    (NEW.id, 'Shopping', '👕', '#06B6D4'),
    (NEW.id, 'Other', '📌', '#6B7280');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_default_categories_trigger
AFTER INSERT ON families
FOR EACH ROW
EXECUTE FUNCTION create_default_categories();
```

## 5. Update bills table to track OCR parsing
```sql
ALTER TABLE bills ADD COLUMN category_id UUID REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE bills ADD COLUMN extracted_amount DECIMAL(12, 2);
ALTER TABLE bills ADD COLUMN extracted_date DATE;
ALTER TABLE bills ADD COLUMN parse_status TEXT DEFAULT 'PENDING' CHECK (parse_status IN ('PENDING', 'ANALYZING', 'OCR_DONE', 'CATEGORIZED', 'FAILED'));
```

## 6. Grant Supabase Storage permissions
In Supabase Dashboard > Storage > bills bucket > Policies, ensure:
- Authenticated users can upload files to their own paths
- Public can view files (if desired)

## 7. Create `profiles` table (recommended)
It is common to maintain a `profiles` table in `public` that mirrors `auth.users` for application-specific fields (family_id, family_role, display name). Run this if you don't already have a `profiles` table:

```sql
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  display_name text,
  email text,
  family_id uuid REFERENCES families(id) ON DELETE SET NULL,
  family_role text DEFAULT 'member' CHECK (family_role IN ('member','admin')),
  created_at timestamp with time zone DEFAULT now()
);

-- Optional: keep profiles in sync with auth.users on signup
CREATE OR REPLACE FUNCTION public.sync_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta ->> 'full_name', now())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_profile();
```

After creating `profiles`, update any existing user rows accordingly (set `email`, `full_name`, etc.).
