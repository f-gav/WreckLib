import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('WreckLib has persistent campaign chooser and requested sidebar categories',()=>{
 const html=read('public/index.html');
 for(const id of ['workspace-nav','workspace-campaign','appearance-dialog','appearance-open',
   'account-avatar','account-toggle','catalog','catalog-cards','catalog-create','catalog-search']){
  assert.match(html,new RegExp('id="'+id+'"'),id);
 }
 for(const section of ['campaigns','players','npc','locations','maps','handouts','materials']){
  assert.ok(html.includes('data-workspace-section="'+section+'"'),section);
 }
 assert.match(html,/<option value="all">Все кампании<\/option>/);
});
test('Theme/font selections exist only inside settings dialog, not top bar',()=>{
 const html=read('public/index.html');
 const topbar=html.split('</header>')[0];
 const settings=html.split('<dialog id="appearance-dialog"')[1].split('</dialog>')[0];
 assert.doesNotMatch(topbar,/id="accent-choice"|id="font-choice"/);
 assert.match(settings,/id="accent-choice"/);
 assert.match(settings,/id="font-choice"/);
 assert.match(topbar,/id="account-avatar"/);
 assert.match(topbar,/class="topbar-settings-button"/);
});
test('Catalog reads RLS-filtered entry records, preserves guest share and existing editing',()=>{
 const app=read('public/app.js');
 assert.match(app,/from\('entries'\)[\s\S]*?\.in\('campaign_id',ids\)/);
 assert.match(app,/campaign\?\.role==='guest'/);
 assert.match(app,/readGuestImage\(record\.id\)/);
 assert.match(app,/client\.storage\.from\('wrecklib-images'\)\.download\(record\.image_path\)/);
 assert.match(app,/navigateSection\(btn\.dataset\.workspaceSection\)/);
 assert.match(app,/creationDefaults\(category\)/);
 assert.match(app,/update_entry_if_unchanged/);
 assert.match(app,/import_campaign_snapshot/);
});
test('Responsive sidebar and cards use WreckTrack accent/font tokens',()=>{
 const css=read('public/workspace.css');
 assert.match(css,/--display-font/);assert.match(css,/--gold/);
 assert.match(css,/@media\(max-width:850px\)/);
 assert.match(css,/@media\(max-width:550px\)/);
 assert.match(css,/\.entity-cards/);
 assert.match(css,/\.profile-menu/);
 assert.match(read('public/index.html'),/href="\.\/wrecktrack-visual\.css"/);
});
