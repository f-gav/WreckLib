-- Stage 1: fix parent lookup in entries_create RLS.
-- The original unqualified parent_id was bound to the subquery's parent row,
-- effectively checking parent_entry.id = parent_entry.parent_id.
drop policy if exists entries_create on public.entries;
create policy entries_create on public.entries for insert to authenticated
with check (
  private.role_for(campaign_id) in ('master','editor')
  and created_by = (select auth.uid())
  and (visibility = 'published' or private.role_for(campaign_id) = 'master')
  and (
    parent_id is null
    or exists (
      select 1 from public.entries as parent_entry
      where parent_entry.id = entries.parent_id
        and parent_entry.campaign_id = entries.campaign_id
        and parent_entry.kind = 'folder'
        and private.visible_entry(parent_entry.id)
    )
  )
);
