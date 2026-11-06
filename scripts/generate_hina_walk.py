"""Generate a lightweight 2D WALK cycle from the exact user-supplied secretary.png.
Preserves original artwork; moves lower legs subtly, not a full skeletal animation.
"""
from PIL import Image
import numpy as np
import math, json, hashlib
from pathlib import Path

root=Path(__file__).resolve().parents[1]
src=root/'shared/hina/assets/secretary.png'
out=root/'shared/hina/assets/walk.gif'
im=Image.open(src).convert('RGBA')
w,h=im.size
arr=np.asarray(im)
frames=[]
for i in range(10):
    phase=2*math.pi*i/10
    yy,xx=np.indices((h,w),dtype=np.float32)
    fade=np.clip((yy-h*.755)/(h*.17),0,1)
    left=1/(1+np.exp(np.clip((xx-w*.49)/20,-40,40)))
    swing=(left*2-1)*np.sin(phase)*w*.017*fade
    lift=np.maximum(0,np.sin(phase)*(left*2-1))*h*.012*fade
    sx=np.clip(np.rint(xx-swing).astype(np.int32),0,w-1)
    sy=np.clip(np.rint(yy+lift).astype(np.int32),0,h-1)
    frame=Image.fromarray(arr[sy,sx].copy(),'RGBA')
    frame.thumbnail((440,528),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',(512,624),(0,0,0,0))
    bob=round(3*(1-math.cos(2*phase))/2)
    canvas.alpha_composite(frame,((512-frame.width)//2,8+bob))
    frames.append(canvas)
pal=[]
for frame in frames:
    a=np.asarray(frame)
    rgb=Image.fromarray(a[:,:,:3],'RGB').quantize(colors=192,method=Image.Quantize.MEDIANCUT)
    p=rgb.getpalette()[:192*3]
    p=[0,0,0]+p+[0]*(768-3-len(p))
    indexed=Image.new('P',frame.size,0)
    indexed.putpalette(p)
    mask=a[:,:,3]>100
    pix=np.where(mask,np.asarray(rgb,dtype=np.uint8)+1,0).astype('uint8')
    indexed.putdata(pix.flatten().tolist())
    indexed.info['transparency']=0
    pal.append(indexed)
pal[0].save(out,save_all=True,append_images=pal[1:],duration=[110]*10,loop=0,transparency=0,disposal=2,optimize=False)
with Image.open(out) as check:
    assert check.n_frames>=6
assert out.stat().st_size<8*1024*1024
manifest_path=root/'shared/hina/assets/manifest.json'
manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
manifest['version']='2026.11.06.2'
data=out.read_bytes()
manifest['assets']['WALK']={'file':'walk.gif','format':'gif','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'animated':True,'complete':True}
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Generated WALK:',len(data),'bytes, SHA256',manifest['assets']['WALK']['sha256'])
