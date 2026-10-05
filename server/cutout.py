import sys, os
from PIL import Image, ImageOps
from rembg import remove, new_session

source, target = sys.argv[1:3]
image = ImageOps.exif_transpose(Image.open(source)).convert('RGBA')
image.thumbnail((1500, 1500))
session = new_session('u2netp', providers=['CPUExecutionProvider'])
output = remove(image, session=session)
bbox = output.getchannel('A').getbbox()
if not bbox:
    raise RuntimeError('사진에서 피사체를 분리하지 못했습니다. 다른 사진을 사용하세요.')
output.crop(bbox).save(target)
