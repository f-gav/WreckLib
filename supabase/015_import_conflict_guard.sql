-- WreckLib 5B. Atomic, strictly bounded new-campaign import and CAS edits.
-- A new campaign is created rather than overwriting any existing user data.
create function public.import_campaign_snapshot(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid; owner_uid uuid:=(select auth.uid()); it jsonb; record_id text;
  parent_old text; remap jsonb:='{}'::jsonb; id_list text[]:='{}';
  fields record; generated_id uuid; root_name text; old_id text; tags_new text[];
begin
 if owner_uid is null then raise exception 'Authentication required';end if;
 if p_payload is null or pg_catalog.octet_length(p_payload::text)>3000000
   or p_payload->>'format'<>'WreckLib' or p_payload->>'schema_version'<>'1'
   or pg_catalog.jsonb_typeof(p_payload->'entries')<>'array'
 then raise exception 'Invalid WreckLib schema or size';end if;
 if pg_catalog.jsonb_array_length(p_payload->'entries')>250 then
   raise exception 'Import limit: 250 entries';end if;
 root_name:=left(pg_catalog.btrim(coalesce(p_payload#>>'{campaign,name}',''))||' (импорт)',100);
 if pg_catalog.length(root_name)<10 then raise exception 'Invalid campaign name';end if;
 -- Validate complete graph and content before ANY writes.
 for it in select value from pg_catalog.jsonb_array_elements(p_payload->'entries') loop
   old_id:=it->>'id';
   if pg_catalog.jsonb_typeof(it)<>'object' or old_id is null or
     old_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or old_id=any(id_list) then raise exception 'Duplicate or invalid record ID';end if;
   if (it->>'kind') not in ('folder','article','person','location','item','faction','event')
      or pg_catalog.length(coalesce(it->>'title','')) not between 1 and 140
      or coalesce(it->>'visibility','') not in ('published','master')
      or pg_catalog.length(coalesce(it->>'description',''))>10000
      or pg_catalog.length(coalesce(it->>'body',''))>200000
      or pg_catalog.length(coalesce(it->>'secret_body',''))>100000
      or pg_catalog.jsonb_typeof(it->'tags') is distinct from 'array'
   then raise exception 'Invalid entry content';end if;
   select pg_catalog.array_agg(x.value) into tags_new from
     pg_catalog.jsonb_array_elements_text(it->'tags') x;
   if coalesce(pg_catalog.cardinality(tags_new),0)>16
      or pg_catalog.octet_length(pg_catalog.array_to_string(tags_new,','))>640
   then raise exception 'Invalid tags';end if;
   id_list:=pg_catalog.array_append(id_list,old_id);
   remap:=remap||pg_catalog.jsonb_build_object(old_id,pg_catalog.gen_random_uuid()::text);
 end loop;
 -- Parent links must refer to another imported folder. No cycles.
 for it in select value from pg_catalog.jsonb_array_elements(p_payload->'entries') loop
   parent_old:=it->>'parent_id';
   if parent_old is not null and (not (remap?parent_old) or
    not exists(
      select 1 from pg_catalog.jsonb_array_elements(p_payload->'entries') p
      where p->>'id'=parent_old and p->>'kind'='folder'
    )) then raise exception 'Parent folder absent from import';end if;
 end loop;
 insert into public.campaigns(name,owner_id) values(root_name,owner_uid) returning id into cid;
 insert into public.memberships(campaign_id,user_id,role) values(cid,owner_uid,'master');
 -- Parent_id is applied in a second pass for order-independent graph insertion.
 for it in select value from pg_catalog.jsonb_array_elements(p_payload->'entries') loop
   old_id:=it->>'id';generated_id:=(remap->>old_id)::uuid;
   select pg_catalog.array_agg(x.value) into tags_new from
     pg_catalog.jsonb_array_elements_text(it->'tags') x;
   insert into public.entries(
      id,campaign_id,parent_id,kind,title,description,body,tags,visibility,created_by
   ) values(
      generated_id,cid,null,it->>'kind',it->>'title',
      coalesce(it->>'description',''),coalesce(it->>'body',''),
      coalesce(tags_new,'{}'::text[]),it->>'visibility',owner_uid
   );
   if pg_catalog.length(coalesce(it->>'secret_body',''))>0 then
    insert into public.entry_secrets(entry_id,secret_body)
    values(generated_id,it->>'secret_body');
   end if;
 end loop;
 -- Detect cycles in source graph before finishing the transaction.
 for it in select value from pg_catalog.jsonb_array_elements(p_payload->'entries') loop
   old_id:=it->>'id';parent_old:=it->>'parent_id';
   if parent_old is not null then
      declare cursor_old text:=parent_old; seen text[]:=array[old_id]; steps integer:=0;begin
       while cursor_old is not null loop
        if cursor_old=any(seen) or steps>64 then raise exception 'Folder nesting cycle or limit';end if;
        seen:=pg_catalog.array_append(seen,cursor_old);steps:=steps+1;
        select p->>'parent_id' into cursor_old
         from pg_catalog.jsonb_array_elements(p_payload->'entries') p where p->>'id'=cursor_old;
       end loop;
      end;
   end if;
 end loop;
 -- Allowed only inside this SECURITY DEFINER operation.
 perform pg_catalog.set_config('wrecklib.internal_move_entry','on',true);
 for it in select value from pg_catalog.jsonb_array_elements(p_payload->'entries') loop
  parent_old:=it->>'parent_id';
  if parent_old is not null then
    update public.entries e set parent_id=(remap->>parent_old)::uuid
    where e.id=(remap->>(it->>'id'))::uuid and e.campaign_id=cid;
  end if;
 end loop;
 perform pg_catalog.set_config('wrecklib.internal_move_entry','off',true);
 return pg_catalog.jsonb_build_object('campaign_id',cid,'id_map',remap,'entry_count',pg_catalog.cardinality(id_list));
end $$;
revoke all on function public.import_campaign_snapshot(jsonb) from public,anon,authenticated;
grant execute on function public.import_campaign_snapshot(jsonb) to authenticated;

-- Optimistic lock: timestamp observed when the editor opened, not when saving.
create function public.update_entry_if_unchanged(
 p_entry_id uuid,p_expected_updated_at timestamptz,
 p_title text,p_description text,p_body text,p_tags text[],
 p_visibility text default null,p_secret_body text default null
) returns timestamptz language plpgsql security definer set search_path='' as $$
declare row_entry record; actor text; updated_at_new timestamptz;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required';end if;
 select e.id,e.campaign_id,e.updated_at,e.visibility into row_entry
 from public.entries e where e.id=p_entry_id for update;
 if not found then raise exception 'Entry not found';end if;
 actor:=private.role_for(row_entry.campaign_id);
 if actor is null or actor not in ('master','editor') or not private.visible_entry(p_entry_id)
 then raise exception 'Permission denied';end if;
 if row_entry.updated_at is distinct from p_expected_updated_at then
   raise exception 'EDIT_CONFLICT: record was changed by another editor';end if;
 if actor<>'master' and (p_visibility is not null or p_secret_body is not null) then
   raise exception 'Editor cannot change Master-only fields';end if;
 if p_visibility is not null and p_visibility not in ('master','published') then
   raise exception 'Invalid visibility';end if;
 update public.entries e set title=p_title,description=p_description,body=p_body,tags=p_tags,
   visibility=case when actor='master' then coalesce(p_visibility,e.visibility) else e.visibility end
 where e.id=p_entry_id returning e.updated_at into updated_at_new;
 if actor='master' and p_secret_body is not null then
  insert into public.entry_secrets(entry_id,secret_body) values(p_entry_id,p_secret_body)
  on conflict(entry_id) do update set secret_body=excluded.secret_body;
 end if;
 return updated_at_new;
end $$;
revoke all on function public.update_entry_if_unchanged(uuid,timestamptz,text,text,text,text[],text,text) from public,anon,authenticated;
grant execute on function public.update_entry_if_unchanged(uuid,timestamptz,text,text,text,text[],text,text) to authenticated;

create function public.attach_entry_image_if_unchanged(
 p_entry_id uuid,p_expected_updated_at timestamptz,p_image_path text
) returns timestamptz language plpgsql security definer set search_path='' as $$
declare e_row record; actor text; revised timestamptz;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required';end if;
 select e.id,e.campaign_id,e.updated_at into e_row from public.entries e
 where e.id=p_entry_id for update;
 if not found then raise exception 'Entry not found';end if;
 actor:=private.role_for(e_row.campaign_id);
 if actor is null or actor not in ('master','editor') or not private.visible_entry(p_entry_id)
 then raise exception 'Permission denied';end if;
 if e_row.updated_at is distinct from p_expected_updated_at then
  raise exception 'EDIT_CONFLICT: image target changed';end if;
 if p_image_path is null or pg_catalog.split_part(p_image_path,'/',1)<>e_row.campaign_id::text
 or p_image_path !~* '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
 then raise exception 'Invalid campaign image path';end if;
 -- The object must have been uploaded by this user to the private bucket.
 if not exists(select 1 from storage.objects o
  where o.bucket_id='wrecklib-images' and o.name=p_image_path and o.owner_id=(select auth.uid())::text)
 then raise exception 'Image not uploaded by caller';end if;
 update public.entries e set image_path=p_image_path where e.id=p_entry_id
 returning e.updated_at into revised;
 return revised;
end $$;
revoke all on function public.attach_entry_image_if_unchanged(uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.attach_entry_image_if_unchanged(uuid,timestamptz,text) to authenticated;

-- Monotonic versioning for conflict detection, including within one transaction.
create or replace function private.touch_entry_updated_at()
returns trigger language plpgsql set search_path='' as $revision$
begin
 new.updated_at := greatest(
   pg_catalog.clock_timestamp(), old.updated_at + interval '1 microsecond'
 );
 return new;
end $revision$;

-- Old browser clients must not bypass optimistic locking via direct REST UPDATE.
revoke update on public.entries from authenticated;
