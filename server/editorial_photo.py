"""Apply selective colour to real secondary objects, preserving source coordinates."""
import json, sys
import numpy as np
from PIL import Image, ImageOps, ImageEnhance, ImageFilter, ImageChops
from rembg import remove, new_session

source, output_dir, plan_file = sys.argv[1:4]
image = Image.open(source).convert('RGBA')
width, height = image.size
plan = json.load(open(plan_file))
session = new_session('u2netp', providers=['CPUExecutionProvider'])

def bounds(box):
    x = min(width-1, max(0, round(box['x'] * width)))
    y = min(height-1, max(0, round(box['y'] * height)))
    return (x, y, min(width, x+max(1, round(box['width']*width))),
            min(height, y+max(1, round(box['height']*height))))

def object_mask(box):
    region = bounds(box)
    crop = image.crop(region)
    cutout = remove(crop, session=session)
    mask = Image.new('L', image.size, 0)
    mask.paste(cutout.getchannel('A'), region[:2])
    return mask

# Segment the subject with the full frame as context. Cropping to the AI box
# caused dark jackets and arms to disappear and hard-clipped anything outside it.
# Secondary objects still use their own crops for selective colour below.
subject_mask = remove(image, session=session).getchannel('A')
if plan.get('subjectType') == 'person':
    # The general model can make dark clothing translucent. Retain body regions
    # found by the person model, while keeping fine hair from the general mask.
    person_session = new_session('u2net_human_seg', providers=['CPUExecutionProvider'])
    person_mask = remove(image, session=person_session).getchannel('A')
    subject_mask = ImageChops.lighter(subject_mask, person_mask)
if not subject_mask.getbbox():
    raise RuntimeError('주 피사체를 분리하지 못했습니다. 다른 사진을 사용하세요.')
mono = ImageOps.grayscale(image)
# Keep facial midtones; print texture belongs in its own overlay, not crushed skin.
subject_tone = ImageEnhance.Contrast(mono).enhance(1.08)
subject_tone = ImageEnhance.Brightness(subject_tone).enhance(1.04)
subject_tone = subject_tone.filter(ImageFilter.UnsharpMask(radius=.7, percent=65, threshold=3)).convert('RGB')
subject_tone.putalpha(subject_mask)
subject_tone.save(output_dir+'/subject.png')

# Protect the silhouette and a small edge margin; the bounding rectangle may
# contain real background objects such as a table beside the person's hands.
protected = np.asarray(subject_mask.filter(ImageFilter.MaxFilter(9)), dtype=np.float32)/255
accent_alpha = np.zeros((height,width), dtype=np.float32)
for box in plan['accents']:
    mask = np.asarray(object_mask(box), dtype=np.float32)/255
    accent_alpha = np.maximum(accent_alpha, mask*(1-protected))

light = np.asarray(mono, dtype=np.float32)/255
tone = np.clip((light-.15)*1.4, 0, 1)
rgb = np.stack([255*tone,102*tone,15*tone],axis=-1)
accent = np.dstack([rgb,accent_alpha*255]).astype(np.uint8)
Image.fromarray(accent,'RGBA').save(output_dir+'/accents.png')

# A background duotone that preserves dark outlines without artificial colour planes.
background = ImageOps.colorize(mono, sys.argv[4], sys.argv[5])
background.save(output_dir+'/blue.png')
print(json.dumps({'accentPixelCount':int(np.count_nonzero(accent[:,:,3]))}))
