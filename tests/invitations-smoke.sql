-- Rollback-only invite acceptance and role guard test; never leaves synthetic users.
begin;
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at)
values
('61a00000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gm@wrecklib-test.invalid',now(),now()),
('61a00000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','EDITOR@wrecklib-test.invalid',now(),now()),
('61a00000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','wrong@wrecklib-test.invalid',now(),now());
insert into public.campaigns(id,name,owner_id) values('61b00000-0000-4000-8000-000000000001','Invitation test (rollback)','61a00000-0000-4000-8000-000000000001');
insert into public.memberships(campaign_id,user_id,role)
values('61b00000-0000-4000-8000-000000000001','61a00000-0000-4000-8000-000000000001','master');
insert into public.invitations(id,campaign_id,email,role)
values('61c00000-0000-4000-8000-000000000001','61b00000-0000-4000-8000-000000000001','editor@wrecklib-test.invalid','editor');
set local role authenticated;
select set_config('request.jwt.claim.sub','61a00000-0000-4000-8000-000000000003',true);
do $$ declare blocked boolean:=false; begin
 begin
  perform public.accept_invitation('61c00000-0000-4000-8000-000000000001');
 exception when others then blocked:=true;end;
 if not blocked then raise exception 'Wrong email invitation accepted';end if;
 if exists(select 1 from public.memberships where user_id='61a00000-0000-4000-8000-000000000003') then raise exception 'Wrong email obtained membership';end if;
end $$;
select set_config('request.jwt.claim.sub','61a00000-0000-4000-8000-000000000002',true);
do $$ declare cid uuid; begin
 cid:=public.accept_invitation('61c00000-0000-4000-8000-000000000001');
 if cid <> '61b00000-0000-4000-8000-000000000001' then raise exception 'Invitation incorrect campaign';end if;
 if (select role from public.memberships where campaign_id=cid and user_id='61a00000-0000-4000-8000-000000000002') <> 'editor' then raise exception 'Editor membership missing';end if;
 insert into public.entries(campaign_id,kind,title,created_by) values(cid,'article','Editors can create','61a00000-0000-4000-8000-000000000002');
end $$;
select set_config('request.jwt.claim.sub','61a00000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from public.entries where campaign_id='61b00000-0000-4000-8000-000000000001') then raise exception 'Outsider sees editor content';end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.invitations where id='61c00000-0000-4000-8000-000000000001') then raise exception 'Accepted invite was not consumed';end if;
end $$;
rollback;
