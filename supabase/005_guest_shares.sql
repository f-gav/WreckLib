-- WreckLib shared read-only links, applied to the dedicated Supabase project.
-- Tokens are SHA-256 hashed, and unpublished ancestor folders hide descendants.
create table private.campaign_shares (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  token_hash text unique not null check (length(token_hash)=64),
  created_at timestamptz not null default now()
);
alter table private.campaign_shares enable row level security;
revoke all on private.campaign_shares from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.share_campaign_for_token(p_token text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select s.campaign_id from private.campaign_shares s
  where p_token ~ '^[0-9a-f]{64}$'
    and s.token_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token,'UTF8')),'hex')
  limit 1
$function$;

CREATE OR REPLACE FUNCTION private.shared_entry_visible(p_entry_id uuid, p_campaign_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare node record; cur uuid:=p_entry_id; visited uuid[]:='{}'::uuid[];
begin
  if cur is null or p_campaign_id is null then return false;end if;
  while cur is not null loop
    if cur=any(visited) or cardinality(visited)>64 then return false;end if;
    visited:=array_append(visited,cur);
    select e.campaign_id,e.parent_id,e.visibility into node from public.entries e where e.id=cur;
    if not found or node.campaign_id<>p_campaign_id or node.visibility<>'published' then return false;end if;
    cur:=node.parent_id;
  end loop;
  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.get_campaign_share_status(p_campaign_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null or private.role_for(p_campaign_id)<>'master' then
    raise exception 'Not authorized';
  end if;
  return exists(select 1 from private.campaign_shares where campaign_id=p_campaign_id);
end $function$;

CREATE OR REPLACE FUNCTION public.read_shared_campaign(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
          'has_image',e.image_path is not null,'updated_at',e.updated_at
        ) order by e.updated_at desc
      ) from public.entries e
      where e.campaign_id=c.id and private.shared_entry_visible(e.id,c.id)
    ),'[]'::jsonb)
  ) into result from public.campaigns c where c.id=cid;
  return result;
end $function$;

CREATE OR REPLACE FUNCTION public.revoke_campaign_share(p_campaign_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null or private.role_for(p_campaign_id)<>'master' then
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
  if (select auth.uid()) is null or private.role_for(p_campaign_id)<>'master' then
    raise exception 'Only a campaign master may publish a share link';
  end if;
  token:=pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
  insert into private.campaign_shares(campaign_id,token_hash)
  values(p_campaign_id,pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(token,'UTF8')),'hex'))
  on conflict(campaign_id) do update set token_hash=excluded.token_hash,created_at=now();
  return token;
end $function$;

CREATE OR REPLACE FUNCTION public.shared_image_path(p_token text, p_entry_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cid uuid; image text;
begin
  cid:=private.share_campaign_for_token(p_token);
  if cid is null or not private.shared_entry_visible(p_entry_id,cid) then return null;end if;
  select e.image_path into image from public.entries e
    where e.id=p_entry_id and e.campaign_id=cid;
  return image;
end $function$;

revoke all on function private.share_campaign_for_token(text),private.shared_entry_visible(uuid,uuid),public.rotate_campaign_share(uuid),public.revoke_campaign_share(uuid),public.get_campaign_share_status(uuid),public.read_shared_campaign(text),public.shared_image_path(text,uuid) from public,anon,authenticated;
grant execute on function public.rotate_campaign_share(uuid),public.revoke_campaign_share(uuid),public.get_campaign_share_status(uuid) to authenticated;
grant execute on function public.read_shared_campaign(text),public.shared_image_path(text,uuid) to anon,authenticated;
