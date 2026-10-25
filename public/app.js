import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const roles={master:'Мастер',editor:'Игрок+',viewer:'Игрок'};
let client,account=null,campaigns=[],campaign=null,entries=[],selected=null,editing=null,parentId=null;
const notice=x=>{$('notice').textContent=x||''};
function check({data,error}){if(error)throw error;return data}
const writable=()=>campaign?.role==='master'||campaign?.role==='editor';
const base=()=>client.from('entries');
async function launch(){
 if(!/^https:\/\//.test(SUPABASE_URL)||!SUPABASE_PUBLISHABLE_KEY||SUPABASE_PUBLISHABLE_KEY.includes('REPLACE')){notice('Для запуска укажите URL и publishable key отдельного проекта Supabase в public/config.js.');return}
 client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
 const {data:{user}}=await client.auth.getUser();account=user;
 $('login').hidden=!!user;$('home').hidden=!user;$('logout').hidden=!user;
 if(!user)return;
 $('account').textContent=user.email||'WreckLib';
 const invite=new URL(location.href).searchParams.get('invite');
 if(invite){try{await check(await client.rpc('accept_invitation',{p_id:invite}));history.replaceState({},'',location.pathname);notice('Приглашение принято')}catch(e){notice('Приглашение: '+e.message)}}
 await home();
}
$('login-form').onsubmit=async e=>{e.preventDefault();try{const email=e.target.elements.email.value;check(await client.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}}));notice('Письмо со ссылкой для входа отправлено.')}catch(err){notice(err.message)}};
$('logout').onclick=async()=>{await client.auth.signOut();location.reload()};
async function home(){
 campaign=null;$('inside').hidden=true;$('home').hidden=false;
 campaigns=check(await client.from('campaigns').select('id,name,memberships!inner(role)').eq('memberships.user_id',account.id).order('created_at',{ascending:false}));
 $('campaigns').innerHTML=campaigns.map(c=>'<button class="card" data-cid="'+esc(c.id)+'"><strong>'+esc(c.name)+'</strong><p class="muted">'+esc(roles[c.memberships[0]?.role])+'</p></button>').join('')||'<p class="muted">Пока нет кампаний.</p>';
 document.querySelectorAll('[data-cid]').forEach(b=>b.onclick=()=>open(b.dataset.cid));
}
$('campaign-form').onsubmit=async e=>{e.preventDefault();try{check(await client.rpc('create_campaign',{p_name:e.target.elements.name.value}));e.target.reset();await home();notice('Кампания создана')}catch(err){notice(err.message)}};
async function open(cid){
 const found=campaigns.find(c=>c.id===cid);if(!found)return;
 campaign={...found,role:found.memberships[0]?.role};
 $('home').hidden=true;$('inside').hidden=false;$('campaign-name').textContent=campaign.name;$('role').textContent=roles[campaign.role];$('new-folder').hidden=$('new-card').hidden=!writable();$('invite-panel').hidden=campaign.role!=='master';selected=null;await refresh();
}
async function refresh(){
 entries=check(await base().select('id,campaign_id,parent_id,kind,title,description,body,visibility,image_path,updated_at').eq('campaign_id',campaign.id).order('updated_at',{ascending:false}));
 if(campaign.role==='master'&&entries.length){const secrets=check(await client.from('entry_secrets').select('entry_id,secret_body').in('entry_id',entries.map(x=>x.id)));for(const s of secrets){const e=entries.find(x=>x.id===s.entry_id);if(e)e.secret_body=s.secret_body}}
 tree();if(selected){selected=entries.find(e=>e.id===selected.id)||null;await detail()}
}
function tree(){
 const build=(pid,level,seen)=>entries.filter(e=>(e.parent_id||null)===pid).map(e=>{if(seen.has(e.id))return '';const visited=new Set(seen);visited.add(e.id);return '<button class="tree-item '+(selected?.id===e.id?'active':'')+'" data-entry="'+esc(e.id)+'" style="padding-left:'+(10+level*16)+'px">'+(e.kind==='folder'?'▸ ':'• ')+esc(e.title)+'</button>'+build(e.id,level+1,visited)}).join('');
 $('tree').innerHTML=build(null,0,new Set());
 document.querySelectorAll('[data-entry]').forEach(b=>b.onclick=async()=>{selected=entries.find(e=>e.id===b.dataset.entry);tree();await detail()});
}
let imageUrl=null;
async function detail(){
 if(imageUrl){URL.revokeObjectURL(imageUrl);imageUrl=null}
 if(!selected){$('detail').innerHTML='<p class="muted">Выберите запись.</p>';return}
 const e=selected;let portrait='';
 if(e.image_path){const {data,error}=await client.storage.from('wrecklib-images').download(e.image_path);if(!error){imageUrl=URL.createObjectURL(data);portrait='<img class="portrait" src="'+imageUrl+'" alt="">'}}
 $('detail').innerHTML=portrait+'<div class="eyebrow">'+esc(e.kind)+'</div><h2>'+esc(e.title)+'</h2><p class="muted">'+esc(e.description)+'</p><pre>'+esc(e.body)+'</pre>'+(campaign.role==='master'&&e.secret_body?'<div class="secret"><b>Только Мастер</b><pre>'+esc(e.secret_body)+'</pre></div>':'')+(writable()?'<div class="actions"><button id="edit-entry">Редактировать</button><label>Иллюстрация <input type="file" id="image-file" accept="image/*"></label></div>':'');
 if(writable()){$('edit-entry').onclick=()=>editor(e.kind,e);$('image-file').onchange=upload}
}
function editor(kind,e=null){
 editing=e;const f=$('entry-form');f.reset();f.elements.kind.value=kind;f.elements.kind.disabled=!!e;f.elements.title.value=e?.title||'';f.elements.description.value=e?.description||'';f.elements.body.value=e?.body||'';f.elements.secret_body.value=e?.secret_body||'';f.elements.hidden.checked=e?.visibility==='master';$('gm-fields').hidden=campaign.role!=='master';$('editor-title').textContent=e?'Редактировать':'Новая запись';$('editor').showModal();
}
$('cancel').onclick=()=>$('editor').close();$('back').onclick=()=>home().catch(e=>notice(e.message));
$('new-folder').onclick=()=>{parentId=selected?.kind==='folder'?selected.id:null;editor('folder')};
$('new-card').onclick=()=>{parentId=selected?.kind==='folder'?selected.id:null;editor('person')};
$('entry-form').onsubmit=async ev=>{
 ev.preventDefault();const f=ev.target;
 try{
  const entry={title:f.elements.title.value,description:f.elements.description.value,body:f.elements.body.value};
  if(campaign.role==='master')entry.visibility=f.elements.hidden.checked?'master':'published';
  let id=editing?.id;
  if(editing)check(await base().update(entry).eq('id',id));
  else {Object.assign(entry,{campaign_id:campaign.id,parent_id:parentId,kind:f.elements.kind.value,created_by:account.id});id=check(await base().insert(entry).select('id').single()).id}
  if(campaign.role==='master'){const secret=f.elements.secret_body.value;check(await client.from('entry_secrets').upsert({entry_id:id,secret_body:secret}))}
  $('editor').close();await refresh();selected=entries.find(e=>e.id===id);tree();await detail();notice('Сохранено');
 }catch(e){notice(e.message)}
};
$('invite-form').onsubmit=async ev=>{
 ev.preventDefault();
 try{const f=ev.target;const data=check(await client.from('invitations').insert({campaign_id:campaign.id,email:f.elements.email.value.trim().toLowerCase(),role:f.elements.role.value}).select('id').single());const url=new URL(location.href);url.searchParams.set('invite',data.id);$('invite-link').textContent='Перешлите эту ссылку приглашённому пользователю: '+url.href;notice('Приглашение создано')}
 catch(e){notice(e.message)}
};
async function upload(ev){
 const file=ev.target.files?.[0];if(!file||!selected)return;
 try{
  const img=await createImageBitmap(file),scale=Math.min(1,1400/Math.max(img.width,img.height)),canvas=document.createElement('canvas');
  canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);img.close();
  const blob=await new Promise(r=>canvas.toBlob(r,'image/webp',.8));if(!blob||blob.size>3145728)throw Error('Изображение слишком большое');
  const path=campaign.id+'/'+crypto.randomUUID()+'.webp';
  check(await client.storage.from('wrecklib-images').upload(path,blob,{contentType:'image/webp',upsert:false}));
  try{check(await base().update({image_path:path}).eq('id',selected.id))}catch(e){await client.storage.from('wrecklib-images').remove([path]);throw e}
  await refresh();notice('Изображение загружено');
 }catch(e){notice(e.message)}
}
launch().catch(e=>notice(e.message));
