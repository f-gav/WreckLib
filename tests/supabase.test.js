import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Supabase RLS is enabled for all app tables',()=>{const s=read('supabase/001_init.sql');for(const t of ['campaigns','memberships','entries','entry_secrets','invitations'])assert.match(s,new RegExp('alter table public\\.'+t+' enable row level security'))});
test('Sensitive content separated and storage private',()=>{const s=read('supabase/001_init.sql');assert.match(s,/create table public.entry_secrets/);assert.match(s,/wrecklib-images','bucket');assert.match(s,/false,3145728/)});
test('Client uses Supabase, not legacy Worker',()=>{const s=read('public/app.js');assert.match(s,/createClient/);assert.match(s,/signInWithOtp/);assert.doesNotMatch(s,/Cf-Access-Jwt-Assertion/)});
