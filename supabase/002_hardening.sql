-- WreckLib prototype hardening (only for dedicated WreckLib Supabase project).
create index if not exists campaigns_owner_id_idx on public.campaigns(owner_id);
create index if not exists entries_created_by_idx on public.entries(created_by);
create index if not exists entries_parent_id_idx on public.entries(parent_id);
create index if not exists invitations_campaign_id_idx on public.invitations(campaign_id);

-- Keep INSERT/UPDATE permissions narrowly scoped, without duplicate SELECT policies.
drop policy if exists secrets_write on public.entry_secrets;
create policy secrets_insert on public.entry_secrets
for insert to authenticated
with check (exists (select 1 from public.entries e where e.id=entry_id and private.role_for(e.campaign_id)='master'));
create policy secrets_update on public.entry_secrets
for update to authenticated
using (exists (select 1 from public.entries e where e.id=entry_id and private.role_for(e.campaign_id)='master'))
with check (exists (select 1 from public.entries e where e.id=entry_id and private.role_for(e.campaign_id)='master'));

-- Always refresh updated_at on edits; never trust browser-provided timestamps.
create function private.touch_entry_updated_at()
returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger touch_entry_updated_at
before update on public.entries for each row
execute function private.touch_entry_updated_at();
revoke all on function private.touch_entry_updated_at() from public, anon;
