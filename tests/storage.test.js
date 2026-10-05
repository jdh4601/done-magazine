import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {createSourceCache,createProjectStorage,PROJECT_TTL,projectExpiresAt,sourceCacheKey} from '../server/storage.js';
import {loadSource,sourceInput} from '../server/source.js';

const video='https://www.youtube.com/watch?v=1YmxLt4YRfc';
const source={type:'video',mode:'youtube',url:video,title:'원문 제목',author:'작성자',segments:[{id:1,start:42,text:'원문의 구체적인 사실을 보관합니다. '.repeat(10)}]};
async function temp(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'done-storage-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
async function project(data,value){await fs.mkdir(path.join(data,'projects'),{recursive:true});await fs.writeFile(path.join(data,'projects',`${value.id}.json`),JSON.stringify(value));}

test('Downloaded video URLs reuse a persistent source with original timestamps and skip network import',async t=>{
  const data=await temp(t),cache=createSourceCache(data);let downloads=0;
  const downloader=async()=>{downloads++;return source;};
  await loadSource(sourceInput({sourceType:'video',url:video}),data,()=>{},{cache,video:downloader});
  const messages=[];
  const reused=await loadSource(sourceInput({sourceType:'video',url:'https://youtu.be/1YmxLt4YRfc?t=90'}),data,m=>messages.push(m),{cache:createSourceCache(data),video:downloader});
  assert.equal(downloads,1);assert.deepEqual(reused,source);assert.match(messages[0],/재사용/);
  assert.equal(sourceCacheKey({type:'video',url:video}),sourceCacheKey({type:'video',url:'https://youtube.com/shorts/1YmxLt4YRfc'}));
});

test('Blogs reuse the requested URL and redirect URL without fetching again; manual text is never cached',async t=>{
  const data=await temp(t),cache=createSourceCache(data);let downloads=0;
  const blog={...source,type:'blog',mode:'blog',url:'https://example.com/final',segments:source.segments.map(s=>({...s,start:null}))};
  const importer=async()=>{downloads++;return blog;};
  for(const url of ['https://example.com/start','https://example.com/start#section','https://example.com/final'])assert.deepEqual(await loadSource(sourceInput({sourceType:'blog',url}),data,()=>{},{cache,blog:importer}),blog);
  assert.equal(downloads,1);
  const text='매번 현재 입력한 원문을 씁니다. '.repeat(10);
  const manual=await loadSource(sourceInput({sourceType:'text',transcript:text}),data,()=>{},{cache:{get(){throw new Error('must not read cache');},set(){throw new Error('must not write cache');}}});
  assert.equal(manual.mode,'manual');assert.equal(manual.segments[0].text,text.trim());
  assert.notEqual(sourceCacheKey({type:'blog',url:'https://example.com/post?id=1'}),sourceCacheKey({type:'blog',url:'https://example.com/post?id=2'}));
});

test('Expired projects are removed at 72 hours, their source survives, and edited projects do not extend retention',async t=>{
  const data=await temp(t),created=Date.parse('2026-10-01T10:00:00Z'),id=randomUUID();let clock=created+PROJECT_TTL-1;
  const p={id,createdAt:new Date(created).toISOString(),updatedAt:new Date(clock).toISOString(),source};
  await project(data,p);await fs.mkdir(path.join(data,'work',id),{recursive:true});
  await fs.writeFile(path.join(data,'work',id,'private-draft.json'),'{}');
  await fs.mkdir(path.join(data,'photos','shared-photo'),{recursive:true});
  const storage=createProjectStorage(data,{now:()=>clock});
  assert.equal(projectExpiresAt(p),created+PROJECT_TTL);
  assert.equal(await storage.expire(id),false);
  clock++;assert.equal(await storage.expire(id),true);
  await assert.rejects(fs.access(path.join(data,'projects',`${id}.json`)));
  await assert.rejects(fs.access(path.join(data,'work',id)));
  await fs.access(path.join(data,'photos','shared-photo'));
  assert.deepEqual(await createSourceCache(data).get({type:'video',url:video}),source);
  assert.equal(await storage.expire(id),false);
});

test('Startup migrates existing project sources and leftover transcript downloads before expiring projects',async t=>{
  const data=await temp(t),id=randomUUID(),workId=randomUUID();
  const blog={...source,type:'blog',mode:'blog',url:'https://example.com/article',segments:source.segments.map(s=>({...s,start:null}))};
  await project(data,{id,createdAt:'2026-01-01T00:00:00Z',source:blog});
  await fs.mkdir(path.join(data,'work',workId),{recursive:true});
  await fs.writeFile(path.join(data,'work',workId,'transcript.json'),JSON.stringify(source));
  const storage=createProjectStorage(data,{now:()=>Date.parse('2026-01-04T00:00:00Z')});
  assert.deepEqual(await storage.maintain(),{cached:2,deleted:1});
  assert.deepEqual(await storage.cache.get({type:'blog',url:blog.url}),blog);
  assert.deepEqual(await storage.cache.get({type:'video',url:video}),source);
  assert.deepEqual(await storage.maintain(),{cached:0,deleted:0});
});

test('Corrupt source caches are downloaded again, while failed and short downloads are never saved',async t=>{
  const data=await temp(t),cache=createSourceCache(data),input=sourceInput({sourceType:'video',url:video});
  await cache.set(input,source);const file=path.join(data,'source-cache',`${sourceCacheKey(input)}.json`);
  await fs.writeFile(file,'invalid json');let downloads=0;
  assert.deepEqual(await loadSource(input,data,()=>{},{cache,video:async()=>{downloads++;return source;}}),source);
  assert.equal(downloads,1);
  await fs.unlink(file);
  await assert.rejects(loadSource(input,data,()=>{},{cache,video:async()=>{throw new Error('offline');}}),/offline/);
  assert.equal(await cache.get(input),null);
  await assert.rejects(loadSource(input,data,()=>{},{cache,video:async()=>({...source,segments:[{id:1,start:0,text:'짧음'}]})}),/너무 짧/);
  assert.equal(await cache.get(input),null);
});

test('Cache preservation failure prevents destructive project cleanup',async t=>{
  const data=await temp(t),id=randomUUID();await project(data,{id,createdAt:'2026-01-01T00:00:00Z',source});
  const storage=createProjectStorage(data,{now:()=>Date.parse('2026-01-05T00:00:00Z'),cache:{preserve:async()=>{throw new Error('disk full');}}});
  await assert.rejects(storage.expire(id),/disk full/);await fs.access(path.join(data,'projects',`${id}.json`));
});

test('Unknown project timestamps and malformed records are preserved rather than guessed',async t=>{
  const data=await temp(t),id=randomUUID();await project(data,{id,createdAt:'invalid',source});
  assert.equal(projectExpiresAt({createdAt:'invalid'}),null);
  const storage=createProjectStorage(data);assert.equal(await storage.expire(id),false);
  assert.deepEqual(await storage.maintain(),{cached:1,deleted:0});
  await fs.writeFile(path.join(data,'projects',`${id}.json`),'bad json');
  assert.deepEqual(await storage.maintain(),{cached:0,deleted:0});
});
