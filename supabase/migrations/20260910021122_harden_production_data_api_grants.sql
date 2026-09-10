-- Defense in depth: internal authority tables must not become Data API surfaces
-- if a future migration adds an RLS policy. Service roles retain their existing access.
revoke all privileges on table
  public.credit_purchase_intents,
  public.integrity_audit,
  public.integrity_quarantine,
  public.inventory_reservations,
  public.payment_claims,
  public.payment_events,
  public.payment_manual_reviews
from anon, authenticated;
