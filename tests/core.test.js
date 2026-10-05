import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {videoId,parseTranscript} from '../server/transcript.js';
import {validateEvidence} from '../server/codex.js';
import {makeScenes,sceneSvg,wrapText} from '../shared/scene.js';

test('Only genuine YouTube video URLs are accepted',()=>{
  assert.equal(videoId('https://youtu.be/1e4izfOsijE?t=5'),'1e4izfOsijE');
  assert.equal(videoId('https://www.youtube.com/watch?v=1e4izfOsijE&list=abc'),'1e4izfOsijE');
  for(const url of ['http://localhost/admin','https://youtube.com.evil.com/watch?v=1e4izfOsijE','file:///tmp/123','https://www.youtube.com/playlist?list=123','not-a-url'])assert.throws(()=>videoId(url));
});
test('SRT, VTT and Aside ranges retain real timestamps',()=>{
  const srt=parseTranscript('1\n00:01:23,456 --> 00:01:27,456\nA real quote.\n\n2\n00:01:27,456 --> 00:01:30,456\nAnother quote.');
  assert.equal(srt[0].start,83.456);assert.equal(srt[1].text,'Another quote.');
  const aside=parseTranscript('[00:01 - 00:09] thanks for having me\n[01:06 - 01:13] talk to users');
  assert.deepEqual(aside.map(s=>s.start),[1,66]);assert.equal(aside[0].text,'thanks for having me');
});
test('Plain transcripts never invent video timestamps',()=>assert.equal(parseTranscript('We interviewed our first customer.')[0].start,null));
test('JSON3 empty events and repeated rolling captions are ignored',()=>{
  const segments=parseTranscript(JSON.stringify({events:[{tStartMs:5000,segs:[{utf8:'Hello '},{utf8:'world'}]},{tStartMs:6000,segs:[{utf8:'Hello world'}]},{tStartMs:8000}]}),'json3');
  assert.equal(segments.length,1);assert.equal(segments[0].text,'Hello world');assert.equal(segments[0].start,5);
});
test('Evidence must reference an actual source segment and exact passage',()=>{
  const segments=[{id:7,text:'Talk to users before building a product.',start:5}];
  assert.equal(validateEvidence([{segment_id:7,quote:'Talk to users'}],segments)[0].start,5);
  assert.throws(()=>validateEvidence([{segment_id:8,quote:'Talk to users'}],segments));
  assert.throws(()=>validateEvidence([{segment_id:7,quote:'Revenue doubled'}],segments));
  assert.throws(()=>validateEvidence([{segment_id:7,quote:''}],segments));
});
test('Content drives page count; user text is escaped and remains text',()=>{
  for(const count of [3,8,12]){
    const scenes=makeScenes({draft:{title:'<script>alert(1)</script>',cards:Array.from({length:count},(_,i)=>({id:`c${i}`,title:'제목',body:'본문',layout:'paper-bottom',emphasis:''}))}});
    assert.equal(scenes.length,count+2);assert.ok(scenes[0].nodes.some(n=>n.type==='text'&&n.name==='Cover title'));
    assert.ok(!sceneSvg(scenes[0]).includes('<script>'));assert.ok(sceneSvg(scenes[0]).includes('&lt;script&gt;'));
  }
});
test('Explicit line breaks are kept; body fits without clipping',()=>{
  assert.deepEqual(wrapText('첫 줄\n다음 줄',920,50),['첫 줄','다음 줄']);
  const scenes=makeScenes({draft:{title:'대표의 외로움을\n무기로 바꾸는 방법',cards:[{id:'c1',title:'먼저 고객과 대화하라',body:'초기 고객의 구체적인 문제를 찾고 작은 제품으로 해결한다. '.repeat(4),layout:'dark-top',emphasis:''}]}});
  const body=scenes[1].nodes.find(n=>n.name==='Card body');assert.ok(!body.overflow);assert.ok(body.y+body.height<1250);
});
test('Figma import uses loaded fonts, native text and separate image/shape layers',async()=>{
  const code=await fs.readFile(new URL('../figma-plugin/code.js',import.meta.url),'utf8');const created=[],messages=[],loaded=new Set();
  function node(type){return {type,removed:false,x:0,y:0,width:100,height:100,children:[],resize(w,h){this.width=w;this.height=h;},appendChild(n){this.children.push(n);},remove(){this.removed=true;}};}
  const figma={showUI(){},ui:{postMessage:m=>messages.push(m)},currentPage:{children:[],selection:[]},viewport:{scrollAndZoomIntoView(){}},listAvailableFontsAsync:async()=>['Noto Sans KR','Playfair Display'].flatMap(family=>['Regular','Bold'].map(style=>({fontName:{family,style}}))),loadFontAsync:async f=>loaded.add(`${f.family}-${f.style}`),base64Decode:s=>new Uint8Array(Buffer.from(s,'base64')),createImage:()=>({hash:'image-hash'}),createFrame:()=>{const f=node('FRAME');created.push(f);return f;},createText:()=>{const t=node('TEXT');Object.defineProperty(t,'characters',{set(s){assert.ok(loaded.has(`${t.fontName.family}-${t.fontName.style}`));t._characters=s;},get(){return t._characters;}});return t;},createRectangle:()=>node('RECTANGLE'),createEllipse:()=>node('ELLIPSE')};
  const context=vm.createContext({figma,__html__:'',Uint8Array});vm.runInContext(code,context);
  const scenes=makeScenes({draft:{title:'검증 제목',cards:[]}});
  await figma.ui.onmessage({type:'import',document:{version:1,scenes,assets:{'/assets/noise.png':'aW1hZ2U='}}});
  assert.equal(created.length,2);assert.ok(created[0].children.some(n=>n.type==='TEXT'));assert.ok(created[0].children.some(n=>n.type==='ELLIPSE'));assert.equal(messages.at(-1).type,'complete');
});
