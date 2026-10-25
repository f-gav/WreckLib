-- WreckLib Stage 4B: tags belong to the same RLS-protected entry row.
-- Avoid extra exposed tables and preserve existing content and secrets.
alter table public.entries
  add column tags text[] not null default '{}'::text[];
alter table public.entries
  add constraint entries_tags_valid check (
    cardinality(tags)<=16
    and octet_length(array_to_string(tags,','))<=640
    and array_position(tags,null) is null
  );
-- For future RLS-preserving tag queries; current UI filters only visible rows.
create index entries_tags_gin_idx on public.entries using gin(tags);

-- Guest view: only published, non-trashed descendant articles via existing
-- private.shared_entry_visible. No secrets, image paths or member data.
create or replace function public.read_shared_campaign(p_token text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cid uuid; result jsonb;
begin
  cid:=private.share_campaign_for_token(p_token);
  if cid is null then return null;end if;
  select pg_catalog.jsonb_build_object(
    'id',c.id,'name',c.name,
    'entries',coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id',e.id,'parent_id',e.parent_id,'kind',e.kind,
          'title',e.title,'description',e.description,'body',e.body,
          'tags',e.tags,
          'has_image',e.image_path is not null,'updated_at',e.updated_at
        ) order by e.updated_at desc
      ) from public.entries e
      where e.campaign_id=c.id and private.shared_entry_visible(e.id,c.id)
    ),'[]'::jsonb)
  ) into result from public.campaigns c where c.id=cid;
  return result;
end $$;
-- Reassert explicit exposure: these are intentional token-gated reads.
revoke all on function public.read_shared_campaign(text) from public,anon,authenticated;
grant execute on function public.read_shared_campaign(text) to anon,authenticated;
