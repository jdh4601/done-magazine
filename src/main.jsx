import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowUpRight,ArrowRight,Plus,Upload,Download,Check,LoaderCircle,ChevronDown,ChevronLeft,ChevronRight,FileText,Layers,History,X,ExternalLink,Image as ImageIcon,RefreshCw} from 'lucide-react';
import {makeScenes,sceneSvg} from '../shared/scene.js';
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
  const [manual,setManual]=useState(false),[photos,setPhotos]=useState([]),[project,setProject]=useState(null),[selected,setSelected]=useState(0);
  const [busy,setBusy]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[saved,setSaved]=useState(''),[history,setHistory]=useState(null),[fontReady,setFontReady]=useState(0),[variants,setVariants]=useState(false),[exporting,setExporting]=useState(false);
  const photoInput=useRef(),transcriptInput=useRef(),saveQueue=useRef(Promise.resolve()),loaded=useRef(null);
  useEffect(()=>{api('/api/status').then(setStatus).catch(e=>setError(e.message));document.fonts.ready.then(()=>setFontReady(1));},[]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),6000);return()=>clearTimeout(t);},[notice]);
  const measure=useMemo(()=>{const context=document.createElement('canvas').getContext('2d');return (value,size,weight=400,family='Noto Sans KR')=>{context.font=`${weight} ${size}px "${family}"`;return context.measureText(value).width;};},[fontReady]);
  const scenes=useMemo(()=>makeScenes(project,project?.photos||photos,project?.coverVariant||0,measure),[project,photos,measure]);
  const scene=scenes[selected]||scenes[0];const card=selected>0&&selected<scenes.length-1?project?.draft.cards[selected-1]:null;
  useEffect(()=>{
    if(!project)return;if(loaded.current===project){loaded.current=null;return;}
    setSaved('저장 중');const t=setTimeout(()=>{
      saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>api(`/api/projects/${project.id}`,{...json(project),method:'PUT'})).then(()=>setSaved('저장됨')).catch(e=>{setSaved('저장 실패');setError(e.message);});
    },700);return()=>clearTimeout(t);
  },[project]);
  function updateDraft(field,value){setProject(p=>({...p,draft:{...p.draft,[field]:value}}));}
  function updateCard(field,value){setProject(p=>({...p,draft:{...p.draft,cards:p.draft.cards.map((c,i)=>i===selected-1?{...c,[field]:value,manuallyEdited:true}:c)}}));}
  async function watch(id,label){
    for(;;){const state=await api(`/api/jobs/${id}`);setBusy({label,message:state.message});if(state.status==='failed')throw new Error(state.error);if(state.status==='complete')return state.result;await new Promise(r=>setTimeout(r,1500));}
  }
  async function addPhotos(files){
    if(!files.length)return;if(photos.length+files.length>8){setError('사진은 8개까지 사용할 수 있습니다.');return;}
    setError('');setBusy({label:'사진 준비',message:'사진을 업로드하고 있습니다'});
    try{const form=new FormData();for(const file of files)form.append('photos',file);const {jobId}=await api('/api/photos',{method:'POST',body:form});const prepared=await watch(jobId,'사진 준비');setPhotos(old=>[...old,...prepared]);if(project)setProject(p=>({...p,photos:[...p.photos,...prepared],coverPhotoId:p.coverPhotoId||prepared[0]?.id}));setNotice('사진 보정과 피사체 분리가 완료되었습니다.');}
    catch(e){setError(e.message);}finally{setBusy(null);if(photoInput.current)photoInput.current.value='';}
  }
  async function generate(){
    setError('');setBusy({label:'매거진 생성',message:'원고 작성을 준비하고 있습니다'});
    try{const {jobId}=await api('/api/generate',json({url,angle,transcript:manual?transcript:'',title:sourceTitle,photos}));const p=await watch(jobId,'매거진 생성');loaded.current=p;setProject(p);setSelected(0);setVariants(false);setSaved('저장됨');setNotice(`${p.draft.cards.length+2}장의 매거진 초안을 만들었습니다.`);}
    catch(e){setError(e.message);if(e.message.includes('자막'))setManual(true);}finally{setBusy(null);}
  }
  async function exportFile(type){
    if(!scenes.length)return;
    if(!project.photos.length){setError('표지와 본문에 사용할 사진을 먼저 추가하세요.');return;}
    if(scenes.some(s=>s.nodes.some(n=>n.overflow))){setError('페이지에 들어가지 않는 텍스트가 있습니다. 내용을 줄여 주세요.');return;}
    setExporting(true);setError('');
    try{await saveQueue.current;const response=await fetch(`/api/export/${type}`,json({scenes}));if(!response.ok)throw new Error((await response.json()).error);download(await response.blob(),type==='figma'?'D.one-magazine.done.json':'D.one-magazine.zip');setNotice(type==='figma'?'Figma 플러그인에서 내려받은 .done.json 파일을 선택하세요.':'전체 페이지를 PNG로 다운로드했습니다.');}
    catch(e){setError(e.message);}finally{setExporting(false);}
  }
  async function loadProject(id){try{const p=await api(`/api/projects/${id}`);loaded.current=p;setProject(p);setPhotos(p.photos);setUrl(p.source.url);setAngle(p.draft.angle);setSelected(0);setHistory(null);setSaved('저장됨');}catch(e){setError(e.message);}}
  async function showHistory(){try{setHistory(await api('/api/projects'));}catch(e){setError(e.message);}}
  return <div className="app">
    <header className="topbar"><a className="wordmark" href="/">D.one<span>STUDIO</span></a><div className="top-center"><span className="local-dot"/>LOCAL WORKSPACE</div><div className="top-actions"><span className="saved">{saved&&<><Check size={13}/>{saved}</>}</span><button className="quiet" onClick={showHistory} disabled={!!busy}><History size={16}/>프로젝트</button><button className="quiet" disabled={!project||!!busy} onClick={()=>{setProject(null);setSelected(0);setSaved('');setError('');setUrl('');setTranscript('');setPhotos([]);setAngle('');setManual(false);}}><Plus size={16}/>새로 만들기</button></div></header>
    <div className="workspace">
      <aside className="source-panel"><div className="panel-head"><span className="eyebrow">01 / SOURCE</span><h2>영상에서 시작하기</h2></div>
        <label className="field"><span>YouTube URL</span><div className="input-wrap"><input aria-label="YouTube URL" placeholder="https://youtube.com/watch?v=…" value={url} onChange={e=>setUrl(e.target.value)} disabled={!!busy}/><ArrowUpRight size={16}/></div></label>
        <button className={`manual-toggle ${manual?'active':''}`} onClick={()=>setManual(v=>!v)} disabled={!!busy}><FileText size={14}/>자막 직접 넣기<ChevronDown size={14}/></button>
        {manual&&<div className="manual-fields"><label className="field"><span>영상 제목 <small>선택</small></span><input value={sourceTitle} onChange={e=>setSourceTitle(e.target.value)} placeholder="영상 제목을 입력하세요" disabled={!!busy}/></label><label className="field"><span>스크립트</span><textarea aria-label="스크립트" placeholder="영어·한국어 자막을 붙여넣으세요. 타임스탬프가 있으면 함께 유지합니다." value={transcript} onChange={e=>setTranscript(e.target.value)} disabled={!!busy}/></label><button className="text-button" onClick={()=>transcriptInput.current.click()} disabled={!!busy}><Upload size={13}/>TXT / SRT / VTT 가져오기</button><input type="file" ref={transcriptInput} hidden accept=".txt,.srt,.vtt,.json3" onChange={async e=>{if(e.target.files[0])setTranscript(await e.target.files[0].text());e.target.value='';}}/></div>}
        <label className="field angle-field"><span>기사 관점 <small>선택</small></span><textarea aria-label="기사 관점" value={angle} onChange={e=>setAngle(e.target.value)} disabled={!!busy} placeholder="예: 초기 창업가의 고객 인터뷰에 집중해줘"/><p className="hint">비워두면 영상에서 중심 주제를 찾습니다.</p></label>
        <div className="section-rule"/><div className="photo-heading"><span className="eyebrow">02 / PHOTOGRAPHY</span><span>{photos.length}/8</span></div>
        <button className="upload-zone" onClick={()=>photoInput.current.click()} disabled={!!busy} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)addPhotos([...e.dataTransfer.files]);}}><Plus size={22}/><strong>사진 추가</strong><span>표지와 본문에 사용할 사진<br/>JPG · PNG · WebP</span></button><input ref={photoInput} type="file" hidden multiple accept="image/jpeg,image/png,image/webp" onChange={e=>addPhotos([...e.target.files])}/>
        {!!photos.length&&<div className="photo-grid">{photos.map((p,i)=><button key={p.id} className={project?.coverPhotoId===p.id||(!project&&i===0)?'selected':''} title={p.name} disabled={!!busy} onClick={()=>{if(project)setProject(v=>({...v,coverPhotoId:p.id}));else setPhotos(old=>[p,...old.filter(a=>a.id!==p.id)]);}}><img src={p.original} alt={p.name}/>{(project?.coverPhotoId===p.id||(!project&&i===0))&&<span>표지</span>}</button>)}</div>}
        <p className="hint">원본 사진에서 피사체를 분리하고<br/>D.one 스타일로 보정합니다.</p>
        <div className="generate-area"><button className="primary generate" onClick={generate} disabled={!!busy||(!url.trim()&&!(manual&&transcript.trim()))}>{busy?<LoaderCircle className="spin" size={17}/>:<ArrowRight size={17}/>} {busy?busy.label:'매거진 초안 생성'}</button><div className="cli-status"><span className={status?.loggedIn?'online':'offline'}/>{status?status.loggedIn?'Codex CLI 연결됨':'Codex CLI 로그인 필요':'Codex CLI 확인 중'}</div></div>
      </aside>
      <main className="canvas-panel"><div className="canvas-toolbar"><div><span className="eyebrow">{project?'MAGAZINE DRAFT':'TEMPLATE PREVIEW'}</span><h1>{project?selected===0?'표지':selected===scenes.length-1?'엔딩':`본문 ${selected}`:'D.one 에디토리얼'}</h1></div><div className="canvas-tools">{project&&selected===0&&<button className={`quiet ${variants?'chosen':''}`} onClick={()=>setVariants(v=>!v)}><Layers size={15}/>표지 후보</button>}<span className="dimension">1080 × 1350</span></div></div>
        {error&&<div className="error-banner" role="alert"><span>{error}</span><button aria-label="오류 닫기" onClick={()=>setError('')}><X size={16}/></button></div>}
        <div className={`canvas-stage ${busy?'processing':''}`}>
          {!project?<div className="reference-poster"><img src="/references/cover.jpg" alt="D.one 표지 스타일 참조: 주황·파랑·흑백 콜라주"/><div className="reference-caption"><span>STYLE REFERENCE</span><span>사진과 영상으로 새 초안을 만드세요</span></div></div>:variants&&selected===0?<div className="variant-grid">{[0,1,2].map(v=><button key={v} className={`variant ${project.coverVariant===v?'selected':''}`} onClick={()=>{setProject(p=>({...p,coverVariant:v}));setVariants(false);}}><div dangerouslySetInnerHTML={{__html:sceneSvg(makeScenes(project,project.photos,v,measure)[0])}}/><span>구도 {String(v+1).padStart(2,'0')}{project.coverVariant===v&&<Check size={14}/>}</span></button>)}</div>:<div className="poster" aria-label="매거진 미리보기" dangerouslySetInnerHTML={{__html:sceneSvg(scene)}}/>}
          {busy&&<div className="progress-overlay" role="status"><LoaderCircle size={28} className="spin"/><strong>{busy.label}</strong><p>{busy.message}</p><span>이 창을 열어 둔 채 기다려 주세요.</span></div>}
        </div>
        {project?<div className="filmstrip">{scenes.map((s,i)=><button key={s.id} className={`page-thumb ${selected===i?'selected':''}`} onClick={()=>{setSelected(i);setVariants(false);}}><div dangerouslySetInnerHTML={{__html:sceneSvg(s)}}/><span>{String(i+1).padStart(2,'0')} <small>{i===0?'표지':i===scenes.length-1?'엔딩':'본문'}</small></span></button>)}</div>:<div className="empty-strip"><span>표지</span><ArrowRight size={14}/><span>내용에 맞는 본문</span><ArrowRight size={14}/><span>D.one 엔딩</span></div>}
      </main>
      <aside className="editor-panel"><div className="panel-head"><span className="eyebrow">03 / EDITOR</span><h2>{project?'텍스트 편집':'편집 준비'}</h2></div>
        {!project?<div className="editor-empty"><FileText size={30} strokeWidth={1}/><p>초안을 생성하면<br/>제목과 본문을 수정할 수 있습니다.</p><div className="style-notes"><span>표지 스타일</span><div className="swatches"><i style={{background:'#ff660f'}}/><i style={{background:'#1712ff'}}/><i style={{background:'#0a0a0a'}}/><i style={{background:'#edeae3'}}/></div><p>분리한 피사체 · 강한 흑백 대비<br/>콜라주 · 거친 인쇄 질감</p></div></div>:<>
          {selected===0?<><label className="field"><span>표지 제목</span><textarea aria-label="표지 제목" className="title-edit" value={project.draft.title} onChange={e=>updateDraft('title',e.target.value)} maxLength={120}/><p className="hint">줄바꿈을 넣어 제목의 호흡을 조정하세요.</p></label>{!!project.draft.coverTitles?.length&&<div className="title-suggestions"><span className="field-caption">제목 후보</span>{project.draft.coverTitles.map((t,i)=><button key={i} onClick={()=>updateDraft('title',t)}>{t}<ArrowUpRight size={13}/></button>)}</div>}<label className="field"><span>상단 문구</span><input aria-label="상단 문구" value={project.draft.sectionLabel??'FOUNDER’S NOTE'} onChange={e=>updateDraft('sectionLabel',e.target.value)}/></label><div className="article-angle"><span className="eyebrow">기사의 중심</span><p>{project.draft.angle}</p></div></>:card?<><div className="layout-label"><ImageIcon size={14}/>{pageNames[card.layout]}</div><label className="field"><span>제목</span><textarea aria-label="본문 제목" className="title-edit" value={card.title} onChange={e=>updateCard('title',e.target.value)} maxLength={160}/></label><label className="field"><span>본문 <small>{card.body.length}자</small></span><textarea aria-label="본문" className="body-edit" value={card.body} onChange={e=>updateCard('body',e.target.value)} maxLength={2000}/></label><label className="field"><span>밑줄 강조</span><input aria-label="밑줄 강조" value={card.emphasis} onChange={e=>updateCard('emphasis',e.target.value)} placeholder="본문에 있는 문구"/></label><div className="evidence"><span className="eyebrow">원문 근거</span>{card.manuallyEdited&&<p className="edit-note">수정한 문구는 원문 근거와 다시 비교해 주세요.</p>}{card.evidence.map((e,i)=><div key={i}><a href={project.source.url&&e.start!=null?`${project.source.url}${project.source.url.includes('?')?'&':'?'}t=${Math.floor(e.start)}s`:undefined} target="_blank" rel="noreferrer">{time(e.start)}{project.source.url&&e.start!=null&&<ExternalLink size={11}/>}</a><blockquote>{e.quote}</blockquote></div>)}</div></>:<><label className="field"><span>엔딩 제목</span><input aria-label="엔딩 제목" value={project.draft.endingTitle??'D.one'} onChange={e=>updateDraft('endingTitle',e.target.value)}/></label><label className="field"><span>엔딩 문구</span><textarea aria-label="엔딩 문구" value={project.draft.endingSubtitle??'D o  o n e  a n d  D o n e'} onChange={e=>updateDraft('endingSubtitle',e.target.value)}/></label></>}
          {scene?.nodes.some(n=>n.overflow)&&<p className="overflow-warning">텍스트가 페이지 영역을 넘습니다. 내용을 줄여 주세요.</p>}
        </>}
        <div className="export-area"><span className="eyebrow">EXPORT</span><button className="export-button" onClick={()=>exportFile('png')} disabled={!project||!!busy||exporting}><Download size={16}/>전체 PNG 다운로드{exporting&&<LoaderCircle size={14} className="spin"/>}</button><button className="export-button" onClick={()=>exportFile('figma')} disabled={!project||!!busy||exporting}><Layers size={16}/>Figma 편집 파일<ArrowUpRight size={14}/></button><a className="plugin-link" href="/api/plugin" download="D.one-figma-plugin.zip">Figma 플러그인 다운로드<Download size={12}/></a>{project&&<button className="text-button" onClick={()=>download(new Blob([project.source.segments.map(s=>`${s.start==null?'':`[${time(s.start)}] `}${s.text}`).join('\n')],{type:'text/plain;charset=utf-8'}),'transcript.txt')}><FileText size={12}/>원본 스크립트 다운로드</button>}</div>
      </aside>
    </div>
    {notice&&<div className="toast" role="status"><Check size={15}/>{notice}</div>}
    {history!==null&&<div className="modal-backdrop" onClick={()=>setHistory(null)}><section className="history-modal" role="dialog" aria-label="저장한 프로젝트" onClick={e=>e.stopPropagation()}><div className="modal-head"><h2>저장한 프로젝트</h2><button aria-label="프로젝트 닫기" onClick={()=>setHistory(null)}><X size={19}/></button></div>{history.length?history.map(p=><button className="history-item" key={p.id} onClick={()=>loadProject(p.id)}><div><strong>{p.title}</strong><span>{p.cardCount}장 · {new Date(p.updatedAt).toLocaleDateString('ko-KR')}</span></div><ArrowRight size={17}/></button>):<p className="history-empty">아직 저장한 프로젝트가 없습니다.</p>}</section></div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
