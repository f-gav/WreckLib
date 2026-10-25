-- Stage5B role/concurrency/import regression; fixture rolled back in full.
begin;
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at)
values ('a6111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','master@import.invalid',now(),now()),
('a6222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','editor@import.invalid',now(),now()),
('a6333333-3333-4333-8333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','outsider@import.invalid',now(),now());
set local role authenticated;
select set_config('request.jwt.claim.sub','a6111111-1111-4111-8111-111111111111',true);
do $test$
declare payload jsonb; result jsonb; cid uuid; root uuid; child uuid; created timestamp with time zone;
 original_version timestamptz; version2 timestamptz; denied boolean; changes integer;
begin
 payload:=jsonb_build_object('format','WreckLib','schema_version',1,
 'campaign',jsonb_build_object('name','Test archive'),
 'entries',jsonb_build_array(
 jsonb_build_object('id','c6111111-1111-4111-8111-111111111111',
 'parent_id',null,'kind','folder','title','Main folder','body','','description','','tags',jsonb_build_array(),'visibility','published','secret_body',''),
 jsonb_build_object('id','c6222222-2222-4222-8222-222222222222',
 'parent_id','c6111111-1111-4111-8111-111111111111','kind','article','title','Old story',
 'body','A','description','desc','tags',jsonb_build_array('test'),
 'visibility','master','secret_body','Master-only notes')));
 result:=public.import_campaign_snapshot(payload);
 cid:=(result->>'campaign_id')::uuid;
 root:=(result->'id_map'->>'c6111111-1111-4111-8111-111111111111')::uuid;
 child:=(result->'id_map'->>'c6222222-2222-4222-8222-222222222222')::uuid;
 if cid is null or root is null or child is null or cid=child or child=root then raise exception 'ID remap failed';end if;
 if (select parent_id from public.entries where id=child)<>root then raise exception 'Parent remap failed';end if;
 if (select secret_body from public.entry_secrets where entry_id=child)<>'Master-only notes' then raise exception 'Secret missing';end if;
 if (select image_path from public.entries where id=child) is not null then raise exception 'External image path imported';end if;
 if (select count(*) from public.list_entry_revisions(child))<>1 then raise exception 'Revision trigger missing';end if;
 original_version:=(select updated_at from public.entries where id=child);
 version2:=public.update_entry_if_unchanged(child,original_version,'New story','desc','B',array['new'],'published','Updated notes');
 if version2<=original_version then raise exception 'Updated timestamp did not advance';end if;
 denied:=false;
 begin perform public.update_entry_if_unchanged(child,original_version,'stale','desc','stale',array['new'],null,null);
 exception when others then denied:=true;end;
 if not denied then raise exception 'Stale editor overwrote update';end if;
 if (select title from public.entries where id=child)<>'New story' then raise exception 'Stale edit persisted';end if;
 -- Upload ownership check and image CAS also operate through the protected RPC.
 insert into storage.objects(bucket_id,name,owner_id)
 values('wrecklib-images',cid::text||'/a6111111-1111-4111-8111-111111111111.webp',
   (select auth.uid())::text);
 perform public.attach_entry_image_if_unchanged(
   child,version2,cid::text||'/a6111111-1111-4111-8111-111111111111.webp');
 if (select image_path from public.entries where id=child) <>
   cid::text||'/a6111111-1111-4111-8111-111111111111.webp' then
   raise exception 'Image attachment failed';end if;
 denied:=false;
 begin
  perform public.attach_entry_image_if_unchanged(
    child,version2,cid::text||'/a6111111-1111-4111-8111-111111111111.webp');
 exception when others then denied:=true;end;
 if not denied then raise exception 'Stale image update accepted';end if;

 denied:=false;
 begin
  perform public.import_campaign_snapshot(payload || jsonb_build_object('entries',
   jsonb_build_array(
     jsonb_build_object('id','c6111111-1111-4111-8111-111111111111','parent_id',
       'c6222222-2222-4222-8222-222222222222','kind','folder','title','A',
       'description','','body','','tags',jsonb_build_array(),'visibility','published','secret_body',''),
     jsonb_build_object('id','c6222222-2222-4222-8222-222222222222','parent_id',
       'c6111111-1111-4111-8111-111111111111','kind','folder','title','B',
       'description','','body','','tags',jsonb_build_array(),'visibility','published','secret_body','')
   )));
 exception when others then denied:=true;end;
 if not denied then raise exception 'Cyclic import accepted';end if;
 if (select count(*) from public.campaigns where owner_id='a6111111-1111-4111-8111-111111111111')<>1 then
   raise exception 'Invalid import created partial campaign';end if;
 -- Mark database ids in a session variable for subsequent role fixtures.
 perform set_config('wrecklib.fixture_child',child::text,true);
 perform set_config('wrecklib.fixture_campaign',cid::text,true);
end $test$;
-- Confirm REST direct table update forbidden even for authenticated Master.
do $check$
declare denied boolean:=false;begin
 begin update public.entries set title='REST bypass' where id=current_setting('wrecklib.fixture_child')::uuid;
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Legacy REST bypass still works';end if;
end $check$;
-- Invite editor and confirm older Master secret notes remain protected.
reset role;
insert into public.memberships(campaign_id,user_id,role)
values (current_setting('wrecklib.fixture_campaign')::uuid,'a6222222-2222-4222-8222-222222222222','editor');
set local role authenticated;
select set_config('request.jwt.claim.sub','a6222222-2222-4222-8222-222222222222',true);
do $editor$
declare denied boolean:=false;begin
 begin perform public.update_entry_if_unchanged(
 current_setting('wrecklib.fixture_child')::uuid,
 (select updated_at from public.entries where id=current_setting('wrecklib.fixture_child')::uuid),
 'bad','desc','bad',array[]::text[],null,'steal');
 exception when others then denied:=true;end;
 if not denied then raise exception 'Editor changed Master secret';end if;
end $editor$;
select set_config('request.jwt.claim.sub','a6333333-3333-4333-8333-333333333333',true);
do $outsider$
declare denied boolean:=false;begin
 begin perform public.update_entry_if_unchanged(
 current_setting('wrecklib.fixture_child')::uuid,now(),'bad','desc','bad',
 array[]::text[],null,null);exception when others then denied:=true;end;
 if not denied then raise exception 'Outsider changed campaign';end if;
end $outsider$;
rollback;
