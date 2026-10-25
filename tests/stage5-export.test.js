import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCampaignExport,exportFilename,serializeCampaignExport} from '../public/export.js';
const master={id:'a',name:'Мир',role:'master'};
const entries=[
 {id:'b',campaign_id:'a',parent_id:'a-folder',kind:'article',title:'Тайна',description:'',body:'## Secret',tags:['сюжет'],visibility:'master',image_path:'a/p.webp',updated_at:'2026-01-01'},
 {id:'a-folder',campaign_id:'a',parent_id:null,kind:'folder',title:'Корень',body:'',tags:[],visibility:'published'},
 {id:'else',campaign_id:'other',title:'Never export',body:'not visible'}
];
test('Only masters may export; no JWT or share links leak',()=>{
 assert.throws(()=>buildCampaignExport({...master,role:'viewer'},entries),/Мастеру/);
 assert.throws(()=>buildCampaignExport({...master,role:'editor'},entries),/Мастеру/);
 const output=serializeCampaignExport(master,entries,[{entry_id:'b',secret_body:'GM only'}],'2026-10-25T00:00:00Z');
 const obj=JSON.parse(output);
 assert.equal(obj.entries.length,2);
 assert.equal(obj.entries[1].secret_body,'GM only');
 assert.equal(obj.entries[1].parent_id,'a-folder');
 assert.equal(obj.entries[1].body,'## Secret');
 assert.equal(obj.includes.private_image_files,false);
 assert.equal(obj.includes.revision_history,false);
 assert.doesNotMatch(output,/Never export|service_role|access_token|share_token/);
});
test('Export is deterministic, bounded to campaign, and names are sanitized',()=>{
 assert.deepEqual(buildCampaignExport(master,entries,[], '2026-01-01').entries.map(x=>x.id),['a-folder','b']);
 assert.equal(exportFilename('Акт / 1: Зал'), 'WreckLib-Акт-_-1_-Зал.json');
 assert.ok(!exportFilename('../../bad').includes('/'));
});
