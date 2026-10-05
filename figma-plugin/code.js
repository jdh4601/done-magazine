figma.showUI(__html__,{width:380,height:320});
function color(hex){const s=hex.replace('#','');return {r:parseInt(s.slice(0,2),16)/255,g:parseInt(s.slice(2,4),16)/255,b:parseInt(s.slice(4,6),16)/255};}
let importing=false;
figma.ui.onmessage=async(message)=>{
  if(message.type!=='import'||importing)return;
  importing=true;const created=[];
  try{
    const doc=message.document;
    if(doc.version!==1||!Array.isArray(doc.scenes)||!doc.scenes.length||doc.scenes.length>32)throw new Error('D.one에서 내보낸 .done.json 파일을 선택하세요.');
    const fonts=await figma.listAvailableFontsAsync();
    const requested=new Map();
    for(const scene of doc.scenes)for(const n of scene.nodes)if(n.type==='text'){
      const family=n.fontFamily==='Editorial Serif'?'Playfair Display':n.fontFamily;
      const choices=fonts.filter(f=>f.fontName.family===family);
      const style=n.fontWeight>=800?'ExtraBold':n.fontWeight>=600?'Bold':'Regular';
      const preferred=choices.find(f=>f.fontName.style.replace(/\s/g,'')===style);
      if(!preferred)throw new Error(`${family} ${style} 글꼴을 설치하고 Figma를 다시 실행하세요. 웹 앱의 README를 확인해 주세요.`);
      const key=`${family}-${n.fontWeight}`;requested.set(key,preferred.fontName);
    }
    for(const font of requested.values())await figma.loadFontAsync(font);
    const hashes={};for(const [key,value] of Object.entries(doc.assets))hashes[key]=figma.createImage(figma.base64Decode(value)).hash;
    let offset=Math.max(0,...figma.currentPage.children.map(n=>n.x+n.width))+160;
    for(let i=0;i<doc.scenes.length;i++){
      const scene=doc.scenes[i];const frame=figma.createFrame();created.push(frame);frame.name=scene.name;frame.resize(1080,1350);frame.clipsContent=true;frame.x=offset+i*1200;frame.y=0;frame.fills=[];
      for(const n of scene.nodes){
        let node;
        if(n.type==='text'){
          node=figma.createText();const family=n.fontFamily==='Editorial Serif'?'Playfair Display':n.fontFamily;node.fontName=requested.get(`${family}-${n.fontWeight}`);node.fontSize=n.fontSize;node.lineHeight={unit:'PIXELS',value:n.lineHeight};node.characters=n.text;node.textAutoResize='HEIGHT';node.resize(n.width,Math.max(1,n.height));node.fills=[{type:'SOLID',color:color(n.color)}];
        }else{
          node=n.type==='ellipse'?figma.createEllipse():figma.createRectangle();node.resize(n.width,n.height);
          if(n.type==='image')node.fills=[{type:'IMAGE',imageHash:hashes[n.src],scaleMode:'FILL'}];
          else if(n.fill==='gradient')node.fills=[{type:'GRADIENT_LINEAR',gradientTransform:[[0,1,0],[1,0,0]],gradientStops:n.gradientStops.map(s=>({position:s.position,color:{r:0,g:0,b:0,a:s.opacity}}))}];
          else node.fills=[{type:'SOLID',color:color(n.fill)}];
        }
        if(n.clip){
          const viewport=figma.createFrame();viewport.name=n.name+' crop';viewport.resize(n.clip.width,n.clip.height);viewport.clipsContent=true;viewport.fills=[];frame.appendChild(viewport);viewport.x=n.clip.x;viewport.y=n.clip.y;viewport.appendChild(node);node.x=n.x-n.clip.x;node.y=n.y-n.clip.y;
        }else{frame.appendChild(node);node.x=n.x;node.y=n.y;}
        node.name=n.name;node.opacity=n.opacity===undefined?1:n.opacity;if(n.blend)node.blendMode='MULTIPLY';if(n.rotation)node.rotation=-n.rotation;
      }
      figma.ui.postMessage({type:'progress',message:`${i+1}/${doc.scenes.length} 페이지 생성`});
    }
    figma.currentPage.selection=created;figma.viewport.scrollAndZoomIntoView(created);figma.ui.postMessage({type:'complete',message:`${created.length}장을 가져왔습니다. 텍스트·사진·도형은 별도 레이어입니다.`});
  }catch(error){for(const frame of created)if(!frame.removed)frame.remove();figma.ui.postMessage({type:'error',message:error.message});}
  finally{importing=false;}
};
