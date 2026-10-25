-- Repro and regression: RLS intentionally hides freshly INSERT RETURNING rows
-- from the same statement's SELECT policy, but simple INSERT is allowed.
-- All fixture rows and all captured revisions roll back.
begin;
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at)
values('a7111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000',
'authenticated','authenticated','master@entry-rls.invalid',now(),now());
insert into public.campaigns(id,name,owner_id)
values('b7111111-1111-4111-8111-111111111111','RLS create rollback fixture',
'a7111111-1111-4111-8111-111111111111');
insert into public.memberships(campaign_id,user_id,role)
values('b7111111-1111-4111-8111-111111111111',
'a7111111-1111-4111-8111-111111111111','master');
set local role authenticated;
select set_config('request.jwt.claim.sub','a7111111-1111-4111-8111-111111111111',true);
do $smoke$
declare id_created uuid:='c7111111-1111-4111-8111-111111111111';
 failed_returning boolean:=false; got_id uuid; row_count_value integer;
begin
 -- Demonstrate exactly the broken client query without leaving any data.
 begin
  insert into public.entries(id,campaign_id,kind,title,description,body,tags,visibility,created_by)
  values(id_created,'b7111111-1111-4111-8111-111111111111','person',
  'RLS temporary','', '', '{}'::text[],'published',(select auth.uid()))
  returning id into got_id;
 exception when insufficient_privilege then failed_returning:=true;end;
 if not failed_returning then raise exception 'Unexpected INSERT RETURNING RLS behavior';end if;
 -- New client: client-generated UUID + INSERT without RETURNING.
 insert into public.entries(id,campaign_id,kind,title,description,body,tags,visibility,created_by)
 values(id_created,'b7111111-1111-4111-8111-111111111111','person',
  'RLS temporary','', '', '{}'::text[],'published',(select auth.uid()));
 select count(*) into row_count_value from public.entries where id=id_created;
 if row_count_value<>1 or not private.visible_entry(id_created)
 then raise exception 'New inserted entry not readable to its Master';end if;
end $smoke$;
-- An outsider must not gain insert permission.
select set_config('request.jwt.claim.sub','a7222222-2222-4222-8222-222222222222',true);
do $outsider$
declare denied boolean:=false;begin
 begin
  insert into public.entries(id,campaign_id,kind,title,created_by)
  values('c7222222-2222-4222-8222-222222222222',
   'b7111111-1111-4111-8111-111111111111','person','Denied',(select auth.uid()));
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Outsider unexpectedly inserted entry';end if;
end $outsider$;
rollback;
