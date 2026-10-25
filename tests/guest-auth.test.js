import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Google login preserves invitation callback',()=>{
 const app=read('public/app.js');
 assert.match(app,/signInWithOAuth/);
 assert.match(app,/provider:'google'/);
 assert.match(app,/redirectTo:location.origin\+location.pathname\+location.search/);
 assert.match(app,/accept_invitation/);
});
test('Guest mode uses token-gated RPC instead of open table access',()=>{
 const app=read('public/app.js');
 assert.match(app,/read_shared_campaign/);
 assert.match(app,/rotate_campaign_share/);
 assert.match(app,/revoke_campaign_share/);
 assert.match(app,/shared-image/);
 const schema=read('supabase/005_guest_shares.sql');
 assert.match(schema,/private\.campaign_shares/);
 assert.match(schema,/sha256/i);
 assert.match(schema,/shared_entry_visible/);
 assert.match(schema,/grant execute on function public.read_shared_campaign/);
});
test('UI contains guest controls and four WreckTrack accents',()=>{
 const html=read('public/index.html'),style=read('public/style.css');
 for(const id of ['google-login','create-share','revoke-share','invalid-share','accent-choice'])assert.match(html,new RegExp('id="'+id+'"'));
 for(const accent of ['blue','scarlet','purple'])assert.match(style,new RegExp('data-accent="'+accent+'"'));
 assert.match(html,/no-referrer/);
});
