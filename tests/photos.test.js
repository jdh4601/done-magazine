import test from 'node:test';
import assert from 'node:assert/strict';
import {coverFit,photoRoles} from '../shared/photos.js';
import {makeScenes} from '../shared/scene.js';
import {textOnlyCards} from '../shared/pages.js';

test('New drafts stay text-only even with uploaded body photos, including after save and reorder',()=>{
  const photos=[{id:'a',role:'body',original:'a-color.png',gray:'a-gray.png'}];
  const cards=textOnlyCards([{id:'first',title:'첫 페이지',body:'본문',photoId:'a'}, {id:'second',title:'둘째 페이지',body:'본문'}]);
  const project=JSON.parse(JSON.stringify({draft:{title:'표지',cards}}));
  project.draft.cards.reverse();
  const scenes=makeScenes(project,photos);
  assert.ok(scenes.slice(1,-1).every(s=>!s.nodes.some(n=>n.type==='image')));
  project.draft.cards[0].photoId='a';
  const updated=makeScenes(project,photos);
  assert.equal(updated[1].nodes.find(n=>n.name==='Article photo').src,'a-color.png');
  assert.ok(!updated[2].nodes.some(n=>n.type==='image'));
});

test('All cover styles and body layouts add grain over photos, keeping text and ending clear',()=>{
  const photos=[{id:'cover',role:'cover',original:'cover-color.png',blue:'blue.png'}, {id:'body',role:'body',original:'body-color.png',gray:'body-gray.png'}];
  for(const coverStyle of ['original','editorial']){
    const scenes=makeScenes({coverStyle,draft:{title:'표지',cards:['photo-overlay','dark-top','dark-bottom','paper-top','paper-bottom'].map((layoutOverride,i)=>({id:`c${i}`,title:'제목',body:'본문',layoutOverride,photoAssigned:true,photoId:'body'}))}},photos);
    const grain=scenes[0].nodes.findIndex(n=>n.name==='Dry ink and paper grain');
    assert.ok(grain>=0&&grain<scenes[0].nodes.findIndex(n=>n.name==='Cover title'));
    for(const scene of scenes.slice(1,-1)){
      const photo=scene.nodes.find(n=>n.name==='Article photo'),noise=scene.nodes.find(n=>n.name==='Dry ink and paper grain');
      assert.equal(photo.src,'body-color.png');
      assert.deepEqual(noise.clip,photo.clip);
      assert.equal(noise.y,photo.clip.y);assert.equal(noise.height,photo.clip.height);
      assert.ok(scene.nodes.indexOf(noise)<scene.nodes.findIndex(n=>n.name==='Card title'));
    }
    assert.equal(scenes.at(-1).nodes.length,1);
    assert.equal(scenes.at(-1).nodes[0].name,'Original ending template');
  }
});

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
  const photos=[{id:'cover',role:'cover',gray:'cover-gray',blue:'blue',subject:'subject',coverStyleVersion:3},...Array.from({length:3},(_,i)=>({id:`body${i}`,role:'body',original:`body${i}-color`,gray:`body${i}-gray`}))];
  const project={coverPhotoId:'cover',draft:{title:'제목',cards:Array.from({length:4},(_,i)=>({id:`c${i}`,title:'제목',body:'본문',emphasis:''}))}};
  const scenes=makeScenes(project,photos);
  assert.deepEqual(scenes.slice(1,-1).map(s=>s.nodes.find(n=>n.name==='Article photo')?.src),['body0-color','body1-color','body2-color',undefined]);
  assert.ok(!scenes.slice(1,-1).some(s=>s.nodes.some(n=>n.src==='cover-gray')));
  assert.equal(photoRoles(null,photos.slice(1)).cover,undefined);
  assert.equal(scenes.at(-1).nodes[0].src,'/templates/%237.jpg');
});
