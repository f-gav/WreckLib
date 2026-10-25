-- Deny NULL membership in privileged RPCs. PostgreSQL IF NULL is not IF TRUE.
CREATE OR REPLACE FUNCTION private.guard_entry_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare move_ok boolean; trash_ok boolean;
begin
 move_ok:=current_user='postgres' and current_setting('wrecklib.internal_move_entry',true)='on';
 trash_ok:=current_user='postgres' and current_setting('wrecklib.internal_trash_entry',true)='on';
 if new.id is distinct from old.id or new.campaign_id is distinct from old.campaign_id
 or new.created_by is distinct from old.created_by or new.kind is distinct from old.kind
 or (new.parent_id is distinct from old.parent_id and not move_ok)
 or ((new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by) and not trash_ok)
 then raise exception 'Structural fields cannot be changed via direct edit';end if;
 if private.role_for(old.campaign_id) IS DISTINCT FROM 'master' and
 (new.visibility is distinct from old.visibility or
  (new.image_path is distinct from old.image_path and new.image_path is not null
   and split_part(new.image_path,'/',1)<>old.campaign_id::text))
 then raise exception 'Invalid update';end if;
 if new.image_path is not null and split_part(new.image_path,'/',1)<>new.campaign_id::text then
 raise exception 'Image must belong to campaign';end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.change_member_role(p_campaign_id uuid, p_user_id uuid, p_role text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare campaign_owner uuid;
begin
 if (select auth.uid()) is null or private.role_for(p_campaign_id) IS DISTINCT FROM 'master' then
   raise exception 'Only Masters can change members';
 end if;
 if p_role is null or p_role not in ('master','editor','viewer') then raise exception 'Invalid role';end if;
 select c.owner_id into campaign_owner from public.campaigns c where c.id=p_campaign_id for update;
 if campaign_owner is null then raise exception 'Campaign not found';end if;
 if p_user_id=campaign_owner or p_user_id=(select auth.uid()) then
   raise exception 'Owner and current Master roles cannot be changed here';
 end if;
 update public.memberships m set role=p_role
 where m.campaign_id=p_campaign_id and m.user_id=p_user_id;
 if not found then raise exception 'Member not found';end if;
 return true;
end $function$;

CREATE OR REPLACE FUNCTION public.get_campaign_share_status(p_campaign_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null or private.role_for(p_campaign_id) IS DISTINCT FROM 'master' then
    raise exception 'Not authorized';
  end if;
  return exists(select 1 from private.campaign_shares where campaign_id=p_campaign_id);
end $function$;

CREATE OR REPLACE FUNCTION public.list_campaign_members(p_campaign_id uuid)
 RETURNS TABLE(user_id uuid, email text, role text, is_owner boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if (select auth.uid()) is null or private.role_for(p_campaign_id) IS DISTINCT FROM 'master' then
   raise exception 'Only Masters can view campaign members';
 end if;
 return query select m.user_id,u.email::text,m.role,(m.user_id=c.owner_id)
 from public.memberships m
 join public.campaigns c on c.id=m.campaign_id
 join auth.users u on u.id=m.user_id
 where m.campaign_id=p_campaign_id order by (m.user_id=c.owner_id) desc,m.role,u.email;
end $function$;

CREATE OR REPLACE FUNCTION public.list_trash(p_campaign_id uuid)
 RETURNS TABLE(id uuid, title text, kind text, parent_id uuid, deleted_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if (select auth.uid()) is null or private.role_for(p_campaign_id) IS DISTINCT FROM 'master' then
 raise exception 'Only Masters can list trash';end if;
 return query select e.id,e.title,e.kind,e.parent_id,e.deleted_at from public.entries e
 where e.campaign_id=p_campaign_id and e.deleted_at is not null order by e.deleted_at desc,e.id;
end $function$;

CREATE OR REPLACE FUNCTION public.move_entry(p_entry_id uuid, p_parent_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item record; target record; cur uuid:=p_parent_id; seen uuid[]:='{}'; actor text;
begin
 if (select auth.uid()) is null then raise exception 'Not authenticated';end if;
 select e.id,e.campaign_id into item from public.entries e where e.id=p_entry_id for update;
 if not found then raise exception 'Entry not found';end if;
 actor:=private.role_for(item.campaign_id);
 if actor is null or actor not in ('master','editor') then raise exception 'Not allowed to move entries';end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.remove_campaign_member(p_campaign_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare campaign_owner uuid; removed_email text;
begin
 if (select auth.uid()) is null or private.role_for(p_campaign_id) IS DISTINCT FROM 'master' then
   raise exception 'Only Masters can remove members';
 end if;
 select c.owner_id into campaign_owner from public.campaigns c where c.id=p_campaign_id for update;
 if campaign_owner is null then raise exception 'Campaign not found';end if;
 if p_user_id=campaign_owner or p_user_id=(select auth.uid()) then
   raise exception 'Cannot remove the owner or yourself';
 end if;
 select lower(u.email) into removed_email from auth.users u where u.id=p_user_id;
 delete from public.memberships m where m.campaign_id=p_campaign_id and m.user_id=p_user_id;
 if not found then raise exception 'Member not found';end if;
 -- Prevent an old still-pending invitation from silently re-adding this member.
 if removed_email is not null then
  delete from public.invitations i where i.campaign_id=p_campaign_id and lower(i.email)=removed_email;
 end if;
 return true;
end $function$;

CREATE OR REPLACE FUNCTION public.restore_entry(p_entry_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item record;
begin
 if (select auth.uid()) is null then raise exception 'Not authenticated';end if;
 select e.id,e.campaign_id,e.parent_id,e.deleted_at into item from public.entries e where e.id=p_entry_id for update;
 if not found then raise exception 'Entry not found';end if;
 if private.role_for(item.campaign_id) IS DISTINCT FROM 'master' then raise exception 'Only Masters can restore entries';end if;
 if item.deleted_at is null then raise exception 'Not in trash';end if;
 if item.parent_id is not null and not private.visible_entry(item.parent_id) then
 raise exception 'Restore the parent folder first';end if;
 perform pg_catalog.set_config('wrecklib.internal_trash_entry','on',true);
 update public.entries set deleted_at=null,deleted_by=null where id=p_entry_id;
 perform pg_catalog.set_config('wrecklib.internal_trash_entry','off',true);
 return p_entry_id;
end $function$;

CREATE OR REPLACE FUNCTION public.revoke_campaign_invitation(p_invitation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cid uuid;
begin
 if (select auth.uid()) is null then raise exception 'Not authenticated';end if;
 select i.campaign_id into cid from public.invitations i where i.id=p_invitation_id for update;
 if cid is null then raise exception 'Invitation not found';end if;
 if private.role_for(cid) IS DISTINCT FROM 'master' then raise exception 'Only Masters can revoke invitations';end if;
 delete from public.invitations where id=p_invitation_id;
 return true;
end $function$;

CREATE OR REPLACE FUNCTION public.revoke_campaign_share(p_campaign_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null or private.role_for(p_campaign_id) IS DISTINCT FROM 'master' then
    raise exception 'Only a campaign master may revoke a share link';
  end if;
  delete from private.campaign_shares where campaign_id=p_campaign_id;
  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.rotate_campaign_share(p_campaign_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare token text;
begin
  if (select auth.uid()) is null or private.role_for(p_campaign_id) IS DISTINCT FROM 'master' then
    raise exception 'Only a campaign master may publish a share link';
  end if;
  token:=pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
  insert into private.campaign_shares(campaign_id,token_hash)
  values(p_campaign_id,pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(token,'UTF8')),'hex'))
  on conflict(campaign_id) do update set token_hash=excluded.token_hash,created_at=now();
  return token;
end $function$;

CREATE OR REPLACE FUNCTION public.trash_entry(p_entry_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item record;
begin
 if (select auth.uid()) is null then raise exception 'Not authenticated';end if;
 select e.id,e.campaign_id,e.deleted_at into item from public.entries e where e.id=p_entry_id for update;
 if not found then raise exception 'Entry not found';end if;
 if private.role_for(item.campaign_id) IS DISTINCT FROM 'master' then raise exception 'Only Masters can trash entries';end if;
 if item.deleted_at is not null or not private.visible_entry(item.id) then
 raise exception 'Already trashed or under a trashed folder';end if;
 perform pg_catalog.set_config('wrecklib.internal_trash_entry','on',true);
 update public.entries set deleted_at=now(),deleted_by=(select auth.uid()) where id=p_entry_id;
 perform pg_catalog.set_config('wrecklib.internal_trash_entry','off',true);
 return p_entry_id;
end $function$;
