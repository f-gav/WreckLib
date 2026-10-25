import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Move uses a protected RPC and a dialog, never raw structural UPDATE',()=>{
 const app=read('public/app.js'),sql=read('supabase/006_safe_entry_moves.sql');
 assert.match(app,/client\.rpc\('move_entry'/);
 assert.match(app,/isDescendant\(e\.id,moveTargetId\)/);
 assert.match(app,/collapsedFolders/);
 assert.match(read('public/index.html'),/id="move-dialog"/);
 assert.match(sql,/create (?:or replace )?function public\.move_entry/i);
 assert.match(sql,/grant execute on function public\.move_entry/i);
 assert.match(sql,/Moving here would create a folder cycle/);
});
test('Invitations cannot silently replace an established role',()=>{
 const sql=read('supabase/006_safe_entry_moves.sql');
 assert.match(sql,/on conflict\s*\(campaign_id,user_id\)\s*do nothing/i);
 assert.doesNotMatch(sql,/on conflict\s*\(campaign_id,user_id\)\s*do update/i);
});
