import test from 'node:test';
import assert from 'node:assert/strict';
import {validateImportSnapshot,buildImageBackup,extractImageBlob} from '../public/import.js';
const cid='11111111-1111-4111-8111-111111111111',eid='22222222-2222-4222-8222-222222222222',folder='33333333-3333-4333-8333-333333333333',path=cid+'/'+eid+'.webp';
const entry={id:eid,campaign_id:cid,parent_id:folder,kind:'article',title:'WreckLib',body:'',description:'',tags:[],visibility:'published',secret_body:'',image_path:path};
const archive=()=>({format:'WreckLib',schema_version:1,campaign:{id:cid,name:'A'},entries:[{...entry},{...entry,id:folder,kind:'folder',parent_id:null,image_path:null}]});
test('Validates correct roundtrip and safely counts folders',()=>{assert.deepEqual(validateImportSnapshot(archive()).entries,2)});
test('Rejects cycles, duplicate IDs, foreign parents and secret payload size',()=>{
 let d=archive();d.entries[1].parent_id=eid;assert.throws(()=>validateImportSnapshot(d),/Зацикленная/);
 d=archive();d.entries[1].id=eid;assert.throws(()=>validateImportSnapshot(d),/повторный/);
 d=archive();d.entries[0].parent_id='44444444-4444-4444-8444-444444444444';assert.throws(()=>validateImportSnapshot(d),/родительской/);
 d=archive();d.entries[0].secret_body='x'.repeat(100001);assert.throws(()=>validateImportSnapshot(d),/недопустимые/);
});
test('No executable file content and image WebP magic must match',async()=>{
 const bytes=new Uint8Array([82,73,70,70,12,0,0,0,87,69,66,80,0,0,0,0]);
 const blob=new Blob([bytes],{type:'image/webp'});
 const a=await buildImageBackup({id:cid,name:'A',role:'master'},[entry,{...entry,id:folder,parent_id:null,kind:'folder',image_path:null}],[],async()=>blob);
 assert.equal(validateImportSnapshot(a).images,1);
 assert.equal((await extractImageBlob(a.image_assets[path]).arrayBuffer()).byteLength,16);
 await assert.rejects(buildImageBackup({id:cid,name:'A',role:'master'},[entry],[],async()=>new Blob(['not-webp'])),/изображение/);
});
test('Rejects unsupported archive and masquerading paths',()=>{
 const d=archive();d.schema_version=99;assert.throws(()=>validateImportSnapshot(d),/версии 1/);
 const e=archive();e.image_assets={'https://malicious.example/a.webp':{encoding:'base64',mime:'image/webp',size_bytes:12,data:'AA=='}};assert.throws(()=>validateImportSnapshot(e),/Неверный/);
});
