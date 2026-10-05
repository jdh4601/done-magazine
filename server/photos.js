import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { run } from './process.js';

export async function processPhoto(file,root,id,progress) {
  const dir=path.join(root,'data','photos',id);await fs.mkdir(dir,{recursive:true});
  const normalized=path.join(dir,'original.png');
  await sharp(file.buffer,{limitInputPixels:45000000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).png().toFile(normalized);
  progress('흑백 대비와 사진 톤을 보정하고 있습니다');
  await sharp(normalized).grayscale().linear(1.55,-36).png().toFile(path.join(dir,'gray.png'));
  progress('사진에서 피사체를 분리하고 있습니다');
  await run(path.join(root,'.venv','bin','python'),[path.join(root,'server','cutout.py'),normalized,path.join(dir,'cutout.png')],{timeout:240000, cwd:root});
  await sharp(path.join(dir,'cutout.png')).grayscale().linear(1.35,-15).png().toFile(path.join(dir,'subject.png'));
  const meta=await sharp(path.join(dir,'subject.png')).metadata();
  return {id,name:file.originalname,original:`/assets/photos/${id}/original.png`,gray:`/assets/photos/${id}/gray.png`,subject:`/assets/photos/${id}/subject.png`,subjectWidth:meta.width,subjectHeight:meta.height};
}
export async function ensureNoise(root) {
  const filename=path.join(root,'data','noise.png');
  try {await fs.access(filename);return;}catch{}
  const bytes=Buffer.alloc(1080*1350*4);let seed=7;
  for(let i=0;i<bytes.length;i+=4) {seed=(Math.imul(seed,1664525)+1013904223)>>>0;const a=seed%100<30?60+(seed%65):0;bytes[i]=0;bytes[i+1]=0;bytes[i+2]=0;bytes[i+3]=a;}
  await sharp(bytes,{raw:{width:1080,height:1350,channels:4}}).png().toFile(filename);
}
