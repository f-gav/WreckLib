-- Rollback-only Stage 4B tag and visibility regressions. Do not store fixture rows.
begin;
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values
('a8111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gm@tags.invalid',now(),now()),
('a8222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','player@tags.invalid',now(),now()),
('a8333333-3333-4333-8333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','editor@tags.invalid',now(),now()),
('a8444444-4444-4444-8444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','outsider@tags.invalid',now(),now());
insert into public.campaigns(id,name,owner_id)
values('b8111111-1111-4111-8111-111111111111','Tags fixture','a8111111-1111-4111-8111-111111111111');
insert into public.memberships(campaign_id,user_id,role) values
('b8111111-1111-4111-8111-111111111111','a8111111-1111-4111-8111-111111111111','master'),
('b8111111-1111-4111-8111-111111111111','a8222222-2222-4222-8222-222222222222','viewer'),
('b8111111-1111-4111-8111-111111111111','a8333333-3333-4333-8333-333333333333','editor');
insert into public.entries(id,campaign_id,parent_id,kind,title,body,tags,visibility,created_by) values
('c8111111-1111-4111-8111-111111111111','b8111111-1111-4111-8111-111111111111',null,'article','Public','Markdown public',array['город','метро'],'published','a8111111-1111-4111-8111-111111111111'),
('c8222222-2222-4222-8222-222222222222','b8111111-1111-4111-8111-111111111111',null,'folder','Private', '', array['секрет'],'master','a8111111-1111-4111-8111-111111111111'),
('c8333333-3333-4333-8333-333333333333','b8111111-1111-4111-8111-111111111111','c8222222-2222-4222-8222-222222222222','article','Hidden child','Markdown hidden',array['секрет'],'published','a8111111-1111-4111-8111-111111111111');
set local role authenticated;
select set_config('request.jwt.claim.sub','a8111111-1111-4111-8111-111111111111',true);
do $$declare token text; response jsonb; begin
 token:=public.rotate_campaign_share('b8111111-1111-4111-8111-111111111111');
 response:=public.read_shared_campaign(token);
 if jsonb_array_length(response->'entries')<>1 then raise exception 'Guest exposed hidden descendants';end if;
 if response->'entries'->0->'tags' <> '["город","метро"]'::jsonb then raise exception 'Guest tags missing';end if;
 if response::text like '%секрет%' then raise exception 'Hidden tags leaked in guest JSON';end if;
end $$;
select set_config('request.jwt.claim.sub','a8222222-2222-4222-8222-222222222222',true);
do $declare blocked boolean:=false; changed integer:=0; begin
 if (select count(*) from public.entries where campaign_id='b8111111-1111-4111-8111-111111111111')<>1 then raise exception 'Viewer got hidden tags';end if;
 begin
  update public.entries set tags=array['нельзя'] where id='c8111111-1111-4111-8111-111111111111';
  get diagnostics changed=row_count;
 exception when others then blocked:=true;end;
 if not blocked and changed<>0 then raise exception 'Viewer changed tags';end if;
 if (select tags from public.entries where id='c8111111-1111-4111-8111-111111111111')<>array['город','метро'] then
  raise exception 'Viewer tag mutation persisted';end if;
end $;
select set_config('request.jwt.claim.sub','a8333333-3333-4333-8333-333333333333',true);
update public.entries set tags=array['обновлено','метро'] where id='c8111111-1111-4111-8111-111111111111';
do $$begin
 if (select tags from public.entries where id='c8111111-1111-4111-8111-111111111111')<>array['обновлено','метро'] then raise exception 'Editor cannot update tags';end if;
end $$;
select set_config('request.jwt.claim.sub','a8444444-4444-4444-8444-444444444444',true);
do $$begin if (select count(*) from public.entries where campaign_id='b8111111-1111-4111-8111-111111111111')<>0 then raise exception 'Outsider saw tags';end if;end $$;
reset role;
do $$declare rejected boolean:=false;begin
 begin
  insert into public.entries(campaign_id,kind,title,created_by,tags)
  values('b8111111-1111-4111-8111-111111111111','article','Oversized','a8111111-1111-4111-8111-111111111111',array_fill('x'::text, array[17]));
 exception when check_violation then rejected:=true;end;
 if not rejected then raise exception 'Tag limit bypassed';end if;
end $$;
rollback;
