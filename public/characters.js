import * as THREE from './vendor/three.module.js';
import {appendMageBody} from './sculpted-body.js?v=49';

// One skinned surface per actor. Geometry and clips are cached by family;
// skeletons and materials belong to each actor, so poses and status tints stay independent.
const templates=new Map();
const regions={cloth:0,trim:1,skin:2,legs:3,boots:4,metal:5,wood:6,magic:7,hood:8,focus:9};
const palettes={spider:['#34483d','#9a8253','#59735a','#283c30','#23332a','#6c7765','#594632','#a7e47c','#394d3a'],demon:['#632e2c','#d1ad73','#ae5040','#3e292d','#2f2428','#8f6b58','#54332a','#ff994f','#662e2a'],healer:['#375b50','#c5b379','#b9b69a','#2b3d36','#24312d','#8b9d91','#695b3c','#92eab2','#2a4940'],hero:['#63538d','#c5a773','#d3b29a','#343447','#272836','#a4acb5','#72533e','#b18aff','#574475'],caster:['#443358','#957d68','#a6aaa0','#30303e','#242530','#717581','#574537','#dc77ec','#352541'],ghoul:['#474d44','#776d55','#889383','#3a3938','#363a33','#9b9684','#615044','#edbd74','#45483f'],brute:['#613e3a','#9c8062','#aa9789','#3d3337','#312d32','#8b8580','#614337','#f18b57','#51342f'],hunter:['#345445','#a8a07a','#8ea794','#283a32','#222e29','#8c9987','#594a39','#b6db80','#294238'],sentinel:['#465469','#bb9d69','#a6a9ac','#303a4a','#252b37','#9ba5b4','#615345','#72c3ef','#36465a'],boss:['#713437','#d3b37c','#c2a68d','#453038','#30262d','#9b7a64','#5b3b32','#ff9167','#59262e']};
function skeleton(kind){
  if(kind==='spider'){
    const bones=[],byName={};const add=(name,parent,x,y,z)=>{const b=new THREE.Bone();b.name=name;b.position.set(x,y,z);if(parent)byName[parent].add(b);bones.push(b);byName[name]=b;};
    add('pelvis',null,0,16,0);add('head','pelvis',0,0,-9);add('abdomen','pelvis',0,2,9);
    for(let i=0;i<8;i++){const side=i<4?-1:1,row=i%4;add('leg'+i,'pelvis',side*7,0,(row-1.5)*5);add('tip'+i,'leg'+i,side*15,-6,(row-1.5)*6);}
    byName.pelvis.updateMatrixWorld(true);return{bones,byName};
  }

  const bones=[],byName={};
  const add=(name,parent,x,y,z)=>{const bone=new THREE.Bone();bone.name=name;bone.position.set(x,y,z);if(parent)byName[parent].add(bone);bones.push(bone);byName[name]=bone;return bone};
  add('pelvis',null,0,25,0);add('spine','pelvis',0,13,0);add('chest','spine',0,12,0);add('neck','chest',0,8,0);add('head','neck',0,6,0);
  for(const [side,x]of [['L',-1],['R',1]]){
    add('arm'+side,'chest',x*14,-1,0);add('forearm'+side,'arm'+side,0,-14,0);add('hand'+side,'forearm'+side,0,-13,0);
    add('thigh'+side,'pelvis',x*7,-1,0);add('shin'+side,'thigh'+side,0,-12,0);add('foot'+side,'shin'+side,0,-10,-2);
    add('skirt'+side,'pelvis',x*8,0,0);
  }
  add('cape','chest',0,0,7);byName.pelvis.updateMatrixWorld(true);
  return{bones,byName};
}
function template(kind){
  if(templates.has(kind))return templates.get(kind);
  const {bones,byName}=skeleton(kind),boneIndex=Object.fromEntries(bones.map((b,i)=>[b.name,i])),buckets=Array.from({length:10},()=>({p:[],n:[],uv:[],si:[],sw:[]}));
  const hero=kind==='hero',caster=hero||kind==='caster'||kind==='healer',heavy=kind==='brute'||kind==='boss'||kind==='sentinel',hunter=kind==='hunter';
  const width=heavy?1.22:hunter?.85:1;
  // Parts are transformed in bind space and joined by material, not rendered separately.
  function part(geometry,region,bindName,x,y,z,sx=1,sy=1,sz=1,rotation=null,secondary=null,blend=null){
    geometry.scale(sx,sy,sz);if(rotation){geometry.rotateX(rotation[0]||0);geometry.rotateY(rotation[1]||0);geometry.rotateZ(rotation[2]||0)}geometry.translate(x,y,z);
    const g=geometry.index?geometry.toNonIndexed():geometry,b=buckets[regions[region]],p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
    for(let i=0;i<p.count;i++){
      b.p.push(p.getX(i),p.getY(i),p.getZ(i));b.n.push(n.getX(i),n.getY(i),n.getZ(i));b.uv.push(uv?.getX(i)||0,uv?.getY(i)||0);
      const weight=secondary?THREE.MathUtils.clamp(blend?.(p.getY(i))??.5,0,1):0;
      b.si.push(boneIndex[bindName],boneIndex[secondary||bindName],0,0);b.sw.push(1-weight,weight,0,0);
    }
    if(g!==geometry)g.dispose();geometry.dispose();
  }
  const sphere=(r,region,bone,x,y,z,sx=1,sy=1,sz=1)=>part(new THREE.SphereGeometry(r,10,7),region,bone,x,y,z,sx,sy,sz);
  const cylinder=(top,bottom,height,region,bone,x,y,z,secondary=null,blend=null)=>part(new THREE.CylinderGeometry(top,bottom,height,10,3),region,bone,x,y,z,1,1,1,null,secondary,blend);
  if(kind==='spider'){
    sphere(11,'cloth','pelvis',0,16,0,1,.65,1);sphere(14,'hood','abdomen',0,19,12,1,.85,1.2);sphere(8,'skin','head',0,14,-10,1,.65,.8);
    for(let i=0;i<8;i++){
      const side=i<4?-1:1,row=i%4,z=(row-1.5)*5,z2=z+(row-1.5)*6;
      const limb=(a,b,r,bone)=>{const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),mid=new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(.5),g=new THREE.CylinderGeometry(r*.8,r,v.length(),6);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize()));part(g,'trim',bone,mid.x,mid.y,mid.z);};
      limb([side*7,16,z],[side*22,10,z2],2,'leg'+i);limb([side*22,10,z2],[side*29,1,z2+side*2],1.5,'tip'+i);
    }
    for(let side of [-1,1]){part(new THREE.ConeGeometry(1.5,8,6),'trim','head',side*4,7,-14,1,1,1,[.3,0,side*.2]);for(let j=0;j<2;j++)sphere(1.2,'magic','head',side*(2+j*3),16,-16);}
  }else{
  if(hero)appendMageBody(buckets,regions,boneIndex);
  // Enemies retain their existing family geometry.
  if(!hero){
  part(new THREE.SphereGeometry(12,12,8),'cloth','chest',0,41,0,width,1.38,.65,null,'spine',y=>(50-y)/20);
  }
  cylinder(10*width,11*width,5,'trim','pelvis',0,27,0);
  sphere(4,'trim','pelvis',0,27,-9,1,1,.45);
  if(!hero){
  cylinder(5.5,6,7,'skin','neck',0,58,0);
  sphere(8.2,'skin','head',0,67,-1,.83,1.13,.85);
  sphere(3,'skin','head',0,65,-7,1,.6,.5);
  }
  if(hunter){for(const side of [-1,1]){part(new THREE.ConeGeometry(3,18,6),'skin','head',side*9,71,0,1,1,.5,[0,0,-side*1.1]);for(let j=0;j<3;j++)part(new THREE.ConeGeometry(2,12,5),'trim','chest',side*(6+j*3),45+j*4,7,1,1,1,[.65,0,-side*.5]);}}
  if(kind==='ghoul'){for(const side of [-1,1])for(let j=0;j<3;j++)part(new THREE.CapsuleGeometry(1,8,2,6),'trim','chest',side*5,38+j*4,-7,1,1,1,[0,0,side*.9]);}
  // Deep hood rim with a visible face opening; eyes sit on the forward (-Z) face.
  if(caster){
    if(hero){
      part(new THREE.ConeGeometry(14,30,10,3),'hood','head',0,86,1,1,1,1,[0,0,-.08]);
      cylinder(17,17,2.5,'hood','head',0,72,1);
      part(new THREE.TorusGeometry(14.2,1.2,5,16),'trim','head',0,75,1,1,1,1,[Math.PI/2,0,0]);
    }else{
      part(new THREE.SphereGeometry(9.6,12,8,0,Math.PI*2,0,Math.PI*.66),'hood','head',0,69,1,1,1.1,.94);
      part(new THREE.TorusGeometry(7.8,1.6,5,16,Math.PI*1.45),'trim','head',0,68,-6,1,1,1,[0,0,-Math.PI*.22]);
    }
    cylinder(8,11,6,'hood','chest',0,53,1);
    // Four skirt panels have their own bones, allowing walking silhouettes without a rigid cone.
    for(const side of [-1,1]){
      const bone=side<0?'skirtL':'skirtR';
      part(new THREE.CylinderGeometry(11,19,25,10,4,true,side<0?0:Math.PI,Math.PI),'cloth',bone,0,17,0,1,1,.73,null,'pelvis',y=>(y-14)/16);
      cylinder(2,2.5,20,'trim',bone,side*11,16,-11);
    }
    part(new THREE.PlaneGeometry(25,36,4,6),'hood','cape',0,32,9,1,1,1,[.10,0,0], 'chest',y=>(y-37)/12);
  }else{
    sphere(9,'hood','head',0,71,1,1,.5,1);
    for(const side of [-1,1])part(new THREE.ConeGeometry(2.5,16,6),'trim','head',side*7,78,1,1,1,1,[0,0,-side*.45]);
    if(heavy){cylinder(10*width,12*width,22,'metal','chest',0,41,0);sphere(4,'magic','chest',0,43,-11,1,1,.45)}
  }
  for(const side of [-1,1]){
    const suffix=side<0?'L':'R';
    sphere(1.25,'magic','head',side*3.1,68,-7.6,1,.55,.4);
    if(!hero){
    sphere(heavy?8:5.7,heavy?'metal':'cloth','arm'+suffix,side*15,48,0,1,.8,1.1);
    cylinder(caster?5:4.4,caster?6:3.6,15,'cloth','arm'+suffix,side*14,42,0,'forearm'+suffix,y=>(38-y)/6);
    cylinder(3.4,3,13,heavy?'metal':'skin','forearm'+suffix,side*14,28,0);
    sphere(3.8,'skin','hand'+suffix,side*14,22,-1,.85,1,.8);
    cylinder(4.8,4,13,'legs','thigh'+suffix,side*7,18,0,'shin'+suffix,y=>(14-y)/7);
    cylinder(3.8,3.4,11,'boots','shin'+suffix,side*7,7,0);
    sphere(4.5,'boots','foot'+suffix,side*7,3,-3,1,.65,1.5);
    }
    if(!caster&&!heavy){for(let i=0;i<3;i++)part(new THREE.ConeGeometry(1,10,4),'trim','hand'+suffix,side*14+(i-1)*2,17,-4,1,1,1,[Math.PI*.12,0,0]);}
  }
  if(caster){
    cylinder(1.8,2.3,65,'wood','handR',14,41,0);
    part(new THREE.TorusGeometry(7,1.3,5,12),'trim','handR',14,76,0);
    sphere(5,'magic','handR',14,76,0,.8,1.1,.8);
    sphere(5.5,'focus','handL',-14,23,-4);
  }else if(heavy){
    cylinder(2.4,2.4,41,'wood','handR',14,36,0);
    if(kind==='sentinel')part(new THREE.ConeGeometry(4,33,4),'metal','handR',14,58,0,.6,1,1);
    else sphere(9,'metal','handR',14,59,0,1,1.2,.9);
    part(new THREE.SphereGeometry(13,10,6),'metal','handL',-15,32,-5,.8,1.25,.28);
    sphere(4,'trim','handL',-15,32,-9,1,1,.4);
  }
  if(kind==='demon'){
    for(const side of [-1,1]){part(new THREE.ConeGeometry(4,23,7),'trim','head',side*9,79,2,1,1,1,[0,0,-side*.55]);part(new THREE.SphereGeometry(12,8,5),'hood','cape',side*18,47,8,1.2,.9,.18);part(new THREE.ConeGeometry(2.5,17,5),'trim','chest',side*19,59,2,1,1,1,[0,0,-side*.7]);}
  }
  }
  const geometry=new THREE.BufferGeometry(),positions=[],normals=[],uvs=[],indices=[],weights=[];let start=0;
  buckets.forEach((b,i)=>{if(!b.p.length)return;geometry.addGroup(start,b.p.length/3,i);start+=b.p.length/3;positions.push(...b.p);normals.push(...b.n);uvs.push(...b.uv);indices.push(...b.si);weights.push(...b.sw)});
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));geometry.computeBoundingSphere();geometry.userData.sharedCharacter=true;
  const clips=animationClips(bones,kind),result={geometry,clips};templates.set(kind,result);return result;
}
function animationClips(bones,kind){
  if(kind==='spider'){
    const track=(name,values)=>new THREE.QuaternionKeyframeTrack(name+'.quaternion',[0,.2,.4,.6,.8],values.flatMap(r=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)).toArray()));
    const idle=[new THREE.VectorKeyframeTrack('pelvis.position',[0,1,2],[0,16,0,0,16.5,0,0,16,0])],walk=[];
    for(let i=0;i<8;i++){const sign=i%2?1:-1;walk.push(track('leg'+i,[[0,.15*sign,.13*sign],[0,0,0],[0,-.15*sign,-.13*sign],[0,0,0],[0,.15*sign,.13*sign]]));walk.push(track('tip'+i,[[0,0,0],[0,0,.2*sign],[0,0,0],[0,0,-.2*sign],[0,0,0]]));}
    const attack=new THREE.AnimationClip('attack',.4,[new THREE.QuaternionKeyframeTrack('head.quaternion',[0,.15,.4],[0,0,0,1,...new THREE.Quaternion().setFromEuler(new THREE.Euler(.35,0,0)).toArray(),0,0,0,1])]);
    const hit=new THREE.AnimationClip('hit',.2,[]),death=new THREE.AnimationClip('death',.8,[new THREE.QuaternionKeyframeTrack('pelvis.quaternion',[0,.8],[0,0,0,1,...new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,Math.PI*.75)).toArray()]),new THREE.VectorKeyframeTrack('pelvis.position',[0,.8],[0,16,0,0,4,0])]);
    return[new THREE.AnimationClip('idle',2,idle),new THREE.AnimationClip('walk',.8,walk),attack,hit,death];
  }

  const q=(x=0,y=0,z=0)=>new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z)).toArray();
  const track=(name,times,rotations)=>new THREE.QuaternionKeyframeTrack(name+'.quaternion',times,rotations.flatMap(r=>q(...r)));
  const idle=[],walk=[],reference=[];const crouch=kind==='ghoul'||kind==='hunter'?.16:0;
  for(const bone of bones){
    const rest=bone.name==='spine'?[crouch,0,0]:bone.name.startsWith('forearm')?[-.12,0,0]:[0,0,0];
    reference.push(track(bone.name,[0],[rest]));
    const breathe=bone.name==='chest'?[[0,0,0],[.035,0,0],[0,0,0]]:bone.name==='cape'?[[.08,0,0],[.14,0,0],[.08,0,0]]:[rest,rest,rest];
    idle.push(track(bone.name,[0,1.2,2.4],breathe));
    let poses=[rest,rest,rest,rest,rest];
    for(const [suffix,sign]of [['L',1],['R',-1]]){
      if(bone.name==='thigh'+suffix)poses=[[.52*sign,0,0],[0,0,0],[-.52*sign,0,0],[0,0,0],[.52*sign,0,0]];
      if(bone.name==='shin'+suffix)poses=[[.1,0,0],[sign>0?.65:.05,0,0],[.1,0,0],[sign<0?.65:.05,0,0],[.1,0,0]];
      if(bone.name==='arm'+suffix)poses=[[-.22*sign,0,sign*.08],[0,0,sign*.08],[.22*sign,0,sign*.08],[0,0,sign*.08],[-.22*sign,0,sign*.08]];
      if(bone.name==='skirt'+suffix)poses=[[.14*sign,0,0],[0,0,0],[-.14*sign,0,0],[0,0,0],[.14*sign,0,0]];
    }
    if(bone.name==='chest')poses=[[0,-.05,0],[.02,0,0],[0,.05,0],[.02,0,0],[0,-.05,0]];
    if(bone.name==='cape')poses=[[.22,0,.04],[.28,0,0],[.22,0,-.04],[.28,0,0],[.22,0,.04]];
    walk.push(track(bone.name,[0,.2,.4,.6,.8],poses));
  }
  idle.push(new THREE.VectorKeyframeTrack('pelvis.position',[0,1.2,2.4],[0,25,0,0,25.5,0,0,25,0]));
  walk.push(new THREE.VectorKeyframeTrack('pelvis.position',[0,.2,.4,.6,.8],[0,25,0,0,26.3,0,0,25,0,0,26.3,0,0,25,0]));
  if(kind==='hero'){
    // A running cycle: knees flex backward during recovery, opposing arm swing,
    // two flight phases and a forward body lean. Staff hand counters its arm.
    walk.length=0;
    const times=Array.from({length:9},(_,i)=>i*.1);
    for(const bone of bones){
      const poses=times.map(time=>{
        const phase=time/.8*Math.PI*2,swing=Math.cos(phase),bounce=Math.sin(phase*2);
        let pose=[0,0,0];
        if(bone.name==='pelvis')pose=[.045,-.07*swing,.035*swing];
        if(bone.name==='spine')pose=[.15,0,0];
        if(bone.name==='chest')pose=[.025,.1*swing,-.025*swing];
        if(bone.name==='neck')pose=[-.10,0,0];
        if(bone.name==='head')pose=[-.04,-.025*swing,0];
        if(bone.name==='cape')pose=[.30+.07*bounce,0,.04*swing];
        for(const [suffix,offset,side] of [['L',0,1],['R',Math.PI,-1]]){
          const stride=Math.cos(phase+offset),recovery=Math.max(0,Math.sin(phase+offset));
          if(bone.name==='thigh'+suffix)pose=[.68*stride-.08,0,side*.035];
          if(bone.name==='shin'+suffix)pose=[-.16-1.05*recovery,0,0];
          if(bone.name==='foot'+suffix)pose=[.12+.24*recovery-.16*stride,0,0];
          if(bone.name==='arm'+suffix)pose=[-.30*stride,0,side*.12];
          if(bone.name==='forearm'+suffix)pose=[suffix==='R'?.24:.65,0,0];
          if(bone.name==='hand'+suffix)pose=[suffix==='R'?.30*stride-.24:-.12,0,0];
          if(bone.name==='skirt'+suffix)pose=[.25*stride-.07,0,side*.05];
        }
        return pose;
      });
      walk.push(track(bone.name,times,poses));
    }
    walk.push(new THREE.VectorKeyframeTrack('pelvis.position',times,times.flatMap(time=>{
      const phase=time/.8*Math.PI*2;return[.4*Math.cos(phase),25+1.8*(1-Math.cos(phase*2)),0];
    })));
  }
  const magic=kind==='hero'||kind==='caster'||kind==='healer';
  const cast=new THREE.AnimationClip('attack',.55,[track('armR',[0,.15,.28,.55],[[0,0,0],[magic?.35:1.5,0,-.2],[magic?.5:1.05,0,-.5],[0,0,0]]),track('forearmR',[0,.15,.28,.55],[[0,0,0],[magic?-.2:.7,0,0],[magic?-.25:-.5,0,0],[0,0,0]]),track('armL',[0,.15,.28,.55],[[0,0,0],[magic?1.1:.2,0,.3],[magic?.75:.2,0,.4],[0,0,0]]),track('chest',[0,.15,.28,.55],[[0,0,0],[0,-.16,0],[0,.12,0],[0,0,0]])]);
  THREE.AnimationUtils.makeClipAdditive(cast,0,new THREE.AnimationClip('reference',1,reference));
  const hit=new THREE.AnimationClip('hit',.22,[track('chest',[0,.07,.22],[[0,0,0],[-.18,0,.07],[0,0,0]]),track('head',[0,.07,.22],[[0,0,0],[-.12,0,0],[0,0,0]])]);
  THREE.AnimationUtils.makeClipAdditive(hit,0,new THREE.AnimationClip('reference',1,reference));
  const death=new THREE.AnimationClip('death',.8,[track('pelvis',[0,.25,.8],[[0,0,0],[-.3,0,.1],[-Math.PI/2,0,.1]]),new THREE.VectorKeyframeTrack('pelvis.position',[0,.25,.8],[0,25,0,0,20,0,0,5,0]),track('armL',[0,.8],[[0,0,0],[0,0,.8]]),track('armR',[0,.8],[[0,0,0],[0,0,-.7]])]);
  return [new THREE.AnimationClip('idle',2.4,idle),new THREE.AnimationClip('walk',.8,walk),cast,hit,death];
}
export function createRiggedCharacter(kind='hero'){
  const family=palettes[kind]?kind:'ghoul',data=template(family),rig=skeleton(family),root=new THREE.Group();
  const materials=[...palettes[family],family==='hero'?'#769bbd':palettes[family][7]].map((color,i)=>new THREE.MeshStandardMaterial({color,roughness:i===5?.38:[7,9].includes(i)?.25:.86,metalness:[1,5].includes(i)?.55:0,side:THREE.DoubleSide,emissive:[7,9].includes(i)?color:'#000000',emissiveIntensity:[7,9].includes(i)?1.4:0}));
  materials.forEach(m=>m.userData.ephemeral=true);
  const skin=new THREE.SkinnedMesh(data.geometry,materials);skin.name=family+'-skinned-surface';skin.add(rig.byName.pelvis);skin.bind(new THREE.Skeleton(rig.bones));skin.normalizeSkinWeights();skin.castShadow=true;skin.receiveShadow=true;skin.frustumCulled=false;root.add(skin);
  const scale=family==='boss'?2.05:family==='brute'?1.3:family==='hunter'?.93:family==='demon'?1.2:1;root.scale.setScalar(scale);
  const mixer=new THREE.AnimationMixer(skin),actions=Object.fromEntries(data.clips.map(c=>[c.name,mixer.clipAction(c)]));
  actions.idle.play();actions.walk.play().setEffectiveWeight(0);actions.hit.setLoop(THREE.LoopOnce,1);actions.hit.clampWhenFinished=true;actions.attack.setLoop(THREE.LoopOnce,1);actions.attack.clampWhenFinished=true;actions.death.setLoop(THREE.LoopOnce,1);actions.death.clampWhenFinished=true;
  return{root,skin,bones:rig.byName,mixer,actions,materials,kind:family,motion:0,lastTime:null,lastAttack:0,lastHit:0,dead:false,gearKey:''};
}
export function updateRiggedCharacter(model,actor,time,dt){
  dt=Math.max(0,Math.min(.05,dt??(model.lastTime===null?0:time-model.lastTime)));model.lastTime=time;
  if(model.dead){model.mixer.update(dt);return;}
  const frozen=!!actor.status?.freeze;if(frozen)return;const walk=actor.moving?1:0;
  model.motion+=(walk-model.motion)*(1-Math.exp(-12*dt));model.actions.walk.setEffectiveWeight(model.motion);model.actions.idle.setEffectiveWeight(1-model.motion);
  model.actions.walk.setEffectiveTimeScale(model.kind==='hero'?1.25:model.kind==='hunter'?1.4:model.kind==='brute'?.75:1);
  const attack=actor.attackAnim||0;
  if(attack>model.lastAttack+.025){model.actions.attack.reset().setEffectiveWeight(1).play();}
  model.lastAttack=attack;const hit=actor.hit||0;if(hit>model.lastHit+.025)model.actions.hit.reset().setEffectiveWeight(1).play();model.lastHit=hit;const previousStepTime=model.actions.walk.time;model.mixer.update(frozen?0:dt);const stepTime=model.actions.walk.time;if(model.motion>.25&&actor.moving&&((previousStepTime<.4&&stepTime>=.4)||stepTime<previousStepTime))model.onStep?.();
}
export function beginCharacterDeath(model){
  if(model.dead)return;model.dead=true;model.actions.attack.stop();model.actions.hit.stop();model.actions.idle.stop();model.actions.walk.stop();model.actions.death.reset().play();
}
export function applyCharacterEquipment(model,equipped){
  if(!equipped)return;
  const key=['robes','head','legs','staff','offhand'].map(slot=>equipped[slot]?.uid+':'+equipped[slot]?.level).join('|');if(key===model.gearKey)return;model.gearKey=key;
  const quality={Common:'#8f819d',Rare:'#5c9fca',Epic:'#a276d3',Legendary:'#d4a14f'};
  for(const [slot,index]of [['robes',0],['head',8],['legs',3]]){
    const item=equipped[slot],color=new THREE.Color(quality[item?.rarity]||palettes.hero[index]);
    if(item?.name.startsWith('Apprentice'))color.set(palettes.hero[index]);else color.multiplyScalar(slot==='legs'?.45:.72);
    model.materials[index].color.copy(color);
  }
  const weapon=equipped.staff;model.materials[7].color.set(quality[weapon?.rarity]||'#b18aff');model.materials[7].emissive.copy(model.materials[7].color);
  model.materials[9].color.set(quality[equipped.offhand?.rarity]||'#769bbd');model.materials[9].emissive.copy(model.materials[9].color);
  model.materials[1].color.set(quality[equipped.robes?.rarity]||'#c5a773').lerp(new THREE.Color('#d7b980'),.55);
}
export function disposeRiggedCharacter(model){model.mixer.stopAllAction();model.mixer.uncacheRoot(model.skin);model.skin.skeleton.dispose();}

export function prepareCharacterTemplates(){for(const kind of Object.keys(palettes))template(kind);}
