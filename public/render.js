import { soundEffects } from './sound-effects.js?v=48';
import { createRiggedCharacter, updateRiggedCharacter, beginCharacterDeath, applyCharacterEquipment, disposeRiggedCharacter, prepareCharacterTemplates } from './characters.js?v=48';
import { RARITIES } from './skills.js?v=48';
import { StableLightSelection } from './light-selection.js?v=48';
import { RoomEnvironment } from './vendor/room-environment.js';
import * as THREE from './vendor/three.module.js';
let renderer,scene,camera,W,H,hero,rooms,corridors,ray=new THREE.Raycaster(),ground=new THREE.Plane(new THREE.Vector3(0,1,0),0),floorTarget=new THREE.Vector3(),aimRing,mini,miniCtx,dungeonGroup,lightPool=[],floorSurface,wallSurface,woodSurface,wetSurface,wetMask,aimLine,heroLight,heroLightTarget,heroGlow,lightSelection,lastLightTime=0,spellTexture,particleCloud,cutawayScreen=new THREE.Vector3(),cutawayViewport=new THREE.Vector2(),merchantModel,shieldVisual,lootBeamTexture,merchantLabel,portalLabel,mapCanvas,mapOriginX=0,mapOriginY=0,shaderWarmup,lastShadowTime=-1;
const backdrops=new Map();
function setBackdrop(theme){
  scene.userData.backdropTheme=theme;
  if(!backdrops.has(theme)){
    const texture=new THREE.TextureLoader().load('./textures/'+theme+'-backdrop-v1.png',loaded=>{if(scene.userData.backdropTheme===theme)scene.background=loaded;});
    texture.colorSpace=THREE.SRGBColorSpace;backdrops.set(theme,texture);
  }
  scene.background=backdrops.get(theme);
}
function updateBackdrop(x,y){
  const texture=scene.background;if(!texture?.isTexture)return;
  const aspect=W/H,imageAspect=texture.image?.width/texture.image?.height||16/9;
  const u=.9*Math.min(1,aspect/imageAspect),v=.9*Math.min(1,imageAspect/aspect);
  texture.repeat.set(u,v);texture.offset.set((1-u)/2+THREE.MathUtils.clamp(-(x*.793-y*.609)*.000025,-.04,.04),(1-v)/2+THREE.MathUtils.clamp((x*.609+y*.793)*.000025,-.04,.04));
}
let castleWallSurface;
const enemyModels=new Map(),effectModels=new Map(),lootModels=new Map(),chestModels=new Map(),floating=new Map(),statusLabels=new Map(),torches=[];
const statusTints={burn:new THREE.Color('#f65325'),freeze:new THREE.Color('#58bdff'),slow:new THREE.Color('#82c5ee')};
const materials=new Map();function mat(color,metal=.15,rough=.8){const key=color+':'+metal;if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,metalness:metal,roughness:rough}));return materials.get(key)}
function mesh(geo,material,parent,x=0,y=0,z=0){let m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
function block(parent,x,y,z,w,h,d,color){return mesh(new THREE.BoxGeometry(w,h,d),mat(color),parent,x,y,z)}
function buildCharacter(kind){const rig=createRiggedCharacter(kind),root=rig.root,hero=kind==='hero',boss=kind==='boss';
let health=new THREE.Group();health.position.y=kind==='spider'?44:boss?100:hero?110:kind==='brute'?85:90;root.add(health);let backing=mesh(new THREE.PlaneGeometry(42,4),new THREE.MeshBasicMaterial({color:'#22131c',side:THREE.DoubleSide}),health);let bar=mesh(new THREE.PlaneGeometry(40,3),new THREE.MeshBasicMaterial({color:boss?'#e9a25e':'#c15c65',side:THREE.DoubleSide}),health,0,0,.1);if(hero)bar.material.color.set('#73d1a1');for(const [index,part]of [backing,bar].entries()){part.material.transparent=true;part.material.depthTest=false;part.material.depthWrite=false;part.renderOrder=1002+index;}
const statusMaterials=hero?[]:rig.materials.map(material=>({material,color:material.color.clone(),emissive:material.emissive.clone(),intensity:material.emissiveIntensity})),statusSparks=[];if(!hero){for(let i=0;i<5;i++){const spark=new THREE.Sprite(new THREE.SpriteMaterial({map:spellTexture,color:'#ff6a25',transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));spark.visible=false;root.add(spark);statusSparks.push(spark);}}
let frostShell,statusRing;if(!hero){frostShell=mesh(new THREE.OctahedronGeometry(37),new THREE.MeshBasicMaterial({color:'#8ee8ff',transparent:true,opacity:.18,depthWrite:false}),root,0,37,0);frostShell.scale.y=1.4;frostShell.visible=false;frostShell.castShadow=false;statusRing=ring('#91cf76',27);statusRing.visible=false;root.add(statusRing);}scene.add(root);return Object.assign(rig,{health,bar,frostShell,statusRing,statusMaterials,statusSparks})}
function syncCharacter(model,a,time,dt){model.root.position.set(a.renderX??a.x,0,a.renderY??a.y);model.root.rotation.y=-(a.face||0)-Math.PI/2;if(a.spin>0)model.root.rotation.y=time*22;updateRiggedCharacter(model,a,time,dt);model.root.visible=true;model.health.quaternion.copy(camera.quaternion).premultiply(model.root.quaternion.clone().invert());model.bar.scale.x=Math.max(0,Math.min(1,a.hp/a.max));model.bar.position.x=-20*(1-model.bar.scale.x);if(model.frostShell){const frozen=!!a.status?.freeze,burning=!!a.status?.burn,chilled=!!a.status?.slow;const state=frozen?'freeze':burning?'burn':chilled?'slow':'';if(model.statusTint!==state){model.statusTint=state;for(const entry of model.statusMaterials){entry.material.color.copy(entry.color);entry.material.emissive.copy(entry.emissive);entry.material.emissiveIntensity=entry.intensity;if(state){entry.material.color.lerp(statusTints[state],state==='slow'?.25:.6);entry.material.emissive.copy(statusTints[state]);entry.material.emissiveIntensity=state==='burn'?.45:.2;}}}model.statusSparks.forEach((spark,i)=>{spark.visible=burning||frozen;if(!spark.visible)return;const phase=(time*(burning?1.4:.6)+i*.2)%1,angle=i*2.4+time*.7;spark.position.set(Math.cos(angle)*17,12+phase*65,Math.sin(angle)*17);spark.scale.set(burning?12*(1-phase)+5:5,burning?25*(1-phase)+8:5,1);spark.material.color.set(frozen?'#b8f1ff':i%2?'#ff5a20':'#ffbb42');spark.material.opacity=Math.sin(phase*Math.PI)*.8;});model.frostShell.visible=!!a.status?.freeze;model.statusRing.visible=!!a.status?.poison||!!a.status?.burn;model.statusRing.material.color.set(a.status?.burn?'#ff873d':'#8acf74');}}
function floorTexture(){let cv=document.createElement('canvas');cv.width=cv.height=256;let c=cv.getContext('2d');c.fillStyle='#363844';c.fillRect(0,0,256,256);for(let y=0;y<4;y++)for(let x=0;x<4;x++){let g=46+((x*17+y*7)%16);c.fillStyle=`rgb(${g},${g+2},${g+10})`;c.fillRect(x*64+2,y*64+2,60,60);c.strokeStyle='#50505b';c.strokeRect(x*64+3,y*64+3,58,58)}let texture=new THREE.CanvasTexture(cv);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.SRGBColorSpace;return texture}
export function initRender(canvas,dungeon){rooms=dungeon.rooms;corridors=dungeon.corridors;renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});const mobileRenderer=window.matchMedia?.('(pointer:coarse)').matches;renderer.setPixelRatio(Math.min(devicePixelRatio,mobileRenderer?1:1.25));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;scene=new THREE.Scene();scene.backgroundIntensity=.75;scene.background=new THREE.Color('#10131d');scene.fog=new THREE.FogExp2('#10131d',.0007);camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,5,5500);scene.add(new THREE.HemisphereLight('#a4b8da','#2b1921',.22));let sun=new THREE.DirectionalLight('#c8d3e4',.55);sun.position.set(300,1000,400);sun.castShadow=true;sun.shadow.mapSize.set(mobileRenderer?512:1024,mobileRenderer?512:1024);sun.shadow.camera.left=-1100;sun.shadow.camera.right=1100;sun.shadow.camera.top=1100;sun.shadow.camera.bottom=-1100;sun.shadow.camera.far=2400;sun.shadow.bias=-.0005;scene.add(sun);scene.add(sun.target);scene.userData.sun=sun;
const environment=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(environment,.04).texture;scene.environmentIntensity=.16;environment.dispose();pmrem.dispose();
floorSurface=createFloorSurface();
wallSurface=createSurface('./textures/castle-ashlar.webp',.95,0);wallSurface.vertexColors=true;castleWallSurface=wallSurface;
woodSurface=createSurface('./textures/chest-oak.webp',.72,0);
const maskSize=64,mask=new Uint8Array(maskSize*maskSize*4);for(let y=0;y<maskSize;y++)for(let x=0;x<maskSize;x++){let radius=Math.hypot((x+ .5)/maskSize*2-1,(y+.5)/maskSize*2-1),value=Math.round(Math.max(0,Math.min(1,(1-radius)*5))*255),i=(y*maskSize+x)*4;mask[i]=mask[i+1]=mask[i+2]=value;mask[i+3]=255}wetMask=new THREE.DataTexture(mask,maskSize,maskSize);wetMask.channel=1;wetMask.needsUpdate=true;
wetSurface=new THREE.MeshPhysicalMaterial({map:floorSurface.map,normalMap:floorSurface.normalMap,roughnessMap:floorSurface.roughnessMap,alphaMap:wetMask,roughness:.1,metalness:0,clearcoat:1,clearcoatRoughness:.08,transparent:true,opacity:.8,depthWrite:false,color:'#7e8b98',normalScale:new THREE.Vector2(.18,.18),envMapIntensity:1.25});heroLight=new THREE.SpotLight('#c7ddff',165000,650,.95,.65,2);heroLight.position.set(0,210,110);heroLightTarget=new THREE.Object3D();heroLightTarget.position.set(0,0,110);scene.add(heroLightTarget);heroLight.target=heroLightTarget;heroLight.castShadow=!mobileRenderer;renderer.shadowMap.autoUpdate=!mobileRenderer;heroLight.shadow.mapSize.set(512,512);heroLight.shadow.camera.near=8;heroLight.shadow.camera.far=650;heroLight.shadow.bias=-.0006;heroLight.shadow.normalBias=.5;scene.add(heroLight);heroGlow=new THREE.Group();mesh(new THREE.SphereGeometry(4,10,8),new THREE.MeshBasicMaterial({color:'#e1f1ff'}),heroGlow);mesh(new THREE.SphereGeometry(9,10,8),new THREE.MeshBasicMaterial({color:'#91caff',transparent:true,opacity:.15,depthWrite:false}),heroGlow);heroGlow.children.forEach(o=>o.castShadow=false);scene.add(heroGlow);lightSelection=new StableLightSelection(8);for(let i=0;i<8;i++){let light=new THREE.PointLight('#ffac63',110000,400,2);scene.add(light);lightPool.push(light)}initSpellVisuals();shieldVisual=new THREE.Mesh(new THREE.SphereGeometry(43,20,12),new THREE.MeshBasicMaterial({color:'#ad8cff',transparent:true,opacity:.13,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));scene.add(shieldVisual);rebuildDungeon(dungeon);
prepareCharacterTemplates();hero=buildCharacter('hero');hero.onStep=()=>soundEffects?.step();aimRing=makeAimMarker();scene.add(aimRing);aimLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:'#b6cfff',transparent:true,opacity:.7}));scene.add(aimLine);mini=document.createElement('canvas');mini.id='minimap';mini.width=240;mini.height=160;mini.style.cssText='position:absolute;right:20px;top:16px;width:180px;height:120px;pointer-events:none;z-index:2';document.body.append(mini);miniCtx=mini.getContext('2d');warmSpellShaders();merchantLabel=worldText('Enchanter','#e1c68f',12,true);portalLabel=worldText('Enter Rift 2','#e1c68f',12,true);scene.add(merchantLabel,portalLabel);}
const biomeFloorSurfaces=new Map();
function createFloorSurface(biome='castle'){
  if(biomeFloorSurfaces.has(biome))return biomeFloorSurfaces.get(biome);
  const surface=new THREE.MeshStandardMaterial({map:floorTexture(),roughness:1,metalness:0,vertexColors:true,normalScale:new THREE.Vector2(1,1)});
  biomeFloorSurfaces.set(biome,surface);
  const prefix=biome==='castle'?'flagstone':biome,version=biome==='castle'?'v2':'v1';
  const files=[['map',prefix+'-albedo-'+version+'.webp'],['normalMap',prefix+'-normal-'+version+'.png'],['roughnessMap',prefix+'-roughness-'+version+'.png'],['displacementMap',prefix+'-height-'+version+'.png']];
  surface.displacementScale=biome==='castle'?0:biome==='jungle'?2:1;surface.displacementBias=-surface.displacementScale*.5;
  const loader=new THREE.TextureLoader();
  for(const [property,file]of files)loader.load('./textures/'+file,texture=>{
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    if(property==='map')texture.colorSpace=THREE.SRGBColorSpace;
    surface[property]?.dispose();surface[property]=texture;surface.needsUpdate=true;
    if(wetSurface&&floorSurface===surface&&property!=='displacementMap'){wetSurface[property]=texture;wetSurface.needsUpdate=true;}
  },undefined,()=>console.warn('Floor material channel unavailable: '+file));
  return surface;
}
function roomNear(dungeon,x,y){return [...dungeon.rooms,...dungeon.sideRooms].reduce((best,r)=>Math.hypot(x-r.x,y-r.y)<Math.hypot(x-best.x,y-best.y)?r:best,dungeon.rooms[0]);}
function themeTint(theme){return new THREE.Color(({chapel:'#c9b7a2',crypt:'#a7b3aa',flooded:'#8daebc',grove:'#75965b',marsh:'#658775',temple:'#a6ad76',cinder:'#7e6467',lava:'#a47568',gate:'#87738f',ice:'#a8cce0',frost:'#b8d2e3',glacier:'#8fbdd6'})[theme]||'#a7b3aa');}
function createSurface(url,roughness,metalness){
  function dataTexture(values){const texture=new THREE.DataTexture(new Uint8Array(values),1,1);texture.needsUpdate=true;return texture}
  const surface=new THREE.MeshStandardMaterial({map:floorTexture(),normalMap:dataTexture([128,128,255,255]),roughnessMap:dataTexture([200,200,200,255]),roughness,metalness});
  // Derived lighting channels are numerical texture data, not baked shadows.
  const loader=new THREE.TextureLoader();loader.load(url,texture=>{
    texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    const size=512,canvas=document.createElement('canvas');canvas.width=canvas.height=size;const context=canvas.getContext('2d');context.drawImage(texture.image,0,0,size,size);const rgba=context.getImageData(0,0,size,size).data,height=new Float32Array(size*size),normal=new Uint8Array(size*size*4),rough=new Uint8Array(size*size*4);
    for(let i=0;i<height.length;i++)height[i]=(rgba[i*4]*.2126+rgba[i*4+1]*.7152+rgba[i*4+2]*.0722)/255;
    const at=(x,y)=>height[((y+size)%size)*size+(x+size)%size];
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){let i=y*size+x,j=i*4,dx=(at(x+1,y)-at(x-1,y))*3,dy=(at(x,y+1)-at(x,y-1))*3,length=Math.hypot(dx,dy,1);normal[j]=Math.round((-dx/length*.5+.5)*255);normal[j+1]=Math.round((dy/length*.5+.5)*255);normal[j+2]=Math.round((1/length*.5+.5)*255);normal[j+3]=255;let value=Math.round((.42+Math.min(1,height[i]*2)*.48)*255);rough[j]=rough[j+1]=rough[j+2]=value;rough[j+3]=255}
    function channel(data){const map=new THREE.DataTexture(data,size,size);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;map.generateMipmaps=true;map.needsUpdate=true;return map}
    surface.map.dispose();surface.normalMap.dispose();surface.roughnessMap.dispose();surface.map=texture;surface.normalMap=channel(normal);surface.roughnessMap=channel(rough);if(surface===floorSurface&&wetSurface){wetSurface.map=surface.map;wetSurface.normalMap=surface.normalMap;wetSurface.roughnessMap=surface.roughnessMap}
  },undefined,()=>console.warn('Material texture unavailable; using the built-in material.'));
  return surface;
}
export function rebuildDungeon(dungeon){
  wallSurface=['jungle','hell'].includes(dungeon.biome)?createFloorSurface(dungeon.biome+'-wall'):castleWallSurface;if(['jungle','hell'].includes(dungeon.biome))wallSurface.displacementScale=0;floorSurface=createFloorSurface(dungeon.biome||'castle');if(wetSurface){wetSurface.map=floorSurface.map;wetSurface.normalMap=floorSurface.normalMap;wetSurface.roughnessMap=floorSurface.roughnessMap;wetSurface.needsUpdate=true;}rooms=dungeon.rooms;corridors=dungeon.corridors;scene.userData.biomeName=dungeon.biomeName;const bg=dungeon.biome==='jungle'?'#101c16':dungeon.biome==='hell'?'#200d13':dungeon.biome==='frozen'?'#101c2c':'#10131d';setBackdrop(dungeon.biome||'castle');scene.fog.color.set(bg);scene.userData.sun.color.set(dungeon.biome==='jungle'?'#c4deb1':dungeon.biome==='hell'?'#edb6a5':dungeon.biome==='frozen'?'#aecfff':'#c8d3e4');for(const light of lightPool)light.color.set(dungeon.biome==='jungle'?'#b7df88':dungeon.biome==='hell'?'#ff6b38':dungeon.biome==='frozen'?'#75caff':'#ffac63');cacheMinimap(dungeon);lastShadowTime=-1;
  if(dungeonGroup){scene.remove(dungeonGroup);const disposed=new Set();dungeonGroup.traverse(o=>{if(o.geometry&&!disposed.has(o.geometry)){o.geometry.dispose();disposed.add(o.geometry)}if(o.material?.isMeshBasicMaterial||o.material?.userData?.dungeonOwned)o.material.dispose()});}
  dungeonGroup=new THREE.Group();scene.add(dungeonGroup);torches.length=0;lightSelection.reset();lastLightTime=0;
  // One continuous UV surface: no overlapping planes or per-tile texture resets.
  const positions=[],normals=[],uvs=[],indices=[],floorColors=[];
  dungeon.triangles.forEach((triangle,i)=>{for(const v of [triangle[0],triangle[2],triangle[1]]){positions.push(v.x,-1,v.y);normals.push(0,1,0);uvs.push(v.x/320,-v.y/320);const color=dungeon.biome==='castle'?themeTint(roomNear(dungeon,v.x,v.y).theme):new THREE.Color('#e6e6e6');floorColors.push(color.r,color.g,color.b)}indices.push(i*3,i*3+1,i*3+2)});
  const floorGeometry=new THREE.BufferGeometry();floorGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));floorGeometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));floorGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));floorGeometry.setIndex(indices);floorGeometry.setAttribute('color',new THREE.Float32BufferAttribute(floorColors,3));
  const floor=new THREE.Mesh(floorGeometry,floorSurface);floor.receiveShadow=true;dungeonGroup.add(floor);
  // World-space UVs keep masonry courses continuous across wall segments.
  const wallPositions=[],wallNormals=[],wallUvs=[],wallIndices=[],wallColors=[],unit=new THREE.BoxGeometry(1,1,1),wp=unit.attributes.position,wn=unit.attributes.normal;
  for(const wall of dungeon.walls){const start=wallPositions.length/3,room=roomNear(dungeon,wall.x,wall.y),height=dungeon.biome==='jungle'?75:dungeon.biome==='hell'?135:room.theme==='chapel'?165:room.theme==='crypt'?145:125,color=themeTint(room.theme);wall.height=height;for(let i=0;i<wp.count;i++){let a=wall.angle||0,c=Math.cos(a),s=Math.sin(a),lx=wp.getX(i)*wall.w,lz=wp.getZ(i)*wall.h,x=wall.x+lx*c-lz*s,y=height/2+wp.getY(i)*height,z=wall.y+lx*s+lz*c,nx=wn.getX(i)*c-wn.getZ(i)*s,ny=wn.getY(i),nz=wn.getX(i)*s+wn.getZ(i)*c;wallPositions.push(x,y,z);wallNormals.push(nx,ny,nz);wallColors.push(color.r,color.g,color.b);wallUvs.push((Math.abs(nx)>.5?z:x)/160,Math.abs(ny)>.5?-z/160:y/160)}for(const i of unit.index.array)wallIndices.push(start+i)}unit.dispose();
  const wallGeometry=new THREE.BufferGeometry();wallGeometry.setAttribute('position',new THREE.Float32BufferAttribute(wallPositions,3));wallGeometry.setAttribute('normal',new THREE.Float32BufferAttribute(wallNormals,3));wallGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(wallUvs,2));wallGeometry.setIndex(wallIndices);wallGeometry.setAttribute('color',new THREE.Float32BufferAttribute(wallColors,3));const walls=new THREE.Mesh(wallGeometry,wallSurface);walls.castShadow=true;walls.receiveShadow=true;dungeonGroup.add(walls);
  const caps=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),wallSurface,dungeon.walls.length),dummy=new THREE.Object3D();dungeon.walls.forEach((wall,i)=>{dummy.position.set(wall.x,wall.height+3,wall.y);dummy.rotation.y=-(wall.angle||0);dummy.scale.set(wall.w+2,8,wall.h+4);dummy.updateMatrix();caps.setMatrixAt(i,dummy.matrix);caps.setColorAt(i,themeTint(roomNear(dungeon,wall.x,wall.y).theme))});caps.instanceMatrix.needsUpdate=true;caps.castShadow=true;caps.receiveShadow=true;dungeonGroup.add(caps);
  for(let index=0;index<rooms.length;index++){let room=rooms[index];for(let n=0;n<(['flooded','marsh','lava'].includes(room.theme)?5:1);n++){let x=room.x+(n?1:-1)*room.w*.13,z=room.y+Math.sin(dungeon.seed+index*5+n)*room.h*.16,rx=45+(dungeon.seed+index*31+n*13)%45,rz=35+(dungeon.seed+index*17+n*11)%35;const positions=[x,.05,z],uv=[x/320,-z/320],uv1=[.5,.5],normal=[0,1,0],indices=[],count=48;for(let i=0;i<=count;i++){let a=i/count*Math.PI*2,variation=1+Math.sin(a*5+index)*.09,px=x+Math.cos(a)*rx*variation,pz=z+Math.sin(a)*rz*variation;positions.push(px,.05,pz);uv.push(px/320,-pz/320);uv1.push(.5+Math.cos(a)*.5,.5+Math.sin(a)*.5);normal.push(0,1,0);if(i<count)indices.push(0,i+2,i+1)}let geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('uv1',new THREE.Float32BufferAttribute(uv1,2));geometry.setIndex(indices);const poolMaterial=dungeon.biome==='hell'?new THREE.MeshStandardMaterial({color:'#a32d14',emissive:'#ff410a',emissiveIntensity:1.2,roughness:.5}):wetSurface;if(dungeon.biome==='hell')poolMaterial.userData.dungeonOwned=true;let water=new THREE.Mesh(geometry,poolMaterial);water.receiveShadow=true;dungeonGroup.add(water)}}
  for(const room of rooms)for(const dx of [-1,1])for(const dy of [-1,1]){const x=room.x+dx*(room.w*.32),y=room.y+dy*(room.h*.32);mesh(new THREE.CylinderGeometry(15,19,110,8),wallSurface,dungeonGroup,x,55,y);block(dungeonGroup,x,112,y,34,10,34,'#8a7d7c');const fire=mesh(new THREE.OctahedronGeometry(7),new THREE.MeshBasicMaterial({color:'#ffbb73'}),dungeonGroup,x,130,y);torches.push({fire})}
  const added=new Set();for(const passage of corridors){const vertical=passage.h>passage.w,length=vertical?passage.h:passage.w;for(let step=120;step<length-60;step+=240){const x=vertical?passage.x:passage.x-passage.w/2+step,z=vertical?passage.y-passage.h/2+step:passage.y,key=Math.round(x/80)+','+Math.round(z/80);if(added.has(key)||rooms.some(r=>Math.abs(x-r.x)<r.w/2&&Math.abs(z-r.y)<r.h/2))continue;added.add(key);const sx=x+(vertical?passage.w/2-24:0),sz=z+(vertical?0:passage.h/2-24);block(dungeonGroup,sx,40,sz,10,80,10,'#635140');block(dungeonGroup,sx,84,sz,18,7,18,'#8c704a');const fire=mesh(new THREE.OctahedronGeometry(6),new THREE.MeshBasicMaterial({color:'#ffbc79'}),dungeonGroup,sx,95,sz);torches.push({fire})}}
  if(dungeon.deco.length){const rubble=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1),mat('#5a515a'),dungeon.deco.length);dungeon.deco.forEach((d,i)=>{dummy.position.set(d.x,3,d.y);dummy.scale.set(d.r,d.r*.4,d.r);dummy.rotation.y=d.x;dummy.updateMatrix();rubble.setMatrixAt(i,dummy.matrix)});rubble.receiveShadow=true;dungeonGroup.add(rubble)}
  decorateDungeon(dungeon);
  if(dungeon.biome==='hell')for(const room of rooms){const gate=new THREE.Group();gate.position.set(room.x,0,room.y-room.h*.35);dungeonGroup.add(gate);for(const side of [-1,1]){mesh(new THREE.CylinderGeometry(10,17,100,6),mat('#442a39'),gate,side*45,50,0);mesh(new THREE.ConeGeometry(12,35,5),mat('#ad7359'),gate,side*45,115,0);}const arch=mesh(new THREE.TorusGeometry(45,8,6,18,Math.PI),mat('#6f3544'),gate,0,100,0);const glow=mesh(new THREE.TorusGeometry(40,2,4,18,Math.PI),new THREE.MeshBasicMaterial({color:'#ff6928'}),gate,0,100,2);}
  dungeonGroup.traverse(object=>{if(object.material?.isMeshStandardMaterial&&object.material!==floorSurface&&object.material!==wetSurface)wallCutaway(object.material);});
  const throne=rooms[rooms.length-1],portal=new THREE.Group();portal.position.set(throne.x,85,throne.y-140);let arch=mesh(new THREE.TorusGeometry(55,9,8,32),mat('#655069',.5),portal);arch.scale.y=1.45;let core=mesh(new THREE.CircleGeometry(49,40),new THREE.MeshBasicMaterial({color:'#ad3c9b',transparent:true,opacity:.45,side:THREE.DoubleSide}),portal);core.scale.y=1.45;dungeonGroup.add(portal);scene.userData.portal=portal;portal.visible=false;merchantModel=new THREE.Group();const cloak=mat('#32536a');mesh(new THREE.ConeGeometry(18,45,8),cloak,merchantModel,0,24,0);mesh(new THREE.SphereGeometry(9,10,8),mat('#bfac90'),merchantModel,0,57,0);mesh(new THREE.ConeGeometry(13,19,8),cloak,merchantModel,0,74,0);block(merchantModel,20,30,0,3,65,3,'#bba06b');mesh(new THREE.OctahedronGeometry(6),new THREE.MeshBasicMaterial({color:'#b1e7eb'}),merchantModel,20,65,0);merchantModel.visible=false;dungeonGroup.add(merchantModel);
}
// Wall-mounted detail stays outside walking routes; rubble is decorative.
function decorateDungeon(dungeon){
  const batches=new Map(),hellGlow=dungeon.biome==='hell'?new THREE.MeshBasicMaterial({color:'#ff5827'}):null;
  function instance(kind,geometry,material,x,y,z,sx,sy,sz,angle=0){
    if(!batches.has(kind))batches.set(kind,{geometry,material,transforms:[]});else geometry.dispose();
    const transform=new THREE.Object3D();transform.position.set(x,y,z);transform.scale.set(sx,sy,sz);transform.rotation.y=-angle;transform.updateMatrix();batches.get(kind).transforms.push(transform.matrix.clone());
  }
  const used=[];
  for(const wall of dungeon.walls){
    if(used.some(w=>Math.hypot(w.x-wall.x,w.y-wall.y)<145))continue;
    used.push(wall);
    const room=roomNear(dungeon,wall.x,wall.y),angle=wall.angle;
    const nx=-Math.sin(angle),nz=Math.cos(angle),sign=dungeon.contains(wall.x+nx*20,wall.y+nz*20)?1:-1;
    const mount=new THREE.Group();mount.position.set(wall.x+nx*sign*6,0,wall.y+nz*sign*6);mount.rotation.y=-angle;dungeonGroup.add(mount);
    if(dungeon.biome==='jungle'){
      const x=wall.x-nx*sign*20,z=wall.y-nz*sign*20,height=85+(used.length*31+dungeon.seed)%65;
      instance('trunks',new THREE.CylinderGeometry(1,1.3,1,6),wallSurface,x,height/2,z,12,height,12,angle);
      instance('canopies',new THREE.IcosahedronGeometry(1,0),mat(room.theme==='marsh'?'#345c42':'#426a32'),x,height+20,z,48,38,48,angle);
      for(let j=0;j<3;j++)instance('roots',new THREE.BoxGeometry(1,1,1),wallSurface,wall.x,8+j*12,wall.y,55,7,22,angle+j*.15);
      continue;
    }
    if(dungeon.biome==='frozen'){instance('ice-spires',new THREE.ConeGeometry(1,1,5),mat('#8fb9d1',.15,.28),wall.x,wall.height*.35,wall.y,22,wall.height*.7,22,angle);continue;}
    if(dungeon.biome==='hell'){
      instance('basalt',new THREE.ConeGeometry(1,1,5),wallSurface,wall.x,wall.height*.4,wall.y,25,wall.height*.8,25,angle);
      instance('embers',new THREE.OctahedronGeometry(1),hellGlow,wall.x+nx*sign*12,35,wall.y+nz*sign*12,6,18,6,angle);
      continue;
    }
    const stone=mat(room.theme==='chapel'?'#877d70':room.theme==='crypt'?'#626961':'#536872');
    instance('pilaster-'+room.theme,new THREE.BoxGeometry(1,1,1),stone,wall.x,wall.height/2,wall.y,20,wall.height,26,angle);
    instance('base-'+room.theme,new THREE.BoxGeometry(1,1,1),stone,wall.x,8,wall.y,30,16,34,angle);
    const choice=(dungeon.seed+used.length*17)%4;
    if(choice===0){
      const panel=mesh(new THREE.PlaneGeometry(48,58),mat('#202631',.05),mount,0,45,sign*9);panel.material.side=THREE.DoubleSide;
      const arch=mesh(new THREE.TorusGeometry(24,5,6,16,Math.PI),stone,mount,0,66,sign*12);
      for(const side of [-1,1])mesh(new THREE.BoxGeometry(9,43,10),stone,mount,side*24,44,sign*12);
      if(room.theme==='crypt')for(let i=-1;i<=1;i++)mesh(new THREE.SphereGeometry(5,8,6),mat('#b4ad92'),mount,i*12,31,sign*14);
      if(room.theme==='flooded')for(let i=-2;i<=2;i++)mesh(new THREE.BoxGeometry(2,40,4),mat('#544c40',.7),mount,i*8,43,sign*14);
    }else if(choice===1&&room.theme==='chapel'){
      const cloth=new THREE.MeshStandardMaterial({color:'#682d3c',roughness:1,side:THREE.DoubleSide});cloth.userData.dungeonOwned=true;
      const banner=mesh(new THREE.PlaneGeometry(32,56,4,6),cloth,mount,0,54,sign*15);
      const attr=banner.geometry.attributes.position;for(let i=0;i<attr.count;i++)attr.setZ(i,Math.sin(attr.getX(i)*.22)*2);banner.geometry.computeVertexNormals();
      mesh(new THREE.BoxGeometry(38,4,4),mat('#ac8d57',.6),mount,0,84,sign*16);
      mesh(new THREE.BoxGeometry(3,23,2),mat('#b8a46e',.4),mount,0,54,sign*18);
      mesh(new THREE.BoxGeometry(16,3,2),mat('#b8a46e',.4),mount,0,57,sign*18);
    }else if(choice===2){
      // Uneven masonry repairs break up the otherwise continuous wall band.
      for(let j=0;j<3;j++)instance('repairs-'+room.theme,new THREE.BoxGeometry(1,1,1),stone,wall.x+Math.cos(angle)*(j-1)*20,20+j*15,wall.y+Math.sin(angle)*(j-1)*20,18,12,wall.h+5,angle);
    }else if(room.theme==='flooded'){
      const stain=new THREE.MeshStandardMaterial({color:'#283f39',roughness:1,transparent:true,opacity:.65,side:THREE.DoubleSide});stain.userData.dungeonOwned=true;
      mesh(new THREE.PlaneGeometry(38,wall.height*.6),stain,mount,0,wall.height*.3,sign*10);
    }
  }
  for(const room of dungeon.rooms){
    if(room.theme==='crypt')for(const side of [-1,1]){
      const x=room.x+side*room.w*.34,z=room.y;
      instance('sarcophagi',new THREE.BoxGeometry(1,1,1),mat('#696d66'),x,15,z,40,30,82);
      instance('tomb-lids',new THREE.BoxGeometry(1,1,1),mat('#8b8b78'),x,32,z,47,6,90);
      instance('tomb-inlay',new THREE.BoxGeometry(1,1,1),mat('#a3a18e'),x,36,z,5,2,40);
    }
    if(room.theme==='chapel')for(const side of [-1,1]){
      const x=room.x+side*room.w*.35,z=room.y-room.h*.18;
      instance('broken-column',new THREE.CylinderGeometry(1,1.15,1,8),mat('#858177'),x,30,z,19,60,19);
      instance('fallen-column',new THREE.BoxGeometry(1,1,1),mat('#77746e'),x+side*24,6,z+35,24,12,46,.6*side);
    }
  }
  for(const batch of batches.values()){
    const object=new THREE.InstancedMesh(batch.geometry,batch.material,batch.transforms.length);
    batch.transforms.forEach((matrix,i)=>object.setMatrixAt(i,matrix));object.castShadow=object.receiveShadow=true;dungeonGroup.add(object);
  }
}
function cacheMinimap(dungeon){
  const xs=dungeon.triangles.flatMap(triangle=>triangle.map(v=>v.x)),ys=dungeon.triangles.flatMap(triangle=>triangle.map(v=>v.y));
  mapOriginX=Math.min(...xs);mapOriginY=Math.min(...ys);const scale=.18;
  mapCanvas=document.createElement('canvas');mapCanvas.width=Math.ceil((Math.max(...xs)-mapOriginX)*scale)+2;mapCanvas.height=Math.ceil((Math.max(...ys)-mapOriginY)*scale)+2;
  const context=mapCanvas.getContext('2d');context.fillStyle='#474958';context.beginPath();
  for(const triangle of dungeon.triangles){context.moveTo((triangle[0].x-mapOriginX)*scale,(triangle[0].y-mapOriginY)*scale);for(let i=1;i<3;i++)context.lineTo((triangle[i].x-mapOriginX)*scale,(triangle[i].y-mapOriginY)*scale);context.closePath();}context.fill();
}
function warmSpellShaders(){
  if(!renderer.compileAsync)return;
  const warmup=new THREE.Group();shaderWarmup=warmup;warmup.visible=false;
  for(const type of ['arcane','fireball','ring','danger','meteor','zone','lightning'])warmup.add(makeSpellEffect({type,spell:type==='ring'?'nova':null,r:100,color:'#bbaaff',x:0,y:0,tx:100,ty:100}));
  scene.add(warmup);
  renderer.compileAsync(scene,camera).catch(()=>{}).finally(()=>scene.remove(warmup));
}
function wallCutaway(material){
  if(material.userData.cutaway)return;
  // Alpha hashing preserves depth ordering for merged and instanced walls.
  material.userData.cutaway=true;material.transparent=false;material.depthWrite=true;material.alphaHash=true;
  material.onBeforeCompile=shader=>{
    shader.uniforms.riftHero={value:cutawayScreen};shader.uniforms.riftViewport={value:cutawayViewport};
    shader.fragmentShader='uniform vec3 riftHero; uniform vec2 riftViewport;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphahash_fragment>',`
      vec2 riftNdc = gl_FragCoord.xy / riftViewport * 2.0 - 1.0;
      float riftDistance = length((riftNdc-riftHero.xy)*vec2(riftViewport.x/riftViewport.y,1.0));
      float riftForeground = 1.0-step(riftHero.z*0.5+0.5-0.000005,gl_FragCoord.z);
      float riftWindow = 1.0-smoothstep(0.10,0.23,riftDistance);
      diffuseColor.a *= 1.0-riftForeground*riftWindow*0.82;
      #include <alphahash_fragment>`);
  };
  material.customProgramCacheKey=()=> 'rift-wall-cutaway-depth-v2';material.needsUpdate=true;
}
// Share text textures across repeated damage values and status combinations.
const textTextures=new Map(),textPosition=new THREE.Vector3();
function textTexture(text,color,size,background){
  const key=JSON.stringify([String(text),color,size,background]);if(textTextures.has(key))return textTextures.get(key);
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),lines=String(text).split('\n'),font=size*2;
  ctx.font='bold '+font+'px Arial';canvas.width=Math.min(900,Math.max(50,...lines.map(line=>Math.ceil(ctx.measureText(line).width+24))));canvas.height=lines.length*(font+8)+12;
  if(background){ctx.fillStyle='rgba(13,14,24,0.88)';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.strokeRect(1,1,canvas.width-2,canvas.height-2);}
  ctx.textAlign='center';ctx.font='bold '+font+'px Arial';ctx.fillStyle=color;ctx.strokeStyle='#090910';ctx.lineWidth=4;ctx.lineJoin='round';
  lines.forEach((line,i)=>{const y=font+4+i*(font+8);ctx.strokeText(line,canvas.width/2,y,canvas.width-16);ctx.fillText(line,canvas.width/2,y,canvas.width-16);});
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;
  const entry={key,texture,width:canvas.width/2,height:canvas.height/2,refs:0};textTextures.set(key,entry);
  for(const [oldKey,old]of textTextures){if(textTextures.size<=128)break;if(!old.refs&&old!==entry){old.texture.dispose();textTextures.delete(oldKey);}}
  return entry;
}
function updateWorldText(label,text,color=label.userData.textColor){
  const key=JSON.stringify([String(text),color,label.userData.textSize,label.userData.textBackground]);if(label.userData.textEntry?.key===key)return;
  if(label.userData.textEntry)label.userData.textEntry.refs--;
  const entry=textTexture(text,color,label.userData.textSize,label.userData.textBackground);entry.refs++;label.userData.textEntry=entry;label.userData.textColor=color;label.material.map=entry.texture;label.material.needsUpdate=true;
}
function worldText(text,color,size=12,background=false){
  const label=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,depthWrite:false,depthTest:false,toneMapped:false}));label.renderOrder=1000;label.userData.textSize=size;label.userData.textBackground=background;updateWorldText(label,text,color);return label;
}
function placeWorldText(label,x,y,z){
  label.position.set(x,z,y);textPosition.copy(label.position).applyMatrix4(camera.matrixWorldInverse);
  const pixelWorld=Math.max(1,-textPosition.z)*2*Math.tan(camera.fov*Math.PI/360)/H,entry=label.userData.textEntry;
  label.scale.set(entry.width*pixelWorld,entry.height*pixelWorld,1);
}
function lootLabel(item){
  const detail=item.type==='gem'?'Skill gem · Level '+item.level:item.type==='potion'?'Healing potion':Object.entries(item.stats||{}).filter(([,v])=>v).map(([key,v])=>key==='cooldown'?Math.round(v*100)+'% CDR':'+'+v+' '+(key==='power'?'damage':'armor')).join(' · ');
  const label=worldText((item.name||'Relic')+'\n'+detail,item.color||'#d6d4c8',12,true);label.position.y=58;return label;
}
function lootModel(item){
  const group=new THREE.Group(),color=item.color||RARITIES[item.rarity]||'#d6d4c8';
  const gem=mesh(new THREE.OctahedronGeometry(9),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:1.5}),group,0,17,0);gem.material.userData.ephemeral=true;
  const height=Math.min(230,65+(item.power||0)*3+(item.rarity==='Legendary'?55:0));
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(3,12,height,12,1,true),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.35,map:lootBeamTexture,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}));beam.position.y=height/2;group.add(beam);
  const label=lootLabel(item);group.add(label);group.userData.label=label;spellGlow(group,color,45,.5,0,12,0);if(item.rarity==='Legendary'){group.userData.sparks=[];for(let i=0;i<4;i++)group.userData.sparks.push(spellGlow(group,color,12,.8,0,30+i*20,0));}return group;
}
function initSpellVisuals(){
  const size=64,rgba=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const r=Math.hypot((x+.5)/size*2-1,(y+.5)/size*2-1),i=(y*size+x)*4;
    rgba[i]=rgba[i+1]=rgba[i+2]=255;rgba[i+3]=Math.round(Math.max(0,1-r)**2*255);
  }
  spellTexture=new THREE.DataTexture(rgba,size,size);spellTexture.needsUpdate=true;const beam=new Uint8Array(64*4);for(let y=0;y<64;y++){beam[y*4]=beam[y*4+1]=beam[y*4+2]=255;beam[y*4+3]=Math.round(Math.pow(1-y/63,1.4)*255);}lootBeamTexture=new THREE.DataTexture(beam,1,64);lootBeamTexture.magFilter=THREE.LinearFilter;lootBeamTexture.needsUpdate=true;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(1024*3),3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(1024*3),3));geometry.setDrawRange(0,0);
  const material=new THREE.PointsMaterial({map:spellTexture,size:14,sizeAttenuation:true,vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
  particleCloud=new THREE.Points(geometry,material);particleCloud.frustumCulled=false;scene.add(particleCloud);
}
function updateParticles(particles){
  const position=particleCloud.geometry.attributes.position,color=particleCloud.geometry.attributes.color,count=Math.min(1024,particles.length),tint=new THREE.Color();
  for(let i=0;i<count;i++){const p=particles[i],fade=Math.max(0,p.life/(p.max??.4));position.setXYZ(i,p.x,Math.max(2,p.z),p.y);tint.set(p.color);color.setXYZ(i,tint.r*fade,tint.g*fade,tint.b*fade);}
  position.needsUpdate=color.needsUpdate=true;particleCloud.geometry.setDrawRange(0,count);
}
function spellGlow(parent,color,size,opacity=1,x=0,y=0,z=0){
  const material=new THREE.SpriteMaterial({map:spellTexture,color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,opacity});
  const sprite=new THREE.Sprite(material);sprite.scale.set(size,size,1);sprite.position.set(x,y,z);sprite.userData.opacity=opacity;parent.add(sprite);return sprite;
}
function makeSpellEffect(f){
  if(['bolt','arcane','fireball'].includes(f.type)){
    const group=new THREE.Group(),fire=f.type==='fireball';if(f.spellId===4){const shard=mesh(new THREE.OctahedronGeometry(9),new THREE.MeshBasicMaterial({color:'#d7faff',toneMapped:false}),group);shard.scale.set(2.4,.5,.5);}
    mesh(new THREE.SphereGeometry(fire?7:3,10,8),new THREE.MeshBasicMaterial({color:fire?'#fff2bd':'#efe4ff',toneMapped:false}),group);
    spellGlow(group,f.color,fire?70:43,.95);
    spellGlow(group,fire?'#ff5628':'#8d6aff',fire?100:60,.35);
    for(let i=1;i<=3;i++)spellGlow(group,f.color,(fire?32:21)*(1-i*.13),.6,-i*(fire?12:9),i*(fire?3:0),0);
    return group;
  }
  if(f.type==='lightning'){
    const points=[];for(let i=0;i<=8;i++){let fraction=i/8;points.push(new THREE.Vector3((f.tx-f.x)*fraction+(i&&i<8?Math.sin(i*7)*12:0),35+Math.sin(i)*5,(f.ty-f.y)*fraction));}
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:f.color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));
  }
  if(f.type==='meteor'){
    const group=new THREE.Group();group.add(ring(f.color,f.r));const rock=mesh(new THREE.DodecahedronGeometry(24),new THREE.MeshBasicMaterial({color:'#ffbd70',toneMapped:false}),group);group.userData.rock=rock;spellGlow(group,f.color,100,.8,0,40,0);return group;
  }
  if(f.type==='zone'){
    const group=new THREE.Group();const disc=mesh(new THREE.PlaneGeometry(f.r*2,f.r*2),new THREE.MeshBasicMaterial({map:spellTexture,color:f.color,transparent:true,opacity:.45,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}),group);disc.rotation.x=-Math.PI/2;group.add(ring(f.color,f.r));for(let i=0;i<5;i++)spellGlow(group,f.color,75,.16,Math.cos(i*1.26)*f.r*.5,18,Math.sin(i*1.26)*f.r*.5);return group;
  }
  if(f.type==='danger'){
    const group=new THREE.Group();group.add(ring(f.color,f.r));
    const disc=mesh(new THREE.CircleGeometry(f.r,48),new THREE.MeshBasicMaterial({color:f.color,transparent:true,opacity:.2,side:THREE.DoubleSide,depthWrite:false}),group);disc.rotation.x=-Math.PI/2;disc.position.y=1;return group;
  }
  if(f.spell){
    const group=new THREE.Group();
    const wave=new THREE.Mesh(new THREE.RingGeometry(f.r-12,f.r,64),new THREE.MeshBasicMaterial({color:f.color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));wave.rotation.x=-Math.PI/2;group.add(wave);
    const haze=new THREE.Mesh(new THREE.PlaneGeometry(f.r*2.2,f.r*2.2),new THREE.MeshBasicMaterial({map:spellTexture,color:f.color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,opacity:.45}));haze.rotation.x=-Math.PI/2;haze.position.y=4;haze.userData.opacity=.45;group.add(haze);
    const shell=new THREE.Mesh(new THREE.SphereGeometry(f.r,24,12,0,Math.PI*2,0,Math.PI/2),new THREE.MeshBasicMaterial({color:f.color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,opacity:.07}));shell.scale.y=.22;shell.userData.opacity=.07;group.add(shell);return group;
  }
  if(f.type==='slash'){let o=new THREE.Mesh(new THREE.TorusGeometry(f.r,3,4,24,Math.PI*.8),new THREE.MeshBasicMaterial({color:f.color,transparent:true,depthWrite:false}));o.rotation.x=-Math.PI/2;return o;}
  return ring(f.color,f.r);
}
function makeAimMarker(){
  const group=new THREE.Group();
  const fill=new THREE.Mesh(new THREE.CircleGeometry(145,64),new THREE.MeshBasicMaterial({color:'#74d6ed',transparent:true,opacity:.2,depthWrite:false,depthTest:true,side:THREE.DoubleSide,toneMapped:false}));
  const outline=new THREE.Mesh(new THREE.RingGeometry(142,145,64),new THREE.MeshBasicMaterial({color:'#ceefff',transparent:true,opacity:.95,depthWrite:false,depthTest:true,side:THREE.DoubleSide,toneMapped:false}));
  for(const part of [fill,outline]){part.rotation.x=-Math.PI/2;part.renderOrder=20;group.add(part);}
  group.userData.fill=fill;return group;
}
function ring(color,radius){let obj=new THREE.Mesh(new THREE.RingGeometry(radius-2,radius,64),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));obj.rotation.x=-Math.PI/2;obj.position.y=2;return obj}
export function resizeRender(w,h){W=w;H=h;if(!renderer)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
export function projectWorld(x,y,z=0){let v=new THREE.Vector3(x,z,y).project(camera);return{x:(v.x+1)*W/2,y:(1-v.y)*H/2,scale:1}}
export function screenToWorld(x,y){ray.setFromCamera(new THREE.Vector2(x/W*2-1,1-y/H*2),camera);let hit=ray.ray.intersectPlane(ground,floorTarget);return hit?{x:hit.x,y:hit.z}:{x:hero.root.position.x,y:hero.root.position.z}}
function remove(object){scene.remove(object);const disposed=new Set();object.traverse(n=>{if(n.userData.textEntry)n.userData.textEntry.refs--;if(n.geometry&&!n.isSprite&&!n.geometry.userData.sharedCharacter)n.geometry.dispose();if(n.isSkinnedMesh)n.skeleton.dispose();for(const material of Array.isArray(n.material)?n.material:[n.material]){if(material&&!disposed.has(material)&&(material.isLineBasicMaterial||material.isMeshBasicMaterial||material.isSpriteMaterial||material.userData?.ephemeral)){material.dispose();disposed.add(material);}}})}
function syncCollection(map,items,make,update){let current=new Set(items);for(const [key,obj] of map)if(!current.has(key)){remove(obj);map.delete(key)}for(const item of items){if(!map.has(item)){let obj=make(item);map.set(item,obj);scene.add(obj)}update(map.get(item),item)}}
const corpses=[];let lastCorpseTime=0;
function syncEnemies(s){
  if(s.t<lastCorpseTime){for(const corpse of corpses){disposeRiggedCharacter(corpse.model);remove(corpse.model.root);}corpses.length=0;}lastCorpseTime=s.t;
  const alive=new Set(s.enemies);
  for(const [actor,model]of enemyModels)if(!alive.has(actor)){
    enemyModels.delete(actor);
    if(actor.hp<=0){beginCharacterDeath(model);model.health.visible=false;corpses.push({model,actor,age:0,last:s.t});}
    else{disposeRiggedCharacter(model);remove(model.root);}
  }
  for(const actor of s.enemies){if(!enemyModels.has(actor)){const model=buildCharacter(actor.kind);if(actor.elite){model.root.scale.multiplyScalar(1.12);model.materials[1].color.set('#d7ae61');model.statusMaterials[1].color.copy(model.materials[1].color);}enemyModels.set(actor,model);}syncCharacter(enemyModels.get(actor),actor,s.t,s.animationDelta);}
  for(let i=corpses.length-1;i>=0;i--){const c=corpses[i],dt=Math.max(0,Math.min(.05,s.animationDelta??s.t-c.last));c.last=s.t;c.age+=dt;updateRiggedCharacter(c.model,c.actor,s.t,dt);if(c.age>.85){for(const material of c.model.materials){material.opacity=Math.max(0,1-(c.age-.85)*2);material.alphaHash=true;}}if(c.age>1.35||corpses.length>8){disposeRiggedCharacter(c.model);remove(c.model.root);corpses.splice(i,1);}}
}
export function renderFrame(s){const p=s.p;const rx=p.renderX??p.x,ry=p.renderY??p.y;const mobile=window.matchMedia?.('(pointer:coarse)').matches||(H<520&&W>H);const zoom=mobile?.45:.72;camera.position.set(rx+510*zoom,850*zoom,ry+660*zoom);camera.lookAt(rx,10,ry-60*zoom);updateBackdrop(rx,ry);camera.updateMatrixWorld();if(mobile&&(s.t<lastShadowTime||s.t-lastShadowTime>=1/30)){renderer.shadowMap.needsUpdate=true;lastShadowTime=s.t;}cutawayScreen.set(rx,43,ry).project(camera);const ratio=renderer.getPixelRatio?.()??Math.min(devicePixelRatio,1.5);cutawayViewport.set(W*ratio,H*ratio);shieldVisual.visible=(p.shield||0)>0;shieldVisual.position.set(rx,37,ry);shieldVisual.rotation.y=s.t;let sun=scene.userData.sun;sun.position.set(p.x+300,1000,p.y+400);sun.target.position.set(p.x,0,p.y);applyCharacterEquipment(hero,s.equipped);syncCharacter(hero,p,s.t,s.animationDelta);if(s.over&&p.hp<=0)beginCharacterDeath(hero);else if(hero.dead&&p.hp>0){hero.dead=false;hero.actions.death.stop();hero.actions.idle.reset().play();hero.actions.walk.reset().play();}heroLight.position.set(rx-100,180,ry+65);heroLightTarget.position.set(rx,0,ry);heroGlow.position.set(rx-100,180,ry+65);heroGlow.scale.setScalar(1+Math.sin(s.t*2)*.05);
syncEnemies(s);
for(const torch of torches){torch.fire.rotation.y=s.t*2;torch.fire.scale.y=1.4+Math.sin(s.t*8+torch.fire.position.x)*.2}
// A fixed light pool keeps shader variants stable as the player changes rooms.
const lightDt=Math.max(0,Math.min(.05,s.t-lastLightTime));lastLightTime=s.t;
lightSelection.update(torches,hero.root.position,lightDt).forEach((slot,i)=>{const light=lightPool[i];if(slot.source)light.position.copy(slot.source.fire.position);light.intensity=slot.weight*(110000+Math.sin(s.t*6+i)*4000)});
syncCollection(effectModels,s.fx,makeSpellEffect,(o,f)=>{
  const projectile=['bolt','arcane','fireball'].includes(f.type),a=Math.max(0,f.life/f.max),age=f.max-f.life;
  o.position.set(f.x,projectile?35:f.type==='slash'?35:3,f.y);
  if(f.type==='slash')o.rotation.z=-f.angle-.4;
  if(!['danger','zone','meteor','lightning'].includes(f.type)&&!projectile)o.scale.setScalar(.3+(1-a)*.7);if(f.type==='meteor')o.userData.rock.position.y=20+a*400;if(f.type==='zone')o.rotation.y=age*.2;
  if(projectile){o.rotation.y=-Math.atan2(f.vy,f.vx);o.scale.setScalar(1+Math.sin(s.t*22)*.06);}
  o.traverse(n=>{if(n.material){n.material.opacity=f.type==='danger'?(n.geometry?.type==='CircleGeometry'?(f.trigger?.7:.12+(1-a)*.3):.8):Math.min(1,a*2)*(n.userData.opacity??1);if(n.isSprite)n.material.rotation=age*(f.type==='fireball'?2.5:-2);}});
});
updateParticles(s.particles);

syncCollection(lootModels,s.drops,lootModel,(o,d)=>{o.position.set(d.x,0,d.y);o.children[0].rotation.y=s.t;o.children[0].position.y=17+Math.sin(s.t*3)*4;const label=o.userData.label;placeWorldText(label,d.x,d.y,58);label.position.set(0,58,0);label.visible=Math.hypot(d.x-p.x,d.y-p.y)<650;label.material.opacity=Math.hypot(d.x-p.x,d.y-p.y)<320?1:.45;o.userData.sparks?.forEach((spark,i)=>spark.position.set(Math.cos(s.t*2+i*1.57)*15,30+i*20+Math.sin(s.t*3+i)*8,Math.sin(s.t*2+i*1.57)*15));});
syncCollection(statusLabels,s.enemies.filter(e=>e.elite||Object.keys(e.status||{}).length),()=>worldText('','#dcecff',12,true),(label,e)=>{
  const statuses=(e.elite?'★ Elite · ':'')+Object.keys(e.status||{}).sort().map(name=>({freeze:'❄ Frozen',burn:'♨ Burning',poison:'☣ Poison',slow:'↓ Slowed',stun:'ϟ Stunned'}[name]||name)).join(' · ');
  updateWorldText(label,statuses);placeWorldText(label,e.renderX??e.x,e.renderY??e.y,e.kind==='boss'?205:e.kind==='spider'?57:e.kind==='demon'?125:103);
});
syncCollection(chestModels,s.chests,()=>{let group=new THREE.Group();mesh(new THREE.BoxGeometry(42,27,30),woodSurface,group,0,13.5,0);const iron=mat('#a88a54',.8,.32);for(let side of [-1,1]){mesh(new THREE.BoxGeometry(4,29,32),iron,group,side*14,14,0);for(let z of [-16,16])for(let y of [6,21])mesh(new THREE.SphereGeometry(1.5,6,4),iron,group,side*14,y,z)}let pivot=new THREE.Group();pivot.position.set(0,27,15);group.add(pivot);mesh(new THREE.BoxGeometry(44,9,32),woodSurface,pivot,0,4,-15);for(let side of [-1,1])mesh(new THREE.BoxGeometry(4,10,34),iron,pivot,side*14,4,-15);mesh(new THREE.BoxGeometry(7,10,3),iron,group,0,20,-17);let handle=mesh(new THREE.TorusGeometry(3,1,4,10),iron,group,0,17,-19);group.userData.lid=pivot;return group},(o,ch)=>{o.position.set(ch.x,0,ch.y);o.userData.lid.rotation.x=ch.opened?1.2:0});
aimRing.userData.fill.material.opacity=mobile?.22:.13;aimRing.visible=s.started&&!s.paused&&!s.over&&s.showAim;aimRing.position.set(s.aim.x,2,s.aim.y);let radius=s.previewRadius??145;aimRing.scale.setScalar(radius/145);aimLine.visible=aimRing.visible;let vertices=aimLine.geometry.attributes.position;vertices.setXYZ(0,p.renderX??p.x,4,p.renderY??p.y);vertices.setXYZ(1,s.aim.x,4,s.aim.y);vertices.needsUpdate=true;aimLine.geometry.computeBoundingSphere();scene.userData.portal.visible=!!s.bossDead;scene.userData.portal.rotation.z=Math.sin(s.t*.4)*.05;merchantModel.visible=!!s.merchant;if(s.merchant)merchantModel.position.set(s.merchant.x,0,s.merchant.y);merchantLabel.visible=portalLabel.visible=!!s.bossDead;if(s.bossDead){placeWorldText(merchantLabel,s.merchant.x,s.merchant.y,95);updateWorldText(portalLabel,'Enter Rift '+(s.rift+1));placeWorldText(portalLabel,rooms[rooms.length-1].x,rooms[rooms.length-1].y-140,170);}
syncCollection(floating,s.texts,a=>worldText(a.text,a.color,20),(label,a)=>{placeWorldText(label,a.x,a.y,a.z);label.material.opacity=Math.min(1,a.life*2);});
let c=miniCtx;c.clearRect(0,0,240,160);c.fillStyle='#10121be8';c.fillRect(0,0,240,160);c.strokeStyle='#8c7652';c.strokeRect(.5,.5,239,159);const mapScale=.18;function mp(x,y){const dx=x-p.x,dz=y-p.y,basis=camera.matrixWorld.elements;return{x:120+(dx*basis[0]+dz*basis[2])*mapScale,y:73-(dx*basis[4]+dz*basis[6])*mapScale}}c.save();c.beginPath();c.rect(4,4,232,137);c.clip();const basis=camera.matrixWorld.elements,origin=mp(mapOriginX,mapOriginY);c.save();c.transform(basis[0],-basis[4],basis[2],-basis[6],origin.x,origin.y);c.drawImage(mapCanvas,0,0);c.restore();for(const e of s.enemies){let m=mp(e.x,e.y);c.fillStyle=e.kind==='boss'?'#ffbc65':'#df6573';c.fillRect(m.x-2,m.y-2,4,4)}for(const chest of s.chests)if(!chest.opened){let m=mp(chest.x,chest.y);c.fillStyle='#b99762';c.fillRect(m.x-2,m.y-2,4,4)}c.fillStyle='#f1d394';c.beginPath();c.arc(120,73,4,0,Math.PI*2);c.fill();c.strokeStyle='#e6c88e';c.beginPath();c.moveTo(120,73);const facing=mp(p.x+Math.cos(p.face||0)*72,p.y+Math.sin(p.face||0)*72);c.lineTo(facing.x,facing.y);c.stroke();c.restore();c.fillStyle='#cfb889';c.font='12px Arial';c.textAlign='center';c.fillText((scene.userData.biomeName||'SANCTUM').toUpperCase(),120,153);renderer.render(scene,camera)}
