import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { run } from './process.js';
import { analyzePhoto } from './codex.js';

export async function processPhoto(file,root,id,progress,role='cover',style='editorial',provider='codex') {
  const dir=path.join(root,'data','photos',id);await fs.mkdir(dir,{recursive:true});
  const normalized=path.join(dir,'original.png');
  await sharp(file.buffer,{limitInputPixels:45000000}).rotate().trim({background:'#ffffff',threshold:10}).resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).png().toFile(normalized);
  progress('흑백 대비와 사진 톤을 보정하고 있습니다');
  await sharp(normalized).grayscale().linear(1.55,-36).png().toFile(path.join(dir,'gray.png'));
  if(role==='body'||style==='original'){
    const meta=await sharp(normalized).metadata();
    return {id,role,name:file.originalname,original:`/assets/photos/${id}/original.png`,gray:`/assets/photos/${id}/gray.png`,sourceWidth:meta.width,sourceHeight:meta.height};
  }
  progress('Codex가 주 피사체와 강조할 주변 요소를 찾고 있습니다');
  const plan=await analyzePhoto(normalized,dir,provider);
  await fs.writeFile(path.join(dir,'plan.json'),JSON.stringify(plan));
  progress('피사체를 흑백으로 분리하고 주변 요소에 주황색을 입히고 있습니다');
  const processing=JSON.parse(await run(path.join(root,'.venv','bin','python'),[path.join(root,'server','editorial_photo.py'),normalized,dir,path.join(dir,'plan.json')],{timeout:240000, cwd:root}));
  const meta=await sharp(path.join(dir,'subject.png')).metadata();
  return {id,role,name:file.originalname,original:`/assets/photos/${id}/original.png`,gray:`/assets/photos/${id}/gray.png`,subject:`/assets/photos/${id}/subject.png`,blue:`/assets/photos/${id}/blue.png`,accents:`/assets/photos/${id}/accents.png`,accentLabels:processing.accentPixelCount?plan.accents.map(a=>a.label):[],accentPixelCount:processing.accentPixelCount,coverStyleVersion:3,sourceWidth:meta.width,sourceHeight:meta.height,subjectWidth:meta.width,subjectHeight:meta.height};
}
const contentCache=new Map();
export async function withContentBounds(photo,root){
  if(!contentCache.has(photo.id))contentCache.set(photo.id,(async()=>{
    const file=path.join(root,'data','photos',photo.id,'original.png');
    const meta=await sharp(file).metadata();
    const {info}=await sharp(file).trim({background:'#ffffff',threshold:10}).png().toBuffer({resolveWithObject:true});
    return {sourceWidth:meta.width,sourceHeight:meta.height,contentBounds:{x:-(info.trimOffsetLeft||0),y:-(info.trimOffsetTop||0),width:info.width,height:info.height}};
  })().catch(()=>({})));
  return {...photo,...await contentCache.get(photo.id)};
}
export async function ensureNoise(root) {
  const filename=path.join(root,'data','editorial-grain.png');
  try {await fs.access(filename);return;}catch{}
  const bytes=Buffer.alloc(1080*1350*4);let seed=7;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  // Soft paper fibres, uneven ink deposition and fine grain rather than uniform confetti.
  const coarse=Array.from({length:44*55},()=>random());
  for(let y=0;y<1350;y++)for(let x=0;x<1080;x++){
    const i=(y*1080+x)*4,cell=coarse[Math.floor(y/25)*44+Math.floor(x/25)];
    const fibre=(Math.sin(y*.75+x*.015)+1)*3,grain=random();
    const pale=grain>.94;bytes[i]=bytes[i+1]=bytes[i+2]=pale?235:0;
    bytes[i+3]=Math.round(pale?12:grain<.12?30+cell*25:grain<.58?5+cell*10+fibre:0);
  }
  await sharp(bytes,{raw:{width:1080,height:1350,channels:4}}).png().toFile(filename);
}
