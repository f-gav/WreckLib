-- Reversible-trash smoke test: rolls back all synthetic data.
begin;
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values
('a9111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','master@trash.invalid',now(),now()),
('a9222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reader@trash.invalid',now(),now()),
('a9333333-3333-4333-8333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','outsider@trash.invalid',now(),now());
insert into public.campaigns(id,name,owner_id) values ('b9111111-1111-4111-8111-111111111111','Rollback trash test','a9111111-1111-4111-8111-111111111111');
insert into public.memberships(campaign_id,user_id,role) values
('b9111111-1111-4111-8111-111111111111','a9111111-1111-4111-8111-111111111111','master'),
('b9111111-1111-4111-8111-111111111111','a9222222-2222-4222-8222-222222222222','viewer');
insert into public.entries(id,campaign_id,parent_id,kind,title,created_by) values
('c9111111-1111-4111-8111-111111111111','b9111111-1111-4111-8111-111111111111',null,'folder','Folder','a9111111-1111-4111-8111-111111111111'),
('c9222222-2222-4222-8222-222222222222','b9111111-1111-4111-8111-111111111111','c9111111-1111-4111-8111-111111111111','article','Published child','a9111111-1111-4111-8111-111111111111'),
('c9333333-3333-4333-8333-333333333333','b9111111-1111-4111-8111-111111111111','c9111111-1111-4111-8111-111111111111','article','Individually deleted child','a9111111-1111-4111-8111-111111111111');
set local role authenticated;
select set_config('request.jwt.claim.sub','a9111111-1111-4111-8111-111111111111',true);
do $$declare token text;response jsonb;blocked boolean:=false;modified integer;begin
 token:=public.rotate_campaign_share('b9111111-1111-4111-8111-111111111111');
 update public.entries set image_path='b9111111-1111-4111-8111-111111111111/photo.webp'
 where id='c9222222-2222-4222-8222-222222222222';
 if public.shared_image_path(token,'c9222222-2222-4222-8222-222222222222')
 is distinct from 'b9111111-1111-4111-8111-111111111111/photo.webp'
 then raise exception 'Published image path missing before deletion';end if;
 -- The direct REST update has to fail for an active row.
 begin update public.entries set deleted_at=now() where id='c9222222-2222-4222-8222-222222222222';exception when others then blocked:=true;end;
 if not blocked then raise exception 'Client could set tombstone';end if;
 perform public.trash_entry('c9333333-3333-4333-8333-333333333333');
 perform public.trash_entry('c9111111-1111-4111-8111-111111111111');
 if private.visible_entry('c9222222-2222-4222-8222-222222222222') then raise exception 'Child of trash still visible';end if;
 if public.shared_image_path(token,'c9222222-2222-4222-8222-222222222222') is not null
 then raise exception 'Guest image path leaked after trash';end if;
 response:=public.read_shared_campaign(token);
 if jsonb_array_length(response->'entries')<>0 then raise exception 'Guest can see trashed subtree';end if;
 if (select count(*) from public.entries where campaign_id='b9111111-1111-4111-8111-111111111111')<>0 then raise exception 'Master sees trash in active tree';end if;
 if (select count(*) from public.list_trash('b9111111-1111-4111-8111-111111111111'))<>2 then raise exception 'Trash does not contain two explicit tombstones';end if;
 -- RLS silently updates 0 rows when trying to undelete via direct table UPDATE.
 update public.entries set deleted_at=null where id='c9111111-1111-4111-8111-111111111111';
 get diagnostics modified=row_count;
 if modified<>0 then raise exception 'Direct undelete changed a row';end if;
 blocked:=false;
 begin perform public.restore_entry('c9333333-3333-4333-8333-333333333333');exception when others then blocked:=true;end;
 if not blocked then raise exception 'Restored child under deleted parent';end if;
 perform public.restore_entry('c9111111-1111-4111-8111-111111111111');
 if (select count(*) from public.entries where campaign_id='b9111111-1111-4111-8111-111111111111')<>2 then raise exception 'Other explicitly deleted child was improperly restored';end if;
 perform public.restore_entry('c9333333-3333-4333-8333-333333333333');
 if (select count(*) from public.entries where campaign_id='b9111111-1111-4111-8111-111111111111')<>3 then raise exception 'Restore count incorrect';end if;
 if (select parent_id from public.entries where id='c9222222-2222-4222-8222-222222222222')<>'c9111111-1111-4111-8111-111111111111' then raise exception 'Original hierarchy was lost';end if;
end $$;
select set_config('request.jwt.claim.sub','a9222222-2222-4222-8222-222222222222',true);
do $$declare denied boolean:=false;begin
 begin perform public.trash_entry('c9222222-2222-4222-8222-222222222222');exception when others then denied:=true;end;
 if not denied then raise exception 'Viewer may trash';end if;
end $$;
select set_config('request.jwt.claim.sub','a9333333-3333-4333-8333-333333333333',true);
do $$declare denied boolean:=false;begin
 begin perform public.restore_entry('c9333333-3333-4333-8333-333333333333');exception when others then denied:=true;end;
 if not denied then raise exception 'Outsider may restore';end if;
end $$;
rollback;
