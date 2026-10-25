import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('Stage 5 interface uses server-authorized revisions and restricted export',()=>{
 const app=read('public/app.js'),html=read('public/index.html');
 for(const id of ['history-dialog','history-list','history-preview','history-restore','export-json'])
  assert.ok(html.includes('id="'+id+'"'),id);
 for(const rpc of ['list_entry_revisions','read_entry_revision','restore_entry_revision','list_campaign_members'])
  assert.ok(app.includes("client.rpc('"+rpc+"'"),rpc);
 assert.match(app,/campaign\?\.role!=='master'/);
 assert.match(app,/fetchAllCampaignEntries/);
 assert.match(app,/\.range\(start,start\+pageSize-1\)/);
 assert.match(app,/serializeCampaignExport/);
 assert.match(app,/renderMarkdown\(snapshot\.body\|\|''/);
});
test('Revision snapshots stored in private schema without secret notes',()=>{
 const sql=read('supabase/014_entry_history.sql');
 assert.match(sql,/create table private\.entry_revisions/);
 assert.match(sql,/alter table private\.entry_revisions enable row level security/);
 assert.match(sql,/revoke all on private\.entry_revisions/);
 assert.match(sql,/is distinct from 'master'/);
 const snapshotPart=sql.slice(sql.indexOf('pg_catalog.jsonb_build_object('),sql.indexOf('),coalesce'));
 assert.doesNotMatch(snapshotPart,/secret_body|image_path|visibility|parent_id/);
});
