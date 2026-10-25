-- Stage 1: eliminate broad default Supabase grants from application tables.
-- TRUNCATE bypasses RLS: never grant it to browser-facing roles.
revoke all privileges on table
  public.campaigns, public.memberships, public.entries,
  public.entry_secrets, public.invitations
from public, anon, authenticated;

grant select, insert on table public.campaigns to authenticated;
grant select on table public.memberships to authenticated;
grant select, insert, update on table public.entries to authenticated;
grant select, insert, update on table public.entry_secrets to authenticated;
grant select, insert on table public.invitations to authenticated;
