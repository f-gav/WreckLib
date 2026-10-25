import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('Editor, live preview and authorized search are connected',()=>{
 const html=read('public/index.html'),app=read('public/app.js');
 for(const id of ['entry-search','search-results','markdown-source','markdown-preview-content','wiki-picker'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(app,/renderMarkdown\(e\.body,entries\)/);
 assert.match(app,/searchEntries\(entries,query,40\)/);
 assert.match(app,/findBacklinks\(e\.id,entries\)/);
 assert.match(app,/const found=entries\.find\(e=>e\.id===id\)/);
 assert.match(app,/navigateToVisibleEntry/);
 assert.doesNotMatch(app,/from\('entries'\)\.select\([^)]*\)\.eq\('id'/);
});
test('Markdown source is served locally and WreckTrack controls stay',()=>{
 const app=read('public/app.js'),html=read('public/index.html'),css=read('public/wrecktrack-visual.css');
 assert.match(app,/from '\.\/markdown\.js'/);
 assert.match(css,/\.markdown-body/);
 for(const id of ['accent-choice','font-choice','show-tree','show-detail','trash-panel','members-list'])assert.ok(html.includes('id="'+id+'"'));
});
