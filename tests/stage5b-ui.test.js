import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const r=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
test('Stage5B browser requires preview and RPC for import',()=>{
 const a=r('public/app.js'),h=r('public/index.html');
 for(const id of ['import-choose','import-file','import-dialog','import-summary','import-confirm','export-backup'])
  assert.ok(h.includes('id="'+id+'"'),id);
 assert.match(a,/validateImportSnapshot\(data\)/);
 assert.match(a,/client\.rpc\('import_campaign_snapshot'/);
 assert.match(a,/buildImageBackup/);
 assert.match(a,/extractImageBlob\(asset\)/);
 assert.match(a,/storage\.from\('wrecklib-images'\)\.upload/);
});
test('Editor and images use server-side compare-and-swap',()=>{
 const a=r('public/app.js'),sql=r('supabase/015_import_conflict_guard.sql');
 assert.match(a,/client\.rpc\('update_entry_if_unchanged'/);
 assert.match(a,/client\.rpc\('attach_entry_image_if_unchanged'/);
 assert.match(a,/EDIT_CONFLICT/);
 assert.match(sql,/revoke update on public\.entries from authenticated/);
 assert.match(sql,/for update/);
 assert.doesNotMatch(a,/base\(\)\.update\(entry\)/);
 assert.doesNotMatch(a,/base\(\)\.update\(\{image_path/);
});
