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
console.log('Deployment smoke passed. Note: the user must still complete an actual Google sign-in.');
