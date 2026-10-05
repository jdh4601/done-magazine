import {bodyTemplate,ENDING_TEMPLATE,templateUrl} from './templates.js';
import {photoRoles,coverFit} from './photos.js';
import {LOGO_PATH,LOGO_TEXT,logoBoxFor,logoTransform} from './logo.js';
export const WIDTH=1080, HEIGHT=1350;
const INK='#0A0A0A', PAPER='#EDEAE3', BLUE='#1712FF';
// Matches the Figma cover spec: linear #000 at 0% opacity → 100% opacity at the 62% stop.
const COVER_GRADIENT_STOPS=[{position:0,opacity:0},{position:0.62,opacity:1}];
const DEFAULT_MEASURE=(text,size)=>Array.from(text).reduce((sum,c)=>sum+(/\s/.test(c)?0.3:/[\u0000-\u007f]/.test(c)?0.54:1)*size,0);
export function wrapText(value,width,size,measure=DEFAULT_MEASURE) {
  const result=[];
  for(const paragraph of String(value || '').split('\n')) {
    if(!paragraph) {result.push('');continue;}
    let line='';
    for(const char of Array.from(paragraph)) {
      if(line && measure(line+char,size)>width) {
        const breakAt=line.lastIndexOf(' ');
        if(breakAt>line.length*0.35) { result.push(line.slice(0,breakAt));line=line.slice(breakAt+1)+char; }
        else {result.push(line);line=char.trimStart();}
      } else line+=char;
    }
    result.push(line.trimEnd());
  }
  return result;
}
function text(name,value,x,y,width,size,color,weight=400,measure,maxHeight=9999,font='Pretendard') {
  const lines=wrapText(value,width,size,measure?(v,s)=>measure(v,s,weight,font):undefined);
  const lineHeight=Math.round(size*1.45),height=lines.length*lineHeight;
  return {type:'text',name,text:lines.join('\n'),x,y,width,height,fontSize:size,lineHeight,color,fontFamily:font,fontWeight:weight,overflow:height>maxHeight};
}
const rect=(name,x,y,width,height,fill,extra={})=>({type:'rect',name,x,y,width,height,fill,...extra});
const img=(name,photo,x,y,width,height)=>({type:'image',name,src:photo,x,y,width,height});
// Photo-bottom pages: logo only (no rule), cap top at 80px to match the side margin.
function header(nodes,color) {nodes.push(text('D.one','D.one',80,72,200,26,color,700,undefined,50,'Editorial Serif'));}
function footer(nodes,color) {nodes.push(rect('Footer line',80,1248,920,1,color,{opacity:0.3}));nodes.push(text('D.one','D.one',80,1268,200,26,color,700,undefined,50,'Editorial Serif'));}

export function makeScenes(project,assets=[],variant=0,measure=DEFAULT_MEASURE) {
  if(!project?.draft)return [];
  const scenes=[]; const {draft}=project;
  const {cover:asset,body:bodyPhotos}=photoRoles(project,assets);
  const base=coverFit(asset,WIDTH,HEIGHT,project.coverPhotoPosition);
  const cropVariants=[base,...[1.06,1.1].map(scale=>[(base[0]-540)*scale+540,(base[1]-675)*scale+675,base[2]*scale,base[3]*scale])];
  const crop=cropVariants[variant%3];
  const coverNodes=[rect('Background',0,0,WIDTH,HEIGHT,INK)];
  const originalCover=project.coverStyle==='original';
  if(asset&&originalCover)coverNodes.push(img('Original cover photo',asset.original,...crop));
  if(asset&&!originalCover) {
    coverNodes.push(img('Blue photographic background',asset.blue||asset.gray,...crop));
    if(!asset.blue)coverNodes.push(rect('Blue multiply',...crop,BLUE,{blend:'multiply'}));
    if(asset.accents)coverNodes.push(img('Orange secondary objects',asset.accents,...crop));
  }
  if(asset&&!originalCover&&asset.subject) {
    let [fx,fy,fw,fh]=asset.coverStyleVersion>=2?crop:[190,180,700,850];
    if(!(asset.coverStyleVersion>=2)){
      const ratio=asset.subjectWidth/asset.subjectHeight;
      if(fw/fh>ratio) {const newWidth=fh*ratio;fx+=(fw-newWidth)/2;fw=newWidth;} else {const newHeight=fw/ratio;fy+=fh-newHeight;fh=newHeight;}
    }
    coverNodes.push(img('Cutout subject',asset.subject,fx,fy,fw,fh));
  }
  coverNodes.push(rect('Title gradient',0,940,WIDTH,410,'gradient',{gradientStops:COVER_GRADIENT_STOPS}));
  if(!originalCover){
    coverNodes.push({...img('Dry ink and paper grain','/assets/editorial-grain.png',0,0,WIDTH,HEIGHT),opacity:.45});
  }
  const coverTitle=text('Cover title',draft.title,80,1030,920,90,'#fff',800,measure,350);
  coverTitle.lineHeight=108;coverTitle.height=coverTitle.text.split('\n').length*coverTitle.lineHeight;
  coverTitle.overflow=coverTitle.height>350;
  coverTitle.y=Math.max(880,Math.min(1050,1290-coverTitle.height))-40;
  coverNodes.push(coverTitle);
  // Hangul in Pretendard ExtraBold 90px ends ~8px below the baseline; the logo sits 50px under that.
  const titleBottom=coverTitle.y+coverTitle.fontSize+(coverTitle.height-coverTitle.lineHeight)+8;
  const logoBox=logoBoxFor(WIDTH/2,titleBottom+50,36);
  coverNodes.push(text('D.one','D.one',logoBox.x,logoBox.y,152,36,'#fff',700,undefined,100,'Editorial Serif'));
  scenes.push({id:'cover',name:'01 · 표지',kind:'cover',width:WIDTH,height:HEIGHT,nodes:coverNodes});
  draft.cards.forEach((card,i)=>{
    const template=bodyTemplate(i),layout=card.layoutOverride||template.layout;
    const photo=card.photoAssigned?bodyPhotos.find(a=>a.id===card.photoId):bodyPhotos.find(a=>a.id===card.photoId)||bodyPhotos[i];
    const paper=layout.startsWith('paper');const color=paper?INK:'#fff';
    const nodes=[rect('Background',0,0,WIDTH,HEIGHT,paper?PAPER:INK)];
    const overlay=layout==='photo-overlay';const top=layout.endsWith('top');
    if(photo){
      const slot={x:0,y:overlay?0:top?0:675,width:WIDTH,height:overlay?HEIGHT:675};
      const [px,py,pw,ph]=coverFit(photo,slot.width,slot.height,card.photoPosition);
      nodes.push({...img('Article photo',photo.gray,px,slot.y+py,pw,ph),clip:slot});
    }
    if(overlay)nodes.push(rect('Photo shade',0,0,WIDTH,HEIGHT,'#000',{opacity:0.76}));
    let y=overlay?365:top?750:174;
    const headline=text('Card title',card.title,80,y,920,55,color,700,measure,160);nodes.push(headline);
    const bodyY=y+headline.height+64;
    const body=text('Card body',card.body,80,bodyY,920,30,color,400,measure,Math.max(0,(overlay?1190:top?1225:645)-bodyY));nodes.push(body);
    if(overlay||top)footer(nodes,overlay?'#fff':color);
    else header(nodes,color);
    scenes.push({id:card.id,name:`${String(i+2).padStart(2,'0')} · ${card.title}`,kind:'article',templateFile:card.templateOverride||template.file,layout,width:WIDTH,height:HEIGHT,nodes});
  });
  const end=[img('Original ending template',templateUrl(ENDING_TEMPLATE),0,0,WIDTH,HEIGHT)];
  scenes.push({id:'ending',name:`${String(scenes.length+1).padStart(2,'0')} · 엔딩`,kind:'ending',templateFile:ENDING_TEMPLATE,width:WIDTH,height:HEIGHT,nodes:end});
  return scenes;
}
export function escapeXml(value) {return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
export function sceneSvg(scene,resolveImage=s=>s) {
  let content='';
  for(const [index,n] of scene.nodes.entries()) {
    const opacity=n.opacity??1; const rotation=n.rotation?` transform="rotate(${n.rotation} ${n.x} ${n.y})"`:'';
    if(n.type==='rect'||n.type==='ellipse') {
      const fill=n.fill==='gradient'?`url(#shade-${index})`:n.fill;
      if(n.fill==='gradient')content+=`<defs><linearGradient id="shade-${index}" x1="0" y1="0" x2="0" y2="1">${n.gradientStops.map(s=>`<stop offset="${s.position}" stop-color="#000" stop-opacity="${s.opacity}"/>`).join('')}</linearGradient></defs>`;
      const attrs=`fill="${escapeXml(fill)}" opacity="${opacity}"${rotation}${n.blend?' style="mix-blend-mode:multiply"':''}`;
      content+=n.type==='ellipse'?`<ellipse cx="${n.x+n.width/2}" cy="${n.y+n.height/2}" rx="${n.width/2}" ry="${n.height/2}" ${attrs}/>`:`<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" ${attrs}/>`;
    } else if(n.type==='image'){
      if(n.clip)content+=`<defs><clipPath id="photo-${index}"><rect x="${n.clip.x}" y="${n.clip.y}" width="${n.clip.width}" height="${n.clip.height}"/></clipPath></defs>`;
      content+=`<image href="${escapeXml(resolveImage(n.src))}" x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" opacity="${opacity}"${n.clip?` clip-path="url(#photo-${index})"`:''} preserveAspectRatio="xMidYMid slice"/>`;
    }
    else if(n.type==='text'&&n.fontFamily==='Editorial Serif'&&n.text===LOGO_TEXT) content+=`<path d="${LOGO_PATH}" fill="${escapeXml(n.color)}" transform="${logoTransform(n.x,n.y,n.fontSize)}" aria-label="${LOGO_TEXT}"/>`;
    else if(n.type==='text') content+=`<text x="${n.x}" y="${n.y}" fill="${escapeXml(n.color)}" font-family="${n.fontFamily==='Editorial Serif'?'Playfair Display':escapeXml(n.fontFamily)}" font-size="${n.fontSize}" font-weight="${n.fontWeight}">${n.text.split('\n').map((l,i)=>`<tspan x="${n.x}" y="${n.y+n.fontSize+i*n.lineHeight}">${escapeXml(l)}</tspan>`).join('')}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}">${content}</svg>`;
}
