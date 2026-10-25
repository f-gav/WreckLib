-- Do not permit browser inserts that pre-populate trash markers.
drop policy if exists entries_create on public.entries;
create policy entries_create on public.entries for insert to authenticated
with check (
 deleted_at is null and deleted_by is null
 and private.role_for(campaign_id) in ('master','editor')
 and created_by=(select auth.uid())
 and (visibility='published' or private.role_for(campaign_id)='master')
 and (
 parent_id is null
 or exists(
 select 1 from public.entries as parent_entry
 where parent_entry.id=entries.parent_id
   and parent_entry.campaign_id=entries.campaign_id
   and parent_entry.kind='folder'
   and private.visible_entry(parent_entry.id)
 )
 )
);
