// The GitHub runner has network access; validate the actual published site.
// Never log publishable or service-role keys or any personal account information.
import assert from 'node:assert/strict';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../public/config.js';

const origin='https://f-gav.github.io/WreckLib/';
const expected=[
  ['', '<title>WreckLib'],
  ['app.js', 'signInWithOAuth'],
  ['style.css', '--gold'],
  ['wrecktrack-visual.css', 'font-family:"Neuzeit Antiqua"']
];

async function http(url,opts){
 let error;
 for(let i=0;i<7;i++){
  try{
   const res=await fetch(url,{...opts,redirect:'follow',signal:AbortSignal.timeout(16000)});
   if(res.ok)return res;
   error=new Error('HTTP '+res.status+' '+url.replace(/\?.*/,'')); // never print keys
  }catch(e){error=e}
  if(i<6)await new Promise(resolve=>setTimeout(resolve,3500));
 }
 throw error;
}
for(const [file,fragment] of expected){
 const url=new URL(file,origin);
 url.searchParams.set('build',process.env.GITHUB_SHA?.slice(0,12)||'current');
 const res=await http(url.toString(),{headers:{'Cache-Control':'no-cache'}});
 const body=await res.text();
 assert.ok(body.includes(fragment),'Missing new WreckLib asset: '+file);
 console.log('OK page asset:',file||'index.html',res.status);
}
for(const font of ['neuzeit-antiqua.ttf','belarus-regular.ttf','ebbe-regular.ttf','old-town-regular.ttf']){
 const url=new URL('fonts/'+font,origin);
 const res=await http(url.toString());
 const bytes=await res.arrayBuffer();
 assert.ok(bytes.byteLength>8000,'Font file unexpectedly small: '+font);
 console.log('OK local font:',font,bytes.byteLength,'bytes');
}
const r=await http(SUPABASE_URL+'/auth/v1/settings',{
 headers:{apikey:SUPABASE_PUBLISHABLE_KEY}
});
const settings=await r.json();
const enabled=settings?.external?.google===true;
console.log('Google OAuth provider enabled:',enabled);
assert.ok(enabled,'Enable Google in Supabase Auth Providers and configure its client credentials');
// Check the first OAuth handshake without accessing any private Google account.
const start=new URL(SUPABASE_URL+'/auth/v1/authorize');
start.searchParams.set('provider','google');
start.searchParams.set('redirect_to',origin);
const authorize=await fetch(start,{redirect:'manual',headers:{apikey:SUPABASE_PUBLISHABLE_KEY},signal:AbortSignal.timeout(15000)});
const providerLocation=authorize.headers.get('location')||'';
assert.ok(authorize.status>=300&&authorize.status<400,'Google OAuth did not begin redirect flow');
assert.ok(/^https:\/\/accounts\.google\.com\//.test(providerLocation),'Google OAuth did not redirect to Google');
console.log('OK Google OAuth initial redirect:',authorize.status);

const badToken='0'.repeat(64);
const badEntry='00000000-0000-4000-8000-000000000000';
// Unauthorized guest RPC must not reveal any campaign content.
const guest=await fetch(SUPABASE_URL+'/rest/v1/rpc/read_shared_campaign',{
 method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},
 body:JSON.stringify({p_token:badToken}),signal:AbortSignal.timeout(15000)
});
assert.equal(guest.status,200,'Anonymous guest RPC unavailable');
assert.equal(await guest.json(),null,'Invalid guest token must return no campaign');
console.log('OK invalid guest share rejected');

// Guest image endpoint must never return an image without a valid token and visible entry.
const image=await fetch(SUPABASE_URL+'/functions/v1/shared-image',{
 method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},
 body:JSON.stringify({token:badToken,entry_id:badEntry}),signal:AbortSignal.timeout(15000)
});
assert.equal(image.status,404,'Invalid guest image share should be denied');
console.log('OK unauthorized guest image denied:',image.status);
// Verify anonymous callers cannot invoke privileged stage-3B RPCs.
for(const [name,payload] of [
 ['trash_entry',{p_entry_id:'00000000-0000-4000-8000-000000000000'}],
 ['restore_entry',{p_entry_id:'00000000-0000-4000-8000-000000000000'}],
 ['list_trash',{p_campaign_id:'00000000-0000-4000-8000-000000000000'}],
 ['list_campaign_members',{p_campaign_id:'00000000-0000-4000-8000-000000000000'}],
 ['change_member_role',{p_campaign_id:'00000000-0000-4000-8000-000000000000',p_user_id:'00000000-0000-4000-8000-000000000000',p_role:'master'}]
]){
 const resp=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{
  method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)
 });
 assert.ok(resp.status===401||resp.status===403||resp.status===404,
  'Anonymous caller unexpectedly reached privileged RPC: '+name+' ('+resp.status+')');
 console.log('OK stage3B anonymous RPC denied:',name,resp.status);
}
console.log('Deployment smoke passed. The user must still complete an actual Google sign-in.');
