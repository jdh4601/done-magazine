import test from 'node:test';
import assert from 'node:assert/strict';
import {makeScenes,sceneSvg} from '../shared/scene.js';

const project=count=>({draft:{title:'고객의 문제에서 시작하는 법',cards:Array.from({length:count},(_,i)=>({id:`c${i}`,title:'작게 시작하라',body:'고객이 겪는 문제를 듣고 첫 제품의 범위를 정한다.',layout:'paper-top',emphasis:''}))}});
test('Magazine uses exact Pretendard weights, sizes and 64px text spacing',()=>{
  const scenes=makeScenes(project(12));
  const title=scenes[0].nodes.find(n=>n.name==='Cover title');
  assert.deepEqual([title.fontFamily,title.fontWeight,title.fontSize],['Pretendard',800,90]);
  for(const page of scenes.filter(s=>s.kind==='article')){
    const headline=page.nodes.find(n=>n.name==='Card title'),body=page.nodes.find(n=>n.name==='Card body');
    assert.deepEqual([headline.fontFamily,headline.fontWeight,headline.fontSize],['Pretendard',700,55]);
    assert.deepEqual([body.fontFamily,body.fontWeight,body.fontSize],['Pretendard',400,30]);
    assert.equal(body.y-headline.y-headline.height,64);
  }
});
test('Body repeats numbered templates and ending is the unchanged source image',()=>{
  const scenes=makeScenes(project(12));
  assert.deepEqual(scenes.slice(1,-1).map(s=>s.templateFile),['#2.jpg','#3.jpg','#4.jpg','#5.jpg','#6.jpg','#2.jpg','#3.jpg','#4.jpg','#5.jpg','#6.jpg','#2.jpg','#3.jpg']);
  assert.deepEqual(scenes.slice(1,6).map(s=>s.layout),['photo-overlay','dark-top','dark-bottom','dark-bottom','photo-overlay']);
  assert.equal(scenes.at(-1).nodes.length,1);
  assert.deepEqual(scenes.at(-1).nodes[0],{type:'image',name:'Original ending template',src:'/templates/%237.jpg',x:0,y:0,width:1080,height:1350});
});
test('Long edited text reports overflow without shrinking prescribed font sizes',()=>{
  const p=project(5);p.draft.title='표지 제목 '.repeat(60);p.draft.cards[2].body='내용 '.repeat(300);
  const scenes=makeScenes(p),title=scenes[0].nodes.find(n=>n.name==='Cover title'),body=scenes[3].nodes.find(n=>n.name==='Card body');
  assert.equal(title.fontSize,90);assert.ok(title.overflow);
  assert.equal(body.fontSize,30);assert.ok(body.overflow);
});
test('Cover always has the bottom black gradient with Figma stops 0%→62%',()=>{
  for(const coverStyle of ['editorial','original']){
    const p={...project(1),coverStyle};
    const cover=makeScenes(p)[0],shade=cover.nodes.find(n=>n.name==='Title gradient');
    assert.ok(shade,`${coverStyle} cover is missing the gradient`);
    assert.deepEqual([shade.x,shade.y,shade.width,shade.height],[0,940,1080,410]);
    assert.deepEqual(shade.gradientStops,[{position:0,opacity:0},{position:0.62,opacity:1}]);
    assert.ok(cover.nodes.indexOf(shade)<cover.nodes.findIndex(n=>n.name==='Cover title'));
    const svg=sceneSvg(cover);
    assert.match(svg,/<stop offset="0" stop-color="#000" stop-opacity="0"\/><stop offset="0.62" stop-color="#000" stop-opacity="1"\/>/);
  }
});
