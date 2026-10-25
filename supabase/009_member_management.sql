-- WreckLib stage 3B, part B. Membership management restricted to campaign Masters.
-- No direct membership writes are ever granted to browser clients.
create function public.list_campaign_members(p_campaign_id uuid)
returns table(user_id uuid,email text,role text,is_owner boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or private.role_for(p_campaign_id)<>'master' then
   raise exception 'Only Masters can view campaign members';
 end if;
 return query select m.user_id,u.email::text,m.role,(m.user_id=c.owner_id)
 from public.memberships m
 join public.campaigns c on c.id=m.campaign_id
 join auth.users u on u.id=m.user_id
 where m.campaign_id=p_campaign_id order by (m.user_id=c.owner_id) desc,m.role,u.email;
end $$;

create function public.change_member_role(p_campaign_id uuid,p_user_id uuid,p_role text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare campaign_owner uuid;
begin
 if (select auth.uid()) is null or private.role_for(p_campaign_id)<>'master' then
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
end $$;

create function public.remove_campaign_member(p_campaign_id uuid,p_user_id uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare campaign_owner uuid; removed_email text;
begin
 if (select auth.uid()) is null or private.role_for(p_campaign_id)<>'master' then
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
end $$;

create function public.revoke_campaign_invitation(p_invitation_id uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare cid uuid;
begin
 if (select auth.uid()) is null then raise exception 'Not authenticated';end if;
 select i.campaign_id into cid from public.invitations i where i.id=p_invitation_id for update;
 if cid is null then raise exception 'Invitation not found';end if;
 if private.role_for(cid)<>'master' then raise exception 'Only Masters can revoke invitations';end if;
 delete from public.invitations where id=p_invitation_id;
 return true;
end $$;

revoke all on function public.list_campaign_members(uuid),public.change_member_role(uuid,uuid,text),
  public.remove_campaign_member(uuid,uuid),public.revoke_campaign_invitation(uuid)
from public,anon,authenticated;
grant execute on function public.list_campaign_members(uuid),public.change_member_role(uuid,uuid,text),
  public.remove_campaign_member(uuid,uuid),public.revoke_campaign_invitation(uuid)
to authenticated;
