"""Generate a no-stretch Hina WALK preview using only rigid 2D translation.
Original secretary.png and greeting.gif remain unchanged.
For articulated walking, use independently cut rigid body parts rather than pixel warping.
"""
from PIL import Image
import math, json, hashlib
from pathlib import Path

root=Path(__file__).resolve().parents[1]
src=root/'shared/hina/assets/secretary.png'
out=root/'shared/hina/assets/walk.gif'
original=Image.open(src).convert('RGBA')
# Consistent frame, anchored silhouette and original aspect ratio; no nonuniform scaling.
canvas_size=(512,624)
sprite=original.copy()
sprite.thumbnail((500,600),Image.Resampling.LANCZOS)
base_x=(canvas_size[0]-sprite.width)//2
base_y=canvas_size[1]-sprite.height-10
frames=[]
for i in range(10):
    phase=2*math.pi*i/10
    # A gentle rigid-body stepping preview; never warp the character or change its size.
    dx=round(2*math.sin(phase))
    dy=round(2*(1-math.cos(2*phase))/2)
    canvas=Image.new('RGBA',canvas_size,(0,0,0,0))
    canvas.alpha_composite(sprite,(base_x+dx,base_y-dy))
    frames.append(canvas)

# Use one shared palette across frames so transparent pixels remain transparent.
pal=[]
for frame in frames:
    rgb=frame.convert('RGB').quantize(colors=254,method=Image.Quantize.MEDIANCUT)
    indexed=Image.new('P',frame.size,0)
    palette=rgb.getpalette()[:254*3]
    indexed.putpalette([0,0,0]+palette+[0]*(768-3-len(palette)))
    from PIL import ImageChops
    alpha=frame.getchannel('A').point(lambda a: 255 if a>100 else 0)
    # Reserve index 0 for transparency; shift RGB indices into 1..255.
    import numpy as np
    px=np.asarray(rgb,dtype=np.uint8)
    a=np.asarray(alpha,dtype=np.uint8)
    indices=np.where(a>0,px+1,0).astype('uint8')
    indexed.putdata(indices.ravel().tolist())
    indexed.info['transparency']=0
    pal.append(indexed)
pal[0].save(out,save_all=True,append_images=pal[1:],duration=[110]*10,loop=0,transparency=0,disposal=2,optimize=False)
with Image.open(out) as check:
    assert check.n_frames>=6
assert out.stat().st_size<8*1024*1024
manifest_path=root/'shared/hina/assets/manifest.json'
manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
manifest['version']='2026.11.06.3'
data=out.read_bytes()
manifest['assets']['WALK']={'file':'walk.gif','format':'gif','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'animated':True,'complete':True}
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Generated no-stretch WALK:',len(data),'bytes, SHA256',manifest['assets']['WALK']['sha256'])
