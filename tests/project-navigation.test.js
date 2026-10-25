import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CATEGORIES,categorize,matchesCategory,creationDefaults} from '../public/project-navigation.js';
const person=(id,title,tags=[])=>({id,title,kind:'person',tags});
const entries=[
 person('1','Анна',['Игрок']),person('2','Винсент',[]),
 {id:'3',title:'Лес',kind:'location',tags:[]},
 {id:'4',title:'План метро',kind:'article',tags:['карта']},
 {id:'5',title:'Записка',kind:'article',tags:['раздатка']},
 {id:'6',title:'Папка',kind:'folder',tags:['карта']},
 {id:'7',title:'Тайна',kind:'article',tags:[]},
];
test('Sections classify existing entry kinds without changing schema',()=>{
 assert.deepEqual(categorize(entries,'players').map(x=>x.id),['1']);
 assert.deepEqual(categorize(entries,'npc').map(x=>x.id),['2']);
 assert.deepEqual(categorize(entries,'locations').map(x=>x.id),['3']);
 assert.deepEqual(categorize(entries,'maps').map(x=>x.id),['4']);
 assert.deepEqual(categorize(entries,'handouts').map(x=>x.id),['5']);
 assert.equal(matchesCategory(entries[5],'maps'),false);
});
test('Legacy persons appear in NPC, while PCs are opt-in tagged',()=>{
 assert.equal(matchesCategory(person('8','Герой',['pc']),'players'),true);
 assert.equal(matchesCategory(person('9','Герой',['player']),'npc'),false);
 assert.equal(matchesCategory(person('10','Селянин'), 'npc'),true);
 assert.equal(creationDefaults('maps').tag,'карта');
 assert.equal(creationDefaults('handouts').kind,'article');
 assert.equal(Object.keys(CATEGORIES).length,5);
});
test('Classifying never reads secrets or other users and does not mutate entries',()=>{
 const original=structuredClone(entries);
 categorize(entries,'npc');
 assert.deepEqual(entries,original);
});
