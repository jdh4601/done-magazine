import {downloadBlog,blogUrl} from './blog.js';
import {downloadTranscript,parseTranscript,videoId} from './transcript.js';

export function sourceInput(value){
  const type=value.sourceType||(value.transcript?.trim()?'text':'video');
  if(!['video','blog','text'].includes(type))throw new Error('영상 URL, 블로그 URL, 직접 텍스트 중 하나를 선택하세요.');
  const url=type==='text'?'':String(value.url||'').trim();
  const transcript=type==='text'?String(value.transcript||''):'';
  if(type==='video')videoId(url);
  if(type==='blog')blogUrl(url);
  if(type==='text'&&!transcript.trim())throw new Error('텍스트 내용을 입력하세요.');
  if(transcript.length>1000000)throw new Error('텍스트는 100만 자 이하로 입력하세요.');
  return {type,url,transcript,title:String(value.title||'').trim()};
}
export async function loadSource(input,dir,progress,{video=downloadTranscript,blog=downloadBlog,cache}={}){
  let source;
  if(input.type!=='text'&&cache){const cached=await cache.get(input);if(cached){progress('저장된 원문 스크립트를 재사용하고 있습니다');return {...cached,type:input.type};}}
  if(input.type==='text'){
    progress('입력한 텍스트를 정리하고 있습니다');
    source={url:'',title:input.title,author:'',mode:'manual',segments:parseTranscript(input.transcript)};
  }else if(input.type==='blog'){
    progress('블로그 본문을 가져오고 있습니다');source=await blog(input.url);
  }else{
    progress('YouTube 자막을 다운로드하고 있습니다');source=await video(input.url,dir);
  }
  if(source.segments.reduce((sum,s)=>sum+s.text.length,0)<80)throw new Error('매거진을 만들기에 원문 내용이 너무 짧습니다.');
  source={...source,type:input.type};
  if(input.type!=='text'&&cache){await cache.set(input,source);if(source.url&&source.url!==input.url)await cache.set({...input,url:source.url},source);}
  return source;
}
