// RLS-aware tag tools. Input always comes from visible entries or an authorized editor.
export const MAX_TAGS=16;
export const MAX_TAG_LENGTH=40;
export function normalizedTag(value){
 return String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
}
export function parseTags(value){
 const raw=String(value??'').split(/[,;\n]/);
 const unique=new Set();
 for(const tag of raw){
  const cleaned=normalizedTag(tag);
  if(!cleaned)continue;
  if(cleaned.length>MAX_TAG_LENGTH)throw new Error('Тег слишком длинный (до 40 символов)');
  if(/[<>]/.test(cleaned)||/[\u0000-\u001F]/.test(cleaned))throw new Error('Недопустимые символы в теге');
  unique.add(cleaned);
  if(unique.size>MAX_TAGS)throw new Error('Можно указать не более 16 тегов');
 }
 const tags=[...unique];
 if(new TextEncoder().encode(tags.join(',')).length>640)throw new Error('Теги превышают допустимый размер');
 return tags;
}
export function collectVisibleTags(entries=[]){
 const visible=new Set();
 for(const entry of entries){
  for(const tag of Array.isArray(entry.tags)?entry.tags:[]){
   if(typeof tag==='string'&&tag.trim())visible.add(normalizedTag(tag));
  }
 }
 return [...visible].sort((a,b)=>a.localeCompare(b,'ru'));
}
export function filterByTag(entries=[],tag=''){
 const needle=normalizedTag(tag);
 if(!needle)return entries.slice();
 return entries.filter(entry=>Array.isArray(entry.tags)&&entry.tags.some(t=>normalizedTag(t)===needle));
}
