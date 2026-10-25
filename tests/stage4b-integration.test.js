import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Stage 4B UI controls and readable/writable tags',()=>{
 const a=read('public/app.js'),h=read('public/index.html');
 for(const id of ['tag-filter','entry-tags','entry-search','markdown-source'])
  assert.match(h,new RegExp('id="'+id+'"'));
 assert.match(a,/parseTags\(f\.elements\.tags\.value\)/);
 assert.match(a,/select\('id,campaign_id,parent_id,kind,title,description,body,tags,visibility/);
 assert.match(a,/filterByTag\(entries,tag\)/);
 assert.match(a,/collectVisibleTags\(entries\)/);
 assert.match(a,/data-tag=/);
 assert.match(a,/populateTagFilter\(\);renderSearch\(\)/);
});
test('Markdown authoring buttons for tables and nesting exist',()=>{
 const a=read('public/app.js'),h=read('public/index.html');
 assert.match(h,/data-md="table"/);
 assert.match(h,/data-md="nested-list"/);
 assert.match(a,/case 'table':insertMarkdown/);
 assert.match(a,/case 'nested-list':insertMarkdown/);
});
test('Guest projection has only published entry tags and previous hidden guards',()=>{
 const sql=read('supabase/013_entry_tags.sql');
 assert.match(sql,/'tags',e\.tags/);
 assert.match(sql,/private\.shared_entry_visible\(e\.id,c\.id\)/);
 assert.doesNotMatch(sql,/entry_secrets|secret_body|owner_id/);
});
