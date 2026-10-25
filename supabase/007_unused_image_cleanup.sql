-- WreckLib: clean only own unreferenced uploads, never a live image.
create function private.wrecklib_image_unused(p_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.entries e where e.image_path=p_name);
$$;
revoke all on function private.wrecklib_image_unused(text) from public,anon,authenticated;
grant execute on function private.wrecklib_image_unused(text) to authenticated;
create policy wrecklib_own_unused_image_read on storage.objects for select to authenticated
using(
 bucket_id='wrecklib-images'
 and owner_id=(select auth.uid())::text
 and private.wrecklib_image_unused(name)
 and exists (
  select 1 from public.memberships m
  where m.campaign_id::text=split_part(storage.objects.name,'/',1)
    and m.user_id=(select auth.uid()) and m.role in ('master','editor')
 )
);
create policy wrecklib_own_unused_image_delete on storage.objects for delete to authenticated
using(
 bucket_id='wrecklib-images'
 and owner_id=(select auth.uid())::text
 and private.wrecklib_image_unused(name)
 and exists (
  select 1 from public.memberships m
  where m.campaign_id::text=split_part(storage.objects.name,'/',1)
    and m.user_id=(select auth.uid()) and m.role in ('master','editor')
 )
);
