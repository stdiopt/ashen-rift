// Generate a connected body surface once in bind pose. Smooth unions remove
// the shoulder/elbow seams of separate primitives; the result uses the same rig.
export function appendMageBody(buckets,regions,boneIndex){
  const shapes=[[0,42,0,11,15,7],[0,27,0,11,8,8],[0,57,0,5,8,5],[0,67,-1,7,10,7]];
  for(const side of [-1,1])shapes.push([side*13,47,0,6,7,6],[side*14,40,0,5,10,5],[side*14,29,0,3.8,9,3.8],[side*14,22,-1,3.8,5,3.6],[side*7,18,0,5,9,5],[side*7,7,0,3.8,8,3.8],[side*7,3,-3,4.5,3,6]);
  const field=(x,y,z)=>{
    let value=100;
    for(const [cx,cy,cz,rx,ry,rz] of shapes){
      const distance=(Math.hypot((x-cx)/rx,(y-cy)/ry,(z-cz)/rz)-1)*Math.min(rx,ry,rz);
      const h=Math.max(0,1-Math.abs(value-distance)/2);value=Math.min(value,distance)-h*h*.5;
    }
    return value;
  };
  const weights=(x,y)=>{
    const side=x<0?'L':'R',ax=Math.abs(x);
    let a,b,w;
    if(ax>10&&y>18&&y<54){
      if(y>43){a='arm'+side;b='chest';w=Math.max(0,Math.min(.65,(y-44)/10))}
      else if(y>29){a='arm'+side;b='forearm'+side;w=Math.max(0,Math.min(1,(39-y)/10))}
      else{a='forearm'+side;b='hand'+side;w=Math.max(0,Math.min(1,(27-y)/6))}
    }else if(y<25){
      a='thigh'+side;b='shin'+side;w=Math.max(0,Math.min(1,(18-y)/9));
      if(y<8){a='shin'+side;b='foot'+side;w=Math.max(0,Math.min(1,(8-y)/5))}
      if(y>21){a='thigh'+side;b='pelvis';w=(y-21)/4}
    }else if(y>59){a='neck';b='head';w=Math.max(0,Math.min(1,(y-59)/5))}
    else if(y>51){a='chest';b='neck';w=Math.max(0,Math.min(1,(y-51)/8))}
    else{a='spine';b=y<34?'pelvis':'chest';w=y<34?Math.max(0,Math.min(1,(34-y)/9)):Math.max(0,Math.min(1,(y-34)/12))}
    return[boneIndex[a],boneIndex[b],1-w,w];
  };
  const emit=(p,region)=>{
    const [x,y,z]=p;
    const b=buckets[regions[region]],epsilon=.15;
    let nx=field(x+epsilon,y,z)-field(x-epsilon,y,z),ny=field(x,y+epsilon,z)-field(x,y-epsilon,z),nz=field(x,y,z+epsilon)-field(x,y,z-epsilon),length=Math.hypot(nx,ny,nz)||1;
    const [a,c,wa,wc]=weights(x,y);b.p.push(x,y,z);b.n.push(nx/length,ny/length,nz/length);b.uv.push((x+24)/48,y/80);b.si.push(a,c,0,0);b.sw.push(wa,wc,0,0);
  };
  const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],tets=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]],step=3;
  const interpolate=(a,b,va,vb)=>{const t=va/(va-vb);return a.map((v,i)=>v+(b[i]-v)*t)};
  const triangle=(a,b,c)=>{
    const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],mid=a.map((n,i)=>(n+b[i]+c[i])/3);
    const [x,y]=mid,ax=Math.abs(x),region=y>55?'skin':y<12?'boots':y<25&&ax<11?'legs':ax>11&&y<33?'skin':'cloth';
    if(field(...mid.map((v,i)=>v+n[i]*.001))<field(...mid))emit(a,region),emit(c,region),emit(b,region);else emit(a,region),emit(b,region),emit(c,region);
  };
  for(let x=-24;x<24;x+=step)for(let y=-3;y<81;y+=step)for(let z=-15;z<15;z+=step){
    const points=corners.map(c=>[x+c[0]*step,y+c[1]*step,z+c[2]*step]),values=points.map(p=>field(...p));
    if(values.every(v=>v>=0)||values.every(v=>v<0))continue;
    for(const tet of tets){
      const inside=tet.filter(i=>values[i]<0),outside=tet.filter(i=>values[i]>=0),edge=(a,b)=>interpolate(points[a],points[b],values[a],values[b]);
      if(inside.length===1)triangle(...outside.map(i=>edge(inside[0],i)));
      else if(inside.length===3)triangle(...inside.map(i=>edge(outside[0],i)));
      else if(inside.length===2){const a=edge(inside[0],outside[0]),b=edge(inside[0],outside[1]),c=edge(inside[1],outside[0]),d=edge(inside[1],outside[1]);triangle(a,b,c);triangle(b,d,c)}
    }
  }
}
