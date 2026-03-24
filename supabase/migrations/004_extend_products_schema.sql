-- supabase/migrations/004_extend_products_schema.sql

-- 1. Rename 'name' to 'title' to match the UI modifications
ALTER TABLE products RENAME COLUMN name TO title;

-- 2. Drop the original_price column as vintage items are unique
ALTER TABLE products DROP COLUMN IF EXISTS original_price;

-- (Mantenemos image_urls que ya viene de la Phase 1 como TEXT[])

-- 3. Drop NOT NULL constraints from 'size' and 'color' (since they might be unknown or N/A)
ALTER TABLE products ALTER COLUMN size DROP NOT NULL;
ALTER TABLE products ALTER COLUMN color DROP NOT NULL;

-- 4. Add new columns for the detailed vintage catalog
ALTER TABLE products Add COLUMN IF NOT EXISTS subcategory TEXT;
ALTER TABLE products Add COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE products Add COLUMN IF NOT EXISTS condition TEXT;
ALTER TABLE products Add COLUMN IF NOT EXISTS measurements TEXT;
