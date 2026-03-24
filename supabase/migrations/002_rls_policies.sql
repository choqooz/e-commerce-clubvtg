-- ============================================
-- ClubVTG — Row Level Security Policies
-- ============================================
-- Prerequisite: Run 001_initial_schema.sql first

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tryon_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- ── PROFILES ──
-- Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (id = auth.jwt()->>'sub');

-- Profiles are created/updated via server-side webhook (service_role key)
-- No INSERT/UPDATE/DELETE policies for anon/authenticated — handled server-side

-- ── PRODUCTS ──
-- Everyone can view available products
CREATE POLICY "Anyone can view available products"
  ON products FOR SELECT
  USING (status = 'available');

-- Admin manages products via server-side (service_role key)

-- ── ORDERS ──
-- Users can view their own orders
CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  USING (user_id = auth.jwt()->>'sub');

-- Users can create orders
CREATE POLICY "Users can create orders"
  ON orders FOR INSERT
  WITH CHECK (user_id = auth.jwt()->>'sub');

-- ── ORDER ITEMS ──
-- Users can view their own order items (via join)
CREATE POLICY "Users can view own order items"
  ON order_items FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders WHERE user_id = auth.jwt()->>'sub'
    )
  );

-- ── AI TRYON LOGS ──
-- Users can view their own logs
CREATE POLICY "Users can view own ai logs"
  ON ai_tryon_logs FOR SELECT
  USING (user_id = auth.jwt()->>'sub');

-- ── CREDIT TRANSACTIONS ──
-- Users can view their own transactions
CREATE POLICY "Users can view own credit transactions"
  ON credit_transactions FOR SELECT
  USING (user_id = auth.jwt()->>'sub');
