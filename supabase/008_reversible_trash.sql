
-- Stage 3B. Reversible deletion: a tombstoned folder hides descendants without breaking parent_id.
alter table public.entries add column deleted_at timestamptz, add column deleted_by uuid references auth.users(id);
create index entries_trash_by_campaign on public.entries(campaign_id,deleted_at desc) where deleted_at is not null;

create or replace function private.visible_entry(eid uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare cur uuid:=eid; cid uuid; actor text; node record; seen uuid[]:='{}';
begin
 select e.campaign_id into cid from public.entries e where e.id=eid;
 actor:=private.role_for(cid);
 if cid is null or actor is null then return false;end if;
 while cur is not null loop
  if cur=any(seen) or cardinality(seen)>=64 then return false;end if;
  seen:=array_append(seen,cur);
  select e.parent_id,e.campaign_id,e.visibility,e.deleted_at into node from public.entries e where e.id=cur;
  if not found or node.campaign_id<>cid or node.deleted_at is not null then return false;end if;
  if actor<>'master' and node.visibility<>'published' then return false;end if;
  cur:=node.parent_id;
 end loop;
 return true;
end $$;
create or replace function private.shared_entry_visible(p_entry_id uuid,p_campaign_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare cur uuid:=p_entry_id; node record; seen uuid[]:='{}';
begin
 if cur is null or p_campaign_id is null then return false;end if;
 while cur is not null loop
  if cur=any(seen) or cardinality(seen)>=64 then return false;end if;
  seen:=array_append(seen,cur);
  select e.parent_id,e.campaign_id,e.visibility,e.deleted_at into node from public.entries e where e.id=cur;
  if not found or node.campaign_id<>p_campaign_id or node.deleted_at is not null
    or node.visibility<>'published' then return false;end if;
  cur:=node.parent_id;
 end loop;
 return true;
end $$;

-- Tombstones and structural columns cannot be written by ordinary REST clients.
create or replace function private.guard_entry_update()
returns trigger language plpgsql set search_path='' as $$
declare move_ok boolean; trash_ok boolean;
begin
 move_ok:=current_user='postgres' and current_setting('wrecklib.internal_move_entry',true)='on';
 trash_ok:=current_user='postgres' and current_setting('wrecklib.internal_trash_entry',true)='on';
 if new.id is distinct from old.id or new.campaign_id is distinct from old.campaign_id
 or new.created_by is distinct from old.created_by or new.kind is distinct from old.kind
 or (new.parent_id is distinct from old.parent_id and not move_ok)
 or ((new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by) and not trash_ok)
 then raise exception 'Structural fields cannot be changed via direct edit';end if;
 if private.role_for(old.campaign_id)<>'master' and
 (new.visibility is distinct from old.visibility or
  (new.image_path is distinct from old.image_path and new.image_path is not null
   and split_part(new.image_path,'/',1)<>old.campaign_id::text))
 then raise exception 'Invalid update';end if;
 if new.image_path is not null and split_part(new.image_path,'/',1)<>new.campaign_id::text then
 raise exception 'Image must belong to campaign';end if;
 return new;
end $$;

-- Disable movement of trash and into trash for everyone, including Masters.
create or replace function public.move_entry(p_entry_id uuid,p_parent_id uuid default null)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare item record; target record; cur uuid:=p_parent_id; seen uuid[]:='{}'; actor text;
begin
 if (select auth.uid()) is null then raise exception 'Not authenticated';end if;
 select e.id,e.campaign_id into item from public.entries e where e.id=p_entry_id for update;
 if not found then raise exception 'Entry not found';end if;
 actor:=private.role_for(item.campaign_id);
 if actor not in ('master','editor') then raise exception 'Not allowed to move entries';end if;
 if not private.visible_entry(item.id) then raise exception 'Entry is hidden or trashed';end if;
 if p_parent_id is not null then
  select e.id,e.campaign_id,e.kind into target from public.entries e where e.id=p_parent_id for update;
  if not found or target.campaign_id<>item.campaign_id or target.kind<>'folder'
  then raise exception 'Destination must be a folder in this campaign';end if;
  if not private.visible_entry(p_parent_id) then raise exception 'Destination is hidden or trashed';end if;
 end if;
 while cur is not null loop
  if cur=p_entry_id or cur=any(seen) then raise exception 'Moving here would create a folder cycle';end if;
  if cardinality(seen)>=64 then raise exception 'Folder nesting limit reached';end if;
  seen:=array_append(seen,cur);
  select e.parent_id into cur from public.entries e where e.id=cur;
 end loop;
 perform pg_catalog.set_config('wrecklib.internal_move_entry','on',true);
 update public.entries set parent_id=p_parent_id where id=p_entry_id;
 perform pg_catalog.set_config('wrecklib.internal_move_entry','off',true);
 return p_entry_id;
end $$;

create function public.trash_entry(p_entry_id uuid)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare item record;
begin
 if (select auth.uid()) is null then raise exception 'Not authenticated';end if;
 select e.id,e.campaign_id,e.deleted_at into item from public.entries e where e.id=p_entry_id for update;
 if not found then raise exception 'Entry not found';end if;
 if private.role_for(item.campaign_id)<>'master' then raise exception 'Only Masters can trash entries';end if;
 if item.deleted_at is not null or not private.visible_entry(item.id) then
 raise exception 'Already trashed or under a trashed folder';end if;
 perform pg_catalog.set_config('wrecklib.internal_trash_entry','on',true);
 update public.entries set deleted_at=now(),deleted_by=(select auth.uid()) where id=p_entry_id;
 perform pg_catalog.set_config('wrecklib.internal_trash_entry','off',true);
 return p_entry_id;
end $$;
create function public.restore_entry(p_entry_id uuid)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare item record;
begin
 if (select auth.uid()) is null then raise exception 'Not authenticated';end if;
 select e.id,e.campaign_id,e.parent_id,e.deleted_at into item from public.entries e where e.id=p_entry_id for update;
 if not found then raise exception 'Entry not found';end if;
 if private.role_for(item.campaign_id)<>'master' then raise exception 'Only Masters can restore entries';end if;
 if item.deleted_at is null then raise exception 'Not in trash';end if;
 if item.parent_id is not null and not private.visible_entry(item.parent_id) then
 raise exception 'Restore the parent folder first';end if;
 perform pg_catalog.set_config('wrecklib.internal_trash_entry','on',true);
 update public.entries set deleted_at=null,deleted_by=null where id=p_entry_id;
 perform pg_catalog.set_config('wrecklib.internal_trash_entry','off',true);
 return p_entry_id;
end $$;
create function public.list_trash(p_campaign_id uuid)
returns table(id uuid,title text,kind text,parent_id uuid,deleted_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or private.role_for(p_campaign_id)<>'master' then
 raise exception 'Only Masters can list trash';end if;
 return query select e.id,e.title,e.kind,e.parent_id,e.deleted_at from public.entries e
 where e.campaign_id=p_campaign_id and e.deleted_at is not null order by e.deleted_at desc,e.id;
end $$;
revoke all on function public.trash_entry(uuid),public.restore_entry(uuid),public.list_trash(uuid) from public,anon,authenticated;
grant execute on function public.trash_entry(uuid),public.restore_entry(uuid),public.list_trash(uuid) to authenticated;
