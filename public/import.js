// Offline backup/import helpers. Never interpret JSON as executable HTML.
import {buildCampaignExport} from './export.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS=new Set(['folder','article','person','location','item','faction','event']);
const VIS=new Set(['master','published']);
export const MAX_ARCHIVE_BYTES=36*1024*1024;
export const MAX_IMAGE_BYTES=3*1024*1024;
const hasOwn=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export function validateImportSnapshot(data){
 const failures=[];
 if(!data||typeof data!=='object'||Array.isArray(data)||data.format!=='WreckLib'||data.schema_version!==1)
  throw new Error('Поддерживаются только JSON-архивы WreckLib версии 1');
 if(!Array.isArray(data.entries)||data.entries.length>250)throw new Error('Лимит импорта — 250 записей');
 const ids=new Map(),parents=new Map();
 for(const [i,e] of data.entries.entries()){
  if(!e||typeof e!=='object'||Array.isArray(e)||!UUID.test(e.id||'')||ids.has(e.id))
   {failures.push('Строка '+(i+1)+': неверный или повторный ID');continue}
  ids.set(e.id,e);
  if(!KINDS.has(e.kind)||!VIS.has(e.visibility)||typeof e.title!=='string'||e.title.length<1||e.title.length>140
     ||typeof e.body!=='string'||e.body.length>200000
     ||typeof e.description!=='string'||e.description.length>10000
     ||typeof e.secret_body!=='string'||e.secret_body.length>100000
     ||!Array.isArray(e.tags)||e.tags.length>16||
       e.tags.some(t=>typeof t!=='string')||
       new TextEncoder().encode(e.tags.join(',')).length>640)
    failures.push('Строка '+(i+1)+': недопустимые поля');
  if(e.parent_id!==null && e.parent_id!==undefined && !UUID.test(e.parent_id||''))
    failures.push('Строка '+(i+1)+': неверная родительская папка');
  parents.set(e.id,e.parent_id||null);
 }
 for(const [id,parent] of parents){
  if(parent&&(!ids.has(parent)||ids.get(parent)?.kind!=='folder'))
   failures.push('Нет родительской папки для '+id);
  const visited=new Set([id]);let cur=parent,steps=0;
  while(cur){
   if(visited.has(cur)||++steps>64){failures.push('Зацикленная структура папок: '+id);break}
   visited.add(cur);cur=parents.get(cur)||null;
  }
 }
 const assets=data.image_assets;
 let imageCount=0,totalSize=0;
 if(assets!==undefined){
  if(!assets||typeof assets!=='object'||Array.isArray(assets))failures.push('Повреждён список изображений');
  else for(const [path,img] of Object.entries(assets)){
   if(!img||img.encoding!=='base64'||img.mime!=='image/webp'||
      typeof img.data!=='string'||img.data.length>MAX_IMAGE_BYTES*1.4+10||
      !Number.isInteger(img.size_bytes)||img.size_bytes<12||img.size_bytes>MAX_IMAGE_BYTES||
      !UUID.test(path.split('/')[0]||'')||!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/i.test(path)||
      !data.entries.some(e=>e.image_path===path))failures.push('Неверный файл изображения '+path);
   else{
    // Decode and check the real WebP header BEFORE creating a campaign.
    try{extractImageBlob(img)}catch{failures.push('Повреждённый WebP: '+path)}
    imageCount++;totalSize+=img.size_bytes;
   }
  }
 }
 if(failures.length)throw new Error('Проверка не пройдена: '+failures.slice(0,6).join('; '));
 const sqlDocument={format:data.format,schema_version:data.schema_version,campaign:data.campaign,entries:data.entries};
 if(new TextEncoder().encode(JSON.stringify(sqlDocument)).length>3000000)
  throw new Error('Текстовая часть архива превышает предел импорта 3 МБ');
 if(new TextEncoder().encode(JSON.stringify(data)).length>MAX_ARCHIVE_BYTES)
  throw new Error('Размер резервной копии превышает 36 МБ');
 if(data.campaign?.name===undefined||typeof data.campaign.name!=='string'||data.campaign.name.length>100)
  throw new Error('Некорректное название кампании');
 return {name:data.campaign.name,entries:data.entries.length,folders:data.entries.filter(e=>e.kind==='folder').length,images:imageCount,imageBytes:totalSize,hasImages:!!assets};
}
function uintToBase64(bytes){
 let str='';
 for(let i=0;i<bytes.length;i+=32768)str+=String.fromCharCode(...bytes.subarray(i,i+32768));
 return btoa(str);
}
function base64ToBytes(encoded){
 if(!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)||encoded.length%4!==0)throw Error('Неверная кодировка изображения');
 const bin=atob(encoded),bytes=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
 return bytes;
}
function verifyWebp(bytes){
 const name=b=>String.fromCharCode(...bytes.subarray(b,b+4));
 if(bytes.length<12||name(0)!=='RIFF'||name(8)!=='WEBP')throw Error('Архив содержит не-WebP изображение');
}
export async function buildImageBackup(campaign,entries,secrets,download){
 const archive=buildCampaignExport(campaign,entries,secrets);
 archive.image_assets={};
 const paths=[...new Set(archive.entries.map(e=>e.image_path).filter(Boolean))];
 let total=0;
 for(const path of paths){
  const blob=await download(path);
  if(!blob||blob.size<12||blob.size>MAX_IMAGE_BYTES)throw Error('Нельзя сохранить изображение: '+path);
  const bytes=new Uint8Array(await blob.arrayBuffer());
  verifyWebp(bytes);total+=bytes.length;
  if(total>24*1024*1024)throw Error('Лимит резервной копии изображений — 24 МБ');
  archive.image_assets[path]={encoding:'base64',mime:'image/webp',size_bytes:bytes.length,data:uintToBase64(bytes)};
 }
 validateImportSnapshot(archive);
 return archive;
}
export function extractImageBlob(asset){
 const bytes=base64ToBytes(asset.data);
 if(bytes.length!==asset.size_bytes||bytes.length>MAX_IMAGE_BYTES)throw Error('Неверная длина изображения');
 verifyWebp(bytes);
 return new Blob([bytes],{type:'image/webp'});
}
