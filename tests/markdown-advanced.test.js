import test from 'node:test';
import assert from 'node:assert/strict';
import {renderMarkdown} from '../public/markdown.js';
test('Table headings, alignment, escaped content and empty cells',()=>{
 const source='| Имя | Значение | Обсуждение |\n|:---|---:|:---:|\n| Винсент | **12** | [[Секрет]] |\n| | <img src=x onerror=alert(1)> | текст |';
 const html=renderMarkdown(source,[]);
 assert.match(html,/<table>/);assert.match(html,/<th style="text-align:left">Имя<\/th>/);
 assert.match(html,/<th style="text-align:right">Значение<\/th>/);
 assert.match(html,/<th style="text-align:center">Обсуждение<\/th>/);
 assert.match(html,/<strong>12<\/strong>/);assert.ok(!html.includes('<img '));
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(html,/wiki-unresolved/);
});
test('Ordinary pipe paragraph is not mistaken for a table',()=>{
 const html=renderMarkdown('Условие: a | b\n\nПродолжение.');
 assert.ok(!html.includes('<table>'));
 assert.match(html,/<p>Условие: a \| b<\/p>/);
});
test('Nested unordered list, ordered inside unordered, sibling items',()=>{
 const markdown='- Глава\n  - Этаж 1\n    1. Комната\n    2. Коридор\n  - Этаж 2\n- Примечание';
 const html=renderMarkdown(markdown);
 assert.match(html,/<ul><li>Глава<ul>/);
 assert.match(html,/<ol><li>Комната<\/li><li>Коридор<\/li><\/ol>/);
 assert.match(html,/<li>Примечание<\/li><\/ul>$/);
});
test('Nested markup cannot inject HTML',()=>{
 const html=renderMarkdown('- item\n  - <svg onload=alert(1)>\n\n| x | y |\n|---|---|\n| <script> | **ok** |');
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<svg '));
 assert.match(html,/<strong>ok<\/strong>/);
});
test('Indented continuation and mixed list segments terminate',()=>{
 const html=renderMarkdown('1. Первый\n   продолжение\n2. Второй\n\n* следующий');
 assert.match(html,/<ol><li>Первый<br>продолжение<\/li><li>Второй<\/li><\/ol>/);
 assert.match(html,/<ul><li>следующий<\/li><\/ul>/);
});
