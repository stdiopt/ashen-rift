import * as CANNON from './vendor/cannon-es.js';
const SCALE = 40;
let world, actors = new Map();
const rayResult=new CANNON.RaycastResult(),rayFrom=new CANNON.Vec3(),rayTo=new CANNON.Vec3();
export function configurePhysics(walls) {
  world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 8;
  world.defaultContactMaterial.friction = 0;
  world.defaultContactMaterial.restitution = 0;
  actors = new Map();
  for (const w of walls) {
    const body = new CANNON.Body({ mass: 0, collisionFilterGroup: 1 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w.w / 80, 1, w.h / 80)));
    body.position.set(w.x / SCALE, .5, w.y / SCALE);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),-(w.angle||0));
    world.addBody(body);
  }
  world.broadphase.autoDetectAxis();
}
function actorBody(actor) {
  if (actors.has(actor)) return actors.get(actor);
  const radius = actor.kind === 'boss' ? 25 : actor.kind === 'brute' ? 18 : 14;
  const body = new CANNON.Body({ mass: actor.kind === 'boss' ? 6 : 1, fixedRotation: true, linearDamping: 0, collisionFilterGroup: actor.kind ? 4 : 2 });
  body.addShape(new CANNON.Sphere(radius / SCALE));
  body.position.set(actor.x / SCALE, .5, actor.y / SCALE);
  body.linearFactor.set(1, 0, 1);
  body.actor = actor;
  world.addBody(body);
  actors.set(actor, body);
  return body;
}
export function teleportActor(actor, x, y) {
  actor.x = x; actor.y = y;
  actor.prevX = x; actor.prevY = y;
  const body = actorBody(actor);
  body.position.set(x / SCALE, .5, y / SCALE);
  body.velocity.setZero(); body.aabbNeedsUpdate = true;world.broadphase.dirty=true;
}
export function stepPhysics(dt, list) {
  const live = new Set(list);
  for (const [actor, body] of actors) if (!live.has(actor)) { world.removeBody(body); actors.delete(actor); }
  for (const actor of list) {
    const body = actorBody(actor);
    actor.prevX = actor.x; actor.prevY = actor.y;
    body.velocity.set(((actor.motionX || 0) / dt + (actor.knockX || 0)) / SCALE, 0, ((actor.motionY || 0) / dt + (actor.knockY || 0)) / SCALE);
    actor.motionX = actor.motionY = 0;
    actor.knockX = (actor.knockX || 0) * Math.exp(-dt * 8);
    actor.knockY = (actor.knockY || 0) * Math.exp(-dt * 8);
  }
  world.step(dt);
  for (const [actor, body] of actors) { actor.x = body.position.x * SCALE; actor.y = body.position.z * SCALE; }
}
export function projectileHit(x, y, nx, ny, source, projectileRadius=0) {
  const result=rayResult;result.reset();rayFrom.set(x/SCALE,.5,y/SCALE);rayTo.set(nx/SCALE,.5,ny/SCALE);
  // Walls stop shots before any actor behind them can be hit.
  world.raycastClosest(rayFrom,rayTo,{skipBackfaces:true,collisionFilterMask:1},result);
  const dx=nx-x,dy=ny-y,lengthSquared=dx*dx+dy*dy;
  let nearest=result.hasHit?Math.hypot(result.hitPointWorld.x*SCALE-x,result.hitPointWorld.z*SCALE-y)/Math.sqrt(lengthSquared):Infinity;
  let hit=result.hasHit?{actor:null,x:result.hitPointWorld.x*SCALE,y:result.hitPointWorld.z*SCALE}:null;
  if(lengthSquared===0)return hit;
  // Sweep the projectile's full width against a combat radius matching the model.
  // Movement bodies stay compact so doorways remain easy to traverse.
  for(const [actor] of actors){
    if(actor===source||actor.hp<=0||Boolean(actor.kind)===Boolean(source?.kind))continue;
    const radius=(actor.kind==='boss'?42:actor.kind==='brute'?28:actor.kind?20:14)+projectileRadius;
    const ox=x-actor.x,oy=y-actor.y,c=ox*ox+oy*oy-radius*radius,b=ox*dx+oy*dy;
    const discriminant=b*b-lengthSquared*c;if(discriminant<0)continue;
    const entry=c<=0?0:(-b-Math.sqrt(discriminant))/lengthSquared;
    if(entry<0||entry>1||entry>=nearest)continue;
    nearest=entry;hit={actor,x:x+dx*entry,y:y+dy*entry};
  }
  return hit;
}
