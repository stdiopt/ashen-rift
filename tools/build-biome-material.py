"""Derive aligned tileable height, normal and roughness channels from biome artwork.
Usage: python tools/build-biome-material.py jungle|hell|frozen SOURCE
Height is a material-aware approximation, not measured geometry.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
asset,source=sys.argv[1:3]
kind=asset.split('-')[0]
out=Path(__file__).resolve().parents[1]/'public/textures'
size=512
rgb=np.asarray(Image.open(source).convert('RGB').resize((size,size)),dtype=float)/255
# Match opposite edges in a narrow band, with interior artwork preserved.
for axis in [0,1]:
 a=rgb if axis==0 else np.swapaxes(rgb,0,1)
 for i in range(16):
  w=.5*(1-i/16)**2;lo=a[i].copy();hi=a[-1-i].copy();a[i]=lo*(1-w)+hi*w;a[-1-i]=hi*(1-w)+lo*w
r,g,b=np.moveaxis(rgb,2,0);lum=r*.2126+g*.7152+b*.0722
if kind=='jungle':
 moss=np.clip((g-r)*9,0,1);height=.28+lum*.48+moss*.12;rough=.9-moss*.12
elif kind=='hell':
 cracks=np.clip((r-g)*8,0,1);height=.55+lum*.55-cracks*.35;rough=.84+cracks*.12
else:
 frost=np.clip((lum-.45)*2.2,0,1);height=.35+lum*.4+frost*.15;rough=.3+frost*.6
height=gaussian_filter(np.clip(height,0,1),.8,mode='wrap');height=(height-height.min())/max(float(np.ptp(height)),1e-8)
# Normal gradients use the exact same periodic height field and UV orientation.
relief={'jungle':3,'hell':5,'frozen':2}[kind]
scale=relief/((160 if 'wall' in asset else 320)/size*2)
dx=(np.roll(height,-1,1)-np.roll(height,1,1))*scale;dy=(np.roll(height,-1,0)-np.roll(height,1,0))*scale
length=np.sqrt(dx*dx+dy*dy+1);normal=np.stack((-dx/length,dy/length,1/length),axis=2)
Image.fromarray(np.uint8(rgb*255)).save(out/f'{asset}-albedo-v1.webp',quality=92)
Image.fromarray(np.uint8(np.clip(height,0,1)*255)).save(out/f'{asset}-height-v1.png')
Image.fromarray(np.uint8(np.clip(normal*.5+.5,0,1)*255)).save(out/f'{asset}-normal-v1.png')
Image.fromarray(np.uint8(np.clip(rough,0,1)*255)).save(out/f'{asset}-roughness-v1.png')
assert np.allclose(np.linalg.norm(normal,axis=2),1)
assert np.ptp(height)>.5
print(kind,'PBR channels built at',size,'px')
