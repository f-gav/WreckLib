-- Applied WreckLib migration: safe entry movement and protection of existing membership roles.
-- All three functions run in the dedicated WreckLib database only.
CREATE OR REPLACE FUNCTION private.guard_entry_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare trusted_move boolean;
begin
 trusted_move := current_user='postgres'
   and current_setting('wrecklib.internal_move_entry',true)='on';
 if new.id is distinct from old.id
   or new.campaign_id is distinct from old.campaign_id
   or new.created_by is distinct from old.created_by
   or new.kind is distinct from old.kind
   or (new.parent_id is distinct from old.parent_id and not trusted_move) then
    raise exception 'Structural fields cannot be changed via direct edit';
 end if;
 if private.role_for(old.campaign_id)<>'master'
   and (new.visibility is distinct from old.visibility
        or (new.image_path is distinct from old.image_path
            and new.image_path is not null
            and split_part(new.image_path,'/',1)<>old.campaign_id::text)) then
    raise exception 'Invalid update';
 end if;
 if new.image_path is not null
   and split_part(new.image_path,'/',1)<>new.campaign_id::text then
    raise exception 'Image must belong to campaign';
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.accept_invitation(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare inv record; caller_email text;
begin
 if (select auth.uid()) is null then raise exception 'Not authenticated'; end if;
 select lower(email) into caller_email from auth.users where id=(select auth.uid());
 select * into inv from public.invitations where id=p_id and lower(email)=caller_email for update;
 if not found then raise exception 'Invitation not found'; end if;
 insert into public.memberships(campaign_id,user_id,role)
 values(inv.campaign_id,(select auth.uid()),inv.role)
 on conflict(campaign_id,user_id) do nothing;
 delete from public.invitations where id=p_id;
 return inv.campaign_id;
end $function$;

CREATE OR REPLACE FUNCTION public.move_entry(p_entry_id uuid, p_parent_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item record; destination record; node_id uuid; seen uuid[]:='{}'::uuid[];
        actor_role text; steps integer:=0;
begin
 if (select auth.uid()) is null then raise exception 'Not authenticated'; end if;
 select e.id,e.campaign_id,e.parent_id,e.visibility into item
 from public.entries e where e.id=p_entry_id for update;
 if not found then raise exception 'Entry not found';end if;
 actor_role:=private.role_for(item.campaign_id);
 if actor_role not in ('master','editor') then raise exception 'Not allowed to move entries';end if;
 if actor_role='editor' and not private.visible_entry(item.id) then
   raise exception 'Hidden entry cannot be moved by editor';
 end if;
 if p_parent_id is not null then
   select e.id,e.campaign_id,e.kind,e.visibility into destination
   from public.entries e where e.id=p_parent_id for update;
   if not found or destination.campaign_id<>item.campaign_id
      or destination.kind<>'folder' then raise exception 'Destination must be a folder in this campaign';end if;
   if actor_role='editor' and not private.visible_entry(p_parent_id) then
     raise exception 'Editors cannot move entries under hidden folders';end if;
 end if;
 node_id:=p_parent_id;
 while node_id is not null loop
   if node_id=p_entry_id or node_id=any(seen) then
     raise exception 'Moving here would create a folder cycle';
   end if;
   seen:=array_append(seen,node_id);steps:=steps+1;
   if steps>64 then raise exception 'Folder nesting limit reached';end if;
   select parent_id into node_id from public.entries where id=node_id;
 end loop;
 perform pg_catalog.set_config('wrecklib.internal_move_entry','on',true);
 update public.entries set parent_id=p_parent_id where id=p_entry_id;
 perform pg_catalog.set_config('wrecklib.internal_move_entry','off',true);
 return p_entry_id;
end $function$;

revoke all on function public.move_entry(uuid,uuid) from public,anon,authenticated;
grant execute on function public.move_entry(uuid,uuid) to authenticated;
