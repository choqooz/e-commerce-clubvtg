-- ============================================
-- ClubVTG — Initial Database Schema
-- ============================================

-- ENUMS
CREATE TYPE product_status AS ENUM ('available', 'reserved', 'sold', 'archived');
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'delivered', 'cancelled');

-- ============================================
-- 1. PERFILES DE USUARIO (sync con Clerk)
-- ============================================
CREATE TABLE profiles (
  id            TEXT PRIMARY KEY,                    -- Clerk user ID
  email         TEXT UNIQUE NOT NULL,
  full_name     TEXT,
  credits       INTEGER DEFAULT 0 CHECK (credits >= 0),
  is_admin      BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. PRODUCTOS VINTAGE (Stock Único)
-- ============================================
CREATE TABLE products (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  description   TEXT,
  price         NUMERIC NOT NULL CHECK (price >= 0),
  original_price NUMERIC CHECK (original_price >= 0),
  size          TEXT NOT NULL,
  color         TEXT NOT NULL,
  color_hex     TEXT,
  category      TEXT NOT NULL,
  image_urls    TEXT[] NOT NULL DEFAULT '{}',
  status        product_status DEFAULT 'available',
  reserved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_status ON products (status);
CREATE INDEX idx_products_category ON products (category);
CREATE INDEX idx_products_slug ON products (slug);

-- ============================================
-- 3. ÓRDENES
-- ============================================
CREATE TABLE orders (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           TEXT REFERENCES profiles(id) NOT NULL,
  total_amount      NUMERIC NOT NULL,
  shipping_fee      NUMERIC NOT NULL DEFAULT 5000,
  status            order_status DEFAULT 'pending',
  mp_payment_id     TEXT,
  mp_preference_id  TEXT,
  tracking_number   TEXT,
  shipping_address  JSONB NOT NULL,
  customer_notes    TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_user ON orders (user_id);
CREATE INDEX idx_orders_status ON orders (status);

-- ============================================
-- 4. ITEMS DE ORDEN
-- ============================================
CREATE TABLE order_items (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id          UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  product_id        UUID REFERENCES products(id) NOT NULL,
  price_at_purchase NUMERIC NOT NULL
);

CREATE INDEX idx_order_items_order ON order_items (order_id);

-- ============================================
-- 5. LOGS DE USO DE IA
-- ============================================
CREATE TABLE ai_tryon_logs (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           TEXT REFERENCES profiles(id) NOT NULL,
  product_id        UUID REFERENCES products(id) NOT NULL,
  user_image_url    TEXT NOT NULL,
  result_image_url  TEXT,
  status            TEXT DEFAULT 'processing',
  error_message     TEXT,
  credits_charged   INTEGER DEFAULT 1,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_logs_user ON ai_tryon_logs (user_id);

-- ============================================
-- 6. TRANSACCIONES DE CRÉDITOS
-- ============================================
CREATE TABLE credit_transactions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         TEXT REFERENCES profiles(id) NOT NULL,
  amount          INTEGER NOT NULL,
  reason          TEXT NOT NULL,
  mp_payment_id   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_tx_user ON credit_transactions (user_id);

-- ============================================
-- RPC: Descontar crédito atómicamente
-- ============================================
CREATE OR REPLACE FUNCTION use_ai_credit(p_user_id TEXT, p_product_id UUID, p_user_image_url TEXT)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
  v_credits INTEGER;
BEGIN
  UPDATE profiles
  SET credits = credits - 1, updated_at = NOW()
  WHERE id = p_user_id AND credits > 0
  RETURNING credits INTO v_credits;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  INSERT INTO ai_tryon_logs (user_id, product_id, user_image_url, status)
  VALUES (p_user_id, p_product_id, p_user_image_url, 'processing')
  RETURNING id INTO v_log_id;

  INSERT INTO credit_transactions (user_id, amount, reason)
  VALUES (p_user_id, -1, 'ai_tryon');

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RPC: Reembolsar crédito (si la generación falla)
-- ============================================
CREATE OR REPLACE FUNCTION refund_ai_credit(p_log_id UUID)
RETURNS VOID AS $$
DECLARE
  v_user_id TEXT;
BEGIN
  SELECT user_id INTO v_user_id
  FROM ai_tryon_logs
  WHERE id = p_log_id AND status = 'failed' AND credits_charged > 0;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'log_not_found_or_already_refunded';
  END IF;

  UPDATE profiles SET credits = credits + 1, updated_at = NOW()
  WHERE id = v_user_id;

  UPDATE ai_tryon_logs SET credits_charged = 0 WHERE id = p_log_id;

  INSERT INTO credit_transactions (user_id, amount, reason)
  VALUES (v_user_id, 1, 'refund');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
