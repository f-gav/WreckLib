import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
test('3B browser controls use privileged APIs not table writes',()=>{
 const html=read('public/index.html'),app=read('public/app.js');
 for(const id of ['trash-panel','trash-list','members-list','pending-list','members-refresh'])assert.match(html,new RegExp('id="'+id+'"'));
 for(const rpc of ['trash_entry','restore_entry','list_trash','list_campaign_members','change_member_role','remove_campaign_member','revoke_campaign_invitation'])
   assert.ok(app.includes("client.rpc('"+rpc+"'"),rpc);
 assert.match(app,/campaign\.role==='master'/);
});
test('3B SQL uses guarded soft deletion and NULL-safe membership checks',()=>{
 const trash=read('supabase/008_reversible_trash.sql');
 const access=read('supabase/009_member_management.sql');
 const fix=read('supabase/010_deny_null_membership.sql');
 assert.match(trash,/deleted_at timestamptz/);
 assert.match(trash,/new\.deleted_at is distinct from old\.deleted_at/);
 assert.match(trash,/private\.shared_entry_visible/);
 assert.match(access,/owner_id/);
 assert.match(access,/remove_campaign_member/);
 assert.match(fix,/IS DISTINCT FROM 'master'/i);
 assert.match(fix,/actor is null or actor not in/i);
});
