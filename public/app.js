import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
import {renderMarkdown,searchEntries,findBacklinks,escapeHtml} from './markdown.js';
import {parseTags,collectVisibleTags,filterByTag,normalizedTag} from './tags.js';
import {serializeCampaignExport,exportFilename} from './export.js';
import {validateImportSnapshot,buildImageBackup,extractImageBlob,MAX_ARCHIVE_BYTES} from './import.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roles={master:'Мастер',editor:'Игрок+',viewer:'Игрок',guest:'Гость'};
const kinds={folder:'Папка',person:'Персонаж',location:'Локация',item:'Предмет',faction:'Фракция',event:'Событие',article:'Статья'};
const viewToken=new URL(location.href).searchParams.get('share');
const notice=x=>{$('notice').textContent=x||''};
const check=({data,error})=>{if(error)throw error;return data};
let client,account=null,campaigns=[],campaign=null,entries=[],selected=null,editing=null,parentId=null,imageUrl=null,moveTargetId=null,historyEntryId=null,historyRevisionId=null,importData=null;
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
 $('invite-panel').hidden=$('share-panel').hidden=$('trash-panel').hidden=campaign.role!=='master';
 $('readonly-indicator').hidden=writable();
 $('export-json').hidden=$('export-backup').hidden=campaign.role!=='master';
 $('share-link').textContent='';
}

async function open(cid){
 const found=campaigns.find(c=>c.id===cid);if(!found)return;
 campaign={...found,role:found.memberships[0]?.role};entries=[];selected=null;collapsedFolders.clear();$('entry-search').value='';$('tag-filter').value='';setMobileView('tree');
 showInside();
 if(campaign.role==='master')await Promise.all([refreshShareStatus(),refreshMembers(),refreshTrash()]);
 await refresh();
}

async function openShared(token){
 $('login').hidden=true;$('home').hidden=true;$('inside').hidden=true;
 try{
  const data=check(await client.rpc('read_shared_campaign',{p_token:token}));
  if(!data||!Array.isArray(data.entries)){$('invalid-share').hidden=false;return}
  campaign={id:data.id,name:data.name,role:'guest'};entries=data.entries;selected=null;collapsedFolders.clear();$('entry-search').value='';$('tag-filter').value='';setMobileView('tree');
  showInside();tree();populateTagFilter();renderSearch();$('detail').innerHTML='<p class="muted">Выберите опубликованный материал слева.</p>';
 }catch(err){$('invalid-share').hidden=false;notice('Не удалось открыть ссылку: '+err.message)}
}

async function refresh(){
 if(!campaign||campaign.role==='guest')return;
 entries=check(await base()
  .select('id,campaign_id,parent_id,kind,title,description,body,tags,visibility,image_path,updated_at')
  .eq('campaign_id',campaign.id).order('updated_at',{ascending:false}));
 if(campaign.role==='master'&&entries.length){
  const secrets=check(await client.from('entry_secrets').select('entry_id,secret_body')
   .in('entry_id',entries.map(e=>e.id)));
  const lookup=new Map(entries.map(e=>[e.id,e]));
  secrets.forEach(s=>{if(lookup.has(s.entry_id))lookup.get(s.entry_id).secret_body=s.secret_body});
 }
 tree();populateTagFilter();renderSearch();
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


// Local searching never calls a privileged search endpoint: only entries returned
// by campaign RLS or the read-only guest share RPC are considered.
function navigateToVisibleEntry(id){
 const found=entries.find(e=>e.id===id);
 if(!found)return; // Do not fetch arbitrary IDs or disclose hidden entries.
 selected=found;tree();setMobileView('detail');
 detail().catch(err=>notice(err.message));
}
$('detail').addEventListener('click',event=>{
 const link=event.target.closest('[data-wiki-target]');
 if(!link||!$('detail').contains(link))return;
 event.preventDefault();
 navigateToVisibleEntry(link.dataset.wikiTarget);
});

function populateTagFilter(){
 const selector=$('tag-filter'),previous=selector.value;
 const options=collectVisibleTags(entries);
 selector.innerHTML='<option value="">Все теги</option>'+
  options.map(tag=>'<option value="'+esc(tag)+'">'+esc(tag)+'</option>').join('');
 selector.value=options.includes(previous)?previous:'';
}
$('tag-filter').addEventListener('change',renderSearch);

function renderSearch(){
 const query=$('entry-search').value.trim(),tag=$('tag-filter').value,results=$('search-results');
 const active=!!query||!!tag;
 $('tree').hidden=active;
 results.hidden=!active;
 if(!active){results.replaceChildren();return}
 const subset=filterByTag(entries,tag);
 const hits=query?searchEntries(subset,query,40):subset.slice().sort((a,b)=>a.title.localeCompare(b.title,'ru'))
   .slice(0,80).map(entry=>({entry,excerpt:entry.description||''}));
 results.innerHTML=hits.map(({entry,excerpt})=>
  '<button type="button" class="search-hit" data-search-target="'+esc(entry.id)+'">'+
  '<strong>'+esc(entry.title)+'</strong>'+
  (Array.isArray(entry.tags)&&entry.tags.length?'<span class="search-hit-tags">'+entry.tags.map(t=>'<span class="tag-pill">'+esc(t)+'</span>').join('')+'</span>':'')+
  (excerpt?'<small>'+esc(excerpt)+'</small>':'')+'</button>'
 ).join('')||'<p class="muted">Ничего не найдено среди доступных материалов.</p>';
 results.querySelectorAll('[data-search-target]').forEach(btn=>btn.onclick=()=>{
  navigateToVisibleEntry(btn.dataset.searchTarget);
 });
}
$('entry-search').addEventListener('input',renderSearch);

function populateWikiPicker(){
 const picker=$('wiki-picker');
 picker.innerHTML='<option value="">Выберите статью…</option>'+
  entries.filter(e=>e.kind!=='folder').slice().sort((a,b)=>a.title.localeCompare(b.title,'ru'))
   .map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+'</option>').join('');
}
function updateMarkdownPreview(){
 $('markdown-preview-content').innerHTML=renderMarkdown($('markdown-source').value,entries);
}
$('markdown-source').addEventListener('input',updateMarkdownPreview);
function insertMarkdown(prefix,suffix,placeholder){
 const area=$('markdown-source');
 const start=area.selectionStart,end=area.selectionEnd;
 const marked=area.value.slice(start,end)||placeholder;
 area.setRangeText(prefix+marked+suffix,start,end,'end');
 area.focus();updateMarkdownPreview();
}
document.querySelectorAll('[data-md]').forEach(button=>button.addEventListener('click',()=>{
 const type=button.dataset.md;
 switch(type){
  case 'bold':insertMarkdown('**','**','жирный текст');break;
  case 'italic':insertMarkdown('*','*','курсив');break;
  case 'heading':insertMarkdown('\n## ','\n','Заголовок');break;
  case 'list':insertMarkdown('\n- ','\n','пункт');break;
  case 'nested-list':insertMarkdown('\n- Раздел\n  - ','\n','подпункт');break;
  case 'table':insertMarkdown('\n| Название | Описание |\n| :--- | ---: |\n| ',' | значение |\n','строка');break;
  case 'quote':insertMarkdown('\n> ','\n','цитата');break;
  case 'code':insertMarkdown('\x60','\x60','код');break;
  case 'link':insertMarkdown('[','](https://example.com)','текст ссылки');break;
  case 'wiki':{
   const id=$('wiki-picker').value,entry=entries.find(e=>e.id===id);
   if(!entry){notice('Сначала выберите доступную статью для ссылки.');return}
   insertMarkdown('[[',']]',entry.id+'|'+entry.title);break;
  }
 }
}));

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
  '<p class="muted">'+esc(e.description)+'</p>'+
  (Array.isArray(e.tags)&&e.tags.length?'<div class="article-tags">'+e.tags.map(tag=>
   '<button type="button" class="tag-pill tag-action" data-tag="'+esc(tag)+'">#'+esc(tag)+'</button>').join('')+'</div>':'')+
  '<div class="markdown-body">'+renderMarkdown(e.body,entries)+'</div>'+
  (findBacklinks(e.id,entries).length?'<section class="backlinks"><h3>Ссылаются на эту статью</h3>'+
    findBacklinks(e.id,entries).map(back=>'<button type="button" class="button backlink-item" data-wiki-target="'+esc(back.id)+'">'+esc(back.title)+'</button>').join('')+'</section>':'')+
  (campaign.role==='master'&&e.secret_body?
    '<div class="secret"><b>Только Мастер</b><pre>'+esc(e.secret_body)+'</pre></div>':'')+
  (writable()?'<div class="actions"><button class="button" id="edit-entry" type="button">Редактировать</button><button class="button" id="move-entry" type="button">Переместить</button>'+
   '<label>Иллюстрация <input type="file" id="image-file" accept="image/*"></label></div>':'');
 $('detail').querySelectorAll('[data-tag]').forEach(btn=>btn.onclick=()=>{
  const tag=normalizedTag(btn.dataset.tag);
  populateTagFilter();
  $('tag-filter').value=tag;
  renderSearch();setMobileView('tree');
 });
 if(writable()){
  $('edit-entry').onclick=()=>editor(e.kind,e);
  $('move-entry').onclick=moveEditor;
  $('image-file').onchange=upload;
  if(campaign.role==='master'){
    $('detail').querySelector('.actions').insertAdjacentHTML('beforeend',
      '<button type="button" class="button danger-button" id="trash-entry">В корзину</button>');
    $('trash-entry').onclick=trashSelected;
    $('detail').querySelector('.actions').insertAdjacentHTML('beforeend',
      '<button type="button" class="button" id="history-open">История версий</button>');
    $('history-open').onclick=()=>openHistory(e.id);
  }
 }
}

function editor(kind,e=null){
 editing=e;const f=$('entry-form');f.reset();
 f.elements.kind.value=kind;f.elements.kind.disabled=!!e;
 f.elements.title.value=e?.title||'';f.elements.description.value=e?.description||'';
 f.elements.body.value=e?.body||'';f.elements.tags.value=(e?.tags||[]).join(', ');f.elements.secret_body.value=e?.secret_body||'';
 f.elements.hidden.checked=e?.visibility==='master';
 $('gm-fields').hidden=campaign.role!=='master';
 $('editor-title').textContent=e?'Редактировать':'Новая запись';
 $('editor').showModal();populateWikiPicker();updateMarkdownPreview();
}
$('cancel').onclick=()=>$('editor').close();
$('new-folder').onclick=()=>{if(!writable())return;parentId=selected?.kind==='folder'?selected.id:null;editor('folder')};
$('new-card').onclick=()=>{if(!writable())return;parentId=selected?.kind==='folder'?selected.id:null;editor('person')};
$('entry-form').onsubmit=async ev=>{
 ev.preventDefault();if(!writable())return;
 const f=ev.target;
 try{
  const entry={title:f.elements.title.value,description:f.elements.description.value,body:f.elements.body.value,tags:parseTags(f.elements.tags.value)};
  if(campaign.role==='master')entry.visibility=f.elements.hidden.checked?'master':'published';
  let id=editing?.id;
  if(editing){
   check(await client.rpc('update_entry_if_unchanged',{
    p_entry_id:id,p_expected_updated_at:editing.updated_at,
    p_title:entry.title,p_description:entry.description,p_body:entry.body,
    p_tags:entry.tags,p_visibility:campaign.role==='master'?entry.visibility:null,
    p_secret_body:campaign.role==='master'?f.elements.secret_body.value:null
   }));
  }else{
   Object.assign(entry,{campaign_id:campaign.id,parent_id:parentId,kind:f.elements.kind.value,created_by:account.id});
   id=check(await base().insert(entry).select('id').single()).id;
   if(campaign.role==='master'){
    check(await client.from('entry_secrets').upsert({entry_id:id,secret_body:f.elements.secret_body.value}));
   }
  }
  $('editor').close();await refresh();selected=entries.find(e=>e.id===id);
  tree();await detail();notice('Сохранено');
 }catch(err){
  notice((err.message||'').includes('EDIT_CONFLICT')
   ?'Конфликт редактирования: запись изменена в другой вкладке. Скопируйте черновик перед обновлением страницы — ваши правки не сохранены.'
   :err.message);
 }
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
  notice('Приглашение создано. Только владелец указанного email сможет принять его.');await refreshMembers();
 }catch(err){notice(err.message)}
};


// Master-only membership management. Roles are enforced by server RPCs, not this UI.
async function refreshMembers(){
 if(campaign?.role!=='master')return;
 try{
  const cid=campaign.id;
  const members=check(await client.rpc('list_campaign_members',{p_campaign_id:cid}));
  const pending=check(await client.from('invitations').select('id,email,role')
    .eq('campaign_id',cid).order('created_at',{ascending:false}));
  if(campaign?.id!==cid)return;
  $('members-list').innerHTML=members.map(m=>{
   const protectedMember=m.is_owner||m.user_id===account.id;
   return '<div class="member-row"><div class="member-name">'+esc(m.email||m.user_id)+
     (m.is_owner?' <span class="muted">(владелец)</span>':'')+'</div>'+
     (protectedMember?'<span class="muted">'+esc(roles[m.role]||m.role)+'</span>':
     '<select aria-label="Роль участника" data-member-role="'+esc(m.user_id)+'">'+
       ['master','editor','viewer'].map(r=>'<option value="'+r+'"'+(m.role===r?' selected':'')+'>'+esc(roles[r])+'</option>').join('')+
     '</select><div class="member-actions">'+
     '<button class="button mini-button" data-member-save="'+esc(m.user_id)+'" type="button">Сохранить</button>'+
     '<button class="button mini-button danger-button" data-member-remove="'+esc(m.user_id)+'" type="button">Отозвать доступ</button></div>')+
     '</div>';
  }).join('')||'<p class="muted">Участников нет.</p>';
  $('pending-list').innerHTML=pending.map(inv=>'<div class="member-row"><div class="member-name">'+esc(inv.email)+
    ' <span class="muted">· '+esc(roles[inv.role]||inv.role)+'</span></div>'+
    '<button type="button" class="button mini-button" data-invite-cancel="'+esc(inv.id)+'">Отозвать приглашение</button></div>').join('')||
    '<p class="muted">Ожидающих приглашений нет.</p>';
  document.querySelectorAll('[data-member-save]').forEach(btn=>btn.onclick=async()=>{
   const uid=btn.dataset.memberSave;
   const role=btn.closest('.member-row').querySelector('select').value;
   try{check(await client.rpc('change_member_role',{p_campaign_id:cid,p_user_id:uid,p_role:role}));
    notice('Роль участника обновлена');await refreshMembers();}
   catch(err){notice('Роли: '+err.message)}
  });
  document.querySelectorAll('[data-member-remove]').forEach(btn=>btn.onclick=async()=>{
   const uid=btn.dataset.memberRemove;
   if(!confirm('Отозвать доступ этого участника к кампании?'))return;
   try{check(await client.rpc('remove_campaign_member',{p_campaign_id:cid,p_user_id:uid}));
    notice('Доступ участника отозван');await refreshMembers();}
   catch(err){notice('Участники: '+err.message)}
  });
  document.querySelectorAll('[data-invite-cancel]').forEach(btn=>btn.onclick=async()=>{
   if(!confirm('Отменить это приглашение?'))return;
   try{check(await client.rpc('revoke_campaign_invitation',{p_invitation_id:btn.dataset.inviteCancel}));
    notice('Приглашение отозвано');await refreshMembers();}
   catch(err){notice('Приглашение: '+err.message)}
  });
 }catch(err){notice('Список участников: '+err.message)}
}
$('members-refresh').onclick=()=>refreshMembers();
async function refreshTrash(){
 if(campaign?.role!=='master')return;
 try{
  const cid=campaign.id;
  const rows=check(await client.rpc('list_trash',{p_campaign_id:cid}));
  if(campaign?.id!==cid)return;
  $('trash-list').innerHTML=rows.map(item=>'<div class="member-row"><div class="member-name">'+
    esc(item.kind==='folder'?'▸ ':'• ')+esc(item.title)+'</div>'+
    '<button type="button" class="button mini-button" data-restore="'+esc(item.id)+'">Восстановить</button></div>').join('')||
    '<p class="muted">Корзина пуста.</p>';
  document.querySelectorAll('[data-restore]').forEach(btn=>btn.onclick=async()=>{
   const id=btn.dataset.restore;
   try{
    check(await client.rpc('restore_entry',{p_entry_id:id}));
    await refresh();await refreshTrash();
    selected=entries.find(e=>e.id===id)||null;
    tree();await detail();
    notice('Материал восстановлен с исходной иерархией');
   }catch(err){notice('Восстановление: '+err.message)}
  });
 }catch(err){notice('Корзина: '+err.message)}
}
$('trash-refresh').onclick=()=>refreshTrash();
async function trashSelected(){
 if(campaign?.role!=='master'||!selected)return;
 const id=selected.id;
 const question=selected.kind==='folder'
   ?'Переместить папку в корзину вместе со всеми вложенными материалами?'
   :'Переместить эту запись в корзину?';
 if(!confirm(question))return;
 try{
  check(await client.rpc('trash_entry',{p_entry_id:id}));
  selected=null;await refresh();await detail();await refreshTrash();
  setMobileView('tree');
  notice('Материал перемещён в корзину. Данные и вложенность сохранены.');
 }catch(err){notice('Корзина: '+err.message)}
}

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


async function openHistory(id){
 if(campaign?.role!=='master'||!entries.some(e=>e.id===id))return;
 historyEntryId=id;historyRevisionId=null;
 $('history-restore').disabled=true;
 $('history-list').textContent='Загрузка версий…';
 $('history-preview').innerHTML='<p class="muted">Выберите версию слева.</p>';
 $('history-title').textContent='История: '+(entries.find(e=>e.id===id)?.title||'Статья');
 $('history-dialog').showModal();
 try{
  const versions=check(await client.rpc('list_entry_revisions',{p_entry_id:id}));
  if(historyEntryId!==id)return;
  $('history-list').innerHTML=versions.map(version=>
   '<button class="button history-item" type="button" data-revision="'+esc(version.revision_id)+'">'+
   '<b>Версия '+esc(version.revision_number)+'</b>'+
   '<small>'+esc(new Date(version.created_at).toLocaleString('ru-RU'))+'</small>'+
   '<span>'+esc(version.title)+'</span></button>').join('')||'<p class="muted">История пуста.</p>';
  $('history-list').querySelectorAll('[data-revision]').forEach(btn=>btn.onclick=async()=>{
   const versionId=Number(btn.dataset.revision);
   if(!Number.isSafeInteger(versionId))return;
   $('history-restore').disabled=true;
   historyRevisionId=null;
   try{
    const snapshot=check(await client.rpc('read_entry_revision',
      {p_entry_id:historyEntryId,p_revision_id:versionId}));
    if(historyEntryId!==id)return;
    historyRevisionId=versionId;
    $('history-preview').innerHTML='<h3>'+esc(snapshot.title)+'</h3>'+
     '<p>'+esc(snapshot.description||'')+'</p>'+
     '<div class="markdown-body">'+renderMarkdown(snapshot.body||'',entries)+'</div>'+
     '<p class="muted">Теги: '+esc((snapshot.tags||[]).join(', ')||'нет')+'</p>';
    $('history-restore').disabled=false;
   }catch(err){notice('История: '+err.message)}
  });
 }catch(err){notice('История: '+err.message);$('history-list').textContent='Не удалось загрузить историю.'}
}
$('history-close').onclick=()=>$('history-dialog').close();
$('history-dialog').addEventListener('close',()=>{historyEntryId=null;historyRevisionId=null});
$('history-restore').onclick=async()=>{
 if(campaign?.role!=='master'||!historyEntryId||!historyRevisionId)return;
 if(!confirm('Восстановить содержимое выбранной версии? Текущая версия останется в истории.'))return;
 const id=historyEntryId,revisionId=historyRevisionId;
 $('history-restore').disabled=true;
 try{
  check(await client.rpc('restore_entry_revision',{p_entry_id:id,p_revision_id:revisionId}));
  $('history-dialog').close();
  await refresh();
  selected=entries.find(e=>e.id===id)||null;
  tree();await detail();
  notice('Версия восстановлена; текущее состояние сохранено новой записью истории.');
 }catch(err){notice('Восстановление версии: '+err.message)}
 finally{$('history-restore').disabled=false}
};

async function fetchAllCampaignEntries(cid){
 const rows=[];const pageSize=500;
 for(let start=0;start<100000;start+=pageSize){
  const part=check(await client.from('entries')
   .select('id,campaign_id,parent_id,kind,title,description,body,tags,visibility,image_path,updated_at')
   .eq('campaign_id',cid).order('id',{ascending:true}).range(start,start+pageSize-1));
  rows.push(...part);
  if(part.length<pageSize)return rows;
 }
 throw new Error('Слишком много материалов для одного JSON-экспорта');
}
async function exportCampaignJSON(withImages=false){
 if(!account||campaign?.role!=='master')return;
 const currentCampaign={id:campaign.id,name:campaign.name,role:campaign.role};
 const button=withImages?$('export-backup'):$('export-json');
 button.disabled=true;
 try{
  // Ensure the Master role is current rather than trusting cached client state.
  check(await client.rpc('list_campaign_members',{p_campaign_id:currentCampaign.id}));
  const all=await fetchAllCampaignEntries(currentCampaign.id);
  const secrets=[];
  for(let i=0;i<all.length;i+=100){
   const ids=all.slice(i,i+100).map(e=>e.id);
   if(ids.length){
    const part=check(await client.from('entry_secrets')
     .select('entry_id,secret_body').in('entry_id',ids));
    secrets.push(...part);
   }
  }
  check(await client.rpc('list_campaign_members',{p_campaign_id:currentCampaign.id}));
  let json;
  if(withImages){
   const bundle=await buildImageBackup(currentCampaign,all,secrets,async path=>
    check(await client.storage.from('wrecklib-images').download(path)));
   json=JSON.stringify(bundle,null,2);
  }else json=serializeCampaignExport(currentCampaign,all,secrets,new Date().toISOString());
  const url=URL.createObjectURL(new Blob([json],{type:'application/json;charset=utf-8'}));
  const a=document.createElement('a');
  a.href=url;a.download=exportFilename(currentCampaign.name);
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  notice('JSON-экспорт подготовлен. История версий и материалы корзины не включены.');
 }catch(err){notice('Ошибка JSON-экспорта: '+err.message)}
 finally{button.disabled=false}
}
$('export-json').onclick=()=>exportCampaignJSON(false);
$('export-backup').onclick=()=>exportCampaignJSON(true);


// No import writes occur before preview and explicit confirmation.
$('import-choose').onclick=()=>{if(account)$('import-file').click()};
$('import-file').onchange=async event=>{
 importData=null;const file=event.target.files?.[0];event.target.value='';
 if(!file)return;
 try{
  if(file.size>MAX_ARCHIVE_BYTES)throw Error('JSON-архив превышает 36 МБ');
  const data=JSON.parse(await file.text());
  const info=validateImportSnapshot(data);
  importData=data;
  $('import-summary').textContent='Мир: '+info.name+'; записей: '+info.entries+
   '; папок: '+info.folders+'; изображений: '+info.images+
   '. Создаётся новая кампания. Архив без файлов изображений восстановит только тексты.';
  $('import-confirm').disabled=false;
  $('import-dialog').showModal();
 }catch(err){notice('Проверка JSON: '+err.message)}
};
$('import-cancel').onclick=()=>$('import-dialog').close();
$('import-dialog').addEventListener('close',()=>{importData=null});
$('import-confirm').onclick=async()=>{
 if(!account||!importData)return;
 const data=importData;
 $('import-confirm').disabled=true;
 let importedCampaign=null,restoredImages=0;
 try{
  validateImportSnapshot(data);
  const result=check(await client.rpc('import_campaign_snapshot',{p_payload:{
   format:data.format,schema_version:1,campaign:data.campaign,entries:data.entries
  }}));
  importedCampaign=result.campaign_id;
  if(data.image_assets){
   // Fetch all new timestamps in small pages to avoid truncation.
   const fresh=new Map();
   for(let offset=0;offset<data.entries.length;offset+=200){
    const ids=data.entries.slice(offset,offset+200).map(e=>result.id_map[e.id]);
    const subset=check(await client.from('entries').select('id,updated_at').in('id',ids));
    for(const e of subset)fresh.set(e.id,e.updated_at);
   }
   for(const entry of data.entries){
    const oldPath=entry.image_path,asset=data.image_assets[oldPath];
    if(!oldPath||!asset)continue;
    const id=result.id_map[entry.id],expected=fresh.get(id);
    if(!id||!expected)throw Error('Нельзя найти импортированную карточку');
    const path=importedCampaign+'/'+crypto.randomUUID()+'.webp';
    const blob=extractImageBlob(asset);
    check(await client.storage.from('wrecklib-images').upload(path,blob,{
     contentType:'image/webp',upsert:false
    }));
    try{
     const timestamp=check(await client.rpc('attach_entry_image_if_unchanged',{
      p_entry_id:id,p_expected_updated_at:expected,p_image_path:path
     }));
     fresh.set(id,timestamp);restoredImages++;
    }catch(e){
     await client.storage.from('wrecklib-images').remove([path]);throw e;
    }
   }
  }
  $('import-dialog').close();importData=null;
  await home();
  notice('Импортировано '+result.entry_count+' записей, изображений: '+restoredImages+'. Новая кампания создана.');
 }catch(err){
  if(importedCampaign)notice('Новая кампания создана, но восстановление изображений прервалось после '+restoredImages+
   ' файлов. Материалы сохранены, ошибка: '+err.message);
  else notice('Импорт отменён без создания кампании: '+err.message);
 }finally{$('import-confirm').disabled=false}
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
  try{check(await client.rpc('attach_entry_image_if_unchanged',{
   p_entry_id:selected.id,p_expected_updated_at:selected.updated_at,p_image_path:path
  }))}
  catch(e){await client.storage.from('wrecklib-images').remove([path]);throw e}
  await refresh();notice('Изображение загружено');
 }catch(err){notice(err.message)}
}
launch().catch(err=>notice(err.message));
