import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Supabase RLS is enabled for all app tables',()=>{const s=read('supabase/001_init.sql');for(const t of ['campaigns','memberships','entries','entry_secrets','invitations'])assert.match(s,new RegExp('alter table public\\.'+t+' enable row level security'))});
test('Sensitive content separated and storage private',()=>{const s=read('supabase/001_init.sql');assert.match(s,/create table public.entry_secrets/);assert.match(s,/wrecklib-images/);assert.match(s,/false,3145728/)});
test('Client uses Supabase, not legacy Worker',()=>{const s=read('public/app.js');assert.match(s,/createClient/);assert.match(s,/signInWithOtp/);assert.doesNotMatch(s,/Cf-Access-Jwt-Assertion/)});

test('Campaign image paths cannot escape their campaign',()=>{const s=read('supabase/001_init.sql');assert.match(s,/entry_image_campaign_scope/);assert.match(s,/split_part\(image_path,'\/',1\) = campaign_id::text/);});
test('Authenticated roles have explicit table grants',()=>{const s=read('supabase/001_init.sql');assert.match(s,/grant select, insert, update on public.entries to authenticated/);});
test('Invitation links survive email sign-in',()=>{const s=read('public/app.js');assert.match(s,/emailRedirectTo:location.origin\+location.pathname\+location.search/);});
test('Pages assets use relative URLs',()=>{const s=read('public/index.html');assert.match(s,/href="\.\/style.css"/);assert.match(s,/src="\.\/app.js"/);});

test('Hardening migration updates timestamps and removes duplicated SELECT policy',()=>{const s=read('supabase/002_hardening.sql');assert.match(s,/touch_entry_updated_at/);assert.match(s,/drop policy if exists secrets_write/);assert.match(s,/create policy secrets_insert/);assert.match(s,/create policy secrets_update/);});
