import test from 'node:test';
import assert from 'node:assert/strict';
import {SPEC,bodyLayoutSpec} from '../shared/spec.js';
import {makeScenes,WIDTH,HEIGHT} from '../shared/scene.js';
import {BODY_TEMPLATES,ENDING_TEMPLATE} from '../shared/templates.js';

// Locked D.one template spec (docs/decisions/001-magazine-template-spec.md).
// Changing any value here must be a deliberate design decision.
test('Spec values are locked',()=>{
  assert.deepEqual(SPEC.canvas,{width:1080,height:1350,margin:80,contentWidth:920});
  assert.deepEqual(SPEC.colors,{ink:'#0A0A0A',paper:'#EDEAE3',blue:'#001AFF',light:'#fff'});
  assert.deepEqual(SPEC.cover,{
    gradient:{y:940,height:410,stops:[{position:0,opacity:0},{position:0.62,opacity:1}]},
    grainOpacity:0.32,
    blueHighlight:'#163BFF',
    title:{fontFamily:'Pretendard',fontWeight:800,fontSize:90,lineHeight:108,maxHeight:350,minY:840,maxY:1010,bottomY:1250},
    logo:{fontSize:36,gapBelowTitle:50,hangulDescent:8},
  });
  assert.deepEqual(SPEC.body,{
    grainOpacity:0.45,
    title:{fontFamily:'Pretendard',fontWeight:700,fontSize:55,maxHeight:160},
    text:{fontFamily:'Pretendard',fontWeight:400,fontSize:30},
    titleToBody:64,
    photoHeight:675,
    overlayShadeOpacity:0.76,
    header:{logoY:72,logoSize:26},
    footer:{ruleY:1248,ruleOpacity:0.3,logoY:1268,logoSize:26},
    layouts:{
      overlay:{titleY:365,bodyLimit:1190,brand:'footer'},
      photoTop:{titleY:750,bodyLimit:1225,brand:'footer'},
      photoBottom:{titleY:174,bodyLimit:645,brand:'header'},
    },
  });
  assert.ok(Object.isFrozen(SPEC)&&Object.isFrozen(SPEC.cover.title),'spec must be immutable');
});
test('Template order and layout families are locked',()=>{
  assert.deepEqual(BODY_TEMPLATES.map(t=>`${t.file}:${t.layout}`),['#2.jpg:photo-overlay','#3.jpg:dark-top','#4.jpg:dark-bottom','#5.jpg:dark-bottom','#6.jpg:photo-overlay']);
  assert.equal(ENDING_TEMPLATE,'#7.jpg');
  assert.equal(bodyLayoutSpec('photo-overlay'),SPEC.body.layouts.overlay);
  for(const l of ['dark-top','paper-top'])assert.equal(bodyLayoutSpec(l),SPEC.body.layouts.photoTop);
  for(const l of ['dark-bottom','paper-bottom'])assert.equal(bodyLayoutSpec(l),SPEC.body.layouts.photoBottom);
});
test('Rendered scenes follow the spec',()=>{
  assert.deepEqual([WIDTH,HEIGHT],[SPEC.canvas.width,SPEC.canvas.height]);
  const layouts=['photo-overlay','dark-top','dark-bottom'];
  const scenes=makeScenes({draft:{title:'대학은 창업가를\n어떻게 길러야 하는가',cards:layouts.map((l,i)=>({id:`c${i}`,title:'제목',body:'본문',layoutOverride:l}))}});
  const cover=scenes[0].nodes,find=(nodes,name)=>nodes.find(n=>n.name===name);
  assert.equal(find(cover,'Cover title').y,1010);
  scenes.slice(1,-1).forEach((scene,i)=>{
    const layout=bodyLayoutSpec(layouts[i]),title=find(scene.nodes,'Card title'),body=find(scene.nodes,'Card body');
    assert.equal(title.y,layout.titleY);
    assert.equal(body.y,title.y+title.height+SPEC.body.titleToBody);
    assert.equal(!!find(scene.nodes,'Footer line'),layout.brand==='footer');
  });
});
