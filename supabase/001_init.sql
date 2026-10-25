-- WreckLib: run ONLY in a new, dedicated Supabase project.
create extension if not exists pgcrypto;
create table public.campaigns(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 100),owner_id uuid not null references auth.users(id),created_at timestamptz default now());
create table public.memberships(campaign_id uuid not null references public.campaigns(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,role text not null check(role in ('master','editor','viewer')),primary key(campaign_id,user_id));
create table public.entries(id uuid primary key default gen_random_uuid(),campaign_id uuid not null references public.campaigns(id) on delete cascade,parent_id uuid references public.entries(id) on delete restrict,kind text not null check(kind in ('folder','person','location','item','faction','event','article')),title text not null check(length(title) between 1 and 140),description text not null default '',body text not null default '',visibility text not null default 'published' check(visibility in ('published','master')),image_path text,created_by uuid not null references auth.users(id),updated_at timestamptz default now());
create table public.entry_secrets(entry_id uuid primary key references public.entries(id) on delete cascade,secret_body text not null default '');
create table public.invitations(id uuid primary key default gen_random_uuid(),campaign_id uuid not null references public.campaigns(id) on delete cascade,email text not null,role text not null check(role in ('master','editor','viewer')),created_at timestamptz default now());
create index on public.entries(campaign_id,parent_id);
create index on public.memberships(user_id);
create schema if not exists private;
create function private.role_for(cid uuid) returns text language sql stable security definer set search_path='' as $$select m.role from public.memberships m where m.campaign_id=cid and m.user_id=(select auth.uid())$$;
create function private.visible_entry(eid uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare current_id uuid:=eid; root_campaign uuid; node record; seen uuid[]:='{}';
begin
 select campaign_id into root_campaign from public.entries where id=eid;
 if root_campaign is null or private.role_for(root_campaign) is null then return false; end if;
 if private.role_for(root_campaign)='master' then return true; end if;
 while current_id is not null loop
   if current_id=any(seen) then return false; end if;
   seen:=array_append(seen,current_id);
   select parent_id,campaign_id,visibility into node from public.entries where id=current_id;
   if not found or node.campaign_id<>root_campaign or node.visibility<>'published' then return false; end if;
   current_id:=node.parent_id;
 end loop;
 return true;
end $$;
revoke all on function private.role_for(uuid),private.visible_entry(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.role_for(uuid),private.visible_entry(uuid) to authenticated;
alter table public.campaigns enable row level security;
alter table public.memberships enable row level security;
alter table public.entries enable row level security;
alter table public.entry_secrets enable row level security;
alter table public.invitations enable row level security;
create policy campaigns_read on public.campaigns for select to authenticated using (private.role_for(id) is not null);
create policy campaigns_create on public.campaigns for insert to authenticated with check (owner_id=(select auth.uid()));
create policy memberships_read on public.memberships for select to authenticated using (private.role_for(campaign_id) is not null);
create policy entries_read on public.entries for select to authenticated using (private.visible_entry(id));
create policy entries_create on public.entries for insert to authenticated with check (private.role_for(campaign_id) in ('master','editor') and created_by=(select auth.uid()) and (visibility='published' or private.role_for(campaign_id)='master') and (parent_id is null or exists(select 1 from public.entries p where p.id=parent_id and p.campaign_id=entries.campaign_id and p.kind='folder' and private.visible_entry(p.id))));
create policy entries_update on public.entries for update to authenticated using (private.role_for(campaign_id) in ('master','editor') and private.visible_entry(id)) with check (private.role_for(campaign_id) in ('master','editor') and (visibility='published' or private.role_for(campaign_id)='master'));
create policy secrets_read on public.entry_secrets for select to authenticated using (exists(select 1 from public.entries e where e.id=entry_id and private.role_for(e.campaign_id)='master'));
create policy secrets_write on public.entry_secrets for all to authenticated using (exists(select 1 from public.entries e where e.id=entry_id and private.role_for(e.campaign_id)='master')) with check (exists(select 1 from public.entries e where e.id=entry_id and private.role_for(e.campaign_id)='master'));
create policy invites_read on public.invitations for select to authenticated using (private.role_for(campaign_id)='master');
create policy invites_create on public.invitations for insert to authenticated with check (private.role_for(campaign_id)='master');
-- Membership bootstrap and acceptance use narrowly scoped RPCs, not public INSERT policies.
create function public.create_campaign(p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 if (select auth.uid()) is null or length(trim(p_name)) not between 1 and 100 then raise exception 'Invalid campaign'; end if;
 insert into public.campaigns(name,owner_id) values(trim(p_name),(select auth.uid())) returning id into cid;
 insert into public.memberships(campaign_id,user_id,role) values(cid,(select auth.uid()),'master');
 return cid;
end $$;
create function public.accept_invitation(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare inv record; caller_email text;
begin
 if (select auth.uid()) is null then raise exception 'Not authenticated';end if;
 select lower(email) into caller_email from auth.users where id=(select auth.uid());
 select * into inv from public.invitations where id=p_id and lower(email)=caller_email;
 if not found then raise exception 'Invitation not found';end if;
 insert into public.memberships(campaign_id,user_id,role) values(inv.campaign_id,(select auth.uid()),inv.role)
 on conflict(campaign_id,user_id) do update set role=excluded.role;
 delete from public.invitations where id=p_id;
 return inv.campaign_id;
end $$;
revoke all on function public.create_campaign(text),public.accept_invitation(uuid) from public,anon;
grant execute on function public.create_campaign(text),public.accept_invitation(uuid) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('wrecklib-images','wrecklib-images',false,3145728,array['image/webp']) on conflict(id) do nothing;
create policy wrecklib_images_read on storage.objects for select to authenticated using(bucket_id='wrecklib-images' and exists(select 1 from public.entries e where e.image_path=name and private.visible_entry(e.id)));
create policy wrecklib_images_upload on storage.objects for insert to authenticated with check(bucket_id='wrecklib-images' and (storage.foldername(name))[1] in (select m.campaign_id::text from public.memberships m where m.user_id=(select auth.uid()) and m.role in ('master','editor')));

-- Prevent editors from reparenting or moving a record through direct REST updates.
create function private.guard_entry_update() returns trigger language plpgsql set search_path='' as $$
begin
 if new.id<>old.id or new.campaign_id<>old.campaign_id or new.parent_id is distinct from old.parent_id or new.created_by<>old.created_by or new.kind<>old.kind then
  raise exception 'Structural fields cannot be changed via edit';
 end if;
 if private.role_for(old.campaign_id)<>'master' and (new.visibility is distinct from old.visibility or new.image_path is distinct from old.image_path and new.image_path is not null and split_part(new.image_path,'/',1)<>old.campaign_id::text) then
  raise exception 'Invalid update';
 end if;
 if new.image_path is not null and split_part(new.image_path,'/',1)<>new.campaign_id::text then raise exception 'Image must belong to campaign';end if;
 return new;
end $$;
create trigger guard_entry_update before update on public.entries for each row execute function private.guard_entry_update();
