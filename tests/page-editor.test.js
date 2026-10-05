import test from 'node:test';
import assert from 'node:assert/strict';
import {makeScenes} from '../shared/scene.js';

test('Old emphasis never creates underline nodes',()=>{
  const scenes=makeScenes({draft:{title:'표지',cards:[{id:'card',title:'제목',body:'강조할 문장',emphasis:'강조할 문장'}]}});
  assert.ok(!scenes[1].nodes.some(n=>n.name==='Emphasis underline'));
});
test('Explicit page template and photo survive reordering with a fixed ending',()=>{
  const photos=[{id:'cover',role:'cover',gray:'cover',subject:'subject'}, {id:'a',role:'body',gray:'a.png'}, {id:'b',role:'body',gray:'b.png'}];
  const a={id:'a',title:'첫 페이지',body:'본문',layoutOverride:'dark-top',templateOverride:'#3.jpg',photoAssigned:true,photoId:'a'};
  const b={id:'b',title:'둘째 페이지',body:'본문',layoutOverride:'dark-bottom',templateOverride:'#4.jpg',photoAssigned:true,photoId:'b'};
  const scenes=makeScenes({coverPhotoId:'cover',draft:{title:'표지',cards:[b,a,{id:'new',title:'새 페이지',body:'',layoutOverride:'photo-overlay',templateOverride:'#2.jpg',photoAssigned:true,photoId:null}]}},photos);
  assert.deepEqual(scenes.slice(1,-1).map(s=>s.layout),['dark-bottom','dark-top','photo-overlay']);
  assert.deepEqual(scenes.slice(1,-1).map(s=>s.nodes.find(n=>n.name==='Article photo')?.src),['b.png','a.png',undefined]);
  assert.equal(scenes[0].kind,'cover');assert.equal(scenes.at(-1).templateFile,'#7.jpg');
});
