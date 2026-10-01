// Connected branching layouts with a shared continuous floor boundary. Rendering and physics share the same boundary.
export function generateDungeon(seed = Math.floor(Math.random() * 2147483646) + 1) {
  let state = seed;
  const random = () => ((state = state * 16807 % 2147483647) - 1) / 2147483646;
  const pick = values => values[Math.floor(random() * values.length)];
  const rooms = [], corridors = [], deco = [], tiles = [], walls = [], edges=[];
  const layout=pick(['branch','loop','winding']);
  const mirror=random()<.5?-1:1;
  const layouts={
    branch:[[0,160],[-470,-640],[470,-640],[0,-1480],[0,-2320]],
    loop:[[0,160],[-540,-600],[540,-600],[0,-1400],[180,-2240]],
    winding:[[0,160],[600,-650],[-100,-1450],[-720,-2240],[0,-3060]]
  };
  const themes=['chapel','crypt','flooded'];
  const titles={chapel:['Broken Nave','Ruined Sanctuary','Hall of Oaths'],crypt:['Bone Vault','Forgotten Ossuary','Burial Rotunda'],flooded:['Drowned Prison','Sunken Cistern','Hall of Leaks']};
  for(let i=0;i<5;i++){
    const [px,py]=layouts[layout][i];
    const theme=themes[(i+seed)%3],shape=i===0?'rounded':pick(['rounded','ellipse','octagon']);
    const w=pick([480,560,640]),h=pick([480,560,640,720]);
    const room={x:px*mirror+(i?(random()-.5)*80:0),y:py,w,h,theme,shape,name:i===4?'The Warden’s Throne':pick(titles[theme])};
    rooms.push(room);
    for(let j=0;j<14;j++){
      const angle=random()*Math.PI*2,r=.32+random()*.1;
      deco.push({x:room.x+Math.cos(angle)*w*r,y:room.y+Math.sin(angle)*h*r,r:4+random()*9,type:4});
    }
  }
  const connections=layout==='winding'?[[0,1],[1,2],[2,3],[3,4]]:[[0,1],[0,2],[1,3],[2,3],[3,4]];
  if(layout==='loop')connections.push([1,2]);
  function connect(a,b,offset=0){
    const from=rooms[a],to=rooms[b],bend=(random()-.5)*260+offset;
    const length=Math.hypot(to.x-from.x,to.y-from.y),count=Math.ceil(length/38);
    const samples=[];
    for(let j=0;j<=count;j++){
      const t=j/count,dx=to.x-from.x,dy=to.y-from.y;
      const arc=Math.sin(t*Math.PI)*bend;
      const x=from.x+dx*t-dy/length*arc,y=from.y+dy*t+dx/length*arc;
      const radius=90+Math.sin(t*Math.PI)*12;
      const sample={x,y,w:radius*2,h:radius*2,radius};
      corridors.push(sample);samples.push(sample);
    }
    edges.push({from:a,to:b,samples});
  }
  for(const [a,b]of connections)connect(a,b);
  // Optional side chambers expand exploration without adding mandatory waves.
  const sideRooms=[];
  for(let i=1;i<4;i++)if(random()<.72){const r=rooms[i],side=random()<.5?-1:1;
    const pocket={x:r.x+side*(r.w/2+260),y:r.y+80,w:260,h:300,shape:'ellipse',theme:r.theme,name:'Relic alcove'};
    sideRooms.push(pocket);
    const dx=pocket.x-r.x,dy=pocket.y-r.y,count=Math.ceil(Math.hypot(dx,dy)/35);
    for(let j=0;j<=count;j++)corridors.push({x:r.x+dx*j/count,y:r.y+dy*j/count,w:150,h:150,radius:75});
  }
  const spaces=[...rooms,...sideRooms];
  function roomField(r,x,y){
    if(r.shape==='ellipse')return (1-Math.hypot((x-r.x)/(r.w/2),(y-r.y)/(r.h/2)))*Math.min(r.w,r.h)/2;
    if(r.shape==='octagon')return Math.min(r.w/2-Math.abs(x-r.x),r.h/2-Math.abs(y-r.y),(r.w+r.h)*.37-Math.abs(x-r.x)-Math.abs(y-r.y));
    const radius=Math.min(r.w,r.h)*.24,qx=Math.abs(x-r.x)-(r.w/2-radius),qy=Math.abs(y-r.y)-(r.h/2-radius);
    return radius-Math.hypot(Math.max(qx,0),Math.max(qy,0))-Math.min(Math.max(qx,qy),0);
  }
  function field(x,y){
    let value=-1e6;
    for(const r of spaces)value=Math.max(value,roomField(r,x,y));
    for(const r of corridors){const dx=x-r.x,dy=y-r.y;
      if(Math.abs(dx)>r.radius+80||Math.abs(dy)>r.radius+80)continue;
      value=Math.max(value,r.radius-Math.hypot(dx,dy));
    }
    return value;
  }
  const triangles=[];
  const step=40,minX=Math.floor(Math.min(...spaces.map(r=>r.x-r.w/2),...corridors.map(r=>r.x-r.radius))-40),maxX=Math.max(...spaces.map(r=>r.x+r.w/2),...corridors.map(r=>r.x+r.radius))+40;
  const minY=Math.floor(Math.min(...spaces.map(r=>r.y-r.h/2),...corridors.map(r=>r.y-r.radius))-40),maxY=Math.max(...spaces.map(r=>r.y+r.h/2),...corridors.map(r=>r.y+r.radius))+40;
  const point=(x,y)=>({x,y,value:field(x,y)});
  function clip(input){
    const output=[],crossings=[];
    for(let i=0;i<3;i++){const a=input[i],b=input[(i+1)%3];if(a.value>=0)output.push(a);
      if((a.value>=0)!==(b.value>=0)){const t=a.value/(a.value-b.value),v={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};output.push(v);crossings.push(v);}}
    if(output.length>=3)for(let i=1;i<output.length-1;i++)triangles.push([output[0],output[i],output[i+1]]);
    if(crossings.length===2){const[a,b]=crossings,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(length>.01)walls.push({x:(a.x+b.x)/2,y:(a.y+b.y)/2,w:length+1,h:16,angle:Math.atan2(dy,dx)});}
  }
  for(let x=minX;x<maxX;x+=step)for(let y=minY;y<maxY;y+=step){
    const a=point(x,y),b=point(x+step,y),c=point(x+step,y+step),d=point(x,y+step);
    clip([a,b,c]);clip([a,c,d]);if(field(x+20,y+20)>=0)tiles.push({x:x+20,y:y+20});
  }
  return { seed, layout, edges, sideRooms, rooms, corridors, tiles, triangles, walls, deco, contains:(x,y,margin=0)=>field(x,y)>=margin };
}
