-- WreckLib: manual SQL regression suite, synthetic fixture rolls back entirely.
begin;
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values
('a1111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gm@fixture.invalid',now(),now()),
('a2222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ed@fixture.invalid',now(),now()),
('a3333333-3333-4333-8333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','viewer@fixture.invalid',now(),now());
insert into public.campaigns(id,name,owner_id) values ('b1111111-1111-4111-8111-111111111111','Fixture A','a1111111-1111-4111-8111-111111111111'),
('b2222222-2222-4222-8222-222222222222','Fixture B','a1111111-1111-4111-8111-111111111111');
insert into public.memberships(campaign_id,user_id,role) values
('b1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','master'),
('b1111111-1111-4111-8111-111111111111','a2222222-2222-4222-8222-222222222222','editor'),
('b1111111-1111-4111-8111-111111111111','a3333333-3333-4333-8333-333333333333','viewer'),
('b2222222-2222-4222-8222-222222222222','a1111111-1111-4111-8111-111111111111','master');
insert into public.entries(id,campaign_id,parent_id,kind,title,created_by,visibility) values
('c1111111-1111-4111-8111-111111111111','b1111111-1111-4111-8111-111111111111',null,'folder','Folder A','a1111111-1111-4111-8111-111111111111','published'),
('c2222222-2222-4222-8222-222222222222','b1111111-1111-4111-8111-111111111111',null,'folder','Folder B','a1111111-1111-4111-8111-111111111111','published'),
('c3333333-3333-4333-8333-333333333333','b1111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111','article','Child','a1111111-1111-4111-8111-111111111111','published'),
('c4444444-4444-4444-8444-444444444444','b1111111-1111-4111-8111-111111111111',null,'folder','Hidden','a1111111-1111-4111-8111-111111111111','master');
insert into public.invitations(id,campaign_id,email,role) values ('d1111111-1111-4111-8111-111111111111','b1111111-1111-4111-8111-111111111111','ed@fixture.invalid','viewer');
set local role authenticated;
select set_config('request.jwt.claim.sub','a2222222-2222-4222-8222-222222222222',true);
do $$declare denied boolean:=false;begin
 perform public.accept_invitation('d1111111-1111-4111-8111-111111111111');
 if private.role_for('b1111111-1111-4111-8111-111111111111')<>'editor' then raise exception 'Existing role overwritten';end if;
 perform public.move_entry('c3333333-3333-4333-8333-333333333333','c2222222-2222-4222-8222-222222222222');
 if (select parent_id from public.entries where id='c3333333-3333-4333-8333-333333333333')<>'c2222222-2222-4222-8222-222222222222' then raise exception 'Move failed';end if;
 begin perform public.move_entry('c2222222-2222-4222-8222-222222222222','c3333333-3333-4333-8333-333333333333');exception when others then denied:=true;end;
 if not denied then raise exception 'Cycle permitted';end if;
 denied:=false;
 begin perform public.move_entry('c3333333-3333-4333-8333-333333333333','c4444444-4444-4444-8444-444444444444');exception when others then denied:=true;end;
 if not denied then raise exception 'Hidden parent permitted';end if;
 denied:=false;
 begin update public.entries set parent_id=null where id='c3333333-3333-4333-8333-333333333333';exception when others then denied:=true;end;
 if not denied then raise exception 'Direct update bypassed trigger';end if;
end $$;
select set_config('request.jwt.claim.sub','a3333333-3333-4333-8333-333333333333',true);
do $$declare denied boolean:=false;begin
 begin perform public.move_entry('c3333333-3333-4333-8333-333333333333',null);exception when others then denied:=true;end;
 if not denied then raise exception 'Viewer can move entries';end if;
end $$;
rollback;
