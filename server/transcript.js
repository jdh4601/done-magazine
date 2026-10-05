import fs from 'node:fs/promises';
import path from 'node:path';
import { run } from './process.js';

export function videoId(url) {
  let u; try { u = new URL(url); } catch { throw new Error('올바른 YouTube URL을 입력하세요.'); }
  if (!['https:', 'http:'].includes(u.protocol)) throw new Error('YouTube URL만 사용할 수 있습니다.');
  const host = u.hostname.toLowerCase();
  let id;
  if (host === 'youtu.be') id = u.pathname.split('/')[1];
  else if (['youtube.com','www.youtube.com','m.youtube.com'].includes(host)) id = u.searchParams.get('v') || (/^\/(shorts|live|embed)\//.test(u.pathname) ? u.pathname.split('/')[2] : '');
  if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) throw new Error('영상 한 개의 YouTube URL을 입력하세요.');
  return id;
}
const clean = s => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g, ' ').trim();
const seconds = s => s.replace(',', '.').split(':').reduce((v,p) => v * 60 + Number(p), 0);
export function parseTranscript(input, format = '') {
  if (typeof input !== 'string' || !input.trim()) throw new Error('자막 내용을 입력하세요.');
  if (input.length > 1000000) throw new Error('자막은 100만 자 이하로 입력하세요.');
  let segments = [];
  if (format === 'json3' || input.trim().startsWith('{')) {
    try { const doc = JSON.parse(input); segments = (doc.events || []).filter(e => e.segs).map(e => ({ start: Math.floor((e.tStartMs || 0)/1000), text: clean(e.segs.map(s => s.utf8 || '').join('')) })).filter(s => s.text); }
    catch { if (format === 'json3') throw new Error('자막 JSON을 읽을 수 없습니다.'); }
  }
  if (!segments.length) {
    const blocks = input.replace(/\r/g,'').split(/\n\s*\n/);
    for (const block of blocks) {
      const lines = block.split('\n'); const ti = lines.findIndex(l => l.includes('-->'));
      if (ti >= 0) { const text = clean(lines.slice(ti+1).join(' ')); if (text) segments.push({ start: seconds(lines[ti].split('-->')[0].trim()), text }); }
    }
  }
  if (!segments.length) {
    for (const line of input.replace(/\r/g,'').split('\n').filter(s => s.trim())) {
      const match = line.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*-\s*\d{1,2}:\d{2}(?::\d{2})?)?\]?\s+(.+)$/);
      const value = match ? match[2] : line;
      // Plain text has no genuine video timestamps; never invent them.
      for (let i = 0; i < value.length; i += 1800) segments.push({ start: match ? seconds(match[1]) : null, text: clean(value.slice(i,i+1800)) });
    }
  }
  let previous = '';
  return segments.filter(s => { if (!s.text || s.text === previous) return false; previous = s.text; return true; }).map((s,i) => ({ id:i+1, ...s }));
}
export async function downloadTranscript(url, dir) {
  const id = videoId(url);
  await fs.mkdir(dir, { recursive: true });
  // Aside reads the transcript using the user's existing browser session without opening a tab.
  // id has already been restricted to an eleven-character YouTube identifier.
  try {
    const script=`const [meta, transcript] = await Promise.all([youtube.getMetadata('${id}'), youtube.getTranscript('${id}', {includeTimestamp:true})]); console.log('DONE_SOURCE_JSON:'+JSON.stringify({meta,transcript}));`;
    const output=await run(process.env.ASIDE_BIN || 'aside',['repl',script],{timeout:90000});
    const match=output.match(/DONE_SOURCE_JSON:([^\n]+)/);
    if(!match)throw new Error('Aside 자막 출력이 없습니다.');
    const result=JSON.parse(match[1]);const segments=parseTranscript(result.transcript);
    if(!segments.length)throw new Error('자막이 비어 있습니다.');
    const source={url:`https://www.youtube.com/watch?v=${id}`,title:result.meta.title || '',author:result.meta.channelName || '',segments,mode:'youtube-aside'};
    await fs.writeFile(path.join(dir,'transcript.json'),JSON.stringify(source));return source;
  } catch (e) { /* yt-dlp is an independent fallback if Aside is unavailable or blocked. */ }
  try {
    const localYtdlp=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..','.venv','bin','yt-dlp');
    const binary=process.env.YTDLP_BIN || await fs.access(localYtdlp).then(()=>localYtdlp,()=> 'yt-dlp');
    await run(binary, ['--skip-download','--no-playlist','--write-subs','--write-auto-subs','--sub-langs','en,en-orig,ko','--sub-format','json3','--write-info-json','--socket-timeout','15','--retries','1','--extractor-retries','1','-o',path.join(dir,'source'),'--',`https://www.youtube.com/watch?v=${id}`], { timeout: 90000 });
    const files = await fs.readdir(dir); const captions = files.filter(f => f.endsWith('.json3'));
    const selected = captions.find(f=>f.endsWith('.en.json3')) || captions.find(f=>f.endsWith('.en-orig.json3')) || captions[0];
    if (!selected) throw new Error('이 영상에서 영어 또는 한국어 자막을 찾지 못했습니다.');
    const segments = parseTranscript(await fs.readFile(path.join(dir,selected),'utf8'),'json3');
    if (!segments.length) throw new Error('자막이 비어 있습니다.');
    const info = JSON.parse(await fs.readFile(path.join(dir,'source.info.json'),'utf8'));
    return { url:`https://www.youtube.com/watch?v=${id}`, title: info.title || '', author:info.channel || info.uploader || '', segments, language:selected.split('.').slice(-2)[0], mode:'youtube' };
  } catch (e) {
    throw new Error(`자막 자동 추출에 실패했습니다. 스크립트를 붙여넣거나 TXT/SRT/VTT 파일을 올려 주세요. ${e.message.slice(0,450)}`);
  }
}
