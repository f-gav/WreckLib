import test from 'node:test';
import assert from 'node:assert/strict';
import {escapeHtml,renderInline,renderMarkdown,resolveReference,findBacklinks,searchEntries} from '../public/markdown.js';
const a={id:'11111111-1111-4111-8111-111111111111',title:'Винсент',body:'Локация [[Метро]]',description:'Союзник'};
const b={id:'22222222-2222-4222-8222-222222222222',title:'Метро',body:'Подземелье',description:'Тёмная станция'};
const hidden={id:'33333333-3333-4333-8333-333333333333',title:'Секрет',body:'Закрытый',description:'Невидимо'};
const visible=[a,b];
test('Raw HTML is escaped in Markdown',()=>{
 const html=renderMarkdown('# Имя\n\n<script>alert(1)</script><img src=x onerror=alert(1)>',visible);
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img '));
 assert.ok(html.includes('<h1>Имя</h1>'));
 assert.equal(escapeHtml('"<>&'),'&quot;&lt;&gt;&amp;');
});
test('Format, lists, quote and code fences',()=>{
 const html=renderMarkdown('**Жирный** *курсив* ~~нет~~ \x60код\x60\n\n- один\n- два\n\n> цитата\n\n\x60\x60\x60js\n<script>\n\x60\x60\x60');
 assert.match(html,/<strong>Жирный<\/strong>/);assert.match(html,/<em>курсив<\/em>/);
 assert.match(html,/<li>один<\/li>/);assert.match(html,/<blockquote>цитата<\/blockquote>/);
 assert.match(html,/<pre class="md-code"><code>&lt;script&gt;<\/code><\/pre>/);
});
test('Wiki links can only target already visible articles',()=>{
 const html=renderMarkdown('[[Метро]] [[Секрет]] [[11111111-1111-4111-8111-111111111111|Герой]]',visible);
 assert.match(html,/data-wiki-target="22222222-2222-4222-8222-222222222222"/);
 assert.match(html,/class="wiki-unresolved">\[\[Секрет\]\]<\/span>/);
 assert.match(html,/data-wiki-target="11111111-1111-4111-8111-111111111111"/);
 assert.equal(resolveReference('Секрет',visible),null);
 assert.ok(resolveReference('Секрет',[...visible,hidden]));
});
test('External links permit only HTTP(S)',()=>{
 const html=renderInline('[bad](javascript:alert(1)) [good](https://example.com/x)',visible);
 assert.ok(!html.includes('href="javascript:'));
 assert.match(html,/href="https:\/\/example\.com\/x"/);
 assert.match(html,/rel="noopener noreferrer"/);
});
test('Backlinks and search are limited to RLS-filtered visible records',()=>{
 assert.deepEqual(findBacklinks(b.id,visible).map(x=>x.id),[a.id]);
 assert.deepEqual(searchEntries(visible,'союзник').map(x=>x.entry.id),[a.id]);
 assert.deepEqual(searchEntries(visible,'секрет'),[]);
 assert.deepEqual(searchEntries([hidden,...visible],'секрет').map(x=>x.entry.id),[hidden.id]);
});
test('Duplicate titles require stable UUID references',()=>{
 const clone={...a,id:'44444444-4444-4444-8444-444444444444'};
 assert.equal(resolveReference('Винсент',[a,clone]),null);
 assert.equal(resolveReference(a.id+'|Знакомый',[a,clone]).label,'Знакомый');
});
