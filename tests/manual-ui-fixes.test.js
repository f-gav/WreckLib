import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
test('Entry creation uses local UUID without RLS-rejected INSERT RETURNING',()=>{
 const app=read('public/app.js');
 assert.match(app,/id=crypto\.randomUUID\(\)/);
 assert.match(app,/check\(await base\(\)\.insert\(entry\)\)/);
 assert.doesNotMatch(app,/base\(\)\.insert\(entry\)\.select\('id'\)/);
 assert.match(app,/client\.rpc\('update_entry_if_unchanged'/);
 const regression=read('tests/entry-create-rls-smoke.sql');
 assert.match(regression,/returning id into got_id/);
 assert.match(regression,/insert into public\.entries/);
 assert.match(regression,/exception when insufficient_privilege/);
 assert.match(regression,/rollback;/);
});
test('Selected campaign name, not generic label, appears in catalog eyebrow',()=>{
 const app=read('public/app.js');
 assert.match(app,/const chosen=campaigns\.find\(c=>c\.id===navCampaignId\)/);
 assert.match(app,/chosen\?\.name\|\|/);
 assert.match(app,/ВСЕ КАМПАНИИ/);
 const html=read('public/index.html');
 assert.match(html,/id="catalog-eyebrow"/);
});
test('All three selects keep their original data sources and dark widget wiring',()=>{
 const app=read('public/app.js');
 for(const pair of ["$('accent-choice'),{type:'accent'}","$('font-choice'),{type:'font'}","$('workspace-campaign'),{type:'campaign'}"])
  assert.ok(app.includes(pair),pair);
 assert.match(app,/campaignControl\.refresh\(\)/);
 assert.match(app,/localStorage\.setItem\('wrecklib-accent'/);
 assert.match(app,/localStorage\.setItem\('wrecklib-font'/);
});
