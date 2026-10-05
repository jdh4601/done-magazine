import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceInput,loadSource} from '../server/source.js';
import {blogUrl,extractBlog,isPublicAddress} from '../server/blog.js';

test('Only the selected source type contributes URL or text, with legacy manual support',()=>{
  const video='https://www.youtube.com/watch?v=1YmxLt4YRfc';
  assert.deepEqual(sourceInput({sourceType:'video',url:video,transcript:'ignore'}),{type:'video',url:video,transcript:'',title:''});
  assert.equal(sourceInput({sourceType:'blog',url:'https://example.com/post',transcript:'ignore'}).transcript,'');
  assert.deepEqual(sourceInput({sourceType:'text',url:'invalid stale URL',transcript:'본문'}),{type:'text',url:'',transcript:'본문',title:''});
  assert.equal(sourceInput({transcript:'기존 직접 자막'}).type,'text');
  assert.throws(()=>sourceInput({sourceType:'blog',url:'',transcript:'stale text'}));
  assert.throws(()=>sourceInput({sourceType:'text',url:video,transcript:''}));
});
test('Source loading routes to the chosen importer and manual text never downloads URLs',async()=>{
  const calls=[];
  const importer=type=>async url=>{calls.push(type);return {url,title:'원문',segments:[{id:1,start:type==='video'?42:null,text:'원문 사실. '.repeat(30)}]};};
  const readers={video:importer('video'),blog:importer('blog')};
  for(const type of ['video','blog','text']){
    const source=await loadSource(sourceInput({sourceType:type,url:type==='video'?'https://youtu.be/1YmxLt4YRfc':'https://example.com/post',transcript:'입력한 원문. '.repeat(30)}),'/unused',()=>{},readers);
    assert.equal(source.type,type);
    if(type!=='video')assert.equal(source.segments[0].start,null);
    if(type==='text')assert.equal(source.url,'');
  }
  assert.deepEqual(calls,['video','blog']);
});
test('Blog extraction preserves paragraph text and source metadata without running page scripts',()=>{
  const paragraph='고객과 직접 대화하며 제품을 개선했다. 반복되는 요청부터 해결하면서 첫 제품의 범위를 좁혔다. ';
  const html=`<!doctype html><html><head><title>블로그 제목</title><meta name="author" content="작성자"></head><body><nav>삭제할 메뉴</nav><article><h1>블로그 제목</h1><p>${paragraph.repeat(4)}</p><p>10:30 이 문장은 영상 시점이 아니다. ${paragraph.repeat(4)}</p></article><script>throw new Error('must not run')</script></body></html>`;
  const source=extractBlog(html,'https://example.com/post');
  assert.equal(source.title,'블로그 제목');assert.equal(source.author,'작성자');
  assert.ok(source.segments.every(s=>s.start===null));
  assert.ok(source.segments.some(s=>s.text.includes('10:30 이 문장')));
  assert.ok(!source.segments.some(s=>s.text.includes('삭제할 메뉴')||s.text.includes('must not run')));
  assert.throws(()=>extractBlog('<html><body>짧은 글</body></html>','https://example.com'));
});
test('Blog URLs reject non-web protocols, credentials, and local network addresses',()=>{
  for(const url of ['file:///etc/passwd','http://localhost/post','http://127.0.0.1','http://[::1]','http://[::ffff:127.0.0.1]','http://10.0.0.1','https://user:pass@example.com','https://example.com:4317'])assert.throws(()=>blogUrl(url));
  for(const address of ['192.168.1.1','169.254.169.254','172.16.0.1','fc00::1','fe80::1','::'])assert.equal(isPublicAddress(address),false);
  assert.equal(blogUrl('https://example.com/article').href,'https://example.com/article');
  assert.equal(isPublicAddress('8.8.8.8'),true);
});
