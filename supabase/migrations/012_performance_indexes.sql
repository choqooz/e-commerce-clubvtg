-- Performance indexes for production queries

-- Idempotency check in MP webhook (credit_transactions)
CREATE INDEX IF NOT EXISTS idx_credit_tx_mp_payment
ON credit_transactions (mp_payment_id)
WHERE mp_payment_id IS NOT NULL;

-- Lazy release query (products with expired reservations)
CREATE INDEX IF NOT EXISTS idx_products_reserved
ON products (reserved_at)
WHERE status = 'reserved';
