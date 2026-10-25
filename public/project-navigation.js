// Navigation categories are a presentation layer over the existing WreckLib entry kinds.
// No new database roles or public access paths are introduced.
export const CATEGORIES=Object.freeze({
 players:{title:'Игроки',subtitle:'Персонажи игроков',kind:'person',tag:'игрок'},
 npc:{title:'NPC',subtitle:'Неигровые персонажи',kind:'person',tag:'npc'},
 locations:{title:'Локации',subtitle:'Места, поселения и регионы',kind:'location',tag:null},
 maps:{title:'Карты',subtitle:'Карты местности и помещений',kind:'article',tag:'карта'},
 handouts:{title:'Раздатки',subtitle:'Материалы для игроков',kind:'article',tag:'раздатка'}
});
const PC_TAGS=new Set(['игрок','pc','player','персонаж игрока']);
const MAP_TAGS=new Set(['карта','map','maps']);
const HANDOUT_TAGS=new Set(['раздатка','handout','handouts']);
const labels=entry=>new Set(Array.isArray(entry.tags)?entry.tags.map(t=>String(t).trim().toLocaleLowerCase('ru')):[]);
export function matchesCategory(entry,category){
 if(!entry||entry.kind==='folder')return false;
 const tags=labels(entry);
 switch(category){
  case 'players':return entry.kind==='person'&&[...PC_TAGS].some(t=>tags.has(t));
  case 'npc':return entry.kind==='person'&&![...PC_TAGS].some(t=>tags.has(t));
  case 'locations':return entry.kind==='location';
  case 'maps':return entry.kind==='article'&&[...MAP_TAGS].some(t=>tags.has(t));
  case 'handouts':return entry.kind==='article'&&[...HANDOUT_TAGS].some(t=>tags.has(t));
  default:return false;
 }
}
export function categorize(entries,category){
 return entries.filter(entry=>matchesCategory(entry,category))
  .sort((a,b)=>String(a.title).localeCompare(String(b.title),'ru'));
}
export function creationDefaults(category){
 const config=CATEGORIES[category];
 if(!config)throw new Error('Unknown category');
 return {kind:config.kind,tag:config.tag};
}
