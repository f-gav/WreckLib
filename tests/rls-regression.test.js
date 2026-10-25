import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Nested entry INSERT policy references outer row', () => {
 const sql = read('supabase/003_fix_parent_rls.sql');
 assert.match(sql, /parent_entry\.id\s*=\s*entries\.parent_id/);
 assert.match(sql, /parent_entry\.campaign_id\s*=\s*entries\.campaign_id/);
});
test('Browser-facing roles cannot truncate tables or access anonymous app data', () => {
 const sql = read('supabase/004_restrict_grants.sql');
 assert.match(sql, /revoke all privileges on table/i);
 assert.match(sql, /from public, anon, authenticated/i);
 assert.match(sql, /grant select, insert, update on table public.entries to authenticated/i);
 assert.doesNotMatch(sql, /grant\s+all\s+on/i);
});
test('Live smoke test uses rolled-back synthetic users and checks hidden descendants', () => {
 const sql = read('tests/rls-smoke.sql');
 assert.match(sql, /^begin;/mi);
 assert.match(sql, /rollback;\s*$/mi);
 assert.match(sql, /hidden-descendant isolation failed/i);
 assert.match(sql, /Editor nested insertion failed/i);
 assert.match(sql, /Anonymous table read grant remains/i);
});
