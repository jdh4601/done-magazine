import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowUpRight,ArrowRight,Plus,Upload,Download,Check,LoaderCircle,ChevronLeft,ChevronRight,FileText,Layers,History,X,ExternalLink,Image as ImageIcon,RefreshCw,Trash2} from 'lucide-react';
import {makeScenes,sceneSvg} from '../shared/scene.js';
import {photoRoles,MAX_COVER_PHOTOS,selectCoverPhoto} from '../shared/photos.js';
import {deletePage} from '../shared/pages.js';
import './style.css';

async function api(url,options={}) {
  const response=await fetch(url,options);const result=await response.json();if(!response.ok)throw new Error(result.error || '요청을 처리하지 못했습니다.');return result;
}
const json=value=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
const time=start=>{if(start==null)return '시점 정보 없음';const h=Math.floor(start/3600),m=Math.floor(start%3600/60),s=Math.floor(start%60);return `${h?`${h}:`:''}${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;};
const TEMPLATE_CHOICES=[['photo-overlay','#2.jpg','사진 배경형'],['dark-top','#3.jpg','사진 위'],['dark-bottom','#4.jpg','사진 아래']];
const pageNames={'dark-top':'사진 위 · 검정','dark-bottom':'사진 아래 · 검정','paper-top':'사진 위 · 종이색','paper-bottom':'사진 아래 · 종이색','photo-overlay':'사진 배경'};
function App(){
  const [status,setStatus]=useState(null),[url,setUrl]=useState(''),[blogUrl,setBlogUrl]=useState(''),[sourceType,setSourceType]=useState('video'),[sourceExpanded,setSourceExpanded]=useState(true),[angle,setAngle]=useState(''),[sourceTitle,setSourceTitle]=useState(''),[transcript,setTranscript]=useState('');
  const [coverPhotoId,setCoverPhotoId]=useState(null),[coverStyle,setCoverStyle]=useState('editorial'),[provider,setProvider]=useState('codex'),[photos,setPhotos]=useState([]),[project,setProject]=useState(null),[selected,setSelected]=useState(0),[templateCardId,setTemplateCardId]=useState(null);
  const [busy,setBusy]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[saved,setSaved]=useState(''),[history,setHistory]=useState(null),[fontReady,setFontReady]=useState(0),[variants,setVariants]=useState(false),[exporting,setExporting]=useState(false),[dragged,setDragged]=useState(null),[dropTarget,setDropTarget]=useState(null),[coverDragging,setCoverDragging]=useState(false),[photoPreview,setPhotoPreview]=useState(null);
  const photoInput=useRef(),coverReplaceInput=useRef(),coverReplaceTarget=useRef(null),bodyPhotoInput=useRef(),pagePhotoInput=useRef(),transcriptInput=useRef(),saveQueue=useRef(Promise.resolve()),loaded=useRef(null);
  useEffect(()=>{api('/api/status').then(setStatus).catch(e=>setError(e.message));Promise.all([400,700,800].map(weight=>document.fonts.load(`${weight} 30px Pretendard`))).then(()=>document.fonts.ready).then(()=>setFontReady(1));},[]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),6000);return()=>clearTimeout(t);},[notice]);
  const measure=useMemo(()=>{const context=document.createElement('canvas').getContext('2d');return (value,size,weight=400,family='Pretendard')=>{context.font=`${weight} ${size}px "${family}"`;return context.measureText(value).width;};},[fontReady]);
  const scenes=useMemo(()=>{
    const preview=photoPreview&&project?{...project,photos:[...project.photos,photoPreview.photo],draft:{...project.draft,cards:project.draft.cards.map(c=>c.id===photoPreview.cardId?{...c,photoAssigned:true,photoId:photoPreview.photo.id,photoPosition:{x:0,y:0,zoom:1}}:c)}}:project;
    return makeScenes(preview,preview?.photos||photos,preview?.coverVariant||0,measure);
  },[project,photos,measure,photoPreview]);
  const {cover:coverPhoto,covers:coverPhotos,body:bodyPhotos}=photoRoles(project||{coverPhotoId},photos);
  const coverPreviews=useMemo(()=>coverPhotos.map(photo=>makeScenes({...(project||{}),coverPhotoId:photo.id,coverPhotoPosition:photo.id===coverPhoto?.id?project?.coverPhotoPosition:photo.coverPhotoPosition||{},coverStyle:project?.coverStyle||coverStyle,draft:{title:project?.draft.title||'썸네일 미리보기',cards:[]}},photos,photo.id===coverPhoto?.id?project?.coverVariant||0:photo.coverVariant||0,measure)[0]),[project,photos,coverPhoto?.id,coverStyle,measure]);
  const sourceReady=!!(sourceType==='text'?transcript.trim():sourceType==='blog'?blogUrl.trim():url.trim());
  const generationReady=sourceReady&&!!coverPhoto;
  const assignedPhotoCount=scenes.slice(1,-1).filter(s=>s.nodes.some(n=>n.name==='Article photo')).length;
  const scene=scenes[selected]||scenes[0];const card=selected>0&&selected<scenes.length-1?project?.draft.cards[selected-1]:null;
  useEffect(()=>{
    if(!project)return;if(loaded.current===project){loaded.current=null;return;}
    setSaved('저장 중');const t=setTimeout(()=>{
      saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>api(`/api/projects/${project.id}`,{...json(project),method:'PUT'})).then(()=>setSaved('저장됨')).catch(e=>{setSaved('저장 실패');setError(e.message);});
    },700);return()=>clearTimeout(t);
  },[project]);
  function updateDraft(field,value){setProject(p=>({...p,draft:{...p.draft,[field]:value}}));}
  function updateCard(field,value){setProject(p=>({...p,draft:{...p.draft,cards:p.draft.cards.map((c,i)=>i===selected-1?{...c,[field]:value,manuallyEdited:true}:c)}}));}
  function pinPages(p){
    const current=makeScenes(p,p.photos,p.coverVariant||0,measure);
    return p.draft.cards.map((c,i)=>{
      const page=current[i+1],src=page.nodes.find(n=>n.name==='Article photo')?.src;
      return {...c,layoutOverride:page.layout,templateOverride:page.templateFile,photoAssigned:true,photoId:src?p.photos.find(photo=>photo.original===src)?.id||null:null};
    });
  }
  useEffect(()=>{document.querySelector('.page-thumb.selected')?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});},[selected,project?.draft.cards]);
  function goToPage(index){
    if(!project||index<0||index>=scenes.length)return;
    setSelected(index);setVariants(false);
  }
  useEffect(()=>{
    function onKey(e){
      if(!project||e.altKey||e.metaKey||e.ctrlKey||!['ArrowLeft','ArrowRight'].includes(e.key))return;
      if(e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
      e.preventDefault();goToPage(selected+(e.key==='ArrowRight'?1:-1));
    }
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  });
  function movePage(id,target){
    if(!project||busy||exporting)return;
    const cards=pinPages(project),from=cards.findIndex(c=>c.id===id);
    if(from<0||target<0||target>=cards.length||from===target)return;
    const [moved]=cards.splice(from,1);cards.splice(target,0,moved);
    setProject(p=>({...p,draft:{...p.draft,cards}}));setSelected(target+1);setVariants(false);setDragged(null);
  }
  function addPage(){
    if(!project||busy||exporting||project.draft.cards.length>=30)return;
    const cards=pinPages(project);
    cards.push({id:crypto.randomUUID(),title:'새 페이지 제목',body:'',layout:'photo-overlay',layoutOverride:'photo-overlay',templateOverride:'#2.jpg',photoAssigned:true,photoId:null,addedByUser:true});
    setProject(p=>({...p,draft:{...p.draft,cards}}));setSelected(cards.length);setVariants(false);setTemplateCardId(cards.at(-1).id);
    setNotice('본문 페이지를 추가했습니다. 오른쪽에서 템플릿과 내용을 선택하세요.');
  }
  function removePage(id){
    if(!project||busy||exporting)return;
    const result=deletePage(pinPages(project),id);
    if(!result)return;
    setProject(p=>({...p,draft:{...p.draft,cards:result.cards}}));setSelected(result.selected);setVariants(false);setDragged(null);
    setNotice('본문 페이지를 삭제했습니다.');
  }
  function chooseLayout(layout,file){
    setProject(p=>({...p,draft:{...p.draft,cards:p.draft.cards.map((c,i)=>i===selected-1?{...c,layoutOverride:layout,templateOverride:file}:c)}}));setTemplateCardId(null);
  }
  async function watch(id,label){
    for(;;){const state=await api(`/api/jobs/${id}`);setBusy({label,message:state.message});if(state.status==='failed')throw new Error(state.error);if(state.status==='complete')return state.result;await new Promise(r=>setTimeout(r,label.includes('사진')?250:1500));}
  }
  async function addPhotos(files,role='cover',replaceId=null){
    if(!files.length||busy||exporting)return;
    if(role==='cover'&&replaceId&&(!coverPhotos.some(p=>p.id===replaceId)||files.length!==1)){setError('교체할 썸네일 사진 한 장을 선택하세요.');return;}
    if(role==='cover'&&!replaceId&&files.length+coverPhotos.length>MAX_COVER_PHOTOS){setError('썸네일 표지 사진은 최대 3장까지 준비할 수 있습니다. 기존 후보를 삭제한 뒤 추가하세요.');return;}
    if(role==='body'&&files.length>16){setError('본문 사진은 한 번에 16장까지 선택하세요.');return;}
    if(files.some(file=>!['image/jpeg','image/png','image/webp'].includes(file.type))){setError('JPG, PNG, WebP 사진을 선택하세요.');return;}
    if(files.some(file=>file.size>15*1024*1024)){setError('사진당 15MB 이하로 선택하세요.');return;}
    setError('');setBusy({label:role==='cover'?'표지 사진 준비':'본문 사진 준비',message:'사진을 업로드하고 있습니다'});
    try{
      const form=new FormData();form.append('role',role);form.append('provider',project?.provider||provider);form.append('coverStyle',project?.coverStyle||coverStyle);for(const file of files)form.append('photos',file);
      const {jobId}=await api('/api/photos',{method:'POST',body:form});const prepared=await watch(jobId,'사진 준비');
      const next=role==='cover'?[...(replaceId?coverPhotos.map(p=>p.id===replaceId?prepared[0]:p):[...coverPhotos,...prepared]),...bodyPhotos.map(p=>({...p,role:'body'}))]:[...coverPhotos.map(p=>({...p,role:'cover'})),...prepared];
      const nextCoverId=replaceId===coverPhoto?.id?prepared[0].id:coverPhoto?.id;
      const roles=photoRoles({coverPhotoId:nextCoverId},next);setPhotos(next);setCoverPhotoId(roles.cover?.id||null);
      if(project)setProject(p=>({...p,photos:next,coverPhotoId:roles.cover?.id||null,...(replaceId===coverPhoto?.id?{coverPhotoPosition:{x:0,y:0,zoom:1}}:{}),...(role==='body'?{draft:{...p.draft,cards:pinPages(p).map((c,i)=>({...c,photoAssigned:true,photoId:roles.body[i]?.id||null,photoPosition:{x:0,y:0,zoom:1}}))}}:{})}));
      setNotice(role==='cover'?replaceId?'썸네일 사진을 교체했습니다.':`썸네일 후보 ${prepared.length}장을 준비했습니다.`:`본문 사진 ${prepared.length}장을 2페이지부터 순서대로 배치했습니다.`);
    }catch(e){setError(e.message);}finally{setBusy(null);if(photoInput.current)photoInput.current.value='';if(coverReplaceInput.current)coverReplaceInput.current.value='';if(bodyPhotoInput.current)bodyPhotoInput.current.value='';}
  }
  function coverDragOver(e){
    if(![...e.dataTransfer.types].includes('Files'))return;
    e.preventDefault();e.stopPropagation();
    e.dataTransfer.dropEffect=busy||exporting||coverPhotos.length>=MAX_COVER_PHOTOS?'none':'copy';
    setCoverDragging(!busy&&!exporting);
  }
  function coverDrop(e){
    e.preventDefault();e.stopPropagation();setCoverDragging(false);
    addPhotos([...e.dataTransfer.files],'cover');
  }
  function coverPhotoEditor(){return <section className={`cover-upload ${coverDragging?'drag-active':''}`} aria-label="썸네일 사진 드롭 영역" onDragEnter={coverDragOver} onDragOver={coverDragOver} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setCoverDragging(false);}} onDrop={coverDrop}><div className="photo-heading"><span className="eyebrow">THUMBNAIL PHOTOS</span><span>{coverPhotos.length}/{MAX_COVER_PHOTOS}</span></div>
        <div className="template-picker cover-style-picker"><span className="field-caption">표지 사진 스타일</span>{[['editorial','D.one 스타일'],['original','원본 이미지']].map(([value,label])=><button key={value} className={(project?.coverStyle||coverStyle)===value?'selected':''} aria-pressed={(project?.coverStyle||coverStyle)===value} disabled={!!busy||exporting} onClick={()=>chooseCoverStyle(value)}>{label}</button>)}</div>
        <button className="upload-zone" onClick={()=>photoInput.current.click()} disabled={!!busy||exporting||coverPhotos.length>=MAX_COVER_PHOTOS}><Plus size={22}/><strong>{coverPhotos.length?'썸네일 후보 추가':'썸네일 사진 최대 3장 선택'}</strong><span>사진을 여기로 드래그하거나 클릭하세요<br/>최대 3장 · JPG · PNG · WebP</span></button>
        {!!coverPhotos.length&&<div className="cover-candidates" aria-label="썸네일 사진 후보">{coverPhotos.map((photo,i)=><div key={photo.id} className={`cover-candidate ${dropTarget===`cover-${photo.id}`?'photo-drop-active':''}`} onDragOver={e=>{if([...e.dataTransfer.types].includes('Files')){e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect=busy||exporting?'none':'copy';if(!busy&&!exporting)setDropTarget(`cover-${photo.id}`);}}} onDragLeave={()=>setDropTarget(null)} onDrop={e=>{e.preventDefault();e.stopPropagation();setDropTarget(null);setCoverDragging(false);addPhotos([...e.dataTransfer.files],'cover',photo.id);}}><button className={photo.id===coverPhoto?.id?'selected':''} aria-label={`썸네일 후보 ${i+1} 선택`} aria-pressed={photo.id===coverPhoto?.id} disabled={!!busy||exporting} onClick={()=>chooseCoverPhoto(photo.id)}><div className="cover-candidate-art" dangerouslySetInnerHTML={{__html:sceneSvg(coverPreviews[i])}}/><span>{photo.id===coverPhoto?.id?<><Check size={12}/>선택됨</>:`후보 ${i+1}`}</span></button><button className="cover-candidate-replace" aria-label={`썸네일 후보 ${i+1} 사진 교체`} disabled={!!busy||exporting} onClick={()=>{coverReplaceTarget.current=photo.id;coverReplaceInput.current.click();}}>사진 교체</button><button className="cover-candidate-remove" aria-label={`썸네일 후보 ${i+1} 삭제`} disabled={!!busy||exporting} onClick={()=>removeCoverPhoto(photo.id)}><X size={13}/></button></div>)}</div>}
        <p className="hint">후보를 선택해 표지를 편집하세요. 사진 교체를 누르거나 후보 위에 파일 한 장을 놓으면 교체됩니다.</p>
        <p className="hint">{(project?.coverStyle||coverStyle)==='original'?'원본 색상에 노이즈 질감을 더합니다. 제목과 로고는 유지됩니다.':'흑백 피사체 · 강렬한 파랑 · 거친 인쇄 질감 · 주변 요소의 주황색'}</p>
        {coverPhoto&&(project?.coverStyle||coverStyle)!=='original'&&<button className="text-button" onClick={restylePhotos} disabled={!!busy}><RefreshCw size={13}/>표지 다시 디자인</button>}
        {coverDragging&&<div className="cover-drop-overlay" role="status"><Upload size={24}/><strong>{coverPhotos.length>=MAX_COVER_PHOTOS?'최대 3장입니다. 후보를 삭제한 뒤 추가하세요':`여기에 놓으면 썸네일 후보로 추가됩니다 (${MAX_COVER_PHOTOS-coverPhotos.length}장까지)`}</strong></div>}
        </section>;}
  function chooseCoverPhoto(id){
    if(busy||exporting||!coverPhotos.some(p=>p.id===id))return;
    setCoverPhotoId(id);setSelected(0);setVariants(false);
    if(project){const next=selectCoverPhoto(project,id);setPhotos(next.photos);setProject(next);}
  }
  function removeCoverPhoto(id){
    if(busy||exporting)return;
    const next=photos.filter(p=>p.id!==id),nextId=id===coverPhoto?.id?photoRoles(null,next).cover?.id||null:coverPhoto?.id;
    setPhotos(next);setCoverPhotoId(nextId);
    if(project)setProject(p=>({...p,photos:next,coverPhotoId:nextId,...(id===coverPhoto?.id?{coverPhotoPosition:{x:0,y:0,zoom:1}}:{})}));
  }
  async function replacePagePhoto(file,targetId=card?.id){
    if(!file||!project?.draft.cards.some(c=>c.id===targetId)||busy||exporting)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setError('JPG, PNG, WebP 사진을 선택하세요.');return;}
    if(file.size>15*1024*1024){setError('사진당 15MB 이하로 선택하세요.');return;}
    const previewUrl=URL.createObjectURL(file);
    setPhotoPreview({cardId:targetId,photo:{id:'preview',role:'body',original:previewUrl}});
    setSelected(project.draft.cards.findIndex(c=>c.id===targetId)+1);setVariants(false);
    setError('');setBusy({label:'본문 사진 교체',message:'사진을 준비하고 있습니다'});
    try{
      const form=new FormData();form.append('role','body');form.append('provider',project?.provider||provider);form.append('photos',file);
      const {jobId}=await api('/api/photos',{method:'POST',body:form});const [photo]=await watch(jobId,'본문 사진 교체');
      const cards=pinPages(project);const oldId=cards.find(c=>c.id===targetId)?.photoId;
      const unused=oldId&&!cards.some(c=>c.id!==targetId&&c.photoId===oldId);
      const next=[...photos.filter(p=>!unused||p.id!==oldId),photo];
      setPhotos(next);setProject(p=>({...p,photos:next,draft:{...p.draft,cards:pinPages(p).map(c=>c.id===targetId?{...c,photoId:photo.id,photoAssigned:true,photoPosition:{x:0,y:0,zoom:1}}:c)}}));
      setNotice('선택한 본문 페이지의 사진을 교체했습니다.');
    }catch(e){setError(e.message);}finally{setPhotoPreview(null);URL.revokeObjectURL(previewUrl);setBusy(null);if(pagePhotoInput.current)pagePhotoInput.current.value='';}
  }
  function photoDragOver(e,targetId){
    if(!targetId||busy||exporting)return;
    if([...e.dataTransfer.types].some(type=>type==='Files'||type==='application/x-done-photo')){
      e.preventDefault();e.dataTransfer.dropEffect='copy';setDropTarget(targetId);
    }
  }
  function photoDrop(e,targetId){
    e.preventDefault();e.stopPropagation();setDropTarget(null);
    if(!targetId||busy||exporting)return;
    const files=[...e.dataTransfer.files];
    if(files.length){
      if(files.length!==1){setError('페이지마다 사진 한 장을 놓아 주세요.');return;}
      replacePagePhoto(files[0],targetId);return;
    }
    const photo=bodyPhotos.find(p=>p.id===e.dataTransfer.getData('application/x-done-photo'));
    if(!photo)return;
    setProject(p=>({...p,draft:{...p.draft,cards:pinPages(p).map(c=>c.id===targetId?{...c,photoAssigned:true,photoId:photo.id,photoPosition:{x:0,y:0,zoom:1}}:c)}}));
    setSelected(project.draft.cards.findIndex(c=>c.id===targetId)+1);setVariants(false);
  }
  const position=selected===0?project?.coverPhotoPosition||{}:card?.photoPosition||{};
  const positionedPhoto=scene?.nodes.some(n=>n.name==='Article photo'||n.name==='Original cover photo'||n.name==='Blue photographic background');
  function setPhotoPosition(value){
    if(selected===0)setProject(p=>({...p,coverPhotoPosition:{...p.coverPhotoPosition,...value}}));
    else setProject(p=>({...p,draft:{...p.draft,cards:p.draft.cards.map((c,i)=>i===selected-1?{...c,photoPosition:{...c.photoPosition,...value}}:c)}}));
  }
  function photoControls(){return positionedPhoto&&<div className="photo-position"><span className="field-caption">사진 위치</span><label>좌우 <input aria-label="사진 좌우 위치" type="range" min="-100" max="100" value={position.x||0} onChange={e=>setPhotoPosition({x:Number(e.target.value)})} disabled={!!busy}/></label><label>상하 <input aria-label="사진 상하 위치" type="range" min="-100" max="100" value={position.y||0} onChange={e=>setPhotoPosition({y:Number(e.target.value)})} disabled={!!busy}/></label><label>확대 <input aria-label="사진 확대" type="range" min="1" max="2" step="0.01" value={position.zoom||1} onChange={e=>setPhotoPosition({zoom:Number(e.target.value)})} disabled={!!busy}/><small>{Math.round((position.zoom||1)*100)}%</small></label><button className="text-button" onClick={()=>setPhotoPosition({x:0,y:0,zoom:1})} disabled={!!busy}><RefreshCw size={12}/>위치 초기화</button><p className="hint">여유가 없는 방향은 조금 확대한 뒤 이동하세요.</p></div>;}
  async function generate(){
    if(busy||exporting)return;
    if(!generationReady){setError('원문 소스를 입력하고 썸네일 표지 사진을 선택하세요.');return;}
    setError('');setBusy({label:'매거진 생성',message:'원고 작성을 준비하고 있습니다'});
    try{const {jobId}=await api('/api/generate',json({sourceType,url:sourceType==='text'?'':sourceType==='blog'?blogUrl:url,angle,transcript:sourceType==='text'?transcript:'',title:sourceTitle,photos,coverPhotoId:coverPhoto?.id||null,coverStyle:project?.coverStyle||coverStyle,provider}));const p=await watch(jobId,'매거진 생성');loaded.current=p;setProject(p);setPhotos(p.photos);setProvider(p.provider||provider);setSelected(0);setVariants(false);setSourceExpanded(false);setSaved('저장됨');setNotice(`${p.draft.cards.length+2}장의 초안을 만들었습니다. 본문에 사진을 드래그해 넣으세요.`);}
    catch(e){setError(e.message);}finally{setBusy(null);}
  }
  async function createCaption(){
    if(!project||busy||exporting)return;
    const projectId=project.id;
    setError('');setBusy({label:'캡션 생성',message:'매거진 내용을 바탕으로 캡션을 준비하고 있습니다'});
    try {
      await saveQueue.current.catch(()=>{});
      await api(`/api/projects/${projectId}`,{...json(project),method:'PUT'});
      const {jobId}=await api('/api/caption',json({projectId,draft:project.draft,provider:project.provider||provider}));
      const {caption}=await watch(jobId,'캡션 생성');
      setProject(p=>p?.id===projectId?{...p,draft:{...p.draft,caption}}:p);
      setNotice('약 1,000자 캡션을 만들었습니다. 자유롭게 수정할 수 있습니다.');
    }catch(e){setError(e.message);}finally{setBusy(null);}
  }
  async function restylePhotos(){
    if(!coverPhoto)return;
    setError('');setBusy({label:'표지 다시 디자인',message:'사진 속 강조할 요소를 확인하고 있습니다'});
    try{
      const {jobId}=await api('/api/photos/restyle',json({photos:coverPhotos,provider:project?.provider||provider}));const updated=await watch(jobId,'표지 다시 디자인');
      const next=photos.map(p=>updated.find(photo=>photo.previousId===p.id)||p);
      const nextId=updated.find(p=>p.previousId===coverPhoto.id)?.id||coverPhoto.id;setPhotos(next);setCoverPhotoId(nextId);
      if(project)setProject(p=>({...p,photos:next,coverPhotoId:nextId}));
      setNotice('원고와 본문 사진을 유지하고 표지에 새 스타일을 적용했습니다.');return true;
    }catch(e){setError(e.message);return false;}finally{setBusy(null);}
  }
  async function chooseCoverStyle(style){
    if(busy||exporting)return;
    if(style==='editorial'&&coverPhotos.some(p=>!p.subject)){
      if(!await restylePhotos())return;
    }
    setCoverStyle(style);if(project)setProject(p=>({...p,coverStyle:style}));
  }
  async function exportFile(type,scope='all'){
    const single=scope==='selected';
    const pages=single?(scene?[scene]:[]):scenes;
    if(!pages.length)return;
    if(pages.some(s=>s.nodes.some(n=>n.overflow))){setError('내보낼 페이지에 들어가지 않는 텍스트가 있습니다. 내용을 줄여 주세요.');return;}
    setExporting(true);setError('');
    try{
      await saveQueue.current;
      const response=await fetch(`/api/export/${type}`,json({scenes:pages,single}));
      if(!response.ok)throw new Error((await response.json()).error);
      const name=single?`D.one-page-${String(selected+1).padStart(2,'0')}`:'D.one-magazine';
      download(await response.blob(),`${name}${type==='figma'?'.done.json':single?'.png':'.zip'}`);
      setNotice(type==='figma'?'Figma 플러그인에서 내려받은 .done.json 파일을 선택하세요.':single?`${selected+1}번 페이지를 PNG로 다운로드했습니다.`:'전체 페이지를 PNG로 다운로드했습니다.');
    }catch(e){setError(e.message);}finally{setExporting(false);}
  }
  async function loadProject(id){try{const p=await api(`/api/projects/${id}`);loaded.current=p;setProject(p);setProvider(p.provider||'codex');setPhotos(p.photos);setCoverPhotoId(p.coverPhotoId||null);setCoverStyle(p.coverStyle||'editorial');setSourceType(p.source.type||(p.source.mode==='blog'?'blog':p.source.mode==='manual'?'text':'video'));setUrl(p.source.type==='blog'||p.source.mode==='blog'?'':p.source.url||'');setBlogUrl(p.source.type==='blog'||p.source.mode==='blog'?p.source.url||'':'');setTranscript(p.source.mode==='manual'?p.source.segments.map(s=>s.start==null?s.text:`[${time(s.start)}] ${s.text}`).join('\n'):'');setSourceTitle(p.source.title||'');setSourceExpanded(false);setAngle(p.draft.angle);setSelected(0);setHistory(null);setSaved('저장됨');}catch(e){setError(e.message);}}
  async function clearWorkspace(){
    if(busy||exporting)return;
    setBusy({label:'비우기',message:'현재 프로젝트를 저장하고 작업 화면을 비우고 있습니다'});
    try{
      await saveQueue.current;
      if(project)await api(`/api/projects/${project.id}`,{...json(project),method:'PUT'});
      loaded.current=null;
      setProject(null);setPhotos([]);setCoverPhotoId(null);setUrl('');setBlogUrl('');setSourceType('video');setSourceExpanded(true);setAngle('');setSourceTitle('');setTranscript('');
      setCoverStyle('editorial');setSelected(0);setVariants(false);setHistory(null);setSaved('');setError('');
      if(photoInput.current)photoInput.current.value='';
      if(bodyPhotoInput.current)bodyPhotoInput.current.value='';
      if(transcriptInput.current)transcriptInput.current.value='';
      setNotice('작업 화면을 비웠습니다. 저장된 프로젝트는 유지됩니다.');
    }catch(e){setError(e.message);}finally{setBusy(null);}
  }
  async function showHistory(){try{setHistory(await api('/api/projects'));}catch(e){setError(e.message);}}
  return <div className="app">
    <input ref={photoInput} type="file" hidden multiple accept="image/jpeg,image/png,image/webp" onChange={e=>addPhotos([...e.target.files],'cover')}/>
    <input ref={coverReplaceInput} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={e=>addPhotos([...e.target.files],'cover',coverReplaceTarget.current)}/>
    <header className="topbar"><a className="wordmark" href="/">D.one<span>STUDIO</span></a><div className="top-center"><span className="local-dot"/>LOCAL WORKSPACE</div><div className="top-actions"><span className="saved">{saved&&<><Check size={13}/>{saved}</>}</span><button className="quiet" onClick={showHistory} disabled={!!busy}><History size={16}/>프로젝트</button><button className="quiet" onClick={clearWorkspace} disabled={!!busy||exporting||!(project||photos.length||url||blogUrl||angle||sourceTitle||transcript)}><Trash2 size={16}/>비우기</button></div></header>
    <div className={`workspace ${project?'has-project':'new-project'}`}>
      <main className="canvas-panel">
      <div className="canvas-toolbar"><div><span className="eyebrow">{project?'MAGAZINE DRAFT':'NEW MAGAZINE'}</span><h1>{project?sourceExpanded?'소스·사진 설정':selected===0?'표지':selected===scenes.length-1?'엔딩':`본문 ${selected}`:'매거진 만들기'}</h1></div><div className="canvas-tools">{project&&<button className={`quiet ${sourceExpanded?'chosen':''}`} aria-expanded={sourceExpanded} onClick={()=>setSourceExpanded(v=>!v)} disabled={!!busy}>{sourceExpanded?'캐러셀로 돌아가기':'소스·사진 설정'}</button>}{project&&<button className="quiet" disabled={!!busy||exporting} onClick={()=>{setSourceExpanded(false);setSelected(0);setVariants(false);}}>썸네일 편집</button>}{project&&!sourceExpanded&&selected===0&&<button className={`quiet ${variants?'chosen':''}`} onClick={()=>setVariants(v=>!v)}><Layers size={15}/>표지 후보</button>}{project&&<span className="dimension">1080 × 1350</span>}</div></div>
      {error&&<div className="error-banner" role="alert"><span>{error}</span><button aria-label="오류 닫기" onClick={()=>setError('')}><X size={16}/></button></div>}
      {sourceExpanded&&<section className="source-setup" aria-label="소스와 사진 설정"><div className="source-form-grid"><div className="source-fields">
        <div className="panel-head"><span className="eyebrow">01 / SOURCE</span><h2>소스 선택</h2></div>
        <div className="source-type-picker" role="group" aria-label="소스 유형">{[['video','영상 URL'],['blog','블로그 URL'],['text','직접 텍스트']].map(([value,label])=><button key={value} aria-pressed={sourceType===value} onClick={()=>setSourceType(value)} disabled={!!busy}>{label}</button>)}</div>
        {sourceType!=='text'&&<label className="field"><span>{sourceType==='video'?'YouTube 영상 URL':'블로그 글 URL'}</span><div className="input-wrap"><input aria-label={sourceType==='video'?'YouTube 영상 URL':'블로그 글 URL'} placeholder={sourceType==='video'?'https://youtube.com/watch?v=…':'https://blog.naver.com/… 또는 블로그 글 주소'} value={sourceType==='video'?url:blogUrl} onChange={e=>sourceType==='video'?setUrl(e.target.value):setBlogUrl(e.target.value)} disabled={!!busy}/><ArrowUpRight size={16}/></div><p className="hint">{sourceType==='video'?'영상의 자막을 가져옵니다.':'공개된 글의 본문을 가져옵니다. 가져올 수 없는 글은 직접 텍스트로 넣어 주세요.'}</p></label>}
        {sourceType==='text'&&<div className="manual-fields"><label className="field"><span>소스 제목 <small>선택</small></span><input aria-label="소스 제목" value={sourceTitle} onChange={e=>setSourceTitle(e.target.value)} placeholder="글이나 영상의 제목" disabled={!!busy}/></label><label className="field"><span>원문 텍스트</span><textarea aria-label="원문 텍스트" placeholder="글, 인터뷰, 메모 또는 자막을 붙여넣으세요." value={transcript} onChange={e=>setTranscript(e.target.value)} disabled={!!busy}/></label><button className="text-button" onClick={()=>transcriptInput.current.click()} disabled={!!busy}><Upload size={13}/>TXT / SRT / VTT 가져오기</button><input type="file" ref={transcriptInput} hidden accept=".txt,.srt,.vtt,.json3" onChange={async e=>{if(e.target.files[0])setTranscript(await e.target.files[0].text());e.target.value='';}}/></div>}
        <div className="provider-picker"><span className="field-caption">생성 CLI</span><div>{[['codex','Codex CLI'],['claude','Claude CLI']].map(([value,label])=><button type="button" key={value} className={provider===value?'selected':''} aria-pressed={provider===value} onClick={()=>setProvider(value)} disabled={!!busy}>{label}<small>{value==='claude'?status?.claudeLoggedIn?'연결됨':'로그인 필요':status?.loggedIn?'연결됨':'로그인 필요'}</small></button>)}</div></div>
        <label className="field angle-field"><span>기사 관점 <small>선택</small></span><textarea aria-label="기사 관점" value={angle} onChange={e=>setAngle(e.target.value)} disabled={!!busy} placeholder="예: 초기 창업가의 고객 인터뷰에 집중해줘"/><p className="hint">비워두면 소스에서 중심 주제를 찾습니다.</p></label>
      </div><div className="source-photos">{coverPhotoEditor()}<div className="section-rule"/><div className="photo-heading"><span className="eyebrow">03 / BODY PHOTOS</span><span>{bodyPhotos.length}/16</span></div>
        <button className="upload-zone" onClick={()=>bodyPhotoInput.current.click()} disabled={!!busy||!project} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addPhotos([...e.dataTransfer.files],'body');}}><Plus size={22}/><strong>{bodyPhotos.length?'본문 사진 일괄 교체':'본문 사진 여러 장 선택'}</strong><span>{project?'선택 순서대로 2페이지부터 연속 배치':'초안 생성 후 사진을 넣어 주세요'}</span></button>
        <input ref={bodyPhotoInput} type="file" hidden multiple accept="image/jpeg,image/png,image/webp" onChange={e=>addPhotos([...e.target.files],'body')}/>
        {!!bodyPhotos.length&&<div className="photo-grid">{bodyPhotos.map((p,i)=><button key={p.id} draggable={!busy&&!exporting} onDragStart={e=>{e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('application/x-done-photo',p.id);}} title={`드래그하여 본문에 삽입 · ${p.name}`} onClick={()=>{const index=project?.draft.cards.findIndex(c=>c.photoId===p.id);if(index>=0)setSelected(index+1);}}><img src={p.original} alt={p.name}/><span>{project?.draft.cards.findIndex(c=>c.photoId===p.id)>=0?`${project.draft.cards.findIndex(c=>c.photoId===p.id)+2}페이지`:'미배치'}</span></button>)}</div>}
        <p className="hint">본문은 텍스트만 생성됩니다. 사진 파일이나 위 사진을 본문 미리보기·썸네일에 놓으면 컬러와 노이즈가 적용됩니다.</p>
        {project&&assignedPhotoCount<project.draft.cards.length&&<p className="hint">본문 {project.draft.cards.length}장 중 {assignedPhotoCount}장에 사진이 있습니다. 사진이 없는 페이지에 직접 드래그해 넣어 주세요.</p>}
        </div></div><div className="generate-area"><button className="primary generate" onClick={generate} disabled={!!busy||exporting||!generationReady}>{busy?<LoaderCircle className="spin" size={17}/>:<ArrowRight size={17}/>} {busy?busy.label:'매거진 초안 생성'}</button><div className="cli-status"><span className={(provider==='claude'?status?.claudeLoggedIn:status?.loggedIn)?'online':'offline'}/>{status?(provider==='claude'?status.claudeLoggedIn:status.loggedIn)?`${provider==='claude'?'Claude':'Codex'} CLI 연결됨`:`${provider==='claude'?'Claude':'Codex'} CLI 로그인 필요`:'CLI 확인 중'}</div></div>
      {!generationReady&&!busy&&<p className="setup-status">{!sourceReady&&!coverPhoto?'원문 소스와 썸네일 표지 사진을 준비해 주세요.':!sourceReady?'원문 소스를 입력해 주세요.':'썸네일 표지 사진을 선택해 주세요.'}</p>}
      {busy&&<p className="setup-status" role="status">{busy.message}</p>}
      </section>}
      {project&&!sourceExpanded&&<>
        <section className="cover-selection-bar" aria-label="생성 후 썸네일 선택">
          <div className="cover-selection-heading"><span className="eyebrow">썸네일 선택</span><small>사진 {coverPhotos.length}/3</small></div>
          <div className="cover-quick-candidates">{Array.from({length:MAX_COVER_PHOTOS},(_,i)=>{const photo=coverPhotos[i];return photo?<button key={photo.id} className={photo.id===coverPhoto?.id?'selected':''} aria-label={`썸네일 사진 ${i+1} 적용`} aria-pressed={photo.id===coverPhoto?.id} disabled={!!busy||exporting} onClick={()=>chooseCoverPhoto(photo.id)}><div dangerouslySetInnerHTML={{__html:sceneSvg(coverPreviews[i])}}/><span>후보 {i+1}{photo.id===coverPhoto?.id&&<Check size={12}/>}</span></button>:<button key={`empty-${i}`} className="empty" aria-label={`썸네일 후보 ${i+1} 사진 추가`} disabled={!!busy||exporting} onClick={()=>photoInput.current.click()}><Plus size={18}/><span>사진 추가</span></button>;})}</div>
          <div className="cover-quick-style"><span>사진 스타일</span><div>{[['editorial','D.one 스타일'],['original','원본 이미지']].map(([value,label])=><button key={value} aria-pressed={(project.coverStyle||coverStyle)===value} className={(project.coverStyle||coverStyle)===value?'selected':''} disabled={!!busy||exporting} onClick={()=>{setSelected(0);setVariants(false);chooseCoverStyle(value);}}>{label}</button>)}</div></div>
        </section>
        {!!bodyPhotos.length&&<div className="canvas-photo-tray" aria-label="드래그할 본문 사진">{bodyPhotos.map(p=><img key={p.id} src={p.original} alt={p.name} title="본문에 드래그하여 삽입" draggable={!busy&&!exporting} onDragStart={e=>{e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('application/x-done-photo',p.id);}}/>)}</div>}
        <div className={`canvas-stage ${busy?'processing':''}`}>
          {variants&&selected===0?<div className="variant-grid">{[0,1,2].map(v=><button key={v} className={`variant ${project.coverVariant===v?'selected':''}`} onClick={()=>{setProject(p=>({...p,coverVariant:v}));setVariants(false);}}><div dangerouslySetInnerHTML={{__html:sceneSvg(makeScenes(project,project.photos,v,measure)[0])}}/><span>구도 {String(v+1).padStart(2,'0')}{project.coverVariant===v&&<Check size={14}/>}</span></button>)}</div>:<div className={`poster ${dropTarget===card?.id&&card?'photo-drop-active':''}`} aria-label="매거진 미리보기" onDragOver={e=>photoDragOver(e,card?.id)} onDragLeave={()=>setDropTarget(null)} onDrop={e=>photoDrop(e,card?.id)}><div className="poster-art" dangerouslySetInnerHTML={{__html:sceneSvg(scene)}}/>{card&&!busy&&<span className="photo-drop-hint">{dropTarget===card.id?'놓으면 이 페이지에 삽입됩니다':'사진을 여기에 드래그해 '+(positionedPhoto?'교체':'넣으세요')}</span>}</div>}
          {project&&!variants&&<><button className="page-nav prev" aria-label="이전 페이지" title="이전 페이지 (←)" disabled={selected===0} onClick={()=>goToPage(selected-1)}><ChevronLeft size={22}/></button><button className="page-nav next" aria-label="다음 페이지" title="다음 페이지 (→)" disabled={selected===scenes.length-1} onClick={()=>goToPage(selected+1)}><ChevronRight size={22}/></button></>}
          {busy&&!photoPreview&&<div className="progress-overlay" role="status"><LoaderCircle size={28} className="spin"/><strong>{busy.label}</strong><p>{busy.message}</p><span>이 창을 열어 둔 채 기다려 주세요.</span></div>}
        </div>
        <div className="filmstrip">{scenes.map((s,i)=>{
          const movable=i>0&&i<scenes.length-1,canDelete=!busy&&!exporting&&project.draft.cards.length>1;
          const thumb=<button key={s.id} className={`page-thumb ${selected===i?'selected':''} ${dragged===s.id?'dragging':''} ${dropTarget===s.id?'photo-drop-active':''}`} draggable={movable&&!busy&&!exporting} aria-label={`${i+1}페이지 ${movable?'본문, 드래그하여 순서 이동':s.kind==='cover'?'표지':'엔딩'}`} onDragStart={e=>{setDragged(s.id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',s.id);}} onDragEnd={()=>setDragged(null)} onDragOver={e=>{if(movable)photoDragOver(e,s.id);if(movable&&dragged){e.preventDefault();e.dataTransfer.dropEffect='move';}}} onDragLeave={()=>setDropTarget(null)} onDrop={e=>{if(movable&&([...e.dataTransfer.types].includes('Files')||[...e.dataTransfer.types].includes('application/x-done-photo'))){photoDrop(e,s.id);return;}e.preventDefault();if(movable)movePage(e.dataTransfer.getData('text/plain'),i-1);}} onKeyDown={e=>{if(movable&&e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();movePage(s.id,i-1+(e.key==='ArrowRight'?1:-1));}if(movable&&canDelete&&['Delete','Backspace'].includes(e.key)){e.preventDefault();removePage(s.id);}}} onClick={()=>{setSelected(i);setVariants(false);}}><div dangerouslySetInnerHTML={{__html:sceneSvg(s)}}/><span>{String(i+1).padStart(2,'0')} <small>{i===0?'표지':i===scenes.length-1?'엔딩':'본문'}</small></span></button>;
          if(!movable)return thumb;
          return <div key={s.id} className="page-slot">{thumb}<button className="page-delete" aria-label={`${i+1}페이지 삭제`} title={canDelete?'페이지 삭제':'본문 페이지는 최소 1장이 필요합니다'} disabled={!canDelete} onClick={()=>removePage(s.id)}><Trash2 size={11}/></button><div className="page-move"><button aria-label={`${i+1}페이지를 앞으로 한 칸 이동`} title="앞으로 한 칸 (Alt+←)" disabled={!!busy||exporting||i===1} onClick={()=>movePage(s.id,i-2)}><ChevronLeft size={12}/></button><button aria-label={`${i+1}페이지를 뒤로 한 칸 이동`} title="뒤로 한 칸 (Alt+→)" disabled={!!busy||exporting||i===scenes.length-2} onClick={()=>movePage(s.id,i)}><ChevronRight size={12}/></button></div></div>;
        })}<button className="add-page" aria-label="본문 페이지 추가" onClick={addPage} disabled={!!busy||exporting||project.draft.cards.length>=30}><Plus size={28}/><span>본문 페이지 추가</span></button></div>
      </>}

      </main>
      {project&&<aside className="editor-panel"><div className="panel-head"><span className="eyebrow">03 / EDITOR</span><h2>{project?'텍스트 편집':'편집 준비'}</h2></div>
        {!project?<div className="editor-empty"><FileText size={30} strokeWidth={1}/><p>초안을 생성하면<br/>제목과 본문을 수정할 수 있습니다.</p><div className="style-notes"><span>표지 스타일</span><div className="swatches"><i style={{background:'#ff660f'}}/><i style={{background:'#001aff'}}/><i style={{background:'#0a0a0a'}}/><i style={{background:'#edeae3'}}/></div><p>흑백 피사체 · 파랑 배경<br/>주변 요소의 주황색 · 잉크와 종이 결</p></div></div>:<>
          {selected===0&&!sourceExpanded&&coverPhotoEditor()}
          {(selected===0||card)&&<>{card&&<><button className="export-button" onClick={()=>pagePhotoInput.current.click()} disabled={!!busy||exporting}><ImageIcon size={16}/>{positionedPhoto?'이 페이지 사진 교체':'이 페이지에 사진 추가'}</button><input ref={pagePhotoInput} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={e=>replacePagePhoto(e.target.files[0])}/></>}{photoControls()}</>}
          {selected===0?<><label className="field"><span>표지 제목</span><textarea aria-label="표지 제목" className="title-edit" value={project.draft.title} onChange={e=>updateDraft('title',e.target.value)} maxLength={120}/><p className="hint">줄바꿈을 넣어 제목의 호흡을 조정하세요.</p></label>{!!project.draft.coverTitles?.length&&<div className="title-suggestions"><span className="field-caption">제목 후보 3개</span>{project.draft.coverTitles.map((t,i)=><button key={i} onClick={()=>updateDraft('title',t)}>{t}<ArrowUpRight size={13}/></button>)}</div>}<div className="article-angle"><span className="eyebrow">기사의 중심</span><p>{project.draft.angle}</p></div></>:card?<><div className="layout-label"><ImageIcon size={14}/>{scene.templateFile} · {pageNames[scene.layout]}<button className="template-edit" aria-expanded={templateCardId===card.id} disabled={!!busy||exporting} onClick={()=>setTemplateCardId(id=>id===card.id?null:card.id)}>{templateCardId===card.id?'닫기':'템플릿 수정하기'}</button></div>{templateCardId===card.id&&<div className="template-picker"><span className="field-caption">페이지 템플릿</span>{TEMPLATE_CHOICES.map(([layout,file,label])=><button key={layout} className={scene.layout===layout?'selected':''} aria-pressed={scene.layout===layout} onClick={()=>chooseLayout(layout,file)}><ImageIcon size={14}/>{label}</button>)}</div>}<label className="field"><span>제목</span><textarea aria-label="본문 제목" className="title-edit" value={card.title} onChange={e=>updateCard('title',e.target.value)} maxLength={160}/></label><label className="field"><span>본문 <small>{card.body.length}자</small></span><textarea aria-label="본문" className="body-edit" value={card.body} onChange={e=>updateCard('body',e.target.value)} maxLength={2000}/></label></>:<div className="article-angle"><span className="eyebrow">ENDING TEMPLATE</span><p>#7.jpg 원본 템플릿을 그대로 사용합니다.</p></div>}
          {scene?.nodes.some(n=>n.overflow)&&<p className="overflow-warning">텍스트가 페이지 영역을 넘습니다. 내용을 줄여 주세요.</p>}
        </>}
        {project&&<section className="caption-editor"><span className="eyebrow">CAPTION</span><button className="export-button" onClick={createCaption} disabled={!!busy||exporting}><FileText size={16}/>{project.draft.caption?'캡션 다시 생성':'캡션 생성'}</button><p className="hint">현재 제목과 본문으로 약 1,000자 캡션을 만듭니다. 다시 생성하면 기존 캡션을 바꿉니다.</p><label className="field"><span>캡션 <small>{Array.from(project.draft.caption||'').length}자</small></span><textarea aria-label="캡션" className="caption-edit" placeholder="캡션 생성 버튼을 누르거나 직접 작성하세요." value={project.draft.caption||''} onChange={e=>updateDraft('caption',e.target.value)} disabled={!!busy}/></label>{!!project.draft.caption&&<button className="text-button" onClick={()=>download(new Blob([project.draft.caption],{type:'text/plain;charset=utf-8'}),'D.one-caption.txt')}><Download size={12}/>캡션 TXT 다운로드</button>}</section>}
        <div className="export-area"><span className="eyebrow">EXPORT</span><p className="hint">현재 선택: {selected+1} / {scenes.length} 페이지</p><button className="export-button" onClick={()=>exportFile('png','selected')} disabled={!scene||!!busy||exporting}><Download size={16}/>선택 페이지 PNG 다운로드</button><button className="export-button" onClick={()=>exportFile('figma','selected')} disabled={!scene||!!busy||exporting}><Layers size={16}/>선택 페이지 Figma 편집 파일<ArrowUpRight size={14}/></button><button className="export-button" onClick={()=>exportFile('png')} disabled={!project||!!busy||exporting}><Download size={16}/>전체 PNG 다운로드{exporting&&<LoaderCircle size={14} className="spin"/>}</button><button className="export-button" onClick={()=>exportFile('figma')} disabled={!project||!!busy||exporting}><Layers size={16}/>전체 Figma 편집 파일<ArrowUpRight size={14}/></button><a className="plugin-link" href="/api/plugin" download="D.one-figma-plugin.zip">Figma 플러그인 다운로드<Download size={12}/></a>{project&&<button className="text-button" onClick={()=>download(new Blob([project.source.segments.map(s=>`${s.start==null?'':`[${time(s.start)}] `}${s.text}`).join('\n')],{type:'text/plain;charset=utf-8'}),'transcript.txt')}><FileText size={12}/>원본 스크립트 다운로드</button>}</div>
      </aside>}
    </div>
    {notice&&<div className="toast" role="status"><Check size={15}/>{notice}</div>}
    {history!==null&&<div className="modal-backdrop" onClick={()=>setHistory(null)}><section className="history-modal" role="dialog" aria-label="저장한 프로젝트" onClick={e=>e.stopPropagation()}><div className="modal-head"><h2>저장한 프로젝트</h2><button aria-label="프로젝트 닫기" onClick={()=>setHistory(null)}><X size={19}/></button></div><p className="hint history-retention">프로젝트는 생성 후 3일 뒤 자동 삭제됩니다. 가져온 원문 스크립트는 보관해 다시 생성할 때 재사용합니다.</p>{history.length?history.map(p=><button className="history-item" key={p.id} onClick={()=>loadProject(p.id)}><div><strong>{p.title}</strong><span>{p.cardCount}장 · {new Date(p.updatedAt).toLocaleDateString('ko-KR')}{p.expiresAt&&` · ${new Date(p.expiresAt).toLocaleString('ko-KR')} 삭제 예정`}</span></div><ArrowRight size={17}/></button>):<p className="history-empty">아직 저장한 프로젝트가 없습니다.</p>}</section></div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
