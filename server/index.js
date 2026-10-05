import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import JSZip from 'jszip';
import { createServer as createViteServer } from 'vite';
import {cliBinary,normalizeProvider,execute} from './ai.js';
import { run } from './process.js';
import { downloadTranscript, parseTranscript, videoId } from './transcript.js';
import { generateMagazine, generateCaption } from './codex.js';
import { processPhoto, ensureNoise, withContentBounds } from './photos.js';
import { sceneSvg } from '../shared/scene.js';
import {ENDING_TEMPLATE,templateUrl} from '../shared/templates.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const data=path.join(root,'data');await fs.mkdir(data,{recursive:true});await ensureNoise(root);
// Register project-local fonts for PNG rendering; do not alter the user's system fonts.
await fs.writeFile(path.join(data,'fonts.conf'),`<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>${root}/public/fonts</dir><dir>/System/Library/Fonts</dir><dir>/Library/Fonts</dir><cachedir>${data}/font-cache</cachedir></fontconfig>`);
process.env.FONTCONFIG_FILE=path.join(data,'fonts.conf');
const app=express();app.use(express.json({limit:'24mb'}));
const port=Number(process.env.PORT || 4317);
// No shell interpolation, no remote URL fetching, localhost only.
app.use('/api',(req,res,next)=>{
  const origin=req.headers.origin;
  if(origin && origin!==`http://localhost:${port}` && origin!==`http://127.0.0.1:${port}`)return res.status(403).json({error:'로컬 앱에서만 요청할 수 있습니다.'});
  next();
});
app.use('/assets',express.static(data,{dotfiles:'deny',index:false}));
app.use('/templates',express.static(path.join(root,'templates'),{dotfiles:'deny',index:false}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024,files:17},fileFilter:(req,file,cb)=>cb(null,['image/jpeg','image/png','image/webp'].includes(file.mimetype))});
const jobs=new Map();let activeGeneration=false,photoQueue=Promise.resolve();
function job(kind,task) {
  const id=randomUUID();const state={id,kind,status:'running',message:'준비 중',createdAt:Date.now()};jobs.set(id,state);
  Promise.resolve().then(()=>task(message=>{state.message=message;})).then(result=>{state.status='complete';state.result=result;state.message='완료';},error=>{state.status='failed';state.error=error.message;state.message='처리 실패';});
  return id;
}
function safeId(id) {if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('잘못된 프로젝트 ID입니다.');return id;}
async function readProject(id) {
  const project=JSON.parse(await fs.readFile(path.join(data,'projects',`${safeId(id)}.json`),'utf8'));
  project.photos=await Promise.all(project.photos.map(p=>withContentBounds(p,root)));
  return project;
}
async function saveProject(project) {await fs.mkdir(path.join(data,'projects'),{recursive:true});const file=path.join(data,'projects',`${safeId(project.id)}.json`);const temp=`${file}.${randomUUID()}.tmp`;await fs.writeFile(temp,JSON.stringify(project,null,2));await fs.rename(temp,file);}
app.get('/api/status',async(req,res)=>{
  const codex=await cliBinary('codex'),claude=await cliBinary('claude');
  const results=await Promise.allSettled([run(codex,['--version']),run(codex,['login','status']),run(process.env.YTDLP_BIN || 'yt-dlp',['--version']),run(claude,['--version']),run(claude,['auth','status'])]);
  const claudeLoggedIn=results[4].status==='fulfilled'&&(()=>{try{return JSON.parse(results[4].value).loggedIn===true;}catch{return false;}})();
  res.json({codex:results[0].status==='fulfilled'?results[0].value.trim():null,loggedIn:results[1].status==='fulfilled',claude:results[3].status==='fulfilled'?results[3].value.trim():null,claudeLoggedIn,ytdlp:results[2].status==='fulfilled',cutout:await fs.access(path.join(root,'.venv','bin','python')).then(()=>true,()=>false)});
});
app.get('/api/jobs/:id',(req,res)=>{const state=jobs.get(req.params.id);if(!state)return res.status(404).json({error:'작업을 찾지 못했습니다.'});res.json(state);});
app.post('/api/photos',upload.array('photos',16),(req,res)=>{
  if(!req.files?.length)return res.status(400).json({error:'JPG, PNG, WebP 사진을 선택하세요. (사진당 15MB 이하)'});
  let provider;try{provider=normalizeProvider(req.body.provider);}catch(e){return res.status(400).json({error:e.message});}
  const role=req.body.role==='body'?'body':'cover';
  if(role==='cover'&&req.files.length!==1)return res.status(400).json({error:'표지 사진은 한 장만 선택하세요.'});
  const id=job('photos',progress=>{
    const promise=photoQueue.then(async()=>{const list=[];for(let i=0;i<req.files.length;i++){progress(`사진 ${i+1}/${req.files.length} 처리 중`);list.push(await processPhoto(req.files[i],root,randomUUID(),m=>progress(`사진 ${i+1}/${req.files.length} · ${m}`),role,req.body.coverStyle==='original'?'original':'editorial',provider));}return list;});photoQueue=promise.catch(()=>{});return promise;
  });res.json({jobId:id});
});
app.post('/api/photos/restyle',(req,res)=>{
  const photos=req.body.photos;let provider;
  try{provider=normalizeProvider(req.body.provider);if(!Array.isArray(photos)||!photos.length||photos.length>17)throw new Error('다시 처리할 사진을 선택하세요.');for(const p of photos)safeId(p.id);}catch(e){return res.status(400).json({error:e.message});}
  const id=job('photos',progress=>{
    const promise=photoQueue.then(async()=>{
      const list=[];
      for(const p of photos){const buffer=await fs.readFile(path.join(data,'photos',p.id,'original.png'));const updated=await processPhoto({buffer,originalname:p.name},root,randomUUID(),progress,'cover','editorial',provider);list.push({...updated,previousId:p.id});}
      return list;
    });photoQueue=promise.catch(()=>{});return promise;
  });res.json({jobId:id});
});
app.post('/api/generate',async(req,res)=>{
  if(activeGeneration)return res.status(409).json({error:'현재 원고를 작성 중입니다. 완료 후 다시 시도하세요.'});
  const {url='',transcript='',angle='',photos=[],title='',coverPhotoId=null,coverStyle='editorial',provider='codex'}=req.body;
  if(!transcript.trim()&&!url.trim())return res.status(400).json({error:'YouTube URL 또는 자막을 입력하세요.'});
  try {normalizeProvider(provider);if(url.trim())videoId(url.trim());if(transcript.length>1000000)throw new Error('자막이 너무 깁니다.');if(!Array.isArray(photos)||photos.length>17)throw new Error('표지 1장과 본문 사진 16장까지 사용할 수 있습니다.');for(const p of photos)safeId(p.id);}catch(e){return res.status(400).json({error:e.message});}
  activeGeneration=true;
  const id=job('magazine',async progress=>{
    try {
      const projectId=randomUUID();const workDir=path.join(data,'work',projectId);await fs.mkdir(workDir,{recursive:true});
      let source;
      if(transcript.trim()){progress('입력한 자막을 정리하고 있습니다');source={url:url.trim(),title:title.trim(),author:'',mode:'manual',segments:parseTranscript(transcript)};}
      else {progress('YouTube 자막을 다운로드하고 있습니다');source=await downloadTranscript(url.trim(),workDir);}
      if(source.segments.reduce((sum,s)=>sum+s.text.length,0)<80)throw new Error('매거진을 만들기에 자막 내용이 너무 짧습니다.');
      const draft=await generateMagazine(source,String(angle).slice(0,1000),workDir,progress,provider);
      const project={id:projectId,draft,source,photos,provider,coverPhotoId:photos.find(p=>p.id===coverPhotoId)?.id||photos.find(p=>p.role==='cover')?.id||null,coverVariant:0,coverStyle:coverStyle==='original'?'original':'editorial',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      await saveProject(project);return project;
    } finally {activeGeneration=false;}
  });res.json({jobId:id});
});
app.post('/api/caption',async(req,res)=>{
  if(activeGeneration)return res.status(409).json({error:'현재 원고를 작성 중입니다. 완료 후 다시 시도하세요.'});
  const {projectId,draft,provider='codex'}=req.body;
  try {
    normalizeProvider(provider);await readProject(projectId);
    if(typeof draft?.title!=='string'||!Array.isArray(draft.cards)||!draft.cards.length||draft.cards.length>30||draft.cards.some(c=>typeof c.title!=='string'||typeof c.body!=='string'||c.title.length>160||c.body.length>2000))throw new Error('캡션을 만들 매거진 원고를 확인하세요.');
    if(!draft.cards.some(c=>c.body.trim()))throw new Error('본문을 작성한 뒤 캡션을 생성하세요.');
  }catch(e){return res.status(400).json({error:e.message});}
  activeGeneration=true;
  const id=job('caption',async progress=>{
    try {
      const workDir=path.join(data,'work',randomUUID());await fs.mkdir(workDir,{recursive:true});
      return {caption:await generateCaption(draft,workDir,progress,(...args)=>execute(...args,undefined,provider),provider)};
    }finally{activeGeneration=false;}
  });res.json({jobId:id});
});
app.get('/api/projects',async(req,res)=>{
  const dir=path.join(data,'projects');const files=await fs.readdir(dir).catch(()=>[]);const projects=await Promise.all(files.filter(f=>f.endsWith('.json')).map(async f=>{try{const p=JSON.parse(await fs.readFile(path.join(dir,f),'utf8'));return {id:p.id,title:p.draft.title,updatedAt:p.updatedAt,cardCount:p.draft.cards.length+2};}catch{return null;}}));res.json(projects.filter(Boolean).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));
});
app.get('/api/projects/:id',async(req,res)=>{try{res.json(await readProject(req.params.id));}catch(e){res.status(404).json({error:'프로젝트를 찾지 못했습니다.'});}});
app.put('/api/projects/:id',async(req,res)=>{
  try {const existing=await readProject(req.params.id);const value=req.body;if(value.id!==existing.id||!Array.isArray(value.draft?.cards)||value.draft.cards.length>30)throw new Error('잘못된 프로젝트입니다.');
    // Keep original transcript and creation metadata immutable when saving edits.
    const project={...existing,provider:normalizeProvider(value.provider||existing.provider),draft:value.draft,photos:value.photos,coverVariant:value.coverVariant,coverPhotoPosition:value.coverPhotoPosition,coverPhotoId:value.coverPhotoId,coverStyle:value.coverStyle==='original'?'original':'editorial',updatedAt:new Date().toISOString()};await saveProject(project);res.json(project);
  } catch(e){res.status(400).json({error:e.message});}
});
async function packageScenes(scenes) {
  if(!Array.isArray(scenes)||!scenes.length||scenes.length>32)throw new Error('내보낼 페이지가 없습니다.');
  const assets={};
  for(const scene of scenes) {
    if(scene.width!==1080||scene.height!==1350||!Array.isArray(scene.nodes)||scene.nodes.length>100)throw new Error('잘못된 페이지 형식입니다.');
    for(const n of scene.nodes)if(n.type==='image'&&!assets[n.src]) {
      if(n.src===templateUrl(ENDING_TEMPLATE)){
        assets[n.src]=(await fs.readFile(path.join(root,'templates',ENDING_TEMPLATE))).toString('base64');
        continue;
      }
      if(!/^\/assets\/((noise|editorial-grain)\.png|photos\/[a-f0-9-]{36}\/(gray|subject|original|blue|accents)\.png)$/.test(n.src))throw new Error('잘못된 이미지 경로입니다.');
      assets[n.src]=(await fs.readFile(path.join(data,n.src.slice('/assets/'.length)))).toString('base64');
    }
  }
  return {version:1,width:1080,height:1350,scenes,assets};
}
app.post('/api/export/figma',async(req,res)=>{try{res.json(await packageScenes(req.body.scenes));}catch(e){res.status(400).json({error:e.message});}});
app.post('/api/export/png',async(req,res)=>{
  try {
    const bundle=await packageScenes(req.body.scenes);const zip=new JSZip();
    for(let i=0;i<bundle.scenes.length;i++) {
      const scene=bundle.scenes[i];const svg=sceneSvg(scene,src=>`data:image/${src.endsWith('.jpg')?'jpeg':'png'};base64,${bundle.assets[src]}`);
      const buffer=await sharp(Buffer.from(svg)).png().toBuffer();zip.file(`${String(i+1).padStart(2,'0')}-${scene.kind}.png`,buffer);
    }
    res.setHeader('Content-Type','application/zip');res.setHeader('Content-Disposition','attachment; filename="D.one-magazine.zip"');res.send(await zip.generateAsync({type:'nodebuffer'}));
  }catch(e){res.status(400).json({error:e.message});}
});
app.get('/api/plugin',async(req,res)=>{const zip=new JSZip();for(const f of ['manifest.json','code.js','ui.html','README.md'])zip.file(f,await fs.readFile(path.join(root,'figma-plugin',f)));res.type('zip').send(await zip.generateAsync({type:'nodebuffer'}));});
app.use((error,req,res,next)=>res.status(400).json({error:error.message || '요청을 처리하지 못했습니다.'}));
if(process.env.NODE_ENV==='production')app.use(express.static(path.join(root,'dist')));
else {const vite=await createViteServer({root,server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
app.listen(port,'127.0.0.1',()=>console.log(`D.one Magazine Studio → http://localhost:${port}`));
