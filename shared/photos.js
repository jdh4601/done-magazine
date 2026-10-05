export function photoRoles(project,photos=[]){
  const cover=photos.find(p=>p.id===project?.coverPhotoId)||photos.find(p=>p.role==='cover')||photos.find(p=>!p.role);
  return {cover,body:photos.filter(p=>p.id!==cover?.id&&p.role!=='cover')};
}
export function coverFit(photo,width=1080,height=1350,position={}){
  const sw=photo?.sourceWidth||photo?.subjectWidth||width,sh=photo?.sourceHeight||photo?.subjectHeight||height;
  const b=photo?.contentBounds||{x:0,y:0,width:sw,height:sh};
  const zoom=Math.max(1,Math.min(2,Number(position.zoom)||1));
  const scale=Math.max(width/b.width,height/b.height)*zoom;
  const pan=value=>Math.max(-100,Math.min(100,Number(value)||0))/100;
  return [(width-b.width*scale)/2-b.x*scale+pan(position.x)*(b.width*scale-width)/2,(height-b.height*scale)/2-b.y*scale+pan(position.y)*(b.height*scale-height)/2,sw*scale,sh*scale];
}
