import test from 'node:test';
import assert from 'node:assert/strict';
import {deletePage} from '../shared/pages.js';

const cards=['a','b','c'].map(id=>({id,title:id,body:''}));
test('Deleting a body page removes only that card and keeps the order',()=>{
  const result=deletePage(cards,'b');
  assert.deepEqual(result.cards.map(c=>c.id),['a','c']);
  assert.equal(cards.length,3);
});
test('Selection moves to the page that takes the deleted slot, or the previous one at the end',()=>{
  assert.equal(deletePage(cards,'a').selected,1);
  assert.equal(deletePage(cards,'b').selected,2);
  assert.equal(deletePage(cards,'c').selected,2);
});
test('The last remaining body page and unknown ids cannot be deleted',()=>{
  assert.equal(deletePage([cards[0]],'a'),null);
  assert.equal(deletePage(cards,'missing'),null);
});
