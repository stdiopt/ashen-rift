"""Build aligned PBR channels from generated stone outlines, without baked lighting.
Usage: python tools/build-stone-material.py SOURCE_IMAGE
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage
out=Path(__file__).resolve().parents[1]/'public/textures'
size=1024
source=np.asarray(Image.open(sys.argv[1]).convert('L').resize((size,size)),dtype=float)/255
# Blend paired edges before segmentation to make the outline periodic.
for axis in [0,1]:
    view=source if axis==0 else source.T
    for i in range(32):
        weight=(1-i/32)**2*.5
        left,right=view[i].copy(),view[-1-i].copy()
        view[i]=left*(1-weight)+right*weight
        view[-1-i]=right*(1-weight)+left*weight
stone=source>.29
# Toroidal padding keeps distance-to-mortar and gradients continuous at repeats.
padded=np.pad(stone,96,mode='wrap')
padded=ndimage.binary_closing(padded,iterations=2)
distance=ndimage.distance_transform_edt(padded)[96:-96,96:-96]
# Rebuild flat tops and rounded bevels; source lighting never determines elevation.
bevel=np.clip(distance/11,0,1)
bevel=bevel*bevel*(3-2*bevel)
rng=np.random.default_rng(1451)
noise=ndimage.gaussian_filter(rng.normal(size=(size,size)),12,mode='wrap')
noise/=max(np.std(noise),1e-8)
fine=source-ndimage.gaussian_filter(source,2,mode='wrap')
height=np.clip(bevel*(.79+noise*.022)+fine*.1*bevel,0,1)
height=ndimage.gaussian_filter(height,.65,mode='wrap')
# UV span is 320 world units and relief is 7 units.
scale=7/(320/size*2)
dx=(np.roll(height,-1,1)-np.roll(height,1,1))*scale
dy=(np.roll(height,-1,0)-np.roll(height,1,0))*scale
length=np.sqrt(dx*dx+dy*dy+1)
normal=np.stack((-dx/length,dy/length,1/length),axis=2)
# Color variation is low frequency pigmentation, not directional illumination.
pigment=np.clip(.54+noise*.035+fine*.35,0,1)
color=bevel*(.44+pigment*.32)+(1-bevel)*.24
rgb=np.stack((color*.90,color*.96,color),axis=2)
roughness=np.clip(.74+noise*.025+(1-bevel)*.18,0,1)
Image.fromarray(np.uint8(rgb*255)).save(out/'flagstone-albedo-v2.webp',quality=94)
Image.fromarray(np.uint8(np.clip(normal*.5+.5,0,1)*255)).save(out/'flagstone-normal-v2.png')
Image.fromarray(np.uint8(roughness*255)).save(out/'flagstone-roughness-v2.png')
Image.fromarray(np.uint8(height*255)).save(out/'flagstone-height-v2.png')
assert np.percentile(np.hypot(dx,dy),95)>.2
print('Built aligned 1024px stone channels; relief range:',round(float(height.max()-height.min()),3))
