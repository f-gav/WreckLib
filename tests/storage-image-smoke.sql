-- Storage metadata/RLS test; never delete binary objects using direct SQL.
begin;
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at)
values('fa111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','uploader@fixture.invalid',now(),now()),
('fa222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','viewer@fixture.invalid',now(),now());
insert into public.campaigns(id,name,owner_id) values('fb111111-1111-4111-8111-111111111111','Image fixture','fa111111-1111-4111-8111-111111111111');
insert into public.memberships(campaign_id,user_id,role) values('fb111111-1111-4111-8111-111111111111','fa111111-1111-4111-8111-111111111111','master'),('fb111111-1111-4111-8111-111111111111','fa222222-2222-4222-8222-222222222222','viewer');
insert into public.entries(id,campaign_id,kind,title,created_by,image_path) values('fc111111-1111-4111-8111-111111111111','fb111111-1111-4111-8111-111111111111','article','Image record','fa111111-1111-4111-8111-111111111111','fb111111-1111-4111-8111-111111111111/linked.webp');
insert into storage.objects(bucket_id,name,owner_id) values('wrecklib-images','fb111111-1111-4111-8111-111111111111/linked.webp','fa111111-1111-4111-8111-111111111111'),('wrecklib-images','fb111111-1111-4111-8111-111111111111/orphan.webp','fa111111-1111-4111-8111-111111111111');
set local role authenticated;
select set_config('request.jwt.claim.sub','fa111111-1111-4111-8111-111111111111',true);
do $$begin
 if (select count(*) from storage.objects where bucket_id='wrecklib-images')<>2 then raise exception 'Owner cannot see orphan';end if;
 if private.wrecklib_image_unused('fb111111-1111-4111-8111-111111111111/linked.webp') then raise exception 'Live image marked orphan';end if;
 if not private.wrecklib_image_unused('fb111111-1111-4111-8111-111111111111/orphan.webp') then raise exception 'Orphan marked live';end if;
end$$;
select set_config('request.jwt.claim.sub','fa222222-2222-4222-8222-222222222222',true);
do $$begin if (select count(*) from storage.objects where bucket_id='wrecklib-images')<>1 then raise exception 'Viewer sees orphan';end if;end$$;
rollback;
