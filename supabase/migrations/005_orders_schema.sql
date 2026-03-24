-- 005_orders_schema.sql
-- Create orders and order_items tables for Phase 3

-- FORCE RECREATION DE TABLAS PENDIENTES
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;

CREATE TABLE public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT, -- Clerk user ID (optional, for logged-in users)
    customer_email TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
    total_amount NUMERIC NOT NULL,
    shipping_fee NUMERIC NOT NULL DEFAULT 0,
    shipping_info JSONB, -- Stores full address, province, zip formatting for Correo Argentino
    mp_preference_id TEXT,
    mp_payment_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    price NUMERIC NOT NULL
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Service role / Admin bypass implies they have full access.
-- Users can only insert orders where user_id matches their own auth ID.
-- The webhook (via supabaseAdmin / service role) bypasses RLS entirely.
CREATE POLICY "Users can insert own orders"
ON public.orders FOR INSERT
TO public
WITH CHECK (auth.uid()::text = user_id);

-- No public SELECT
CREATE POLICY "No public SELECT on orders"
ON public.orders FOR SELECT
TO public
USING (false);

CREATE POLICY "Anyone can insert order_items"
ON public.order_items FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "No public SELECT on order_items"
ON public.order_items FOR SELECT
TO public
USING (false);

-- Timestamp trigger for orders
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_orders_timestamp ON public.orders;
CREATE TRIGGER update_orders_timestamp
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION update_orders_updated_at();

-- Add 'reserved' status to products
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE public.products ADD CONSTRAINT products_status_check CHECK (status IN ('available', 'reserved', 'sold', 'archived'));

-- IMPORTANTE: Refrescar la caché de esquema de la API de Supabase
NOTIFY pgrst, 'reload schema';
