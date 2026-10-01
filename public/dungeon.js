// Connected branching layouts with a shared continuous floor boundary. Rendering and physics share the same boundary.
export function generateDungeon(seed = Math.floor(Math.random() * 2147483646) + 1, forcedBiome = null) {
  let state = seed;
  const random = () => ((state = state * 16807 % 2147483647) - 1) / 2147483646;
  const pick = values => values[Math.floor(random() * values.length)];
  const chosenBiome=pick(['castle','jungle','hell','frozen']);
  const biome=['castle','jungle','hell','frozen'].includes(forcedBiome)?forcedBiome:chosenBiome;
  const biomeName={castle:'Ruined Castle',jungle:'Overgrown Jungle',hell:'Hell Gates',frozen:'Frozen Crypt'}[biome];
  const rooms = [], corridors = [], deco = [], tiles = [], walls = [], edges=[];
  const layout=pick(['branch','loop','winding']);
  const mirror=random()<.5?-1:1;
  const layouts={
    branch:[[0,160],[-470,-640],[470,-640],[0,-1480],[0,-2320],[-560,-3160],[0,-4020]],
    loop:[[0,160],[-540,-600],[540,-600],[0,-1400],[180,-2240],[-560,-3100],[180,-3980]],
    winding:[[0,160],[600,-650],[-100,-1450],[-720,-2240],[0,-3060],[700,-3920],[0,-4780]]
  };
  const themeLayouts={
    jungle:{branch:[[0,160],[-800,-650],[820,-720],[-1000,-1600],[950,-1690],[80,-2600],[-400,-3650]],loop:[[0,160],[-850,-700],[850,-700],[-950,-1720],[1000,-1650],[80,-2700],[650,-3670]],winding:[[0,160],[820,-720],[1500,-1500],[650,-2300],[-350,-3100],[-1100,-3880],[-250,-4700]]},
    hell:{branch:[[0,160],[-780,-700],[800,-720],[0,-1600],[-850,-2590],[820,-2640],[0,-3580]],loop:[[0,160],[-900,-700],[850,-850],[-180,-1690],[-900,-2520],[0,-3250],[850,-3900]],winding:[[0,160],[-850,-720],[100,-1560],[920,-2320],[120,-3110],[-920,-3900],[0,-4740]]},
    frozen:{branch:[[0,160],[-620,-980],[600,-950],[-950,-2090],[800,-2080],[0,-3100],[450,-4270]],loop:[[0,160],[-1000,-850],[900,-850],[-1000,-2020],[1000,-2110],[0,-2990],[-400,-4250]],winding:[[0,160],[350,-1030],[1050,-1980],[300,-3010],[-550,-3930],[-1200,-4860],[-500,-5820]]}
  };
  const coordinates=(themeLayouts[biome]||layouts)[layout];
  const layoutName={castle:{branch:'Courtyard wings',loop:'Cloister circuit',winding:'Processional halls'},jungle:{branch:'Split groves',loop:'Canopy circuit',winding:'Winding wilds'},hell:{branch:'Forked caverns',loop:'Infernal circuit',winding:'Jagged descent'},frozen:{branch:'Fractured vaults',loop:'Glacial circuit',winding:'Icebound passage'}}[biome][layout];
  const themes=biome==='jungle'?['grove','marsh','temple']:biome==='hell'?['cinder','lava','gate']:biome==='frozen'?['ice','frost','glacier']:['chapel','crypt','flooded'];
  const titles={ice:['Icebound Tomb','Crystal Vault','Frozen Ossuary'],frost:['Frostfall Hall','Silent Crypt','Winter Sanctum'],glacier:['Glacial Court','Blue Chasm','Throne of Ice'],grove:['Rootbound Grove','Emerald Hollow','Thorn Sanctuary'],marsh:['Venom Fen','Sunken Grove','Mire of Whispers'],temple:['Lost Temple','Vinebound Court','Ancient Idol'],cinder:['Ashen Expanse','Cinder Vault','Scorched Hollow'],lava:['Molten Basin','Ember Chasm','Firewell'],gate:['Demon Gate','Infernal Court','Gate of Chains'],chapel:['Broken Nave','Ruined Sanctuary','Hall of Oaths'],crypt:['Bone Vault','Forgotten Ossuary','Burial Rotunda'],flooded:['Drowned Prison','Sunken Cistern','Hall of Leaks']};
  for(let i=0;i<7;i++){
    const [px,py]=coordinates[i];
    const theme=themes[(i+seed)%3],shape=i===0?'rounded':pick(biome==='jungle'?['ellipse','ellipse','rounded']:biome==='hell'?['octagon','rounded','octagon']:biome==='frozen'?['ellipse','rounded','ellipse']:['rounded','rounded','octagon']);
    const w=pick(biome==='jungle'?[760,900,1040]:biome==='hell'?[560,680,820]:biome==='frozen'?[560,650,780]:[560,660,760]),h=pick(biome==='jungle'?[620,780,920]:biome==='hell'?[600,720,840]:biome==='frozen'?[820,1000,1160]:[560,660,760,840]);
    const room={x:px*mirror+(i?(random()-.5)*80:0),y:py,w,h,theme,shape,name:i===6?(biome==='jungle'?'Heart of the Wild':biome==='hell'?'The Infernal Gate':biome==='frozen'?'The Frost Warden’s Crypt':'The Warden’s Throne'):pick(titles[theme])};
    rooms.push(room);
    for(let j=0;j<14;j++){
      const angle=random()*Math.PI*2,r=.32+random()*.1;
      deco.push({x:room.x+Math.cos(angle)*w*r,y:room.y+Math.sin(angle)*h*r,r:4+random()*9,type:4});
    }
  }
  const connections=layout==='winding'?[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6]]:[[0,1],[0,2],[1,3],[2,3],[3,4],[4,5],[5,6]];
  if(biome==='jungle'&&layout!=='winding')connections.splice(0,connections.length,[0,1],[0,2],[1,3],[2,4],[3,5],[4,5],[5,6]);
  if(['hell','frozen'].includes(biome)&&layout==='branch')connections.splice(0,connections.length,[0,1],[0,2],[1,3],[2,3],[3,4],[3,5],[4,6],[5,6]);
  if(biome==='frozen'&&layout==='loop')connections.splice(0,connections.length,[0,1],[0,2],[1,3],[2,4],[3,5],[4,5],[5,6]);
  else if(layout==='loop')connections.push([1,2]);
  function connect(a,b,offset=0){
    const from=rooms[a],to=rooms[b],bend=(random()-.5)*(biome==='jungle'?460:biome==='hell'?340:biome==='frozen'?160:60)+offset;
    const length=Math.hypot(to.x-from.x,to.y-from.y),count=Math.ceil(length/38);
    const samples=[];
    for(let j=0;j<=count;j++){
      const t=j/count,dx=to.x-from.x,dy=to.y-from.y;
      const arc=Math.sin(t*Math.PI)*bend;
      const x=from.x+dx*t-dy/length*arc,y=from.y+dy*t+dx/length*arc;
      const radius=(biome==='jungle'?130:biome==='hell'?85:biome==='frozen'?82:95)+Math.sin(t*Math.PI)*(biome==='jungle'?35:biome==='hell'?28:biome==='frozen'?18:6);
      const sample={x,y,w:radius*2,h:radius*2,radius};
      corridors.push(sample);samples.push(sample);
    }
    edges.push({from:a,to:b,samples});
  }
  for(const [a,b]of connections)connect(a,b);
  // Optional side chambers expand exploration without adding mandatory waves.
  const sideRooms=[];
  for(let i=1;i<6;i++)if(random()<(biome==='jungle'?.9:biome==='frozen'?.8:.72)){const r=rooms[i],side=random()<.5?-1:1;
    const pocket={x:r.x+side*(r.w/2+260),y:r.y+80,w:biome==='jungle'?400:biome==='hell'?320:260,h:biome==='frozen'?460:biome==='jungle'?360:300,shape:biome==='hell'?'octagon':biome==='castle'?'rounded':'ellipse',theme:r.theme,name:'Relic alcove'};
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
  // Limit field queries to nearby rooms/corridor samples as rifts grow.
  const cells=new Map(),cellSize=200,key=(x,y)=>(x+4096)*8192+y+4096;
  function indexSpace(item,type){const halfX=type==='room'?item.w/2:item.radius,halfY=type==='room'?item.h/2:item.radius;
    for(let x=Math.floor((item.x-halfX-80)/cellSize);x<=Math.floor((item.x+halfX+80)/cellSize);x++)for(let y=Math.floor((item.y-halfY-80)/cellSize);y<=Math.floor((item.y+halfY+80)/cellSize);y++){const k=key(x,y);if(!cells.has(k))cells.set(k,[]);cells.get(k).push({item,type});}}
  spaces.forEach(r=>indexSpace(r,'room'));corridors.forEach(r=>indexSpace(r,'corridor'));
  function field(x,y){
    let value=-1e6;
    for(const {item:r,type}of cells.get(key(Math.floor(x/cellSize),Math.floor(y/cellSize)))||[]){
      if(type==='room')value=Math.max(value,roomField(r,x,y));
      else value=Math.max(value,r.radius-Math.hypot(x-r.x,y-r.y));
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
  return { seed, biome, biomeName, layout, layoutName, edges, sideRooms, rooms, corridors, tiles, triangles, walls, deco, contains:(x,y,margin=0)=>field(x,y)>=margin };
}
