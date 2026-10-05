import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { run } from './process.js';
import { analyzePhoto } from './codex.js';

export async function processPhoto(file,root,id,progress) {
  const dir=path.join(root,'data','photos',id);await fs.mkdir(dir,{recursive:true});
  const normalized=path.join(dir,'original.png');
  await sharp(file.buffer,{limitInputPixels:45000000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).png().toFile(normalized);
  progress('흑백 대비와 사진 톤을 보정하고 있습니다');
  await sharp(normalized).grayscale().linear(1.55,-36).png().toFile(path.join(dir,'gray.png'));
  progress('Codex가 주 피사체와 강조할 주변 요소를 찾고 있습니다');
  const plan=await analyzePhoto(normalized,dir);
  await fs.writeFile(path.join(dir,'plan.json'),JSON.stringify(plan));
  progress('피사체를 흑백으로 분리하고 주변 요소에 주황색을 입히고 있습니다');
  await run(path.join(root,'.venv','bin','python'),[path.join(root,'server','editorial_photo.py'),normalized,dir,path.join(dir,'plan.json')],{timeout:240000, cwd:root});
  const meta=await sharp(path.join(dir,'subject.png')).metadata();
  return {id,name:file.originalname,original:`/assets/photos/${id}/original.png`,gray:`/assets/photos/${id}/gray.png`,subject:`/assets/photos/${id}/subject.png`,blue:`/assets/photos/${id}/blue.png`,accents:`/assets/photos/${id}/accents.png`,accentLabels:plan.accents.map(a=>a.label),coverStyleVersion:2,subjectWidth:meta.width,subjectHeight:meta.height};
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
