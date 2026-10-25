import {createRemoteJWKSet,jwtVerify} from 'jose';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const error=(message,status=400)=>response({error:message},status);
const id=()=>crypto.randomUUID();
const kinds=new Set(['folder','person','location','item','faction','event','article']);
const roles=new Set(['master','editor','viewer']);
const canEdit=r=>r==='master'||r==='editor';
async function auth(req,env){
 const token=req.headers.get('Cf-Access-Jwt-Assertion');
 const host=(env.ACCESS_TEAM_DOMAIN||'').replace(/^https?:\/\//,'').replace(/\/$/,'');
 if(!token||!env.ACCESS_AUD||!/^[a-z0-9.-]+\.cloudflareaccess\.com$/.test(host))throw Error('Cloudflare Access не настроен');
 const {payload}=await jwtVerify(token,createRemoteJWKSet(new URL('https://'+host+'/cdn-cgi/access/certs')),{issuer:'https://'+host,audience:env.ACCESS_AUD});
 if(!payload.sub||!payload.email)throw Error('Отсутствует идентификатор пользователя');
 const user={id:String(payload.sub),email:String(payload.email).toLowerCase()};
 await env.DB.prepare('INSERT INTO users(id,email) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email').bind(user.id,user.email).run();
 return user;
}
async function getEntry(env,eid){return env.DB.prepare('SELECT * FROM entries WHERE id=?').bind(eid).first()}
async function visible(env,e,role){
 if(role==='master')return true;
 let current=e;const seen=new Set();
 while(current){if(current.visibility!=='published'||seen.has(current.id))return false;seen.add(current.id);if(!current.parent_id)return true;current=await getEntry(env,current.parent_id);if(!current||current.campaign_id!==e.campaign_id)return false}
 return true;
}
function projection(e,role){const {secret_body,...rest}=e;return role==='master'?{...rest,secret_body}:rest}
async function body(req){return req.json().catch(()=>null)}
async function handle(req,env){
 const p=new URL(req.url).pathname.split('/').filter(Boolean),method=req.method;
 if(p[0]!=='api')return env.ASSETS.fetch(req);
 let me;try{me=await auth(req,env)}catch(e){return error(e.message,401)}
 if(p[1]==='me'&&method==='GET')return response(me);
 if(p[1]==='campaigns'&&p.length===2){
  if(method==='GET'){const rows=await env.DB.prepare('SELECT c.*,m.role FROM campaigns c JOIN memberships m ON c.id=m.campaign_id WHERE m.user_id=? ORDER BY c.created_at DESC').bind(me.id).all();return response(rows.results)}
  if(method==='POST'){const b=await body(req);if(typeof b?.name!=='string'||!b.name.trim()||b.name.length>100)return error('Название кампании обязательно');const cid=id();await env.DB.batch([env.DB.prepare('INSERT INTO campaigns(id,name,description,created_by) VALUES(?,?,?,?)').bind(cid,b.name.trim(),String(b.description||''),me.id),env.DB.prepare('INSERT INTO memberships(campaign_id,user_id,role) VALUES(?,?,?)').bind(cid,me.id,'master')]);return response({id:cid},201)}
 }
 if(p[1]==='invitations'&&p[2]==='accept'&&method==='POST'){
  const invite=await env.DB.prepare('SELECT * FROM invitations WHERE id=? AND email=?').bind(p[3],me.email).first();
  if(!invite)return error('Приглашение недействительно',404);
  await env.DB.batch([env.DB.prepare('INSERT INTO memberships(campaign_id,user_id,role) VALUES(?,?,?) ON CONFLICT(campaign_id,user_id) DO UPDATE SET role=excluded.role').bind(invite.campaign_id,me.id,invite.role),env.DB.prepare('DELETE FROM invitations WHERE id=?').bind(invite.id)]);
  return response({campaign_id:invite.campaign_id});
 }
 if(p[1]!=='campaigns'||!p[2])return error('Маршрут не найден',404);
 const cid=p[2],membership=await env.DB.prepare('SELECT role FROM memberships WHERE campaign_id=? AND user_id=?').bind(cid,me.id).first();
 if(!membership)return error('Нет доступа к кампании',403);
 const role=membership.role;
 if(p[3]==='invitations'&&method==='POST'&&role==='master'){
  const b=await body(req);const email=String(b?.email||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!roles.has(b.role))return error('Некорректное приглашение');
  const token=id();await env.DB.prepare('INSERT INTO invitations(id,campaign_id,email,role,created_by) VALUES(?,?,?,?,?) ON CONFLICT(campaign_id,email) DO UPDATE SET id=excluded.id,role=excluded.role').bind(token,cid,email,b.role,me.id).run();return response({token},201);
 }
 if(p[3]==='entries'&&p.length===4){
  if(method==='GET'){const rows=await env.DB.prepare('SELECT * FROM entries WHERE campaign_id=? ORDER BY created_at').bind(cid).all();const result=[];for(const e of rows.results)if(await visible(env,e,role))result.push(projection(e,role));return response(result)}
  if(method==='POST'&&canEdit(role)){
   const b=await body(req);if(!kinds.has(b?.kind)||typeof b.title!=='string'||!b.title.trim()||b.title.length>140)return error('Некорректная карточка');
   if(role!=='master'&&(b.visibility==='master'||b.secret_body))return error('Секреты доступны только Мастеру',403);
   if(b.parent_id){const parent=await getEntry(env,b.parent_id);if(!parent||parent.campaign_id!==cid||parent.kind!=='folder'||!(await visible(env,parent,role)))return error('Недоступная папка',400)}
   const eid=id();await env.DB.prepare('INSERT INTO entries(id,campaign_id,parent_id,kind,title,description,body,secret_body,visibility,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(eid,cid,b.parent_id||null,b.kind,b.title.trim(),String(b.description||'').slice(0,2000),String(b.body||'').slice(0,100000),role==='master'?String(b.secret_body||'').slice(0,100000):'',role==='master'&&b.visibility==='master'?'master':'published',me.id,me.id).run();return response({id:eid},201);
  }
 }
 if(p[3]==='entries'&&p[4]){
  const e=await getEntry(env,p[4]);if(!e||e.campaign_id!==cid||!(await visible(env,e,role)))return error('Карточка не найдена',404);
  if(p.length===5&&method==='GET')return response(projection(e,role));
  if(p.length===5&&method==='PATCH'&&canEdit(role)){
   const b=await body(req);if(!b||typeof b!=='object')return error('Некорректные данные');
   if(role!=='master'&&('visibility' in b||'secret_body' in b))return error('Недостаточно прав',403);
   const title=b.title??e.title,description=b.description??e.description,text=b.body??e.body,secret=role==='master'?(b.secret_body??e.secret_body):e.secret_body,visibility=role==='master'?(b.visibility??e.visibility):e.visibility;
   if(typeof title!=='string'||!title.trim()||title.length>140||![description,text,secret].every(v=>typeof v==='string')||!['published','master'].includes(visibility))return error('Некорректные поля');
   await env.DB.batch([env.DB.prepare('INSERT INTO revisions(id,entry_id,snapshot,edited_by) VALUES(?,?,?,?)').bind(id(),e.id,JSON.stringify(e),me.id),env.DB.prepare('UPDATE entries SET title=?,description=?,body=?,secret_body=?,visibility=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(title.trim(),description.slice(0,2000),text.slice(0,100000),secret.slice(0,100000),visibility,me.id,e.id)]);
   return response({ok:true});
  }
  if(p[5]==='image'&&method==='POST'&&canEdit(role)){
   const file=await req.blob();if(!file.size||file.size>3000000||file.type!=='image/webp')return error('Допустим оптимизированный WebP до 3 МБ');
   const bytes=new Uint8Array(await file.arrayBuffer());if(String.fromCharCode(...bytes.slice(0,4))!=='RIFF'||String.fromCharCode(...bytes.slice(8,12))!=='WEBP')return error('Неверный WebP');
   const key=cid+'/'+e.id+'/'+id()+'.webp';await env.IMAGES.put(key,bytes,{httpMetadata:{contentType:'image/webp'}});
   await env.DB.prepare('UPDATE entries SET image_key=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(key,e.id).run();if(e.image_key)await env.IMAGES.delete(e.image_key);return response({ok:true});
  }
  if(p[5]==='image'&&method==='GET'){if(!e.image_key)return error('Нет изображения',404);const file=await env.IMAGES.get(e.image_key);if(!file)return error('Не найдено',404);return new Response(file.body,{headers:{'content-type':'image/webp','cache-control':'private, max-age=300','x-content-type-options':'nosniff'}})}
 }
 return error('Действие недоступно',404);
}
export default {async fetch(req,env){try{return await handle(req,env)}catch(e){console.error(e);return error('Внутренняя ошибка',500)}}};
