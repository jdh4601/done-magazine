import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectedEditorialPhrase} from '../server/editorial-style.js';
import {executeWithEvidence,generateCaption} from '../server/codex.js';

test('User-rejected editorial phrases and inflections are detected',()=>{
  for(const phrase of ['과제는 그대로 남는다.','과제는 그대로 남아 있다.','실행이 앞선다.','실행이 앞서는 조직','실행이 앞섰다는 평가','판단은 분명하다.','판단이 명확하다.','분명한 판단이다.'])assert.ok(rejectedEditorialPhrase(phrase),phrase);
  for(const phrase of ['재고가 남았다.','팀은 새 업무를 맡았다.','앞서 소개한 사례','판단을 바꿨다.'])assert.equal(rejectedEditorialPhrase(phrase),null,phrase);
});

test('Magazine titles, candidate titles, body, subtitle and angle all trigger correction',async()=>{
  const source=[{id:1,text:'팀은 새 업무를 맡았다.',start:0}];
  const clean={title:'팀은 새 업무를 맡았다',subtitle:'업무를 바꿨다',angle:'팀 배치를 바꿔라',cover_titles:['팀을 새 업무에 배치하라','담당 업무부터 바꿔라','누가 새 업무를 맡을 것인가'],cards:[{title:'담당 업무를 바꿔라',body:'팀은 새 업무를 맡았다.',evidence:[{segment_id:1}]}]};
  for(const field of ['title','subtitle','angle','cover_titles','body']){
    let calls=0;
    const result=await executeWithEvidence('prompt',{},'.','editorial',source,()=>{},async prompt=>{
      calls++;
      if(calls===2){assert.match(prompt,/금지한 상투어/);return clean;}
      const bad=structuredClone(clean);
      if(field==='body')bad.cards[0].body='과제는 그대로 남는다.';
      else if(field==='cover_titles')bad.cover_titles[0]='실행이 앞선다';
      else bad[field]='판단은 분명하다.';
      return bad;
    });
    assert.equal(calls,2);
    assert.deepEqual(result.cards[0].evidence,[{segment_id:1}]);
  }
});

test('Caption corrects banned phrases even when length is valid',async()=>{
  const clean='팀은 새 업무를 맡았다. '.repeat(100).slice(0,1000);
  let calls=0;
  const result=await generateCaption({title:'팀 배치',cards:[{title:'새 업무',body:'팀은 새 업무를 맡았다.'}]},'.',()=>{},async prompt=>{
    calls++;
    if(calls===1)return {caption:'판단은 분명하다. '+clean.slice(15)};
    assert.match(prompt,/금지한 상투어/);
    assert.match(prompt,/humanizer/);
    return {caption:clean};
  });
  assert.equal(calls,2);
  assert.equal(result,clean.trim());
});
