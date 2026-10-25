-- Run ONLY against the dedicated WreckLib development database as its owner.
-- SECURITY: all synthetic auth users, rows and changes are rolled back.
begin;
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gm@wrecklib.example',now(),now()),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','00000000-0000-0000-0000-000000000000','authenticated','authenticated','editor@wrecklib.example',now(),now()),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','00000000-0000-0000-0000-000000000000','authenticated','authenticated','viewer@wrecklib.example',now(),now()),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd','00000000-0000-0000-0000-000000000000','authenticated','authenticated','outsider@wrecklib.example',now(),now());
insert into public.campaigns(id,name,owner_id) values
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','WreckLib rollback-only smoke test','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into public.memberships(campaign_id,user_id,role) values
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','master'),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','editor'),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','cccccccc-cccc-4ccc-8ccc-cccccccccccc','viewer');
insert into public.entries(id,campaign_id,parent_id,kind,title,created_by,visibility) values
('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',null,'folder','Public folder','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','published'),
('22222222-2222-4222-8222-222222222222','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111','article','Public child','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','published'),
('33333333-3333-4333-8333-333333333333','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',null,'folder','Hidden GM folder','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','master'),
('44444444-4444-4444-8444-444444444444','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','33333333-3333-4333-8333-333333333333','article','Public child of hidden folder','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','published');
insert into public.entry_secrets(entry_id,secret_body) values ('22222222-2222-4222-8222-222222222222','GM-only secret');

set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$ begin
 if (select count(*) from public.entries where campaign_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') <> 4 then raise exception 'Master entries visibility failed';end if;
 if (select count(*) from public.entry_secrets) <> 1 then raise exception 'Master secret visibility failed';end if;
 perform public.create_campaign('Temporary RPC smoke test campaign');
 if not exists(select 1 from public.campaigns where name='Temporary RPC smoke test campaign') then raise exception 'create_campaign RPC failed';end if;
end $$;

select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $$ declare blocked boolean:=false; begin
 if (select count(*) from public.entries where campaign_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') <> 2 then raise exception 'Editor hidden-descendant isolation failed';end if;
 if (select count(*) from public.entry_secrets) <> 0 then raise exception 'Editor could view master secrets';end if;
 insert into public.entries(campaign_id,parent_id,kind,title,created_by)
 values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111','person','Editor nested entry','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 if not exists(select 1 from public.entries where title='Editor nested entry') then raise exception 'Editor nested insertion failed';end if;
 begin
  update public.entries set visibility='master' where id='22222222-2222-4222-8222-222222222222';
 exception when others then blocked:=true;
 end;
 if not blocked then raise exception 'Editor managed to hide published entry';end if;
end $$;

select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
do $$ declare blocked boolean:=false; begin
 if (select count(*) from public.entries where campaign_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') <> 3 then raise exception 'Viewer expected three visible entries';end if;
 if (select count(*) from public.entry_secrets) <> 0 then raise exception 'Viewer can read secrets';end if;
 begin
  insert into public.entries(campaign_id,kind,title,created_by)
  values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','person','Forbidden write','cccccccc-cccc-4ccc-8ccc-cccccccccccc');
 exception when insufficient_privilege then blocked:=true;
 end;
 if not blocked then raise exception 'Viewer write unexpectedly succeeded';end if;
end $$;

select set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
do $$ begin
 if exists(select 1 from public.entries where campaign_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') then raise exception 'Outsider read entries';end if;
 if exists(select 1 from public.campaigns where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') then raise exception 'Outsider read campaign';end if;
end $$;

reset role;
do $$ begin
 if has_table_privilege('anon','public.entries','SELECT') then raise exception 'Anonymous table read grant remains';end if;
 if has_table_privilege('authenticated','public.entries','TRUNCATE') then raise exception 'Authenticated TRUNCATE privilege remains';end if;
 if not has_table_privilege('authenticated','public.entries','SELECT,INSERT,UPDATE') then raise exception 'Necessary authenticated CRUD privileges missing';end if;
end $$;
rollback;
