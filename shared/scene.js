import {bodyTemplate,ENDING_TEMPLATE,templateUrl} from './templates.js';
import {photoRoles,coverFit} from './photos.js';
import {LOGO_PATH,LOGO_TEXT,logoBoxFor,logoTransform} from './logo.js';
import {SPEC,bodyLayoutSpec} from './spec.js';
export const WIDTH=SPEC.canvas.width, HEIGHT=SPEC.canvas.height;
const {ink:INK,paper:PAPER,blue:BLUE,light:LIGHT}=SPEC.colors,{margin:MARGIN,contentWidth:CONTENT_WIDTH}=SPEC.canvas;
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
const logo=(x,y,size,color,boxWidth=200)=>text('D.one',LOGO_TEXT,x,y,boxWidth,size,color,700,undefined,100,'Editorial Serif');
function header(nodes,color) {const {logoY,logoSize}=SPEC.body.header;nodes.push(logo(MARGIN,logoY,logoSize,color));}
function footer(nodes,color) {
  const {ruleY,ruleOpacity,logoY,logoSize}=SPEC.body.footer;
  nodes.push(rect('Footer line',MARGIN,ruleY,CONTENT_WIDTH,1,color,{opacity:ruleOpacity}));nodes.push(logo(MARGIN,logoY,logoSize,color));
}
function coverTitleAndLogo(nodes,title,measure) {
  const spec=SPEC.cover.title;
  const node=text('Cover title',title,MARGIN,spec.minY,CONTENT_WIDTH,spec.fontSize,LIGHT,spec.fontWeight,measure,spec.maxHeight,spec.fontFamily);
  node.lineHeight=spec.lineHeight;node.height=node.text.split('\n').length*node.lineHeight;
  node.overflow=node.height>spec.maxHeight;
  node.y=Math.max(spec.minY,Math.min(spec.maxY,spec.bottomY-node.height));
  nodes.push(node);
  const {fontSize,gapBelowTitle,hangulDescent}=SPEC.cover.logo;
  const lastBaseline=node.y+node.fontSize+node.height-node.lineHeight;
  const box=logoBoxFor(WIDTH/2,lastBaseline+hangulDescent+gapBelowTitle,fontSize);
  nodes.push(logo(box.x,box.y,fontSize,LIGHT,152));
}

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
  const {gradient}=SPEC.cover;
  coverNodes.push(rect('Title gradient',0,gradient.y,WIDTH,gradient.height,'gradient',{gradientStops:gradient.stops}));
  if(asset){
    coverNodes.push({...img('Dry ink and paper grain','/assets/cover-grain.png',0,0,WIDTH,HEIGHT),opacity:SPEC.cover.grainOpacity});
  }
  coverTitleAndLogo(coverNodes,draft.title,measure);
  scenes.push({id:'cover',name:'01 · 표지',kind:'cover',width:WIDTH,height:HEIGHT,nodes:coverNodes});
  draft.cards.forEach((card,i)=>{
    const template=bodyTemplate(i),layout=card.layoutOverride||template.layout;
    const photo=card.photoAssigned?bodyPhotos.find(a=>a.id===card.photoId):bodyPhotos.find(a=>a.id===card.photoId)||bodyPhotos[i];
    const paper=layout.startsWith('paper');const color=paper?INK:LIGHT;
    const spec=bodyLayoutSpec(layout),{photoHeight}=SPEC.body;
    const nodes=[rect('Background',0,0,WIDTH,HEIGHT,paper?PAPER:INK)];
    const overlay=layout==='photo-overlay';const top=layout.endsWith('top');
    if(photo){
      const slot={x:0,y:overlay||top?0:HEIGHT-photoHeight,width:WIDTH,height:overlay?HEIGHT:photoHeight};
      const [px,py,pw,ph]=coverFit(photo,slot.width,slot.height,card.photoPosition);
      nodes.push({...img('Article photo',photo.original,px,slot.y+py,pw,ph),clip:slot});
      nodes.push({...img('Dry ink and paper grain','/assets/editorial-grain.png',slot.x,slot.y,slot.width,slot.height),opacity:SPEC.body.grainOpacity,clip:slot});
    }
    if(overlay)nodes.push(rect('Photo shade',0,0,WIDTH,HEIGHT,'#000',{opacity:SPEC.body.overlayShadeOpacity}));
    const {title:titleSpec,text:textSpec,titleToBody}=SPEC.body;
    const headline=text('Card title',card.title,MARGIN,spec.titleY,CONTENT_WIDTH,titleSpec.fontSize,color,titleSpec.fontWeight,measure,titleSpec.maxHeight,titleSpec.fontFamily);nodes.push(headline);
    const bodyY=spec.titleY+headline.height+titleToBody;
    const body=text('Card body',card.body,MARGIN,bodyY,CONTENT_WIDTH,textSpec.fontSize,color,textSpec.fontWeight,measure,Math.max(0,spec.bodyLimit-bodyY),textSpec.fontFamily);nodes.push(body);
    if(spec.brand==='footer')footer(nodes,overlay?LIGHT:color);
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
