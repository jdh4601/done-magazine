import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {videoId,parseTranscript} from './transcript.js';
import {blogUrl} from './blog.js';

export const PROJECT_TTL=3*24*60*60*1000;
const ID=/^[a-f0-9-]{36}$/;
export function projectExpiresAt(project){
  const created=Date.parse(project.createdAt||project.updatedAt);
  return Number.isFinite(created)?created+PROJECT_TTL:null;
}
export function sourceCacheKey(input){
  let identity;
  if(input.type==='video')identity=videoId(input.url);
  else if(input.type==='blog'){const url=blogUrl(input.url);url.hash='';identity=url.href;}
  else return null;
  return createHash('sha256').update(`${input.type}:${identity}`).digest('hex');
}
function validSource(source){
  return Array.isArray(source?.segments)&&source.segments.length>0&&source.segments.every(s=>Number.isInteger(s.id)&&typeof s.text==='string'&&(s.start==null||Number.isFinite(s.start)))&&new Set(source.segments.map(s=>s.id)).size===source.segments.length&&source.segments.reduce((n,s)=>n+s.text.length,0)>=80;
}
function downloadedInput(source){
  if(!source?.url||source.type==='text'||source.mode==='manual')return null;
  try{
    const type=source.type|| (source.mode==='blog'?'blog':source.mode?.startsWith('youtube')?'video':null);
    if(!type)return null;
    const input={type,url:source.url};sourceCacheKey(input);return input;
  }catch{return null;}
}
export function createSourceCache(data){
  const directory=path.join(data,'source-cache');
  async function get(input){
    const key=sourceCacheKey(input);if(!key)return null;
    try{const record=JSON.parse(await fs.readFile(path.join(directory,`${key}.json`),'utf8'));return record.version===1&&record.key===key&&record.type===input.type&&validSource(record.source)?record.source:null;}
    catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}
  }
  async function set(input,source){
    const key=sourceCacheKey(input);if(!key||!validSource(source))return false;
    await fs.mkdir(directory,{recursive:true});
    const file=path.join(directory,`${key}.json`),temp=`${file}.${randomUUID()}.tmp`;
    const record={version:1,key,type:input.type,url:input.url,cachedAt:new Date().toISOString(),source:{...source,type:input.type}};
    await fs.writeFile(temp,JSON.stringify(record));await fs.rename(temp,file);return true;
  }
  async function preserve(source){
    const input=downloadedInput(source);if(!input||!validSource(source))return false;
    if(await get(input))return false;
    return set(input,source);
  }
  return {get,set,preserve};
}
export function createProjectStorage(data,{now=Date.now,cache=createSourceCache(data)}={}){
  const projects=path.join(data,'projects'),work=path.join(data,'work');
  let running=null;
  async function expire(id){
    if(!ID.test(id))throw new Error('잘못된 프로젝트 ID입니다.');
    const file=path.join(projects,`${id}.json`);
    let project;try{project=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return false;throw error;}
    const deadline=projectExpiresAt(project);
    if(deadline==null||deadline>now())return false;
    // Cache writes must succeed before deleting the project's only copy of a source.
    await cache.preserve(project.source);
    await fs.unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});
    await fs.rm(path.join(work,id),{recursive:true,force:true});
    return true;
  }
  async function maintain(){
    if(running)return running;
    running=(async()=>{
      let cached=0,deleted=0;
      // Recover previously downloaded transcripts even if draft generation failed.
      for(const id of await fs.readdir(work).catch(error=>{if(error.code==='ENOENT')return [];throw error;})){
        if(!ID.test(id))continue;
        const dir=path.join(work,id);
        let source;
        try{source=JSON.parse(await fs.readFile(path.join(dir,'transcript.json'),'utf8'));}
        catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
        if(!source){
          try{
            const info=JSON.parse(await fs.readFile(path.join(dir,'source.info.json'),'utf8'));
            const files=await fs.readdir(dir),captions=files.filter(f=>f.endsWith('.json3'));
            const selected=captions.find(f=>f.endsWith('.en.json3'))||captions.find(f=>f.endsWith('.en-orig.json3'))||captions[0];
            if(selected&&/^[A-Za-z0-9_-]{11}$/.test(info.id))source={type:'video',mode:'youtube',url:`https://www.youtube.com/watch?v=${info.id}`,title:info.title||'',author:info.channel||info.uploader||'',language:selected.split('.').at(-2),segments:parseTranscript(await fs.readFile(path.join(dir,selected),'utf8'),'json3')};
          }catch(error){if(error.code&&error.code!=='ENOENT')throw error;}
        }
        if(source&&await cache.preserve(source))cached++;
      }
      for(const name of await fs.readdir(projects).catch(error=>{if(error.code==='ENOENT')return [];throw error;})){
        if(!name.endsWith('.json')||!ID.test(name.slice(0,-5)))continue;
        let project;try{project=JSON.parse(await fs.readFile(path.join(projects,name),'utf8'));}catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)continue;throw error;}
        if(await cache.preserve(project.source))cached++;
        if(await expire(name.slice(0,-5)))deleted++;
      }
      return {cached,deleted};
    })();
    try{return await running;}finally{running=null;}
  }
  return {cache,expire,maintain};
}
