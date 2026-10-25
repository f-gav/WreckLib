import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
test('All select popups use one dark dropdown module and retain native state',()=>{
 const source=read('public/wreck-select.js');
 assert.match(source,/export function enhanceSelect/);
 assert.match(source,/select\.dispatchEvent\(new Event\('change'/);
 assert.match(source,/select\.value=option\.value/);
 assert.match(source,/title\.textContent=option\.textContent/);
 assert.match(source,/menu\.setAttribute\('role','listbox'\)/);
 assert.match(source,/setAttribute\('aria-selected'/);
 assert.match(source,/document\.addEventListener\('scroll'/);
 assert.match(source,/menu\.style\.maxHeight=/);
 assert.doesNotMatch(source,/eval\(|innerHTML/);
});
test('Styles give options dark popup and checked accent markers',()=>{
 const css=read('public/workspace.css');
 for(const selector of ['.wreck-select-trigger','.wreck-select-menu','.wreck-select-option','.wreck-select-swatch','.wreck-select-mark'])
  assert.ok(css.includes(selector),selector);
 assert.match(css,/color-scheme:dark/);
 assert.match(css,/var\(--gold\)/);
});
