"""Apply selective colour to real secondary objects, preserving source coordinates."""
import json, sys
import numpy as np
from PIL import Image, ImageOps, ImageEnhance
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

subject_mask = object_mask(plan['subject'])
if not subject_mask.getbbox():
    raise RuntimeError('주 피사체를 분리하지 못했습니다. 다른 사진을 사용하세요.')
mono = ImageOps.grayscale(image)
# Dry ink edges and four-bit halftone-like tonal steps, with readable highlights.
subject_tone = ImageEnhance.Contrast(ImageOps.autocontrast(mono, cutoff=1)).enhance(1.65)
subject_tone = ImageOps.posterize(subject_tone.convert('RGB'), 4)
subject_tone.putalpha(subject_mask)
subject_tone.save(output_dir+'/subject.png')

# Protect the whole primary bounding box, not just the imperfect segmentation edge.
protected = np.asarray(subject_mask, dtype=np.float32)/255
sx, sy, ex, ey = bounds(plan['subject'])
protected[sy:ey, sx:ex] = 1
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
background = ImageEnhance.Contrast(ImageOps.autocontrast(mono, cutoff=1)).enhance(1.35)
background = ImageOps.colorize(background, '#030415', '#1712FF')
background.save(output_dir+'/blue.png')
