-- WreckLib stage 5: transaction-only regression. No fixture users are retained.
begin;
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values
('a5111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','master@versions.invalid',now(),now()),
('a5222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','editor@versions.invalid',now(),now()),
('a5333333-3333-4333-8333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','viewer@versions.invalid',now(),now()),
('a5444444-4444-4444-8444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','outsider@versions.invalid',now(),now());
insert into public.campaigns(id,name,owner_id) values('b5111111-1111-4111-8111-111111111111','Versions rollback','a5111111-1111-4111-8111-111111111111');
insert into public.memberships(campaign_id,user_id,role) values
('b5111111-1111-4111-8111-111111111111','a5111111-1111-4111-8111-111111111111','master'),
('b5111111-1111-4111-8111-111111111111','a5222222-2222-4222-8222-222222222222','editor'),
('b5111111-1111-4111-8111-111111111111','a5333333-3333-4333-8333-333333333333','viewer');
insert into public.entries(id,campaign_id,kind,title,description,body,tags,created_by,visibility)
values
('c5111111-1111-4111-8111-111111111111','b5111111-1111-4111-8111-111111111111','article','Начало','Описание','Первая версия',array['старый'],'a5111111-1111-4111-8111-111111111111','published'),
('c5222222-2222-4222-8222-222222222222','b5111111-1111-4111-8111-111111111111','article','Тайна','Hidden','Секретная версия',array['тайна'],'a5111111-1111-4111-8111-111111111111','master');
set local role authenticated;
select set_config('request.jwt.claim.sub','a5222222-2222-4222-8222-222222222222',true);
select public.update_entry_if_unchanged('c5111111-1111-4111-8111-111111111111',
 (select updated_at from public.entries where id='c5111111-1111-4111-8111-111111111111'),
 'Вторая версия','Описание','Второй текст',array['новый'],null,null);
do $$declare denied boolean:=false;begin
 begin perform public.list_entry_revisions('c5111111-1111-4111-8111-111111111111');exception when others then denied:=true;end;
 if not denied then raise exception 'Editor can see history';end if;
 denied:=false;
 begin perform count(*) from private.entry_revisions;exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Editor has direct SELECT on history';end if;
end $$;
select set_config('request.jwt.claim.sub','a5333333-3333-4333-8333-333333333333',true);
do $$declare denied boolean:=false;begin
 begin perform public.list_entry_revisions('c5111111-1111-4111-8111-111111111111');exception when others then denied:=true;end;
 if not denied then raise exception 'Viewer can see history';end if;
end $$;
select set_config('request.jwt.claim.sub','a5444444-4444-4444-8444-444444444444',true);
do $$declare denied boolean:=false;begin
 begin perform public.restore_entry_revision('c5111111-1111-4111-8111-111111111111',1);exception when others then denied:=true;end;
 if not denied then raise exception 'Outsider can restore';end if;
end $$;
select set_config('request.jwt.claim.sub','a5111111-1111-4111-8111-111111111111',true);
do $$declare versions integer;first_id bigint;hidden_id bigint;denied boolean:=false; snapshot jsonb;begin
 select count(*) into versions from public.list_entry_revisions('c5111111-1111-4111-8111-111111111111');
 if versions<>2 then raise exception 'Expected initial and edited versions, got %',versions;end if;
 select revision_id into first_id from public.list_entry_revisions('c5111111-1111-4111-8111-111111111111')
 where revision_number=1;
 select revision_id into hidden_id from public.list_entry_revisions('c5222222-2222-4222-8222-222222222222')
 where revision_number=1;
 snapshot:=public.read_entry_revision('c5111111-1111-4111-8111-111111111111',first_id);
 if snapshot->>'body'<>'Первая версия' then raise exception 'History snapshot wrong';end if;
 if snapshot ? 'secret_body' or snapshot ? 'image_path' then raise exception 'Unsafe content in snapshot';end if;
 begin perform public.restore_entry_revision('c5111111-1111-4111-8111-111111111111',hidden_id);
 exception when others then denied:=true;end;
 if not denied then raise exception 'Revision from another entry restored';end if;
 perform public.restore_entry_revision('c5111111-1111-4111-8111-111111111111',first_id);
 if (select body from public.entries where id='c5111111-1111-4111-8111-111111111111')<>'Первая версия' then
  raise exception 'Revision restore failed';end if;
 if (select tags from public.entries where id='c5111111-1111-4111-8111-111111111111')<>array['старый'] then
  raise exception 'Revision tags restore failed';end if;
 if (select count(*) from public.list_entry_revisions('c5111111-1111-4111-8111-111111111111'))<>3 then
  raise exception 'Restore did not add new revision';end if;
 perform public.trash_entry('c5111111-1111-4111-8111-111111111111');
 denied:=false;
 begin perform public.list_entry_revisions('c5111111-1111-4111-8111-111111111111');exception when others then denied:=true;end;
 if not denied then raise exception 'Trashed revision accessible';end if;
end $$;
rollback;