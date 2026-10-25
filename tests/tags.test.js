import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTags,collectVisibleTags,filterByTag} from '../public/tags.js';
const entries=[
 {id:'1',tags:['метро','пф2']},
 {id:'2',tags:['город','Метро']},
 {id:'3',tags:['секрет']}
];
test('Tags are normalized, deduplicated and limited',()=>{
 assert.deepEqual(parseTags('  Метро, город; МЕТРО \n pf2  '),['метро','город','pf2']);
 assert.throws(()=>parseTags('a'.repeat(41)),/40/);
 assert.throws(()=>parseTags(Array.from({length:17},(_,i)=>'тег'+i).join(',')),/16/);
 assert.throws(()=>parseTags('<script>'),/символы/);
 assert.deepEqual(parseTags(' '),[]);
});
test('Filtering is exact, Unicode normalized and uses only visible entries',()=>{
 assert.deepEqual(filterByTag(entries.slice(0,2),'МЕТРО').map(x=>x.id),['1','2']);
 assert.deepEqual(filterByTag(entries.slice(0,2),'секрет'),[]);
 assert.deepEqual(collectVisibleTags(entries.slice(0,2)),['город','метро','пф2']);
 assert.deepEqual(filterByTag(entries.slice(0,2),'мет'),[]);
});
test('Tags with user-provided HTML are blocked, not executable',()=>{
 assert.throws(()=>parseTags('вау,<img src=x>'),/символы/);
});
