-- WreckLib stage 5: private immutable content revision snapshots.
-- Secrets, image bytes, deleted state, visibility, and parent relationships are intentionally NOT versioned.
create table private.entry_revisions (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.entries(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  snapshot jsonb not null,
  edited_by uuid,
  created_at timestamptz not null default now(),
  unique(entry_id,revision_number)
);
create index entry_revisions_lookup_idx on private.entry_revisions(entry_id,created_at desc);
alter table private.entry_revisions enable row level security;
revoke all on private.entry_revisions from public,anon,authenticated;

create function private.capture_entry_revision()
returns trigger language plpgsql security definer set search_path='' as $$
declare next_number integer;
begin
  if tg_op='UPDATE' and
     old.title is not distinct from new.title and
     old.description is not distinct from new.description and
     old.body is not distinct from new.body and
     old.tags is not distinct from new.tags
  then return new; end if;
  select coalesce(max(r.revision_number),0)+1 into next_number
  from private.entry_revisions r where r.entry_id=new.id;
  insert into private.entry_revisions(entry_id,revision_number,snapshot,edited_by)
  values(new.id,next_number,pg_catalog.jsonb_build_object(
    'title',new.title,'description',new.description,'body',new.body,'tags',new.tags
  ),coalesce((select auth.uid()),new.created_by));
  return new;
end $$;
revoke all on function private.capture_entry_revision() from public,anon,authenticated;
create trigger capture_entry_revision
after insert or update on public.entries
for each row execute function private.capture_entry_revision();

create function public.list_entry_revisions(p_entry_id uuid)
returns table(revision_id bigint,revision_number integer,created_at timestamptz,editor_id uuid,title text,preview text)
language plpgsql stable security definer set search_path='' as $$
declare cid uuid;
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated';end if;
  select e.campaign_id into cid from public.entries e where e.id=p_entry_id;
  if cid is null or private.role_for(cid) is distinct from 'master'
     or not private.visible_entry(p_entry_id)
  then raise exception 'Not authorized to view revision history';end if;
  return query select r.id,r.revision_number,r.created_at,r.edited_by,
    r.snapshot->>'title',left(r.snapshot->>'body',160)
  from private.entry_revisions r where r.entry_id=p_entry_id
  order by r.revision_number desc limit 100;
end $$;

create function public.read_entry_revision(p_entry_id uuid,p_revision_id bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cid uuid; result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated';end if;
  select e.campaign_id into cid from public.entries e where e.id=p_entry_id;
  if cid is null or private.role_for(cid) is distinct from 'master'
     or not private.visible_entry(p_entry_id)
  then raise exception 'Not authorized to read revision';end if;
  select r.snapshot into result from private.entry_revisions r
  where r.entry_id=p_entry_id and r.id=p_revision_id;
  if result is null then raise exception 'Revision not found';end if;
  return result;
end $$;

create function public.restore_entry_revision(p_entry_id uuid,p_revision_id bigint)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare cid uuid; archived jsonb; revised_tags text[];
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated';end if;
  select e.campaign_id into cid from public.entries e
  where e.id=p_entry_id for update;
  if cid is null or private.role_for(cid) is distinct from 'master'
     or not private.visible_entry(p_entry_id)
  then raise exception 'Not authorized to restore revision';end if;
  select r.snapshot into archived from private.entry_revisions r
  where r.id=p_revision_id and r.entry_id=p_entry_id;
  if archived is null then raise exception 'Revision not found';end if;
  select coalesce(array_agg(v.value order by v.ordinality),'{}'::text[])
  into revised_tags from pg_catalog.jsonb_array_elements_text(archived->'tags')
    with ordinality as v(value,ordinality);
  update public.entries e
  set title=archived->>'title',
      description=archived->>'description',
      body=archived->>'body',
      tags=revised_tags
  where e.id=p_entry_id;
  -- BEFORE UPDATE guard and AFTER UPDATE history trigger preserve RLS rules
  -- and create a new revision rather than overwriting old history.
  return p_entry_id;
end $$;
revoke all on function public.list_entry_revisions(uuid),
  public.read_entry_revision(uuid,bigint),
  public.restore_entry_revision(uuid,bigint)
from public,anon,authenticated;
grant execute on function public.list_entry_revisions(uuid),
  public.read_entry_revision(uuid,bigint),
  public.restore_entry_revision(uuid,bigint)
to authenticated;
