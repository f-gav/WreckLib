// Stable, narrowly-scoped JSON export. Only an authenticated campaign Master
// can initiate this feature; Supabase RLS governs all fetched rows.
export function buildCampaignExport(campaign,entryRows,secretRows=[],exportedAt=new Date().toISOString()){
 if(campaign?.role!=='master')throw new Error('Экспорт доступен только Мастеру');
 if(!campaign?.id||!Array.isArray(entryRows)||!Array.isArray(secretRows))throw new Error('Некорректный экспорт');
 const secrets=new Map(secretRows.map(row=>[row.entry_id,row.secret_body]));
 const entries=entryRows
  .filter(row=>row.campaign_id===campaign.id)
  .map(row=>({
   id:row.id,
   parent_id:row.parent_id??null,
   kind:row.kind,
   title:row.title,
   description:row.description??'',
   body:row.body??'',
   tags:Array.isArray(row.tags)?row.tags:[],
   visibility:row.visibility,
   image_path:row.image_path??null,
   secret_body:secrets.get(row.id)??'',
   updated_at:row.updated_at??null
  }))
  .sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 return {
  format:'WreckLib',
  schema_version:1,
  exported_at:exportedAt,
  campaign:{id:campaign.id,name:campaign.name},
  includes:{active_entries:true,master_notes:true,private_image_files:false,deleted_entries:false,revision_history:false},
  entries
 };
}
export function serializeCampaignExport(campaign,entries,secrets,exportedAt){
 return JSON.stringify(buildCampaignExport(campaign,entries,secrets,exportedAt),null,2);
}
export function exportFilename(name){
 const safe=String(name??'кампания').normalize('NFKC')
  .replace(/[\\/:*?"<>|\u0000-\u001F]+/g,'_')
  .trim().replace(/\s+/g,'-').slice(0,64);
 return 'WreckLib-'+(safe||'кампания')+'.json';
}
