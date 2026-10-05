import test from 'node:test';
import assert from 'node:assert/strict';
import {magazineSchema,executeWithEvidence} from '../server/codex.js';
const source=[{id:1,text:'원문 사례',start:0}];
const draft=count=>({cards:Array.from({length:count},(_,i)=>({title:`사례 ${i}`,body:'원문 사례',evidence:[{segment_id:1}]}))});

test('Generated body range excludes cover and ending and is fixed to 4–9',()=>{
  assert.equal(magazineSchema.properties.cards.minItems,4);
  assert.equal(magazineSchema.properties.cards.maxItems,9);
});
test('Out-of-range bodies are regenerated without truncating or padding cards',async()=>{
  for(const [badCount,goodCount] of [[3,4],[10,9]]){
    let calls=0;
    const result=await executeWithEvidence('prompt',magazineSchema,'.','count',source,()=>{},async prompt=>{
      calls++;
      if(calls===2)assert.match(prompt,/표지와 엔딩을 제외하고 4~9장/);
      return draft(calls===1?badCount:goodCount);
    });
    assert.equal(calls,2);
    assert.equal(result.cards.length,goodCount);
    assert.ok(result.cards.every(c=>c.evidence[0].segment_id===1));
  }
});
test('Persistent count failures are reported instead of returning an undersized draft',async()=>{
  await assert.rejects(executeWithEvidence('prompt',magazineSchema,'.','count',source,()=>{},async()=>draft(3)),/본문을 4~9장/);
});
