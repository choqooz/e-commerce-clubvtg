-- Production application is an irreversible policy activation, not a merge-time rollout instruction.
-- It activates only the prepared 019/021 authorities and deliberately performs no historical backfill.
-- After rollout, operational failures remain retryable 503/fix-forward work: never deactivate these authorities.
begin;

update public.clerk_lifecycle_config
set registration_bonus_activated_at = coalesce(registration_bonus_activated_at, pg_catalog.now()),
    clerk_anonymization_activated_at = coalesce(clerk_anonymization_activated_at, pg_catalog.now())
where singleton
  and (registration_bonus_activated_at is null or clerk_anonymization_activated_at is null);

commit;
