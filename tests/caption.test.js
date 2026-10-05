import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCaption} from '../server/codex.js';
const draft={title:'수정된 제목',cards:[{title:'고객의 문제',body:'고객의 실제 행동을 살펴보면 첫 제품의 범위를 좁힐 수 있다.'}]};
test('caption uses current edited copy and corrects length and source framing',async()=>{
  const calls=[];
  const answer='고객의 행동에서 제품의 범위를 좁힌다. '.repeat(60).slice(0,1000);
  const result=await generateCaption(draft,'/tmp',()=>{},async(prompt)=>{
    calls.push(prompt);
    return {caption:calls.length===1?'짧은 캡션':calls.length===2?'영상은 고객의 문제를 다룬다. '+answer.slice(20):answer};
  });
  assert.equal(calls.length,3);
  assert.match(calls[0],/수정된 제목/);
  assert.match(calls[0],/고객의 실제 행동/);
  assert.equal(result,answer.trim());
  assert.ok(result.length>=900&&result.length<=1100);
});
test('failed caption corrections report an error without replacing existing text',async()=>{
  await assert.rejects(generateCaption(draft,'/tmp',()=>{},async()=>({caption:'너무 짧다'})),/다시 생성/);
});
