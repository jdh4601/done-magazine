import test from 'node:test';
import assert from 'node:assert/strict';
import {coverFit,photoRoles} from '../shared/photos.js';
import {makeScenes} from '../shared/scene.js';

test('Minimum crop fills the page after excluding white source margins',()=>{
  const photo={sourceWidth:1080,sourceHeight:1350,contentBounds:{x:32,y:0,width:1015,height:1350}};
  const [x,y,w,h]=coverFit(photo),scale=w/photo.sourceWidth,b=photo.contentBounds;
  assert.ok(Math.abs(x+b.x*scale)<1e-8);
  assert.ok(Math.abs(x+(b.x+b.width)*scale-1080)<1e-8);
  assert.ok(y<=0&&y+h>=1350);
  assert.equal(scale,Math.max(1080/b.width,1350/b.height));
});
test('Position and zoom stay inside the crop without exposing empty edges',()=>{
  for(const [sw,sh] of [[1600,900],[736,919],[1080,1350]])for(const height of [675,1350])for(const zoom of [1,1.2,2])for(const x of [-100,0,100])for(const y of [-100,0,100]){
    const [left,top,width,h]=coverFit({sourceWidth:sw,sourceHeight:sh},1080,height,{x,y,zoom});
    assert.ok(left<=1e-8&&top<=1e-8);
    assert.ok(left+width>=1080-1e-8&&top+h>=height-1e-8);
  }
});
test('Cover and body uploads are separate and body photos follow page order',()=>{
  const photos=[{id:'cover',role:'cover',gray:'cover-gray',blue:'blue',subject:'subject',coverStyleVersion:3},...Array.from({length:3},(_,i)=>({id:`body${i}`,role:'body',gray:`body${i}-gray`}))];
  const project={coverPhotoId:'cover',draft:{title:'제목',cards:Array.from({length:4},(_,i)=>({id:`c${i}`,title:'제목',body:'본문',emphasis:''}))}};
  const scenes=makeScenes(project,photos);
  assert.deepEqual(scenes.slice(1,-1).map(s=>s.nodes.find(n=>n.name==='Article photo')?.src),['body0-gray','body1-gray','body2-gray',undefined]);
  assert.ok(!scenes.slice(1,-1).some(s=>s.nodes.some(n=>n.src==='cover-gray')));
  assert.equal(photoRoles(null,photos.slice(1)).cover,undefined);
  assert.equal(scenes.at(-1).nodes[0].src,'/templates/%237.jpg');
});
