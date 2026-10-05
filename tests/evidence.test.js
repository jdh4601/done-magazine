import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validateEvidence,executeWithEvidence} from '../server/codex.js';

test('Source IDs supply verbatim text without model-generated quotations',()=>{
  const source=[{id:137,text:'where you can make real mistakes. Those',start:10},{id:138,text:"guys are incredibly honest about what's",start:13}];
  assert.deepEqual(validateEvidence([{segment_id:138}],source),[{segmentId:138,quote:source[1].text,start:13}]);
  assert.equal(validateEvidence([{segment_id:138,quote:"Those guys are incredibly honest about what's"}],source)[0].start,10);
  assert.throws(()=>validateEvidence([{segment_id:138,quote:'Their revenue doubled.'}],source));
  assert.throws(()=>validateEvidence([{segment_id:999}],source));
});
test('Invalid source IDs are automatically retried without weakening evidence checks',async()=>{
  let calls=0;const messages=[];
  const runner=async()=>({cards:[{evidence:[{segment_id:++calls===1?999:7}]}]});
  const result=await executeWithEvidence('prompt',{},'.','test',[{id:7,text:'Original source',start:5}],m=>messages.push(m),runner);
  assert.equal(calls,2);assert.equal(result.cards[0].evidence[0].segment_id,7);assert.equal(messages.length,1);
  await assert.rejects(executeWithEvidence('prompt',{},'.','test',[],()=>{},async()=>({cards:[{evidence:[{segment_id:999}]}]})),/자동 수정도 실패/);
});
test('Saved failing output resolves sentences split across adjacent captions',async()=>{
  const dir=new URL('../data/work/d4b1200f-4892-4980-ba77-affd05cffd84/',import.meta.url);
  const available=await fs.access(new URL('magazine.json',dir)).then(()=>true,()=>false);
  if(!available)return;
  const draft=JSON.parse(await fs.readFile(new URL('magazine.json',dir)));
  const source=JSON.parse(await fs.readFile(new URL('transcript.json',dir)));
  for(const card of draft.cards)assert.ok(validateEvidence(card.evidence,source.segments).length);
});

test('Title candidates retry duplicates and wrong counts while keeping source evidence',async()=>{
  const valid=['회의만 바꾸면 팀은 안 움직인다','전환에는 불편한 선택이 따른다','당신의 우선순위는 배치에 있는가'];
  const attempts=[['반복 제목','반복  제목','세 번째 제목'],['하나','둘'],valid];
  const prompts=[];
  const result=await executeWithEvidence('prompt',{},'.','titles',[{id:7,text:'Original source',start:5}],()=>{},async prompt=>{
    prompts.push(prompt);
    return {cover_titles:attempts[prompts.length-1],cards:[{evidence:[{segment_id:7}]}]};
  });
  assert.equal(prompts.length,3);
  assert.match(prompts[1],/정확히 3개/);
  assert.deepEqual(result.cover_titles,valid);
  await assert.rejects(executeWithEvidence('prompt',{},'.','titles',[{id:7,text:'Original source',start:5}],()=>{},async()=>({cover_titles:['하나'],cards:[{evidence:[{segment_id:7}]}]})),/제목 후보/);
});
