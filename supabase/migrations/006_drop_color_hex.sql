-- Drop unused color_hex column (color display uses hardcoded COLOR_MAP in frontend)
ALTER TABLE products DROP COLUMN IF EXISTS color_hex;
