import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const python=fileURLToPath(new URL('../.venv/bin/python',import.meta.url));
test('Subject segmentation preserves shoulders outside the suggested box and excludes them from accent colour',{skip:!existsSync(python)},()=>{
  const result=spawnSync(python,['-c',`
import json, runpy, sys, tempfile, types
from pathlib import Path
from PIL import Image, ImageDraw

# Deterministic segmentation isolates cropping and mask compositing from model accuracy.
calls = []
models = []
def remove(image, session=None):
    calls.append(image.size)
    result = image.copy()
    mask = Image.new('L', image.size, 0)
    if image.size == (100, 100):
        if session == 'u2net_human_seg':
            ImageDraw.Draw(mask).rectangle((10, 10, 80, 99), fill=255)
        else:
            ImageDraw.Draw(mask).rectangle((40, 10, 80, 99), fill=255)
            mask.putpixel((5, 5), 255)
    else:
        mask.paste(255, (0, 0, image.width, image.height))
    result.putalpha(mask)
    return result
def new_session(model, **kwargs):
    models.append(model)
    return model
sys.modules['rembg'] = types.SimpleNamespace(remove=remove, new_session=new_session)
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    Image.new('RGBA', (100, 100), (40, 40, 40, 255)).save(root/'original.png')
    plan = {'subjectType': 'person', 'subject': {'x': .4, 'y': .4, 'width': .2, 'height': .2},
            'accents': [{'x': .5, 'y': .5, 'width': .2, 'height': .2},
                        {'x': .85, 'y': 0, 'width': .15, 'height': .1}]}
    (root/'plan.json').write_text(json.dumps(plan))
    sys.argv = ['editorial_photo.py', str(root/'original.png'), tmp, str(root/'plan.json'), '#001AFF', '#163BFF']
    runpy.run_path('server/editorial_photo.py', run_name='__main__')
    subject = Image.open(root/'subject.png').getchannel('A')
    accents = Image.open(root/'accents.png').getchannel('A')
    assert calls[:2] == [(100, 100), (100, 100)], calls
    assert models == ['u2netp', 'u2net_human_seg'], models
    assert subject.size == (100, 100)
    assert subject.getpixel((15, 50)) == 255, 'shoulder outside the AI box was lost'
    assert subject.getpixel((50, 90)) == 255, 'lower body outside the AI box was lost'
    assert subject.getpixel((5, 5)) == 255, 'fine foreground detail from the general mask was lost'
    assert subject.getpixel((0, 0)) == 0, 'background was retained'
    assert accents.getpixel((50, 50)) == 0, 'body was recoloured as an accent'
    assert accents.getpixel((99, 0)) == 255, 'independent accent was lost'
`],{cwd:fileURLToPath(new URL('..',import.meta.url)),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
});
