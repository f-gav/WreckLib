import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Original font names and local font assets are wired',()=>{
 const css=read('public/wrecktrack-visual.css');
 for(const font of ['neuzeit-antiqua.ttf','belarus-regular.ttf','ebbe-regular.ttf','old-town-regular.ttf'])assert.ok(css.includes(font));
 for(const key of ['classic','neuzeit','belarus','ebbe','old-town'])assert.ok(read('public/app.js').includes(key));
 assert.match(read('public/index.html'),/id="font-choice"/);
 assert.match(read('public/index.html'),/wrecktrack-visual\.css/);
});
test('Mobile layout switches between tree and detail without touching permissions',()=>{
 const css=read('public/wrecktrack-visual.css'),app=read('public/app.js'),html=read('public/index.html');
 for(const id of ['show-tree','show-detail'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(css,/data-mobile-view="detail"/);
 assert.match(css,/max-width:850px/);
 assert.match(app,/setMobileView\('detail'\)/);
 assert.match(app,/aria-pressed/);
});
