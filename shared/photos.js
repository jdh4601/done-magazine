export const MAX_COVER_PHOTOS=3;
export function validatePhotoCounts(photos){
  if(!Array.isArray(photos))throw new Error('사진 목록을 확인하세요.');
  const {covers,body}=photoRoles(null,photos);
  if(covers.length>MAX_COVER_PHOTOS)throw new Error('썸네일 표지 사진은 최대 3장까지 사용할 수 있습니다.');
  if(body.length>16)throw new Error('본문 사진은 최대 16장까지 사용할 수 있습니다.');
}
export function photoRoles(project,photos=[]){
  const cover=photos.find(p=>p.id===project?.coverPhotoId)||photos.find(p=>p.role==='cover')||photos.find(p=>!p.role);
  const covers=photos.filter(p=>p.role==='cover'||p.id===cover?.id);
  return {cover,covers,body:photos.filter(p=>p.id!==cover?.id&&p.role!=='cover')};
}
export function coverFit(photo,width=1080,height=1350,position={}){
  const sw=photo?.sourceWidth||photo?.subjectWidth||width,sh=photo?.sourceHeight||photo?.subjectHeight||height;
  const b=photo?.contentBounds||{x:0,y:0,width:sw,height:sh};
  const zoom=Math.max(1,Math.min(2,Number(position.zoom)||1));
  const scale=Math.max(width/b.width,height/b.height)*zoom;
  const pan=value=>Math.max(-100,Math.min(100,Number(value)||0))/100;
  return [(width-b.width*scale)/2-b.x*scale+pan(position.x)*(b.width*scale-width)/2,(height-b.height*scale)/2-b.y*scale+pan(position.y)*(b.height*scale-height)/2,sw*scale,sh*scale];
}

export function selectCoverPhoto(project,id){
  const {cover,covers}=photoRoles(project,project.photos);
  const target=covers.find(p=>p.id===id);
  if(!target||cover?.id===id)return project;
  return {...project,photos:project.photos.map(p=>p.id===cover?.id?{...p,coverPhotoPosition:project.coverPhotoPosition||{},coverVariant:project.coverVariant||0}:p),coverPhotoId:id,coverPhotoPosition:target.coverPhotoPosition||{x:0,y:0,zoom:1},coverVariant:target.coverVariant||0};
}
