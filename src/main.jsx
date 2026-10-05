import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowUpRight,ArrowRight,Plus,Upload,Download,Check,LoaderCircle,ChevronDown,ChevronLeft,ChevronRight,FileText,Layers,History,X,ExternalLink,Image as ImageIcon,RefreshCw,Trash2} from 'lucide-react';
import {makeScenes,sceneSvg} from '../shared/scene.js';
import {photoRoles} from '../shared/photos.js';
import './style.css';

async function api(url,options={}) {
  const response=await fetch(url,options);const result=await response.json();if(!response.ok)throw new Error(result.error || '요청을 처리하지 못했습니다.');return result;
}
const json=value=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
const time=start=>{if(start==null)return '시점 정보 없음';const h=Math.floor(start/3600),m=Math.floor(start%3600/60),s=Math.floor(start%60);return `${h?`${h}:`:''}${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;};
const pageNames={'dark-top':'사진 위 · 검정','dark-bottom':'사진 아래 · 검정','paper-top':'사진 위 · 종이색','paper-bottom':'사진 아래 · 종이색','photo-overlay':'사진 배경'};
function App(){
  const [status,setStatus]=useState(null),[url,setUrl]=useState(''),[angle,setAngle]=useState(''),[sourceTitle,setSourceTitle]=useState(''),[transcript,setTranscript]=useState('');
  const [coverStyle,setCoverStyle]=useState('editorial'),[manual,setManual]=useState(false),[provider,setProvider]=useState('codex'),[photos,setPhotos]=useState([]),[project,setProject]=useState(null),[selected,setSelected]=useState(0);
  const [busy,setBusy]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[saved,setSaved]=useState(''),[history,setHistory]=useState(null),[fontReady,setFontReady]=useState(0),[variants,setVariants]=useState(false),[exporting,setExporting]=useState(false),[dragged,setDragged]=useState(null);
  const photoInput=useRef(),bodyPhotoInput=useRef(),pagePhotoInput=useRef(),transcriptInput=useRef(),saveQueue=useRef(Promise.resolve()),loaded=useRef(null);
  useEffect(()=>{api('/api/status').then(setStatus).catch(e=>setError(e.message));Promise.all([400,700,800].map(weight=>document.fonts.load(`${weight} 30px Pretendard`))).then(()=>document.fonts.ready).then(()=>setFontReady(1));},[]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),6000);return()=>clearTimeout(t);},[notice]);
  const measure=useMemo(()=>{const context=document.createElement('canvas').getContext('2d');return (value,size,weight=400,family='Pretendard')=>{context.font=`${weight} ${size}px "${family}"`;return context.measureText(value).width;};},[fontReady]);
  const scenes=useMemo(()=>makeScenes(project,project?.photos||photos,project?.coverVariant||0,measure),[project,photos,measure]);
  const {cover:coverPhoto,body:bodyPhotos}=photoRoles(project,photos);
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
      return {...c,layoutOverride:page.layout,templateOverride:page.templateFile,photoAssigned:true,photoId:p.photos.find(photo=>photo.gray===src)?.id||null};
    });
  }
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
    cards.push({id:crypto.randomUUID(),title:'새 페이지 제목',body:'',layout:'photo-overlay',layoutOverride:'photo-overlay',templateOverride:'#2.jpg',photoAssigned:true,photoId:bodyPhotos[cards.length]?.id||null,addedByUser:true});
    setProject(p=>({...p,draft:{...p.draft,cards}}));setSelected(cards.length);setVariants(false);
    setNotice('본문 페이지를 추가했습니다. 오른쪽에서 템플릿과 내용을 선택하세요.');
  }
  function chooseLayout(layout,file){
    setProject(p=>({...p,draft:{...p.draft,cards:p.draft.cards.map((c,i)=>i===selected-1?{...c,layoutOverride:layout,templateOverride:file}:c)}}));
  }
  async function watch(id,label){
    for(;;){const state=await api(`/api/jobs/${id}`);setBusy({label,message:state.message});if(state.status==='failed')throw new Error(state.error);if(state.status==='complete')return state.result;await new Promise(r=>setTimeout(r,1500));}
  }
  async function addPhotos(files,role='cover'){
    if(!files.length||busy)return;
    if(role==='cover'&&files.length!==1){setError('표지 사진은 한 장만 선택하세요.');return;}
    if(role==='body'&&files.length>16){setError('본문 사진은 한 번에 16장까지 선택하세요.');return;}
    setError('');setBusy({label:role==='cover'?'표지 사진 준비':'본문 사진 준비',message:'사진을 업로드하고 있습니다'});
    try{
      const form=new FormData();form.append('role',role);form.append('provider',project?.provider||provider);form.append('coverStyle',project?.coverStyle||coverStyle);for(const file of files)form.append('photos',file);
      const {jobId}=await api('/api/photos',{method:'POST',body:form});const prepared=await watch(jobId,'사진 준비');
      const next=role==='cover'?[prepared[0],...bodyPhotos.map(p=>({...p,role:'body'}))]:[...(coverPhoto?[{...coverPhoto,role:'cover'}]:[]),...prepared];
      const roles=photoRoles(null,next);setPhotos(next);
      if(project)setProject(p=>({...p,photos:next,coverPhotoId:roles.cover?.id||null,draft:{...p.draft,cards:p.draft.cards.map((c,i)=>({...c,photoId:roles.body[i]?.id||null}))}}));
      setNotice(role==='cover'?'표지 사진을 교체했습니다.':`본문 사진 ${prepared.length}장을 2페이지부터 순서대로 배치했습니다.`);
    }catch(e){setError(e.message);}finally{setBusy(null);if(photoInput.current)photoInput.current.value='';if(bodyPhotoInput.current)bodyPhotoInput.current.value='';}
  }
  async function replacePagePhoto(file){
    if(!file||!card||busy)return;
    const targetId=card.id;setError('');setBusy({label:'본문 사진 교체',message:'사진을 준비하고 있습니다'});
    try{
      const form=new FormData();form.append('role','body');form.append('provider',project?.provider||provider);form.append('photos',file);
      const {jobId}=await api('/api/photos',{method:'POST',body:form});const [photo]=await watch(jobId,'본문 사진 교체');
      const cards=pinPages(project);const oldId=cards.find(c=>c.id===targetId)?.photoId;
      const unused=oldId&&!cards.some(c=>c.id!==targetId&&c.photoId===oldId);
      const next=[...photos.filter(p=>!unused||p.id!==oldId),photo];
      setPhotos(next);setProject(p=>({...p,photos:next,draft:{...p.draft,cards:cards.map(c=>c.id===targetId?{...c,photoId:photo.id,photoAssigned:true,photoPosition:{x:0,y:0,zoom:1}}:c)}}));
      setNotice('선택한 본문 페이지의 사진을 교체했습니다.');
    }catch(e){setError(e.message);}finally{setBusy(null);if(pagePhotoInput.current)pagePhotoInput.current.value='';}
  }
  const position=selected===0?project?.coverPhotoPosition||{}:card?.photoPosition||{};
  const positionedPhoto=scene?.nodes.some(n=>n.name==='Article photo'||n.name==='Original cover photo'||n.name==='Blue photographic background');
  function setPhotoPosition(value){
    if(selected===0)setProject(p=>({...p,coverPhotoPosition:{...p.coverPhotoPosition,...value}}));
    else setProject(p=>({...p,draft:{...p.draft,cards:p.draft.cards.map((c,i)=>i===selected-1?{...c,photoPosition:{...c.photoPosition,...value}}:c)}}));
  }
  function photoControls(){return positionedPhoto&&<div className="photo-position"><span className="field-caption">사진 위치</span><label>좌우 <input aria-label="사진 좌우 위치" type="range" min="-100" max="100" value={position.x||0} onChange={e=>setPhotoPosition({x:Number(e.target.value)})} disabled={!!busy}/></label><label>상하 <input aria-label="사진 상하 위치" type="range" min="-100" max="100" value={position.y||0} onChange={e=>setPhotoPosition({y:Number(e.target.value)})} disabled={!!busy}/></label><label>확대 <input aria-label="사진 확대" type="range" min="1" max="2" step="0.01" value={position.zoom||1} onChange={e=>setPhotoPosition({zoom:Number(e.target.value)})} disabled={!!busy}/><small>{Math.round((position.zoom||1)*100)}%</small></label><button className="text-button" onClick={()=>setPhotoPosition({x:0,y:0,zoom:1})} disabled={!!busy}><RefreshCw size={12}/>위치 초기화</button><p className="hint">여유가 없는 방향은 조금 확대한 뒤 이동하세요.</p></div>;}
  async function generate(){
    setError('');setBusy({label:'매거진 생성',message:'원고 작성을 준비하고 있습니다'});
    try{const {jobId}=await api('/api/generate',json({url,angle,transcript:manual?transcript:'',title:sourceTitle,photos,coverPhotoId:coverPhoto?.id||null,coverStyle:project?.coverStyle||coverStyle,provider}));const p=await watch(jobId,'매거진 생성');loaded.current=p;setProject(p);setProvider(p.provider||provider);setSelected(0);setVariants(false);setSaved('저장됨');setNotice(`${p.draft.cards.length+2}장의 매거진 초안을 만들었습니다.`);}
    catch(e){setError(e.message);if(e.message.includes('자막'))setManual(true);}finally{setBusy(null);}
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
      const {jobId}=await api('/api/photos/restyle',json({photos:[coverPhoto],provider:project?.provider||provider}));const [updated]=await watch(jobId,'표지 다시 디자인');
      const next=photos.map(p=>p.id===coverPhoto.id?{...updated,role:'cover'}:p);setPhotos(next);
      if(project)setProject(p=>({...p,photos:next,coverPhotoId:updated.id}));
      setNotice('원고와 본문 사진을 유지하고 표지에 새 스타일을 적용했습니다.');return true;
    }catch(e){setError(e.message);return false;}finally{setBusy(null);}
  }
  async function chooseCoverStyle(style){
    if(busy||exporting)return;
    if(style==='editorial'&&coverPhoto&&!coverPhoto.subject){
      if(!await restylePhotos())return;
    }
    setCoverStyle(style);if(project)setProject(p=>({...p,coverStyle:style}));
  }
  async function exportFile(type){
    if(!scenes.length)return;
    if(!project.photos.length){setError('표지와 본문에 사용할 사진을 먼저 추가하세요.');return;}
    if(scenes.some(s=>s.nodes.some(n=>n.overflow))){setError('페이지에 들어가지 않는 텍스트가 있습니다. 내용을 줄여 주세요.');return;}
    setExporting(true);setError('');
    try{await saveQueue.current;const response=await fetch(`/api/export/${type}`,json({scenes}));if(!response.ok)throw new Error((await response.json()).error);download(await response.blob(),type==='figma'?'D.one-magazine.done.json':'D.one-magazine.zip');setNotice(type==='figma'?'Figma 플러그인에서 내려받은 .done.json 파일을 선택하세요.':'전체 페이지를 PNG로 다운로드했습니다.');}
    catch(e){setError(e.message);}finally{setExporting(false);}
  }
  async function loadProject(id){try{const p=await api(`/api/projects/${id}`);loaded.current=p;setProject(p);setProvider(p.provider||'codex');setPhotos(p.photos);setCoverStyle(p.coverStyle||'editorial');setUrl(p.source.url);setAngle(p.draft.angle);setSelected(0);setHistory(null);setSaved('저장됨');}catch(e){setError(e.message);}}
  async function clearWorkspace(){
    if(busy||exporting)return;
    setBusy({label:'비우기',message:'현재 프로젝트를 저장하고 작업 화면을 비우고 있습니다'});
    try{
      await saveQueue.current;
      if(project)await api(`/api/projects/${project.id}`,{...json(project),method:'PUT'});
      loaded.current=null;
      setProject(null);setPhotos([]);setUrl('');setAngle('');setSourceTitle('');setTranscript('');
      setCoverStyle('editorial');setManual(false);setSelected(0);setVariants(false);setHistory(null);setSaved('');setError('');
      if(photoInput.current)photoInput.current.value='';
      if(bodyPhotoInput.current)bodyPhotoInput.current.value='';
      if(transcriptInput.current)transcriptInput.current.value='';
      setNotice('작업 화면을 비웠습니다. 저장된 프로젝트는 유지됩니다.');
    }catch(e){setError(e.message);}finally{setBusy(null);}
  }
  async function showHistory(){try{setHistory(await api('/api/projects'));}catch(e){setError(e.message);}}
  return <div className="app">
    <header className="topbar"><a className="wordmark" href="/">D.one<span>STUDIO</span></a><div className="top-center"><span className="local-dot"/>LOCAL WORKSPACE</div><div className="top-actions"><span className="saved">{saved&&<><Check size={13}/>{saved}</>}</span><button className="quiet" onClick={showHistory} disabled={!!busy}><History size={16}/>프로젝트</button><button className="quiet" onClick={clearWorkspace} disabled={!!busy||exporting||!(project||photos.length||url||angle||sourceTitle||transcript||manual)}><Trash2 size={16}/>비우기</button></div></header>
    <div className="workspace">
      <aside className="source-panel"><div className="panel-head"><span className="eyebrow">01 / SOURCE</span><h2>영상에서 시작하기</h2></div>
        <label className="field"><span>YouTube URL</span><div className="input-wrap"><input aria-label="YouTube URL" placeholder="https://youtube.com/watch?v=…" value={url} onChange={e=>setUrl(e.target.value)} disabled={!!busy}/><ArrowUpRight size={16}/></div></label>
        <div className="provider-picker"><span className="field-caption">생성 CLI</span><div>{[['codex','Codex CLI'],['claude','Claude CLI']].map(([value,label])=><button type="button" key={value} className={provider===value?'selected':''} aria-pressed={provider===value} onClick={()=>setProvider(value)} disabled={!!busy}>{label}<small>{value==='claude'?status?.claudeLoggedIn?'연결됨':'로그인 필요':status?.loggedIn?'연결됨':'로그인 필요'}</small></button>)}</div></div>
        <button className={`manual-toggle ${manual?'active':''}`} onClick={()=>setManual(v=>!v)} disabled={!!busy}><FileText size={14}/>자막 직접 넣기<ChevronDown size={14}/></button>
        {manual&&<div className="manual-fields"><label className="field"><span>영상 제목 <small>선택</small></span><input value={sourceTitle} onChange={e=>setSourceTitle(e.target.value)} placeholder="영상 제목을 입력하세요" disabled={!!busy}/></label><label className="field"><span>스크립트</span><textarea aria-label="스크립트" placeholder="영어·한국어 자막을 붙여넣으세요. 타임스탬프가 있으면 함께 유지합니다." value={transcript} onChange={e=>setTranscript(e.target.value)} disabled={!!busy}/></label><button className="text-button" onClick={()=>transcriptInput.current.click()} disabled={!!busy}><Upload size={13}/>TXT / SRT / VTT 가져오기</button><input type="file" ref={transcriptInput} hidden accept=".txt,.srt,.vtt,.json3" onChange={async e=>{if(e.target.files[0])setTranscript(await e.target.files[0].text());e.target.value='';}}/></div>}
        <label className="field angle-field"><span>기사 관점 <small>선택</small></span><textarea aria-label="기사 관점" value={angle} onChange={e=>setAngle(e.target.value)} disabled={!!busy} placeholder="예: 초기 창업가의 고객 인터뷰에 집중해줘"/><p className="hint">비워두면 영상에서 중심 주제를 찾습니다.</p></label>
        <div className="section-rule"/><div className="photo-heading"><span className="eyebrow">02 / COVER PHOTO</span><span>{coverPhoto?1:0}/1</span></div>
        <div className="template-picker cover-style-picker"><span className="field-caption">표지 사진 스타일</span>{[['editorial','D.one 스타일'],['original','원본 이미지']].map(([value,label])=><button key={value} className={(project?.coverStyle||coverStyle)===value?'selected':''} aria-pressed={(project?.coverStyle||coverStyle)===value} disabled={!!busy||exporting} onClick={()=>chooseCoverStyle(value)}>{label}</button>)}</div>
        <button className="upload-zone" onClick={()=>photoInput.current.click()} disabled={!!busy} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addPhotos([...e.dataTransfer.files],'cover');}}><Plus size={22}/><strong>{coverPhoto?'표지 사진 교체':'표지 사진 1장 선택'}</strong><span>썸네일 표지 전용 · JPG · PNG · WebP</span></button>
        <input ref={photoInput} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={e=>addPhotos([...e.target.files],'cover')}/>
        {coverPhoto&&<div className="photo-grid"><button className="selected" title={coverPhoto.name} onClick={()=>setSelected(0)}><img src={coverPhoto.original} alt={coverPhoto.name}/><span>표지</span></button></div>}
        <p className="hint">{(project?.coverStyle||coverStyle)==='original'?'원본 색상을 그대로 사용합니다. 제목과 로고는 유지됩니다.':'흑백 피사체 · 파랑 배경 · 주변 요소의 주황색'}</p>
        {coverPhoto&&(project?.coverStyle||coverStyle)!=='original'&&<button className="text-button" onClick={restylePhotos} disabled={!!busy}><RefreshCw size={13}/>표지 다시 디자인</button>}
        <div className="section-rule"/><div className="photo-heading"><span className="eyebrow">03 / BODY PHOTOS</span><span>{bodyPhotos.length}/16</span></div>
        <button className="upload-zone" onClick={()=>bodyPhotoInput.current.click()} disabled={!!busy} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addPhotos([...e.dataTransfer.files],'body');}}><Plus size={22}/><strong>{bodyPhotos.length?'본문 사진 일괄 교체':'본문 사진 여러 장 선택'}</strong><span>선택 순서대로 2페이지부터 연속 배치</span></button>
        <input ref={bodyPhotoInput} type="file" hidden multiple accept="image/jpeg,image/png,image/webp" onChange={e=>addPhotos([...e.target.files],'body')}/>
        {!!bodyPhotos.length&&<div className="photo-grid">{bodyPhotos.map((p,i)=><button key={p.id} title={`${i+2}페이지 · ${p.name}`} onClick={()=>{if(project&&i<project.draft.cards.length)setSelected(i+1);}}><img src={p.original} alt={p.name}/><span>{i+2}페이지</span></button>)}</div>}
        <p className="hint">사진 영역을 빈 여백 없이 최소 확대합니다. 마지막 페이지는 #7 템플릿을 유지합니다.</p>
        {project&&bodyPhotos.length<project.draft.cards.length&&<p className="hint">본문 {project.draft.cards.length}장 중 {bodyPhotos.length}장에 사진이 있습니다. 나머지 페이지에 사용할 사진을 함께 선택해 주세요.</p>}
        <div className="generate-area"><button className="primary generate" onClick={generate} disabled={!!busy||(!url.trim()&&!(manual&&transcript.trim()))}>{busy?<LoaderCircle className="spin" size={17}/>:<ArrowRight size={17}/>} {busy?busy.label:'매거진 초안 생성'}</button><div className="cli-status"><span className={status?.loggedIn?'online':'offline'}/>{status?status.loggedIn?'Codex CLI 연결됨':'Codex CLI 로그인 필요':'Codex CLI 확인 중'}</div></div>
      </aside>
      <main className="canvas-panel"><div className="canvas-toolbar"><div><span className="eyebrow">{project?'MAGAZINE DRAFT':'TEMPLATE PREVIEW'}</span><h1>{project?selected===0?'표지':selected===scenes.length-1?'엔딩':`본문 ${selected}`:'D.one 에디토리얼'}</h1></div><div className="canvas-tools">{project&&selected===0&&<button className={`quiet ${variants?'chosen':''}`} onClick={()=>setVariants(v=>!v)}><Layers size={15}/>표지 후보</button>}<span className="dimension">1080 × 1350</span></div></div>
        {error&&<div className="error-banner" role="alert"><span>{error}</span><button aria-label="오류 닫기" onClick={()=>setError('')}><X size={16}/></button></div>}
        <div className={`canvas-stage ${busy?'processing':''}`}>
          {!project?<div className="reference-poster"><img src="/references/selective-color.png" alt="표지 스타일 참조: 사진 요소 선택 착색과 인쇄 질감"/><div className="reference-caption"><span>STYLE REFERENCE</span><span>사진과 영상으로 새 초안을 만드세요</span></div></div>:variants&&selected===0?<div className="variant-grid">{[0,1,2].map(v=><button key={v} className={`variant ${project.coverVariant===v?'selected':''}`} onClick={()=>{setProject(p=>({...p,coverVariant:v}));setVariants(false);}}><div dangerouslySetInnerHTML={{__html:sceneSvg(makeScenes(project,project.photos,v,measure)[0])}}/><span>구도 {String(v+1).padStart(2,'0')}{project.coverVariant===v&&<Check size={14}/>}</span></button>)}</div>:<div className="poster" aria-label="매거진 미리보기" dangerouslySetInnerHTML={{__html:sceneSvg(scene)}}/>}
          {busy&&<div className="progress-overlay" role="status"><LoaderCircle size={28} className="spin"/><strong>{busy.label}</strong><p>{busy.message}</p><span>이 창을 열어 둔 채 기다려 주세요.</span></div>}
        </div>
        {project?<div className="filmstrip">{scenes.map((s,i)=>{
          const movable=i>0&&i<scenes.length-1;
          return <button key={s.id} className={`page-thumb ${selected===i?'selected':''} ${dragged===s.id?'dragging':''}`} draggable={movable&&!busy&&!exporting} aria-label={`${i+1}페이지 ${movable?'본문, 드래그하여 순서 이동':s.kind==='cover'?'표지':'엔딩'}`} onDragStart={e=>{setDragged(s.id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',s.id);}} onDragEnd={()=>setDragged(null)} onDragOver={e=>{if(movable&&dragged){e.preventDefault();e.dataTransfer.dropEffect='move';}}} onDrop={e=>{e.preventDefault();if(movable)movePage(e.dataTransfer.getData('text/plain'),i-1);}} onKeyDown={e=>{if(movable&&e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();movePage(s.id,i-1+(e.key==='ArrowRight'?1:-1));}}} onClick={()=>{setSelected(i);setVariants(false);}}><div dangerouslySetInnerHTML={{__html:sceneSvg(s)}}/><span>{String(i+1).padStart(2,'0')} <small>{i===0?'표지':i===scenes.length-1?'엔딩':'본문'}</small></span></button>;
        })}<button className="add-page" aria-label="본문 페이지 추가" onClick={addPage} disabled={!!busy||exporting||project.draft.cards.length>=30}><Plus size={28}/><span>본문 페이지 추가</span></button></div>:<div className="empty-strip"><span>표지</span><ArrowRight size={14}/><span>내용에 맞는 본문</span><ArrowRight size={14}/><span>D.one 엔딩</span></div>}

      </main>
      <aside className="editor-panel"><div className="panel-head"><span className="eyebrow">03 / EDITOR</span><h2>{project?'텍스트 편집':'편집 준비'}</h2></div>
        {!project?<div className="editor-empty"><FileText size={30} strokeWidth={1}/><p>초안을 생성하면<br/>제목과 본문을 수정할 수 있습니다.</p><div className="style-notes"><span>표지 스타일</span><div className="swatches"><i style={{background:'#ff660f'}}/><i style={{background:'#1712ff'}}/><i style={{background:'#0a0a0a'}}/><i style={{background:'#edeae3'}}/></div><p>흑백 피사체 · 파랑 배경<br/>주변 요소의 주황색 · 잉크와 종이 결</p></div></div>:<>
          {(selected===0||card)&&<>{card&&<><button className="export-button" onClick={()=>pagePhotoInput.current.click()} disabled={!!busy||exporting}><ImageIcon size={16}/>이 페이지 사진 교체</button><input ref={pagePhotoInput} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={e=>replacePagePhoto(e.target.files[0])}/></>}{photoControls()}</>}
          {selected===0?<><label className="field"><span>표지 제목</span><textarea aria-label="표지 제목" className="title-edit" value={project.draft.title} onChange={e=>updateDraft('title',e.target.value)} maxLength={120}/><p className="hint">줄바꿈을 넣어 제목의 호흡을 조정하세요.</p></label>{!!project.draft.coverTitles?.length&&<div className="title-suggestions"><span className="field-caption">제목 후보</span>{project.draft.coverTitles.map((t,i)=><button key={i} onClick={()=>updateDraft('title',t)}>{t}<ArrowUpRight size={13}/></button>)}</div>}<div className="article-angle"><span className="eyebrow">기사의 중심</span><p>{project.draft.angle}</p></div></>:card?<>{card.addedByUser&&<div className="template-picker"><span className="field-caption">페이지 템플릿</span>{[['photo-overlay','#2.jpg','사진 배경형'],['dark-top','#3.jpg','사진 위'],['dark-bottom','#4.jpg','사진 아래']].map(([layout,file,label])=><button key={layout} className={scene.layout===layout?'selected':''} aria-pressed={scene.layout===layout} onClick={()=>chooseLayout(layout,file)}><ImageIcon size={14}/>{label}</button>)}</div>}<div className="layout-label"><ImageIcon size={14}/>{scene.templateFile} · {pageNames[scene.layout]}</div><label className="field"><span>제목</span><textarea aria-label="본문 제목" className="title-edit" value={card.title} onChange={e=>updateCard('title',e.target.value)} maxLength={160}/></label><label className="field"><span>본문 <small>{card.body.length}자</small></span><textarea aria-label="본문" className="body-edit" value={card.body} onChange={e=>updateCard('body',e.target.value)} maxLength={2000}/></label></>:<div className="article-angle"><span className="eyebrow">ENDING TEMPLATE</span><p>#7.jpg 원본 템플릿을 그대로 사용합니다.</p></div>}
          {scene?.nodes.some(n=>n.overflow)&&<p className="overflow-warning">텍스트가 페이지 영역을 넘습니다. 내용을 줄여 주세요.</p>}
        </>}
        {project&&<section className="caption-editor"><span className="eyebrow">CAPTION</span><button className="export-button" onClick={createCaption} disabled={!!busy||exporting}><FileText size={16}/>{project.draft.caption?'캡션 다시 생성':'캡션 생성'}</button><p className="hint">현재 제목과 본문으로 약 1,000자 캡션을 만듭니다. 다시 생성하면 기존 캡션을 바꿉니다.</p><label className="field"><span>캡션 <small>{Array.from(project.draft.caption||'').length}자</small></span><textarea aria-label="캡션" className="caption-edit" placeholder="캡션 생성 버튼을 누르거나 직접 작성하세요." value={project.draft.caption||''} onChange={e=>updateDraft('caption',e.target.value)} disabled={!!busy}/></label>{!!project.draft.caption&&<button className="text-button" onClick={()=>download(new Blob([project.draft.caption],{type:'text/plain;charset=utf-8'}),'D.one-caption.txt')}><Download size={12}/>캡션 TXT 다운로드</button>}</section>}
        <div className="export-area"><span className="eyebrow">EXPORT</span><button className="export-button" onClick={()=>exportFile('png')} disabled={!project||!!busy||exporting}><Download size={16}/>전체 PNG 다운로드{exporting&&<LoaderCircle size={14} className="spin"/>}</button><button className="export-button" onClick={()=>exportFile('figma')} disabled={!project||!!busy||exporting}><Layers size={16}/>Figma 편집 파일<ArrowUpRight size={14}/></button><a className="plugin-link" href="/api/plugin" download="D.one-figma-plugin.zip">Figma 플러그인 다운로드<Download size={12}/></a>{project&&<button className="text-button" onClick={()=>download(new Blob([project.source.segments.map(s=>`${s.start==null?'':`[${time(s.start)}] `}${s.text}`).join('\n')],{type:'text/plain;charset=utf-8'}),'transcript.txt')}><FileText size={12}/>원본 스크립트 다운로드</button>}</div>
      </aside>
    </div>
    {notice&&<div className="toast" role="status"><Check size={15}/>{notice}</div>}
    {history!==null&&<div className="modal-backdrop" onClick={()=>setHistory(null)}><section className="history-modal" role="dialog" aria-label="저장한 프로젝트" onClick={e=>e.stopPropagation()}><div className="modal-head"><h2>저장한 프로젝트</h2><button aria-label="프로젝트 닫기" onClick={()=>setHistory(null)}><X size={19}/></button></div>{history.length?history.map(p=><button className="history-item" key={p.id} onClick={()=>loadProject(p.id)}><div><strong>{p.title}</strong><span>{p.cardCount}장 · {new Date(p.updatedAt).toLocaleDateString('ko-KR')}</span></div><ArrowRight size={17}/></button>):<p className="history-empty">아직 저장한 프로젝트가 없습니다.</p>}</section></div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
