import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
test('Independent WreckLib shell',()=>{assert.match(read('public/index.html'),/WreckLib/)});
test('Cloud configuration has no secret keys',()=>{const s=read('public/config.js');assert.match(s,/SUPABASE_PUBLISHABLE_KEY/);assert.doesNotMatch(s,/service_role|sb_secret_/i)});
test('RLS protects per-campaign resources',()=>{const s=read('supabase/001_init.sql');assert.match(s,/private\.role_for/);assert.match(s,/private\.visible_entry/)});
