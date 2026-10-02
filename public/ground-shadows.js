import * as THREE from './vendor/three.module.js';

// All mobile contact shadows share one instanced draw and one small texture.
export function createGroundShadows(){
  const size=32,pixels=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const radius=Math.hypot((x+.5)/size*2-1,(y+.5)/size*2-1),i=(y*size+x)*4;
    pixels[i+3]=Math.round(Math.max(0,1-radius)**2*155);
  }
  const texture=new THREE.DataTexture(pixels,size,size);texture.needsUpdate=true;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearFilter;
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
  const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),material,512);
  mesh.name='mobile-contact-shadows';mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;mesh.renderOrder=2;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const transform=new THREE.Object3D();transform.rotation.x=-Math.PI/2;
  const put=(actor,width,depth,fade=1)=>{
    if(mesh.count>=512||fade<=0)return;
    transform.position.set(actor.renderX??actor.x,.8,actor.renderY??actor.y);transform.scale.set(width*fade,depth*fade,1);transform.updateMatrix();mesh.setMatrixAt(mesh.count++,transform.matrix);
  };
  return {mesh,update(player,enemies,chests,corpses=[]){
    mesh.count=0;put(player,55,40);
    for(const actor of enemies){if(actor.hp<=0)continue;const width=actor.kind==='boss'?110:actor.kind==='brute'?72:actor.kind==='spider'?65:55;put(actor,width,width*.72)}
    for(const chest of chests)put(chest,65,48);
    for(const corpse of corpses)put(corpse.actor,55,40,Math.max(0,1-corpse.age/1.35));
    mesh.instanceMatrix.needsUpdate=true;
  }};
}
