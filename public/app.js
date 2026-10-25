import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roles={master:'Мастер',editor:'Игрок+',viewer:'Игрок',guest:'Гость'};
const kinds={folder:'Папка',person:'Персонаж',location:'Локация',item:'Предмет',faction:'Фракция',event:'Событие',article:'Статья'};
const viewToken=new URL(location.href).searchParams.get('share');
const notice=x=>{$('notice').textContent=x||''};
const check=({data,error})=>{if(error)throw error;return data};
let client,account=null,campaigns=[],campaign=null,entries=[],selected=null,editing=null,parentId=null,imageUrl=null,moveTargetId=null;
const collapsedFolders=new Set();
const writable=()=>campaign?.role==='master'||campaign?.role==='editor';
const base=()=>client.from('entries');

const savedAccent=localStorage.getItem('wrecklib-accent')||'gold';
const themes=['gold','blue','scarlet','purple'];
document.documentElement.dataset.accent=themes.includes(savedAccent)?savedAccent:'gold';
$('accent-choice').value=document.documentElement.dataset.accent;
$('accent-choice').onchange=event=>{
 const theme=themes.includes(event.target.value)?event.target.value:'gold';
 document.documentElement.dataset.accent=theme;
 localStorage.setItem('wrecklib-accent',theme);
};

const fontModes=['classic','neuzeit','belarus','ebbe','old-town'];
const savedFont=localStorage.getItem('wrecklib-font')||'classic';
document.documentElement.dataset.font=fontModes.includes(savedFont)?savedFont:'classic';
$('font-choice').value=document.documentElement.dataset.font;
$('font-choice').onchange=event=>{
 const font=fontModes.includes(event.target.value)?event.target.value:'classic';
 document.documentElement.dataset.font=font;
 localStorage.setItem('wrecklib-font',font);
};
function setMobileView(view){
 const active=view==='detail'?'detail':'tree';
 document.documentElement.dataset.mobileView=active;
 $('show-tree').classList.toggle('is-active',active==='tree');
 $('show-detail').classList.toggle('is-active',active==='detail');
 $('show-tree').setAttribute('aria-pressed',String(active==='tree'));
 $('show-detail').setAttribute('aria-pressed',String(active==='detail'));
}
$('show-tree').onclick=()=>setMobileView('tree');
$('show-detail').onclick=()=>setMobileView('detail');
setMobileView('tree');

async function launch(){
 if(!/^https:\/\//.test(SUPABASE_URL)||!SUPABASE_PUBLISHABLE_KEY||SUPABASE_PUBLISHABLE_KEY.includes('REPLACE')){
  notice('Не заданы публичные настройки Supabase для WreckLib');return;
 }
 client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
 const {data:{user}}=await client.auth.getUser();
 account=user;
 $('logout').hidden=!account;
 $('account').textContent=account?.email||'Гость';
 const invite=new URL(location.href).searchParams.get('invite');
 if(invite&&!account){$('login').hidden=false;notice('Войдите с Google или по почте, чтобы принять приглашение.');return;}
 if(invite&&account){
  try{
   check(await client.rpc('accept_invitation',{p_id:invite}));
   const current=new URL(location.href);current.searchParams.delete('invite');
   history.replaceState({},'',current.pathname+current.search);
   notice('Приглашение принято. Права назначены вашему аккаунту.');
  }catch(e){notice('Приглашение: '+e.message)}
 }
 if(viewToken){await openShared(viewToken);return;}
 if(account){await home();return;}
 $('login').hidden=false;
}

$('google-login').onclick=async()=>{
 try{
  const {error}=await client.auth.signInWithOAuth({
   provider:'google',
   options:{redirectTo:location.origin+location.pathname+location.search}
  });
  if(error)throw error;
 }catch(err){notice('Вход Google: '+err.message+'. Проверьте, включён ли Google в Supabase Auth.')}
};
$('login-form').onsubmit=async event=>{
 event.preventDefault();
 try{
  check(await client.auth.signInWithOtp({
   email:event.target.elements.email.value,
   options:{emailRedirectTo:location.origin+location.pathname+location.search}
  }));
  notice('Письмо со ссылкой для входа отправлено.');
 }catch(err){notice(err.message)}
};
$('logout').onclick=async()=>{await client.auth.signOut();location.assign(location.pathname)};
$('back').onclick=()=>{if(account)home().catch(e=>notice(e.message));else location.assign(location.pathname)};

async function home(){
 campaign=null;selected=null;collapsedFolders.clear();setMobileView('tree');
 $('login').hidden=true;$('inside').hidden=true;$('invalid-share').hidden=true;$('home').hidden=false;
 if(!account){$('home').hidden=true;$('login').hidden=false;return}
 campaigns=check(await client.from('campaigns')
  .select('id,name,memberships!inner(role)')
  .eq('memberships.user_id',account.id).order('created_at',{ascending:false}));
 $('campaigns').innerHTML=campaigns.map(c=>
  '<button type="button" class="card" data-cid="'+esc(c.id)+'"><strong>'+esc(c.name)+
  '</strong><p class="muted">'+esc(roles[c.memberships[0]?.role]||'Участник')+'</p></button>'
 ).join('')||'<p class="muted">У вас пока нет кампаний. По ссылке от Мастера можно читать чужую кампанию даже без приглашения.</p>';
 document.querySelectorAll('[data-cid]').forEach(btn=>btn.onclick=()=>open(btn.dataset.cid));
}
$('campaign-form').onsubmit=async event=>{
 event.preventDefault();
 try{
  check(await client.rpc('create_campaign',{p_name:event.target.elements.name.value}));
  event.target.reset();await home();notice('Кампания создана');
 }catch(err){notice(err.message)}
};

function showInside(){
 $('login').hidden=true;$('home').hidden=true;$('invalid-share').hidden=true;$('inside').hidden=false;
 $('campaign-name').textContent=campaign.name;
 $('role').textContent=roles[campaign.role]||'Участник';
 $('new-folder').hidden=$('new-card').hidden=!writable();
 $('invite-panel').hidden=$('share-panel').hidden=campaign.role!=='master';
 $('readonly-indicator').hidden=writable();
 $('share-link').textContent='';
}

async function open(cid){
 const found=campaigns.find(c=>c.id===cid);if(!found)return;
 campaign={...found,role:found.memberships[0]?.role};entries=[];selected=null;collapsedFolders.clear();setMobileView('tree');
 showInside();
 if(campaign.role==='master')await refreshShareStatus();
 await refresh();
}

async function openShared(token){
 $('login').hidden=true;$('home').hidden=true;$('inside').hidden=true;
 try{
  const data=check(await client.rpc('read_shared_campaign',{p_token:token}));
  if(!data||!Array.isArray(data.entries)){$('invalid-share').hidden=false;return}
  campaign={id:data.id,name:data.name,role:'guest'};entries=data.entries;selected=null;collapsedFolders.clear();setMobileView('tree');
  showInside();tree();$('detail').innerHTML='<p class="muted">Выберите опубликованный материал слева.</p>';
 }catch(err){$('invalid-share').hidden=false;notice('Не удалось открыть ссылку: '+err.message)}
}

async function refresh(){
 if(!campaign||campaign.role==='guest')return;
 entries=check(await base()
  .select('id,campaign_id,parent_id,kind,title,description,body,visibility,image_path,updated_at')
  .eq('campaign_id',campaign.id).order('updated_at',{ascending:false}));
 if(campaign.role==='master'&&entries.length){
  const secrets=check(await client.from('entry_secrets').select('entry_id,secret_body')
   .in('entry_id',entries.map(e=>e.id)));
  const lookup=new Map(entries.map(e=>[e.id,e]));
  secrets.forEach(s=>{if(lookup.has(s.entry_id))lookup.get(s.entry_id).secret_body=s.secret_body});
 }
 tree();
 if(selected){selected=entries.find(e=>e.id===selected.id)||null;await detail()}
}

function tree(){
 const byParent=new Map();
 for(const entry of entries){
  const parent=entry.parent_id||null;
  if(!byParent.has(parent))byParent.set(parent,[]);
  byParent.get(parent).push(entry);
 }
 for(const children of byParent.values()){
  children.sort((a,b)=>Number(b.kind==='folder')-Number(a.kind==='folder')||
    a.title.localeCompare(b.title,'ru'));
 }
 function build(pid,level,seen){
  return (byParent.get(pid)||[]).map(e=>{
   if(seen.has(e.id))return '';
   const visited=new Set(seen);visited.add(e.id);
   const isFolder=e.kind==='folder';
   const collapsed=collapsedFolders.has(e.id);
   const toggle=isFolder?
    '<button type="button" class="tree-toggle" data-toggle="'+esc(e.id)+'" aria-label="'+
    (collapsed?'Развернуть':'Свернуть')+' папку '+esc(e.title)+'" aria-expanded="'+
    String(!collapsed)+'">'+(collapsed?'▸':'▾')+'</button>':
    '<span class="tree-spacer" aria-hidden="true"></span>';
   return '<div class="tree-row" style="--tree-indent:'+(Math.min(level,30)*14)+'px">'+
    toggle+'<button type="button" class="tree-item '+(selected?.id===e.id?'active':'')+
    '" data-entry="'+esc(e.id)+'">'+esc(e.title)+'</button></div>'+
    (isFolder&&!collapsed?build(e.id,level+1,visited):'');
  }).join('');
 }
 $('tree').innerHTML=build(null,0,new Set())||'<p class="muted">Материалов пока нет.</p>';
 document.querySelectorAll('[data-toggle]').forEach(btn=>btn.onclick=()=>{
  const id=btn.dataset.toggle;
  if(collapsedFolders.has(id))collapsedFolders.delete(id);else collapsedFolders.add(id);
  tree();
 });
 document.querySelectorAll('[data-entry]').forEach(btn=>btn.onclick=async()=>{
  selected=entries.find(e=>e.id===btn.dataset.entry);tree();setMobileView('detail');await detail();
 });
}

function isDescendant(candidateId,ancestorId){
 const lookup=new Map(entries.map(e=>[e.id,e]));
 let cursor=lookup.get(candidateId),count=0;
 while(cursor&&count<65){
  if(cursor.id===ancestorId)return true;
  cursor=lookup.get(cursor.parent_id);count++;
 }
 return count>=65;
}
function moveEditor(){
 if(!writable()||!selected)return;
 moveTargetId=selected.id;
 const oldParent=selected.parent_id||'';
 $('move-description').textContent='Перемещение: '+selected.title;
 const folderOptions=entries.filter(e=>e.kind==='folder'&&
  !isDescendant(e.id,moveTargetId)&&
  (campaign.role==='master'||e.visibility==='published'));
 const select=$('move-destination');
 select.innerHTML='<option value="">Корень кампании</option>'+folderOptions.map(e=>
  '<option value="'+esc(e.id)+'">'+esc(e.title)+'</option>').join('');
 select.value=oldParent;
 $('move-submit').disabled=false;
 $('move-dialog').showModal();
}
$('move-cancel').onclick=()=>$('move-dialog').close();
$('move-form').onsubmit=async event=>{
 event.preventDefault();
 if(!writable()||!moveTargetId)return;
 const targetId=moveTargetId;
 const destination=$('move-destination').value||null;
 $('move-submit').disabled=true;
 try{
  check(await client.rpc('move_entry',{p_entry_id:targetId,p_parent_id:destination}));
  $('move-dialog').close();moveTargetId=null;
  await refresh();
  selected=entries.find(e=>e.id===targetId)||null;
  if(destination)collapsedFolders.delete(destination);
  tree();await detail();
  notice('Запись перемещена');
 }catch(err){notice('Перемещение: '+err.message)}
 finally{$('move-submit').disabled=false}
};

async function readGuestImage(id){
 const response=await fetch(SUPABASE_URL+'/functions/v1/shared-image',{
  method:'POST',
  headers:{'Content-Type':'application/json','apikey':SUPABASE_PUBLISHABLE_KEY},
  body:JSON.stringify({token:viewToken,entry_id:id}),
  cache:'no-store'
 });
 if(!response.ok)throw new Error('Image unavailable');
 const image=await response.blob();
 if(image.type!=='image/webp')throw new Error('Invalid image type');
 return image;
}
async function detail(){
 if(imageUrl){URL.revokeObjectURL(imageUrl);imageUrl=null}
 if(!selected){$('detail').innerHTML='<p class="muted">Выберите запись.</p>';return}
 const e=selected;let portrait='';
 const imagePresent=campaign.role==='guest'?e.has_image:!!e.image_path;
 if(imagePresent){
  try{
   const blob=campaign.role==='guest'
    ?await readGuestImage(e.id)
    :check(await client.storage.from('wrecklib-images').download(e.image_path));
   if(blob){imageUrl=URL.createObjectURL(blob);portrait='<img class="portrait" src="'+imageUrl+'" alt="">'}
  }catch(_e){/* Unavailable image should not prevent article viewing. */}
 }
 $('detail').innerHTML=portrait+
  '<div class="eyebrow">'+esc(kinds[e.kind]||e.kind)+'</div><h2>'+esc(e.title)+'</h2>'+
  '<p class="muted">'+esc(e.description)+'</p><pre>'+esc(e.body)+'</pre>'+
  (campaign.role==='master'&&e.secret_body?
    '<div class="secret"><b>Только Мастер</b><pre>'+esc(e.secret_body)+'</pre></div>':'')+
  (writable()?'<div class="actions"><button class="button" id="edit-entry" type="button">Редактировать</button><button class="button" id="move-entry" type="button">Переместить</button>'+
   '<label>Иллюстрация <input type="file" id="image-file" accept="image/*"></label></div>':'');
 if(writable()){
  $('edit-entry').onclick=()=>editor(e.kind,e);
  $('move-entry').onclick=moveEditor;
  $('image-file').onchange=upload;
 }
}

function editor(kind,e=null){
 editing=e;const f=$('entry-form');f.reset();
 f.elements.kind.value=kind;f.elements.kind.disabled=!!e;
 f.elements.title.value=e?.title||'';f.elements.description.value=e?.description||'';
 f.elements.body.value=e?.body||'';f.elements.secret_body.value=e?.secret_body||'';
 f.elements.hidden.checked=e?.visibility==='master';
 $('gm-fields').hidden=campaign.role!=='master';
 $('editor-title').textContent=e?'Редактировать':'Новая запись';
 $('editor').showModal();
}
$('cancel').onclick=()=>$('editor').close();
$('new-folder').onclick=()=>{if(!writable())return;parentId=selected?.kind==='folder'?selected.id:null;editor('folder')};
$('new-card').onclick=()=>{if(!writable())return;parentId=selected?.kind==='folder'?selected.id:null;editor('person')};
$('entry-form').onsubmit=async ev=>{
 ev.preventDefault();if(!writable())return;
 const f=ev.target;
 try{
  const entry={title:f.elements.title.value,description:f.elements.description.value,body:f.elements.body.value};
  if(campaign.role==='master')entry.visibility=f.elements.hidden.checked?'master':'published';
  let id=editing?.id;
  if(editing)check(await base().update(entry).eq('id',id));
  else{
   Object.assign(entry,{campaign_id:campaign.id,parent_id:parentId,kind:f.elements.kind.value,created_by:account.id});
   id=check(await base().insert(entry).select('id').single()).id;
  }
  if(campaign.role==='master'){
   check(await client.from('entry_secrets').upsert({entry_id:id,secret_body:f.elements.secret_body.value}));
  }
  $('editor').close();await refresh();selected=entries.find(e=>e.id===id);
  tree();await detail();notice('Сохранено');
 }catch(err){notice(err.message)}
};
$('invite-form').onsubmit=async event=>{
 event.preventDefault();if(campaign?.role!=='master')return;
 try{
  const f=event.target;
  const data=check(await client.from('invitations').insert({
   campaign_id:campaign.id,
   email:f.elements.email.value.trim().toLowerCase(),role:f.elements.role.value
  }).select('id').single());
  const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('invite',data.id);
  $('invite-link').textContent='Отправьте эту ссылку приглашённому Google-аккаунту: '+url.href;
  notice('Приглашение создано. Только владелец указанного email сможет принять его.');
 }catch(err){notice(err.message)}
};

async function refreshShareStatus(){
 if(campaign?.role!=='master')return;
 try{
  const active=check(await client.rpc('get_campaign_share_status',{p_campaign_id:campaign.id}));
  $('share-status').textContent=active?'Доступ по ссылке открыт. Для копирования создайте новую ссылку (старая перестанет работать).':'Публичной ссылки пока нет.';
  $('revoke-share').hidden=!active;
 }catch(err){notice(err.message)}
}
$('create-share').onclick=async()=>{
 if(campaign?.role!=='master')return;
 try{
  const token=check(await client.rpc('rotate_campaign_share',{p_campaign_id:campaign.id}));
  const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('share',token);
  $('share-link').innerHTML='<p>Ссылка для чтения:</p><input id="share-url" readonly aria-label="Ссылка для гостей"><button class="button" id="copy-share" type="button">Копировать ссылку</button>';
  $('share-url').value=url.href;
  $('copy-share').onclick=async()=>{try{await navigator.clipboard.writeText(url.href);notice('Ссылка скопирована')}catch(e){$('share-url').select();notice('Выделите ссылку и скопируйте вручную')}};
  await refreshShareStatus();
  notice('Новая ссылка создана. Старые ссылки этой кампании больше не действуют.');
 }catch(err){notice(err.message)}
};
$('revoke-share').onclick=async()=>{
 if(campaign?.role!=='master'||!confirm('Закрыть доступ всем гостям по этой ссылке?'))return;
 try{
  check(await client.rpc('revoke_campaign_share',{p_campaign_id:campaign.id}));
  $('share-link').textContent='';await refreshShareStatus();notice('Гостевой доступ по ссылке закрыт.');
 }catch(err){notice(err.message)}
};

async function upload(ev){
 const file=ev.target.files?.[0];if(!file||!selected||!writable())return;
 try{
  const img=await createImageBitmap(file),scale=Math.min(1,1400/Math.max(img.width,img.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.width*scale));
  canvas.height=Math.max(1,Math.round(img.height*scale));
  canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);img.close();
  const blob=await new Promise(r=>canvas.toBlob(r,'image/webp',.8));
  if(!blob||blob.size>3145728)throw Error('Изображение слишком большое');
  const path=campaign.id+'/'+crypto.randomUUID()+'.webp';
  check(await client.storage.from('wrecklib-images').upload(path,blob,{contentType:'image/webp',upsert:false}));
  try{check(await base().update({image_path:path}).eq('id',selected.id))}
  catch(e){await client.storage.from('wrecklib-images').remove([path]);throw e}
  await refresh();notice('Изображение загружено');
 }catch(err){notice(err.message)}
}
launch().catch(err=>notice(err.message));
