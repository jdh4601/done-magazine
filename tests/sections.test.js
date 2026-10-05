import test from 'node:test';
import assert from 'node:assert/strict';
import {magazineSchema,numberedTitle} from '../server/codex.js';

test('Card schema asks the model for the source section number or null',()=>{
  const card=magazineSchema.properties.cards.items;
  assert.ok(card.required.includes('section_number'));
  assert.deepEqual(card.properties.section_number.type,['integer','null']);
});
test('Numbered sections become "N. " prefixed titles',()=>{
  assert.equal(numberedTitle('이야기 말고 제품부터',1),'1. 이야기 말고 제품부터');
  assert.equal(numberedTitle('내버려 둘 때 자란다',3),'3. 내버려 둘 때 자란다');
});
test('Unnumbered cards keep their title and duplicated numbers are not repeated',()=>{
  assert.equal(numberedTitle('경진대회의 함정',null),'경진대회의 함정');
  assert.equal(numberedTitle('2. 스스로 일을 시키는 힘',2),'2. 스스로 일을 시키는 힘');
  assert.equal(numberedTitle('2) 스스로 일을 시키는 힘',2),'2. 스스로 일을 시키는 힘');
});
