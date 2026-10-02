import {setText,setHTML,setTitle,onLanguageChange} from './i18n.js?v=61';
const mobileEffects=!!window.matchMedia?.('(pointer:coarse)').matches;
import { soundEffects } from './sound-effects.js?v=61';
import { music } from './music.js?v=61';
import { beginScoreRun, endScoreRun } from './leaderboard.js?v=61';
import { SPELLS, RARITIES, cooldownFor, riftScale } from './skills.js?v=61';
import { toggleGearLock, bulkSalvagePreview, salvageAllGear, sortedBagItems, GEM_QUALITIES, gemPower, fusionOptions, fuseGems, GEAR_SLOTS, GEAR_ICONS, createInventory, createGear, createGem, gemAt, allItems, inventoryStats, collectItem, wearItem, socketGem, removeGem, discardItem, salvageItem, salvageReward, MATERIAL_NAMES, upgradeCost, upgradeGem, upgradeEquipment } from './inventory.js?v=61';
import { attachTouchControls } from './touch-controls.js?v=61';
import { generateDungeon } from './dungeon.js?v=61';
import { configurePhysics, stepPhysics, teleportActor, projectileHit } from './physics.js?v=61';
import { initRender, renderFrame, screenToWorld, projectWorld, resizeRender, rebuildDungeon } from './render.js?v=61';
'use strict';
const canvas=document.getElementById('game'),$=id=>document.getElementById(id),TAU=Math.PI*2;
let W=innerWidth,H=innerHeight,dpr=1,started=false,paused=false,over=false,t=0,last=0,wave=0,kills=0,spawnTimer=0,shake=0,toastTime=0;
let p,enemies=[],drops=[],fx=[],texts=[],keys={},mouse={x:W/2,y:H/2,down:false},stick={x:0,y:0},inputMode='mouse',cd=[0,0,0,0,0],gear,particles=[],touchPrimary=false,touchAimPoint=null,skillGesture=null,primaryGesture=null;
let lastRiftBiome=null;
let dungeon=generateDungeon(),rooms=dungeon.rooms,corridors=dungeon.corridors;
let rift=1,bossDead=false,portalGrace=0,merchantOpen=false,merchantArmed=true,loadout=[0,null,null,null],pack,spellCooldowns=Array(10).fill(0),fullBagNotice=0,padAimAngle=null,moveTarget=null,rightMouseHeld=false;
let encountered=new Set(),cleared=new Set(),activeRoom=-1,trapTimer=4,chests=[];
const inside=(x,y,r,margin=0)=>Math.abs(x-r.x)<r.w/2-margin&&Math.abs(y-r.y)<r.h/2-margin;
// Test the character footprint against the connected floor, not shrunken rooms.
// Shrinking each rectangle separately created invisible gaps at doorway overlaps.
function onFloor(x,y){return dungeon.contains(x,y)}
function walkable(x,y){const radius=14;return [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius],[10,10],[-10,10],[10,-10],[-10,-10]].every(([dx,dy])=>onFloor(x+dx,y+dy))}
function move(a,dx,dy){a.motionX=(a.motionX||0)+dx;a.motionY=(a.motionY||0)+dy}
function resize(){W=innerWidth;H=innerHeight;resizeRender(W,H)}addEventListener('resize',resize);
initRender(canvas,dungeon);configurePhysics(dungeon.walls);resize();
let expeditionSeconds=0,revivesLeft=3,runEnded=false;
function reset(){
  expeditionSeconds=0;revivesLeft=3;runEnded=false;beginScoreRun();
  p={x:0,y:110,hp:100,max:100,level:1,xp:0,gold:0,pots:3,power:18,armor:0,face:-Math.PI/2,inv:0,walk:0};
  pack=createInventory();syncEquipment();
  rift=1;kills=0;selectedItem=null;inventoryTab='all';suppressInventoryClickUntil=0;fullBagNotice=0;padAimAngle=null;loadout=[0,null,null,null];
  enterRift();
}
function enterRift(retrying=false){
  soundEffects?.stop();moveTarget=null;rightMouseHeld=false;
  document.body.classList.add('playing');resetTouch();if(!retrying){const choices=['castle','jungle','hell','frozen'].filter(kind=>kind!==lastRiftBiome);const biome=choices[Math.floor(Math.random()*choices.length)];lastRiftBiome=biome;dungeon=generateDungeon(undefined,biome);}music?.setTheme(dungeon.biome);setText($('rifttheme'), dungeon.biomeName.toUpperCase());rooms=dungeon.rooms;corridors=dungeon.corridors;
  configurePhysics(dungeon.walls);rebuildDungeon(dungeon);accumulator=0;teleportActor(p,0,110);p.hp=p.max;p.shield=0;p.shieldTime=0;p.hazardSlow=0;p.inv=1;
  enemies=[];drops=[];fx=[];texts=[];particles=[];cd=[0,0,0,0,0];spellCooldowns=Array(10).fill(0);wave=0;t=0;fullBagNotice=0;bossDead=false;portalGrace=0;merchantOpen=false;merchantArmed=true;
  cleared=new Set();encountered=new Set([0]);activeRoom=0;trapTimer=4;
  chests=[...rooms.slice(1,-1).map(r=>({x:r.x+r.w*.28,y:r.y+r.h*.23,opened:false})),...dungeon.sideRooms.map(r=>({x:r.x,y:r.y,opened:false}))];
  over=false;paused=false;started=true;p.hit=0;p.attackAnim=0;p.cast=0;p.spin=0;if(retrying)p.pots=Math.max(3,p.pots);setText($('revive-count'), revivesLeft+' revives');toast((retrying?'Revived · ':'')+'Rift '+rift+' · '+dungeon.biomeName+' · '+dungeon.layoutName);
  for(const id of ['start','end','inventory','merchant'])$(id).classList.add('hidden');setText($('pause'), 'Ⅱ');updateUI();
}
function merchantPosition(){return{x:rooms[rooms.length-1].x+105,y:rooms[rooms.length-1].y+25};}
function portalPosition(){return{x:rooms[rooms.length-1].x,y:rooms[rooms.length-1].y-140};}
function toast(s){setText($('toast'), s);toastTime=3.5;$('toast').style.opacity=1}function iso(x,y,z=0){return projectWorld(x,y,z)}function uniso(x,y){return screenToWorld(x,y)}
function skillPoint(gesture){
  if(!gesture)return null;
  const length=Math.hypot(gesture.dx,gesture.dy),id=loadout[gesture.skill]??0,range=SPELLS[id].range*(id===3?gemPower(gemAt(pack,gesture.skill)):1);
  if(length<5||!range)return{x:p.x,y:p.y};
  const dx=gesture.dx*.793+gesture.dy*.609,dy=-gesture.dx*.609+gesture.dy*.793,d=Math.max(.001,Math.hypot(dx,dy)),distance=range*gesture.strength;
  return{x:p.x+dx/d*distance,y:p.y+dy/d*distance};
}
function aim(){if(skillGesture)return skillPoint(skillGesture);let a=uniso(mouse.x,mouse.y),dx=a.x-p.x,dy=a.y-p.y,d=Math.hypot(dx,dy),range=320;if(inputMode!=='mouse'&&!touchAimPoint){const direction=inputMode==='gamepad'?(padAimAngle??p.face):p.face;return{x:p.x+Math.cos(direction)*180,y:p.y+Math.sin(direction)*180};}return{x:p.x+dx*Math.min(1,range/Math.max(1,d)),y:p.y+dy*Math.min(1,range/Math.max(1,d))}}
function spawnWave(index=wave){
  if(index===0){activeRoom=0;encountered.add(0);return;}
  wave=index+1;activeRoom=index;encountered.add(index);const room=rooms[index],boss=index===rooms.length-1;
  toast(boss?'THE RIFT WARDEN HAS ARRIVED':room.name+' · Defeat its guardians');
  const families=dungeon.biome==='jungle'?['spider','hunter','caster','spider','brute']:dungeon.biome==='hell'?['demon','caster','brute','spider','sentinel']:['ghoul','sentinel','caster','hunter','brute','spider'];
  if(rift>=2)families.push('healer');
  const count=boss?3+Math.min(rift-1,4):7+wave*3+Math.min((rift-1)*2,6);
  for(let i=0;i<count;i++){
    let x=room.x+(Math.random()-.5)*(room.w-140),y=room.y+(Math.random()-.5)*(room.h-140);
    if(Math.hypot(x-p.x,y-p.y)<110)y=room.y-room.h*.25;
    if(!dungeon.contains(x,y,35)){x=room.x;y=room.y;}
    const kind=boss&&i===0?'boss':families[i%families.length],elite=rift>1&&kind!=='boss'&&i%7===0;
    const base=kind==='boss'?1900:kind==='brute'?135+wave*22:kind==='sentinel'?105+wave*20:kind==='hunter'?60+wave*14:kind==='caster'?65+wave*15:kind==='demon'?120+wave*20:kind==='healer'?80+wave*16:kind==='spider'?48+wave*12:55+wave*15;
    const hp=base*(kind==='boss'?1.25:1.4)*riftScale(rift).health*(elite?1.7:1);
    enemies.push({room:index,x,y,hp,max:hp,kind,elite,hit:0,atk:1+Math.random(),stun:0,phase:Math.random()*6,walk:0,attackAnim:0,healsLeft:kind==='healer'?Math.min(5,2+Math.floor(rift/2)):0,healCd:2,recovery:0,recovered:false});
  }
  updateUI();
}
function damage(e,n){if(e.hp<=0)return;if(e.kind==='sentinel')n*=.75;e.hp-=n;e.recovery=0;e.hit=.15;e.stun=Math.max(e.stun,.12);texts.push({x:e.x,y:e.y,z:50,text:Math.round(n),color:'#efdba3',life:.8});for(let j=0;j<5;j++)particles.push({x:e.x,y:e.y,z:30,vx:(Math.random()-.5)*120,vy:(Math.random()-.5)*120,vz:Math.random()*100,life:.4,color:'#ba5a55'});if(e.hp<=0){soundEffects?.death(e.kind);kills++;p.xp+=e.kind==='boss'?250:22;p.gold+=Math.round((e.kind==='boss'?180:7+Math.floor(Math.random()*8))*riftScale(rift).reward);if(e.kind==='boss'){bossDead=true;portalGrace=2;toast('Warden defeated · Visit the enchanter, then enter the portal.');}if(kills===1)drops.push({...createGem(1,'Common'),x:e.x,y:e.y});else if(e.kind==='boss')drops.push({...createGem(1+Math.floor(Math.random()*9),'Rare'),x:e.x+20,y:e.y});if(Math.random()<.22||e.kind==='boss')drops.push(makeDrop(e.x,e.y,e.kind==='boss'));if(p.xp>=p.level*90){p.xp-=p.level*90;p.level++;p.max+=18;p.hp=p.max;syncEquipment();p.pots++;toast(`Level ${p.level} · Vitality and power increased`);fx.push({x:p.x,y:p.y,r:130,life:1,max:1,color:'#e7c474',type:'ring'})}}}
function spellBurst(x,y,color,count,speed,height=25){
  if(mobileEffects)count=Math.max(4,Math.round(count*.45));
  for(let j=0;j<count;j++){const angle=Math.random()*Math.PI*2,velocity=speed*(.35+Math.random()*.65),life=.35+Math.random()*.55;
    particles.push({x,y,z:height,vx:Math.cos(angle)*velocity,vy:Math.sin(angle)*velocity,vz:35+Math.random()*90,life,max:life,color,gravity:110});}
}
function applyStatus(enemy,status,duration,power=0){
  if(enemy.hp<=0)return;if(enemy.kind==='boss'&&(status==='freeze'||status==='stun'))duration*=.45;enemy.status??={};
  const old=enemy.status[status];enemy.status[status]={time:Math.max(duration,old?.time??0),power:Math.max(power,old?.power??0)};
}
function areaDamage(x,y,radius,amount,status,duration=0){
  for(const enemy of enemies)if(enemy.hp>0&&Math.hypot(enemy.x-x,enemy.y-y)<radius){damage(enemy,amount);if(status)applyStatus(enemy,status,duration,amount*.15);}
}
function makeDrop(x,y,source=false){
  const roll=Math.random(),boss=source===true,chest=source==='chest';
  // Chests: 5% yellow gear, 5% purple, 25% blue, 65% white.
  // Ordinary mobs: 0.5% purple, 11.5% blue, 88% white among their drops.
  const rarity=chest?(roll<.05?'Legendary':roll<.1?'Epic':roll<.35?'Rare':'Common'):boss?(roll<.05?'Legendary':roll<.2?'Epic':roll<.7?'Rare':'Common'):(roll<.005?'Epic':roll<.12?'Rare':'Common');
  if(!boss&&!chest&&Math.random()<.12)return{x,y,type:'potion',name:'Healing Potion',rarity:'Common',color:RARITIES.Common,power:1};
  const item=rarity!=='Legendary'&&Math.random()<.35?createGem(1+Math.floor(Math.random()*9),rarity,1+Math.floor((rift-1)/3)):createGear(GEAR_SLOTS[Math.floor(Math.random()*5)],rarity,rift);
  return{...item,x,y};
}
function equipDrop(item){
  if(item.type==='potion'){p.pots++;toast('Healing potion collected');return true;}
  if(!collectItem(pack,item)){if(t>fullBagNotice){toast('Backpack full · Equip or discard loot, or visit the enchanter after the boss.');fullBagNotice=t+3;}return false;}
  toast(item.name+' collected · Open inventory to '+(item.type==='gem'?'socket it.':'compare and wear.'));return true;
}
function use(slot,gesture=null){
  if(!started||paused||over||cd[slot]>0)return;
  if(slot===4){if(p.pots<=0||p.hp>=p.max)return;p.pots--;p.hp=Math.min(p.max,p.hp+p.max*.6);cd[4]=8;soundEffects?.play('heal',{voice:true,gain:.8});toast('Vitality restored');fx.push({x:p.x,y:p.y,r:80,life:.5,max:.5,color:'#78c19a',type:'ring'});updateUI();return;}
  const id=loadout[slot];if(id===null||id===undefined)return;const spell=SPELLS[id],override=skillPoint(gesture),target=override||aim(),dx=target.x-p.x,dy=target.y-p.y,distance=Math.hypot(dx,dy);
  const angle=distance>2?Math.atan2(dy,dx):(p.face||-Math.PI/2),power=p.power*gemPower(slot===0?null:gemAt(pack,slot));
  if(id===3&&override&&distance<5)return;
  cd[slot]=cooldownFor(id,activeGemLevel(slot),gear.cooldown);spellCooldowns[id]=cd[slot];p.cast=.4;p.face=angle;soundEffects?.arcane(id);if(id===1)soundEffects?.play('fire-cast',{voice:true,gain:.75});
  if(id===0||id===1||id===4){
    if(id===0)p.attackAnim=.28;
    const speed=id===1?470:id===4?700:620,type=id===1?'fireball':'arcane',life=id===1?Math.max(.03,(distance-22)/speed):1.1;
    fx.push({type,spellId:id,x:p.x+Math.cos(angle)*22,y:p.y+Math.sin(angle)*22,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life,max:life,r:id===1?12:6,color:spell.color,source:p,damage:power*(id===4?2.2:id===1?3.2:1.2)});
  }
  if(id===2){fx.push({x:target.x,y:target.y,r:145,life:.75,max:.75,color:spell.color,type:'ring',spell:'nova'});spellBurst(target.x,target.y,'#a4e6ff',70,230,8);areaDamage(target.x,target.y,150,power*3.5,'freeze',2.2);shake=8;}
  if(id===3){
    const blinkRange=180*gemPower(gemAt(pack,slot)),range=override||inputMode==='mouse'?Math.min(blinkRange,distance):blinkRange;
    let bx=p.x,by=p.y;for(let j=0;j<Math.floor(range/10);j++){const nx=bx+Math.cos(angle)*10,ny=by+Math.sin(angle)*10;if(!walkable(nx,ny))break;bx=nx;by=ny;fx.push({x:bx,y:by,r:18,life:.4,max:.4,color:spell.color,type:'ring'});}teleportActor(p,bx,by);p.inv=.6;
  }
  if(id===5){
    const used=new Set();let from={x:p.x,y:p.y},point=target;
    for(let j=0;j<5;j++){const choices=enemies.filter(e=>e.hp>0&&!used.has(e)&&Math.hypot(e.x-point.x,e.y-point.y)<(j?180:110)).sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y));
      const enemy=choices[0];if(!enemy)break;used.add(enemy);fx.push({type:'lightning',x:from.x,y:from.y,tx:enemy.x,ty:enemy.y,color:spell.color,life:.55,max:.55});spellBurst(enemy.x,enemy.y,'#bfeaff',8,100,44);damage(enemy,power*(2.5-j*.2));applyStatus(enemy,'stun',.65);from=enemy;point=enemy;}
    spellBurst(target.x,target.y,spell.color,18,80,35);
  }
  if(id===6)fx.push({type:'meteor',x:target.x,y:target.y,r:125,life:1,max:1,color:spell.color,power});
  if(id===7||id===8)fx.push({type:'zone',spellId:id,x:target.x,y:target.y,r:spell.radius,life:4,max:4,color:spell.color,power,tick:0,beats:0});
  if(id===9){p.shield=power*6;p.shieldTime=6;spellBurst(p.x,p.y,spell.color,40,100,30);toast('Arcane Shield · '+Math.round(p.shield)+' absorption');}
  updateUI();
}
function merchant(){
  if(!bossDead||over)return;const pos=merchantPosition();
  if(Math.hypot(p.x-pos.x,p.y-pos.y)>170){toast('Approach the enchanter beside the portal.');return;}
  merchantOpen=true;merchantArmed=false;paused=true;closeItemDetail();$('merchant').classList.add('hidden');$('inventory').classList.remove('hidden');renderInventory();
}
function renderShop(){renderInventory();}
function buy(kind,uid){
  if(!merchantOpen||!bossDead)return false;
  if(kind==='inventory'){inventory();return true;}
  if(kind==='potion'){if(p.gold<35){setText($('itemnotice'), 'Not enough gold.');return false;}p.gold-=35;p.pots++;}
  else if(kind==='upgrade'){
    const item=allItems(pack).find(item=>item.uid===uid);if(!item)return false;
    const cost=item.type==='gem'?upgradeGem(pack,uid,p.gold):upgradeEquipment(pack,uid,p.gold);
    if(!cost){setText($('itemnotice'), 'You need gold and '+MATERIAL_NAMES[item.type==='gem'?'powder':'scraps']+' for this upgrade.');return false;}p.gold-=cost.gold;syncEquipment();
  }else return false;
  setText($('itemnotice'), 'Purchase complete.');renderShop();updateUI();return true;
}
let selectedItem=null,inventoryDrag=null,inventoryTab='all',suppressInventoryClickUntil=0;
function syncEquipment(){
  const stats=inventoryStats(pack);p.power=18+(p.level-1)*5+stats.power;p.armor=Math.min(35,stats.armor);
  gear={weapon:pack.equipped.staff.name,armor:pack.equipped.robes.name,weaponPower:stats.power,armorPower:stats.armor,cooldown:Math.min(.45,stats.cooldown)};
  loadout=[0,...[1,2,3].map(slot=>gemAt(pack,slot)?.skill??null)];
  cd=loadout.map(id=>id===null?0:spellCooldowns[id]).concat(cd[4]);
}
function activeGemLevel(slot){return slot===0?0:(gemAt(pack,slot)?.level??1)-1;}
function itemStats(item){return item.type==='gem'?`${SPELLS[item.skill].description} · +${Math.round((gemPower(item)-1)*100)}% ${item.skill===3?'blink distance':'spell power'} · ${GEM_QUALITIES[item.rarity].name} quality`:Object.entries(item.stats).filter(([,v])=>v).map(([key,v])=>key==='cooldown'?Math.round(v*100)+'% cooldown reduction':'+'+v+' '+(key==='power'?'damage':'armor')).join(' · ')||'No stat bonus';}
function itemTile(item,extra=''){return `<button class="item-tile ${selectedItem===item.uid?'selected':''}" data-item="${item.uid}" ${extra} style="--rarity:${item.color}" aria-label="${item.name}, level ${item.level}"><i style="color:${item.type==='gem'?SPELLS[item.skill].color:item.color}">${item.icon}</i><b>${item.type==='gem'?SPELLS[item.skill].short:item.slot}</b><small>${item.locked?'🔒 ':''}Lv. ${item.level}${item.sockets?.length?' · '+item.sockets.filter(Boolean).length+'/'+item.sockets.length+' ◆':''}</small></button>`;}
function equipmentSlot(slot){
  const item=pack.equipped[slot],slots=slot==='staff'?[1,2]:slot==='offhand'?[3]:[];
  const sockets=slots.map(index=>{const gem=gemAt(pack,index),key=['','1 / X','2 / Y','3 / B'][index];return `<button style="--gem-quality:${gem?.color??'transparent'}" class="gear-gem ${selectedItem===gem?.uid?'selected':''}" data-slot="${index}" ${gem?'data-item="'+gem.uid+'"':''} title="${gem?gem.name+' · Level '+gem.level:'Empty skill gem socket'} · ${key}" aria-label="${slot} socket ${index<3?index:1}, ${gem?gem.name:'empty'}, ${key}"><i style="color:${gem?SPELLS[gem.skill].color:'#827b94'}">${gem?gem.icon:'◇'}</i><small>${key}</small></button>`;}).join('');
  return `<div class="gear-slot" data-gear-slot="${slot}" style="--rarity:${item.color}">${itemTile(item)}${slots.length?'<div class="weapon-sockets">'+sockets+'</div>':''}</div>`;
}
function renderInventory(){
  setText($('inventorytitle'), merchantOpen?'RIFT ENCHANTER':'INVENTORY');
  $('enchanteroptions').classList.toggle('hidden',!merchantOpen);
  setText($('inventorysummary'), `${p.power} damage · ${p.armor} armor · ${Math.round(gear.cooldown*100)}% cooldown reduction · ${p.gold} gold · ${pack.scraps} scraps · ${pack.powder} arcane powder`);
  const rows=[['Level',p.level],['Health',Math.ceil(p.hp)+' / '+p.max],['Spell power',p.power],['Armor',p.armor],['Damage reduction',Math.round((1-100/(100+p.armor*2))*100)+'%'],['Cooldown reduction',Math.round(gear.cooldown*100)+'%'],['Gold',p.gold],['Scraps',pack.scraps],['Arcane powder',pack.powder],['Healing potions',p.pots],['Rift',rift],['Experience',p.xp+' / '+p.level*90]];
  setHTML($('character-stats-list'), rows.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join(''));
  setHTML($('equipment'), '<div class="mage-doll"><img src="mage-paperdoll.svg" alt="Mage wearing robes and holding a staff" draggable="false"></div>'+GEAR_SLOTS.map(equipmentSlot).join(''));
  setText($('bagcount'), `Backpack · ${pack.bag.length} / ${pack.capacity}`);
  const visible=sortedBagItems(pack,inventoryTab);
  for(const tab of $('inventory').querySelectorAll('[data-tab]'))tab.setAttribute('aria-selected',String(tab.dataset.tab===inventoryTab));
  setHTML($('items'), visible.map(item=>itemTile(item)).join('')+Array.from({length:pack.capacity-visible.length},()=>'<div class="item-empty">·</div>').join(''));
  renderItemDetail();
}
function closeItemDetail(){selectedItem=null;$('itempopup').classList.add('hidden');}
function renderItemDetail(){
  setText($('itemnotice'), '');
  const item=allItems(pack).find(item=>item.uid===selectedItem),bagItem=pack.bag.includes(item);
  if(!item){$('itempopup').classList.add('hidden');setHTML($('itemdetail'), '<p>Select loot to compare, wear or salvage. Drag gear to the matching slot or a gem to a weapon socket. You can also select an item and tap its slot. Arcane Bolt is always available.</p>');return;}
  let comparison='';if(item.type==='gear'&&bagItem){const current=pack.equipped[item.slot];comparison=`<p class="comparison">Worn: ${current.name} · Lv. ${current.level}<br>${itemStats(current)}<br>${['power','armor','cooldown'].map(key=>{const diff=item.stats[key]-current.stats[key];return diff?`<span class="${diff>0?'better':'worse'}">${diff>0?'+':''}${key==='cooldown'?Math.round(diff*100)+'%':diff} ${key==='cooldown'?'cooldown reduction':key==='power'?'damage':'armor'}</span>`:'';}).filter(Boolean).join(' · ')}</p>`;}
  const wornSlot=[1,2,3].find(slot=>gemAt(pack,slot)?.uid===item.uid),socketWeapon=Object.values(pack.equipped).find(weapon=>weapon.sockets.some(gem=>gem?.uid===item.uid));
  const reward=salvageReward(item),cost=upgradeCost(item),fusion=merchantOpen&&bossDead&&bagItem&&item.type==='gem'?fusionOptions(pack,item.uid):null;$('itempopup').classList.remove('hidden');
  setHTML($('itemdetail'), `<h3 style="color:${item.color}">${item.icon} ${item.name} <small>${item.locked?'🔒 ':''}Lv. ${item.level}</small></h3><p>${itemStats(item)}</p>${comparison}${item.type==='gem'&&bagItem?'<h4>Choose a weapon socket</h4><div class="socket-choices">'+[1,2,3].map(slot=>{const current=gemAt(pack,slot);return `<button data-action="socket" data-index="${slot}"><b>${slot<3?'Staff '+slot:'Offhand'}</b><span>${current?'Replace '+SPELLS[current.skill].name+' · Lv. '+current.level:'Empty socket'}</span></button>`;}).join('')+'</div>':''}${fusion?`<div class="fusion-offer"><h4>Fuse ${SPELLS[item.skill].name} gems</h4><p>${fusion.recipe.count} ${GEM_QUALITIES[item.rarity].name.toLowerCase()} → 1 ${GEM_QUALITIES[fusion.recipe.next].name.toLowerCase()}<br>${fusion.matches.length} matching gems in backpack · Highest level preserved</p><button data-action="fuse" ${fusion.ready?'':'disabled'}>Fuse into ${GEM_QUALITIES[fusion.recipe.next].name} · +${Math.round((GEM_QUALITIES[fusion.recipe.next].power-1)*100)}% base spell power</button></div>`:item.type==='gem'&&item.rarity==='Legendary'?'<p class="inventory-hint">Orange: highest gem quality.</p>':''}<div class="item-actions">${merchantOpen?`<button data-action="upgrade" ${item.level>=10||p.gold<cost.gold||pack[cost.material]<cost.amount?'disabled':''}>${item.level>=10?'Maximum level':'Upgrade to level '+(item.level+1)+' · '+cost.gold+'g + '+cost.amount+' '+MATERIAL_NAMES[cost.material]}</button>`:''}${item.type==='gear'?`<button data-action="lock">${item.locked?'Unlock':'Lock'}</button>`:''}${item.type==='gear'&&bagItem?'<button data-action="wear">Wear</button>':''}${bagItem&&merchantOpen&&bossDead?`<button data-action="salvage" ${item.locked?'disabled':''}>Salvage · ${reward.amount} ${MATERIAL_NAMES[reward.material]}</button>`:''}${bagItem&&!merchantOpen?'<button data-action="discard">Discard</button>':''}${wornSlot?`<button data-action="remove" data-weapon="${socketWeapon.uid}" data-index="${wornSlot<3?wornSlot-1:0}">Unsocket</button>`:''}</div>${item.type==='gear'&&item.sockets.length?`${!bagItem?'<div class="socket-choices">'+item.sockets.map((gem,index)=>`<button data-action="choose-gem" data-index="${item.slot==='staff'?index+1:3}"><b>${item.slot==='staff'?'Staff '+(index+1):'Offhand'}</b><span>${gem?'Switch '+gem.name:'Insert a skill gem'}</span></button>`).join('')+'</div>':''}<div class="stored-sockets">${item.sockets.map((gem,index)=>gem?`<button data-action="remove" data-weapon="${item.uid}" data-index="${index}">${gem.icon} ${gem.name} Lv. ${gem.level} · Remove</button>`:'<small>◇ Empty weapon socket</small>').join('')}</div>`:''}<small>Upgrades at the enchanter · ${item.level<10?cost.gold+' gold + '+cost.amount+' '+MATERIAL_NAMES[cost.material]:'Maximum level'}</small>`);
}
function showGemPicker(slot){
  setText($('itemnotice'), '');
  const current=gemAt(pack,slot);$('itempopup').classList.remove('hidden');
  const gems=sortedBagItems(pack,'gem');
  setHTML($('itemdetail'), `<h3>${slot<3?'Staff socket '+slot:'Offhand socket'}</h3><p>${current?'Replacing '+current.name+' · Level '+current.level:'Choose a skill gem.'}</p><div class="gem-picker">${gems.map(gem=>`<button data-action="socket-item" data-weapon="${gem.uid}" data-index="${slot}"><i style="color:${SPELLS[gem.skill].color}">${gem.icon}</i><span>${gem.name}<small>Level ${gem.level} · ${gem.rarity}</small></span></button>`).join('')||'<p>No spare gems. Collect gem drops to fill this socket.</p>'}</div><p class="inventory-hint">The replaced gem returns to your backpack.</p>`);
}
function inventoryAction(kind,weapon,index){
  if(['salvage','salvage-all','confirm-salvage-all','fuse','upgrade'].includes(kind)&&(!bossDead||!merchantOpen)){setText($('itemnotice'), 'Visit the enchanter after defeating the rift boss to salvage, upgrade or fuse.');return;}
  if(['discard','confirm-discard'].includes(kind)&&merchantOpen)return;
  if(kind==='lock'){if(toggleGearLock(pack,selectedItem))renderInventory();return;}
  if(['salvage','discard','confirm-discard'].includes(kind)&&allItems(pack).find(item=>item.uid===selectedItem)?.locked){setText($('itemnotice'), 'Unlock this gear first.');return;}
  if(kind==='salvage-all'){
    const preview=bulkSalvagePreview(pack);selectedItem=null;setText($('itemnotice'), '');$('itempopup').classList.remove('hidden');
    setHTML($('itemdetail'), `<h3>Salvage unlocked gear?</h3><p>${preview.count} backpack items → ${preview.scraps} scraps<br>${preview.gems.length} socketed gems return to your backpack.</p><p>Worn gear, locked gear and loose skill gems are protected.</p>${!preview.fits?'<p>Make backpack room for the recovered gems first.</p>':''}<button data-action="confirm-salvage-all" ${preview.count&&preview.fits?'':'disabled'}>Confirm salvage</button><button data-action="close-detail">Cancel</button>`);
    return;
  }
  if(kind==='confirm-salvage-all'){
    const result=salvageAllGear(pack);if(!result){setText($('itemnotice'), 'Nothing to salvage, or not enough room for socketed gems.');return;}
    closeItemDetail();renderInventory();updateUI();toast(`Salvaged ${result.count} gear · +${result.scraps} scraps`);return;
  }

  if(kind==='discard'){setHTML($('itemnotice'), 'Discard permanently? No materials are awarded; socketed gems return to your backpack. <button data-action="confirm-discard">Confirm discard</button>');return;}
  if(kind==='confirm-discard'){if(!discardItem(pack,selectedItem)){setText($('itemnotice'), 'Make room to recover the socketed gems first.');return;}selectedItem=null;toast('Item discarded');}
  if(kind==='upgrade'){buy('upgrade',selectedItem);return;}
  if(kind==='buy-potion'){buy('potion');return;}
  if(kind==='fuse'){const gem=fuseGems(pack,selectedItem);if(!gem){setText($('itemnotice'), 'Collect more gems of the same skill and quality.');return;}selectedItem=gem.uid;renderInventory();toast(gem.name+' fused');return;}
  if(kind==='close-detail'){closeItemDetail();return;}
  if(kind==='choose-gem'){showGemPicker(index);return;}
  if(kind==='socket'||kind==='socket-item'){equipSelectedGem(index,kind==='socket-item'?weapon:selectedItem);closeItemDetail();return;}
  if(kind==='wear'){if(!wearItem(pack,selectedItem))return;toast('Equipment changed. Active gems transfer to your new weapon.');}
  if(kind==='salvage'){const result=salvageItem(pack,selectedItem);if(!result){setText($('itemnotice'), 'Make backpack room to recover the socketed gems.');return;}selectedItem=null;toast('Salvaged · +'+result.amount+' '+MATERIAL_NAMES[result.material]);}
  if(kind==='remove'&&!removeGem(pack,weapon,index)){setText($('itemnotice'), 'Backpack full. Make room at the enchanter after the boss.');return;}
  closeItemDetail();syncEquipment();renderInventory();updateUI();
}
function equipSelectedGem(slot,uid=selectedItem){if(!socketGem(pack,slot,uid))return;syncEquipment();renderInventory();updateUI();}
function wearInSlot(slot,uid=selectedItem){
  const item=pack.bag.find(loot=>loot.uid===uid&&loot.type==='gear');if(!item)return false;
  if(item.slot!==slot){toast('This item belongs in the '+item.slot+' slot.');return false;}
  selectedItem=uid;inventoryAction('wear');return true;
}
function clearInventoryTargets(){for(const target of $('inventory').querySelectorAll('[data-gear-slot], [data-slot]')){target.classList.remove('drop-ready');target.classList.remove('drop-wrong');}}
$('inventory').addEventListener('click',event=>{
  if(performance.now()<suppressInventoryClickUntil){event.preventDefault();event.stopPropagation();return;}
  const tab=event.target.closest('[data-tab]');if(tab){inventoryTab=tab.dataset.tab;closeItemDetail();renderInventory();return;}
  const action=event.target.closest('[data-action]');if(action){inventoryAction(action.dataset.action,action.dataset.weapon,Number(action.dataset.index));return;}
  if(event.target===$('itempopup')){closeItemDetail();return;}
  const socket=event.target.closest('[data-slot]'),tile=event.target.closest('[data-item]');
  if(socket&&!tile){showGemPicker(Number(socket.dataset.slot));return;}
  if(tile){selectedItem=tile.dataset.item;renderInventory();}

});
$('inventory').addEventListener('pointerdown',event=>{
  if(event.pointerType==='touch'||event.target.closest('[data-action]'))return;
  const tile=event.target.closest('[data-item]'),item=tile&&allItems(pack).find(item=>item.uid===tile.dataset.item);
  if(!item||(item.type==='gear'&&!pack.bag.includes(item)))return;
  
  event.preventDefault();selectedItem=item.uid;for(const tile of $('inventory').querySelectorAll('[data-item]'))tile.classList.toggle('selected',tile.dataset.item===item.uid);
  inventoryDrag={uid:item.uid,pointer:event.pointerId,x:event.clientX,y:event.clientY,ghost:null};$('inventory').setPointerCapture(event.pointerId);
});
$('inventory').addEventListener('pointermove',event=>{
  if(!inventoryDrag||event.pointerId!==inventoryDrag.pointer)return;
  if(!inventoryDrag.ghost&&Math.hypot(event.clientX-inventoryDrag.x,event.clientY-inventoryDrag.y)>8){
    const item=allItems(pack).find(item=>item.uid===inventoryDrag.uid),ghost=document.createElement('div');ghost.className='spell-drag-ghost';setText(ghost, item.icon);ghost.style.color=item.type==='gem'?SPELLS[item.skill].color:item.color;document.body.append(ghost);inventoryDrag.ghost=ghost;
    for(const target of $('inventory').querySelectorAll('[data-gear-slot], [data-slot]')){const compatible=item.type==='gear'?target.dataset.gearSlot===item.slot:!!target.dataset.slot||['staff','offhand'].includes(target.dataset.gearSlot);target.classList.add(compatible?'drop-ready':'drop-wrong');}
  }
  if(inventoryDrag.ghost){inventoryDrag.ghost.style.left=event.clientX+'px';inventoryDrag.ghost.style.top=event.clientY+'px';}
});
function releaseInventoryDrag(event){
  if(!inventoryDrag||event.pointerId!==inventoryDrag.pointer)return;const drag=inventoryDrag;inventoryDrag=null;drag.ghost?.remove();clearInventoryTargets();
  if(drag.ghost){suppressInventoryClickUntil=performance.now()+400;closeItemDetail();}
  if(event.type==='pointerup'&&!drag.ghost){renderItemDetail();return;}
  if(event.type==='pointerup'&&drag.ghost){const target=document.elementFromPoint(event.clientX,event.clientY),item=allItems(pack).find(item=>item.uid===drag.uid);
    if(item?.type==='gem'){const slot=target?.closest('[data-slot]');if(slot){equipSelectedGem(Number(slot.dataset.slot),drag.uid);closeItemDetail();}}
    else{const slot=target?.closest('[data-gear-slot]');if(slot)wearInSlot(slot.dataset.gearSlot,drag.uid);}
  }
}
window.addEventListener('pointerup',releaseInventoryDrag);window.addEventListener('pointercancel',releaseInventoryDrag);window.addEventListener('blur',()=>{inventoryDrag?.ghost?.remove();inventoryDrag=null;clearInventoryTargets();});
function hurt(n){if(p.inv>0||over)return;n*=riftScale(rift).damage*(1+Math.min(.8,(p.level-1)*.04));const absorbed=Math.min(p.shield||0,n);p.shield=Math.max(0,(p.shield||0)-absorbed);n-=absorbed;if(n<=0)return;p.hp-=Math.max(1,n*100/(100+p.armor*2));p.inv=.5;p.hit=.15;soundEffects?.hurt();shake=5;texts.push({x:p.x,y:p.y,z:65,text:Math.round(n),color:'#fa7873',life:.8});if(p.hp<=0){p.hp=0;finish(false)}}function finish(win){
  over=true;keys={};mouse.down=false;moveTarget=null;rightMouseHeld=false;resetTouch();
  setText($('endtitle'), 'YOU DIED');setText($('endtext'), `Rift ${rift} · ${kills} enemies defeated · Level ${p.level}`);
  setText($('revives-status'), `Revives left: ${revivesLeft}`);
  $('death-choices').classList.remove('hidden');$('revive').disabled=revivesLeft<=0;
  $('score-section').classList.add('hidden');$('restart').classList.add('hidden');$('end').classList.remove('hidden');
  if(revivesLeft<=0)endExpedition();
}
function endExpedition(){
  if(!over||runEnded)return;runEnded=true;
  $('death-choices').classList.add('hidden');$('score-section').classList.remove('hidden');$('restart').classList.remove('hidden');
  setText($('revives-status'), revivesLeft?'Expedition ended.':'No revives remaining. Expedition ended.');
  endScoreRun({rifts:rift-1,kills,level:p.level,seconds:Math.floor(expeditionSeconds)});
}
function revive(){
  if(!over||runEnded||revivesLeft<=0)return;revivesLeft--;keys={};mouse.down=false;
  enterRift(true);
}

function updateUI(){const boss=enemies.find(e=>e.kind==='boss'&&e.hp>0);$('bosshealth').classList.toggle('hidden',!boss);if(boss){$('bossfill').style.width=Math.max(0,boss.hp/boss.max*100)+'%';setText($('bosshp'), Math.ceil(boss.hp)+' / '+Math.ceil(boss.max));}setText($('health'), Math.ceil(p.hp));setText($('level'), 'LV. '+p.level);setText($('power'), p.power);setText($('gold'), p.gold);$('xp').style.width=(p.xp/(p.level*90)*100)+'%';setText($('potions'), 'Heal · '+p.pots);setText($('quest'), activeRoom>=0?(activeRoom===0?'Leave the entrance when ready':cleared.has(activeRoom)?'Explore the remaining chambers':rooms[activeRoom].name):'Explore the sanctum');setText($('progress'), `Rift ${rift} · ${dungeon.biomeName} · ${cleared.size} / ${rooms.length-1} chambers · ${enemies.filter(e=>e.hp>0).length} guardians`);if(bossDead)setText($('quest'), 'Enchanter nearby · Enter portal for Rift '+(rift+1));document.querySelectorAll('.skill').forEach((b,i)=>{const empty=i>0&&i<4&&loadout[i]===null;b.classList.toggle('cooldown',cd[i]>0||empty);b.setAttribute('aria-disabled',String(cd[i]>0||empty));b.querySelector('i').style.opacity=(cd[i]>0||empty)?.4:1;setText(b.querySelector('em'), cd[i]>0?cd[i].toFixed(1):['LMB / SPACE','1','2','3','R'][i]);if(i<4){const spell=SPELLS[loadout[i]];setText(b.querySelector('i'), spell?.icon??'◇');setText(b.querySelector('span'), spell?.short??'Socket');setTitle(b, spell?spell.name+' · '+spell.description:'Empty weapon socket · Equip a skill gem in inventory');}})}
function setInventoryStats(show){
  closeItemDetail();$('inventory').classList.toggle('stats-view',show);$('character-stats').classList.toggle('hidden',!show);setText($('inventory-view'), show?'Equipment':'Stats');$('inventory-view').setAttribute('aria-pressed',String(show));
}
$('inventory-view').onclick=()=>{setInventoryStats(!$('inventory').classList.contains('stats-view'));renderInventory()};
function inventory(){if(!started||over)return;moveTarget=null;rightMouseHeld=false;if(merchantOpen){merchantOpen=false;$('merchant').classList.add('hidden');}const open=$('inventory').classList.contains('hidden');$('inventory').classList.toggle('hidden',!open);paused=open;resetTouch();inventoryDrag?.ghost?.remove();inventoryDrag=null;clearInventoryTargets();closeItemDetail();if(open){setInventoryStats(false);renderInventory();}}
function togglePause(){moveTarget=null;rightMouseHeld=false;if(!started||over||!$('inventory').classList.contains('hidden'))return;paused=!paused;setText($('pause'), paused?'▶':'Ⅱ');toast(paused?'Paused · Press Esc to resume':'Back to battle')}
addEventListener('keydown',e=>{if(e.target?.closest?.('input,textarea,select,[contenteditable]'))return;let k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();keys[k]=true;if(e.repeat)return;if(k==='1')use(1);if(k==='2')use(2);if(k==='3')use(3);if(k===' ')use(0);if(k==='r')use(4);if(k==='i')inventory();if(k==='f')merchant();if(k==='escape'&&!$('itempopup').classList.contains('hidden')){closeItemDetail();return;}if(k==='escape'&&merchantOpen){$('closemerchant').onclick();return;}if(k==='escape'){$('inventory').classList.contains('hidden')?togglePause():inventory()}});addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);addEventListener('blur',()=>{keys={};mouse.down=false;rightMouseHeld=false;if(started&&!over&&!paused)togglePause()});canvas.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;inputMode='mouse';mouse.x=e.clientX;mouse.y=e.clientY});canvas.addEventListener('mousedown',e=>{if(e.sourceCapabilities?.firesTouchEvents)return;inputMode='mouse';mouse.x=e.clientX;mouse.y=e.clientY;if(e.button===2){rightMouseHeld=true;if(started&&!paused&&!over){const target=uniso(e.clientX,e.clientY);if(onFloor(target.x,target.y)){moveTarget={x:target.x,y:target.y,lastX:p.x,lastY:p.y,stuck:0};fx.push({type:'ring',x:target.x,y:target.y,r:18,life:.6,max:.6,color:'#cfddac'});}}return;}if(e.button!==0)return;mouse.down=true;use(0)});window.addEventListener('mouseup',e=>{if(e.button===0)mouse.down=false;if(e.button===2)rightMouseHeld=false;});canvas.addEventListener('pointercancel',e=>{if(e.pointerType!=='touch')mouse.down=false});window.addEventListener('pointercancel',()=>{rightMouseHeld=false;moveTarget=null;});canvas.oncontextmenu=e=>e.preventDefault();function requestLandscape(){if(!window.matchMedia?.('(pointer:coarse)').matches)return;const enter=document.documentElement.requestFullscreen;if(!enter)return;try{Promise.resolve(enter.call(document.documentElement,{navigationUI:'hide'})).then(()=>screen.orientation?.lock?.('landscape')).catch(()=>{})}catch{}}
function beginGame(){soundEffects?.unlock();music?.unlock();requestLandscape();reset()}
$('closemerchant').onclick=()=>{merchantOpen=false;paused=false;closeItemDetail();$('merchant').classList.add('hidden');$('inventory').classList.add('hidden');};$('merchant').addEventListener('click',event=>{const button=event.target.closest('[data-buy]');if(button)buy(button.dataset.buy,button.dataset.uid);});$('begin').onclick=beginGame;$('restart').onclick=beginGame;$('revive').onclick=revive;$('end-run').onclick=endExpedition;$('allowPortrait').onclick=()=>document.body.classList.add('portrait-allowed');$('bag').onclick=inventory;$('closebag').onclick=inventory;$('pause').onclick=togglePause;$('help').onclick=()=>{paused=true;$('start').classList.remove('hidden');setText($('begin'), 'Resume journey');$('begin').onclick=()=>{soundEffects?.unlock();music?.unlock();requestLandscape();if(over||!started)reset();else{paused=false;$('start').classList.add('hidden')}}};const resetTouch=attachTouchControls({canvas,joystick:$('joystick'),buttons:document.querySelectorAll('.skill'),setMove:(x,y)=>{stick={x,y}},setMode:mode=>inputMode=mode,setAim:(x,y)=>{if(x===null){touchAimPoint=null;return}touchAimPoint={x,y};mouse.x=x;mouse.y=y;},cast:use,setPrimary:(value,gesture)=>{touchPrimary=value;primaryGesture=gesture},setSkillAim:gesture=>skillGesture=gesture});let padLast=[];
function update(dt){expeditionSeconds+=dt;t+=dt;p.hazardSlow=Math.max(0,(p.hazardSlow||0)-dt);p.moving=false;p.hit=Math.max(0,(p.hit||0)-dt);p.attackAnim=Math.max(0,(p.attackAnim||0)-dt);p.spin=Math.max(0,(p.spin||0)-dt);p.cast=Math.max(0,(p.cast||0)-dt);p.inv=Math.max(0,p.inv-dt);spellCooldowns=spellCooldowns.map(v=>Math.max(0,v-dt));cd=loadout.map(id=>id===null?0:spellCooldowns[id]).concat(Math.max(0,cd[4]-dt));let sx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),sy=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);sx+=stick.x;sy+=stick.y;let gp=navigator.getGamepads?.();let pad=gp&&Array.from(gp).find(Boolean);if(pad){if(pad.buttons.some(b=>b.pressed)||pad.axes.some(a=>Math.abs(a)>.2))inputMode='gamepad';if(Math.hypot(pad.axes[2]||0,pad.axes[3]||0)>.2)padAimAngle=Math.atan2(-pad.axes[2]*.609+pad.axes[3]*.793,pad.axes[2]*.793+pad.axes[3]*.609);sx+=Math.abs(pad.axes[0])>.15?pad.axes[0]:0;sy+=Math.abs(pad.axes[1])>.15?pad.axes[1]:0;[0,1,2,3,4].forEach((s,i)=>{let idx=[0,2,3,1,4][i];if(pad.buttons[idx]?.pressed&&(!padLast[idx]||i===0))use(s)});padLast=pad.buttons.map(b=>b.pressed)}if(Math.hypot(sx,sy)>.05){moveTarget=null;rightMouseHeld=false;}
if(rightMouseHeld&&inputMode==='mouse'){const target=uniso(mouse.x,mouse.y);if(onFloor(target.x,target.y)){if(moveTarget){moveTarget.x=target.x;moveTarget.y=target.y;}else moveTarget={x:target.x,y:target.y,lastX:p.x,lastY:p.y,stuck:0};}}
if(moveTarget){const dx=moveTarget.x-p.x,dy=moveTarget.y-p.y,distance=Math.hypot(dx,dy);moveTarget.stuck=Math.hypot(p.x-moveTarget.lastX,p.y-moveTarget.lastY)<.2?moveTarget.stuck+dt:0;moveTarget.lastX=p.x;moveTarget.lastY=p.y;if(distance<5||moveTarget.stuck>.65)moveTarget=null;else{const scale=Math.min(1,distance/(190*dt))/distance;sx=(dx*.793-dy*.609)*scale;sy=(dx*.609+dy*.793)*scale;}}
let n=Math.hypot(sx,sy);if(n>.05){sx/=Math.max(1,n);sy/=Math.max(1,n);let dx=sx*.793+sy*.609,dy=-sx*.609+sy*.793;const speed=p.hazardSlow>0?190*.6:190;move(p,dx*speed*dt,dy*speed*dt);p.moving=true;if((p.cast||0)<.22){const direction=Math.atan2(dy,dx),difference=Math.atan2(Math.sin(direction-p.face),Math.cos(direction-p.face));p.face+=difference*(1-Math.exp(-22*dt));}p.walk+=dt*12}if(skillGesture&&Math.hypot(skillGesture.dx,skillGesture.dy)>8){const target=skillPoint(skillGesture);p.face=Math.atan2(target.y-p.y,target.x-p.x);}
if(mouse.down||keys[' ']||touchPrimary)use(0,primaryGesture);
p.shieldTime=Math.max(0,(p.shieldTime||0)-dt);if(!p.shieldTime)p.shield=0;
for(const e of enemies){if(e.hp<=0)continue;
  for(const [name,status]of Object.entries(e.status||{})){
    status.time-=dt;
    if((name==='burn'||name==='poison')&&status.time>0){status.clock=(status.clock||0)+dt;if(status.clock>=.4){damage(e,status.power*.4);status.clock=0;}}
    if(status.time<=0)delete e.status[name];
  }
  if(e.hp<=0)continue;
  e.hit=Math.max(0,e.hit-dt);e.stun=Math.max(0,e.stun-dt);e.atk-=dt;e.phase+=dt;e.attackAnim=Math.max(0,(e.attackAnim||0)-dt);e.moving=false;
  const dx=p.x-e.x,dy=p.y-e.y,d=Math.max(.001,Math.hypot(dx,dy));
  const disabled=e.stun>0||e.status?.freeze||e.status?.stun;
  if(e.pendingAttack){
    if(e.status?.freeze||e.status?.stun){e.pendingAttack=null;e.atk=1;continue;}
    e.pendingAttack.timer-=dt;
    if(e.pendingAttack.timer<=0){
      const attack=e.pendingAttack;e.pendingAttack=null;e.attackAnim=.5;
      if(attack.type==='bolt'){const ax=attack.x-e.x,ay=attack.y-e.y,length=Math.max(1,Math.hypot(ax,ay));fx.push({type:'bolt',x:e.x,y:e.y,vx:ax/length*240,vy:ay/length*240,life:2,max:2,r:10,color:e.elite?'#efb775':'#cb74e1',source:e});}
      else if(attack.type==='lunge'){e.lunge={x:attack.dx,y:attack.dy,time:.38,hit:false};}
      else if(Math.hypot(p.x-e.x,p.y-e.y)<attack.radius)hurt((['brute','demon'].includes(e.kind)?20:17)*(e.elite?1.3:1));
    }
    continue;
  }
  if(e.lunge){
    if(disabled){e.lunge=null;continue;}
    e.lunge.time-=dt;move(e,e.lunge.x*300*dt,e.lunge.y*300*dt);e.moving=true;e.walk+=dt*14;
    if(!e.lunge.hit&&d<45){hurt(12*(e.elite?1.3:1));e.lunge.hit=true;}
    if(e.lunge.time<=0)e.lunge=null;continue;
  }
  e.face=Math.atan2(dy,dx);if(disabled)continue;
  if(!e.recovered&&e.hp<e.max*.3&&['caster','hunter','demon','healer'].includes(e.kind)){
    if(d<240){let rx=-dx/d,ry=-dy/d;if(!onFloor(e.x+rx*25,e.y+ry*25)){rx=dy/d;ry=-dx/d;}move(e,rx*110*dt,ry*110*dt);e.face=Math.atan2(ry,rx);e.moving=true;e.walk+=dt*10;}
    else if(!e.status?.burn&&!e.status?.poison&&e.hit<=0){e.recovery+=dt;if(e.recovery>1.5){const restored=Math.min(e.max*.25,e.max-e.hp);e.hp+=restored;e.recovered=true;e.recovery=0;texts.push({x:e.x,y:e.y,z:90,text:'+'+Math.round(restored),color:'#96e4ab',life:1});fx.push({type:'ring',x:e.x,y:e.y,r:35,life:.6,max:.6,color:'#91e6b0'});}}
    continue;
  }
  if(e.kind==='healer'&&e.healsLeft>0){
    e.healCd=Math.max(0,e.healCd-dt);
    const ally=enemies.filter(a=>a!==e&&a.hp>0&&a.hp<a.max*.8).sort((a,b)=>a.hp/a.max-b.hp/b.max)[0];
    if(ally){const ax=ally.x-e.x,ay=ally.y-e.y,ad=Math.max(1,Math.hypot(ax,ay));e.face=Math.atan2(ay,ax);
      if(ad>170){move(e,ax/ad*85*dt,ay/ad*85*dt);e.moving=true;e.walk+=dt*9;}
      else if(e.healCd<=0){const restored=Math.min(ally.max*(ally.kind==='boss'?.05:.18),ally.max-ally.hp);ally.hp+=restored;e.healsLeft--;e.healCd=5;e.attackAnim=.55;texts.push({x:ally.x,y:ally.y,z:95,text:'+'+Math.round(restored),color:'#9ce7ba',life:1});for(const a of [e,ally])fx.push({type:'ring',x:a.x,y:a.y,r:35,life:.7,max:.7,color:'#86e7b4'});}
      continue;
    }
  }
  const baseSpeed={boss:70,brute:62,caster:78,healer:85,demon:90,spider:135,sentinel:72,hunter:125,ghoul:100}[e.kind]||100;
  const speed=baseSpeed*(e.status?.slow?.time>0?.45:1)*(e.elite?1.08:1),minimum=['caster','healer'].includes(e.kind)?205:34;
  if(['caster','healer'].includes(e.kind)&&d<130){move(e,-dx/d*speed*dt,-dy/d*speed*dt);e.moving=true;e.walk+=dt*9;}else if(d>minimum){move(e,dx/d*speed*dt,dy/d*speed*dt);e.walk+=dt*9;e.moving=true;}
  if(e.atk>0)continue;
  if(['caster','healer'].includes(e.kind)&&d<370){e.pendingAttack={type:'bolt',x:p.x,y:p.y,timer:.55};e.attackAnim=.55;e.atk=2.5;fx.push({type:'ring',x:e.x,y:e.y,r:28,life:.55,max:.55,color:'#ca92e5'});}
  else if(e.kind==='hunter'&&d>65&&d<235){e.pendingAttack={type:'lunge',dx:dx/d,dy:dy/d,timer:.45};e.face=Math.atan2(dy,dx);e.atk=3.2;fx.push({type:'ring',x:e.x+dx/d*75,y:e.y+dy/d*75,r:25,life:.45,max:.45,color:'#eab17a'});}
  else if(['brute','sentinel','demon'].includes(e.kind)&&d<85){const radius=['brute','demon'].includes(e.kind)?78:62;e.pendingAttack={type:'slam',radius,timer:.7};e.attackAnim=.55;e.atk=2.1;fx.push({type:'ring',x:e.x,y:e.y,r:radius,life:.7,max:.7,color:'#f59a71'});}
  else if(e.kind==='boss'&&d<280){e.attackAnim=.5;fx.push({type:'danger',x:p.x,y:p.y,r:95,life:1.2,max:1.2,color:'#e3445f',trigger:false});e.atk=e.hp<e.max*.5?1.5:2.4;if(e.hp<e.max*.5&&!e.enraged){e.enraged=true;toast('The Warden is enraged!')}if(d<55)hurt(22);}
  else if(d<47){e.attackAnim=.5;hurt((e.kind==='spider'?7:8)*(e.elite?1.3:1));if(e.kind==='spider')p.hazardSlow=Math.max(p.hazardSlow||0,.8);e.atk=1.1;}
}

if(over)return;
stepPhysics(dt,[p,...enemies.filter(e=>e.hp>0)]);soundEffects?.walk(Math.hypot(p.x-(p.prevX??p.x),p.y-(p.prevY??p.y))>.05,dungeon.biome==='jungle'?'grass':'stone');
for(const f of [...fx]){f.life-=dt;if(['bolt','arcane','fireball'].includes(f.type)){let nx=f.x+f.vx*dt,ny=f.y+f.vy*dt,hit=projectileHit(f.x,f.y,nx,ny,f.source||p,f.r||0);if(hit){f.x=hit.x;f.y=hit.y;f.life=0;if(f.type==='bolt'){if(hit.actor===p)hurt(12)}else if(f.type==='arcane'&&hit.actor&&hit.actor!==p){damage(hit.actor,f.damage*(f.spellId===4&&hit.actor.status?.freeze?1.8:1));if(f.spellId===4)applyStatus(hit.actor,'freeze',1.4);hit.actor.knockX=Math.sign(f.vx)*60;hit.actor.knockY=Math.sign(f.vy)*60}}else{f.x=nx;f.y=ny}if(f.type!=='bolt'&&f.life>0){const life=f.type==='fireball'?.42:.23;for(let j=0;j<(f.type==='fireball'&&!mobileEffects?2:1);j++)particles.push({x:f.x+(Math.random()-.5)*9,y:f.y+(Math.random()-.5)*9,z:35,vx:-f.vx*.08,vy:-f.vy*.08,vz:f.type==='fireball'?35:5,life,max:life,color:f.type==='fireball'?'#ff7137':f.color,gravity:0});}if(f.type==='arcane'&&f.life<=0)spellBurst(f.x,f.y,'#c3adff',12,80,35);if(f.type==='fireball'&&f.life<=0){soundEffects?.play('explosion',{gain:.65});spellBurst(f.x,f.y,'#ffa857',55,180,35);fx.push({type:'ring',x:f.x,y:f.y,r:105,life:.45,max:.45,color:'#ffac62',spell:'fire'});for(const e of enemies)if(e.hp>0&&Math.hypot(e.x-f.x,e.y-f.y)<110){damage(e,f.damage);applyStatus(e,'burn',3,f.damage*.15);let a=Math.atan2(e.y-f.y,e.x-f.x);e.knockX=Math.cos(a)*220;e.knockY=Math.sin(a)*220}}}
if(f.type==='meteor'&&f.life<=0){soundEffects?.play('explosion',{gain:.85,rate:.85});areaDamage(f.x,f.y,f.r,f.power*5,'burn',4);spellBurst(f.x,f.y,f.color,85,230,20);fx.push({type:'ring',spell:'fire',x:f.x,y:f.y,r:f.r,life:.6,max:.6,color:f.color});shake=10;}
if(f.type==='zone'){f.tick-=dt;if(f.tick<=0){f.tick=.5;f.beats++;areaDamage(f.x,f.y,f.r,f.power*(f.spellId===8?.18:.6),f.spellId===7?'poison':'slow',f.spellId===7?2:1);spellBurst(f.x,f.y,f.color,12,60,5);}}
if(f.type==='danger'&&f.life<.25&&!f.trigger){f.trigger=true;if(Math.hypot(f.x-p.x,f.y-p.y)<f.r)hurt(f.hazard==='poison'?10:f.hazard==='ice'?16:f.hazard==='fire'?34:28);if(['poison','ice'].includes(f.hazard)&&Math.hypot(f.x-p.x,f.y-p.y)<f.r)p.hazardSlow=1.5;shake=8}}
fx=fx.filter(f=>f.life>0);texts.forEach(v=>{v.life-=dt;v.z+=dt*35});texts=texts.filter(v=>v.life>0);particles.forEach(v=>{v.life-=dt;v.x+=v.vx*dt;v.y+=v.vy*dt;v.z+=v.vz*dt;v.vz-=dt*(v.gravity??400)});particles=particles.filter(v=>v.life>0).slice(-(mobileEffects?320:1024));drops=drops.filter(v=>{if(Math.hypot(v.x-p.x,v.y-p.y)>45)return true;return !equipDrop(v)});enemies=enemies.filter(e=>e.hp>0);for(const index of encountered)if(index>0&&!cleared.has(index)&&!enemies.some(e=>e.room===index&&e.hp>0)){cleared.add(index);toast(rooms[index].name+' cleared');p.hp=Math.min(p.max,p.hp+25);p.pots++;if(cleared.size===rooms.length-1)toast('All chambers cleared · Visit the enchanter or enter the portal.')}
for(let i=0;i<rooms.length;i++)if(inside(p.x,p.y,rooms[i],0)){activeRoom=i;if(!encountered.has(i))spawnWave(i);break}
trapTimer-=dt;if(trapTimer<=0&&activeRoom>0&&enemies.length){trapTimer=activeRoom===4?3:5;for(let i=0;i<2+activeRoom;i++){let r=rooms[activeRoom];fx.push({type:'danger',x:r.x+(Math.random()-.5)*(r.w-100),y:r.y+(Math.random()-.5)*(r.h-100),r:dungeon.biome==='jungle'?75:55,life:dungeon.biome==='hell'?1.2:1.6,max:dungeon.biome==='hell'?1.2:1.6,color:dungeon.biome==='jungle'?'#80bd48':dungeon.biome==='hell'?'#ff7135':dungeon.biome==='frozen'?'#83d8ff':'#e3445f',hazard:dungeon.biome==='jungle'?'poison':dungeon.biome==='hell'?'fire':dungeon.biome==='frozen'?'ice':null,trigger:false})}}
for(const chest of chests)if(!chest.opened&&Math.hypot(chest.x-p.x,chest.y-p.y)<50){chest.opened=true;soundEffects?.play('chest',{gain:.75});p.gold+=50;p.pots++;drops.push(makeDrop(chest.x,chest.y,'chest'));toast('Relic chest opened · +50 gold · Healing potion')}
if(bossDead){const vendor=merchantPosition(),distance=Math.hypot(p.x-vendor.x,p.y-vendor.y);if(distance>125)merchantArmed=true;if(distance<75&&merchantArmed)merchant();}
portalGrace=Math.max(0,portalGrace-dt);if(bossDead&&!portalGrace){const portal=portalPosition();if(Math.hypot(p.x-portal.x,p.y-portal.y)<48){rift++;enterRift();return;}}
toastTime-=dt;if(toastTime<0)$('toast').style.opacity=0;shake=Math.max(0,shake-dt*35);uiTimer-=dt;if(uiTimer<=0){updateUI();uiTimer=.1}}
let accumulator=0,uiTimer=0,renderAlpha=1,drawDt=0;
function draw(){for(const a of [p,...enemies]){a.renderX=(a.prevX??a.x)+(a.x-(a.prevX??a.x))*renderAlpha;a.renderY=(a.prevY??a.y)+(a.y-(a.prevY??a.y))*renderAlpha}renderFrame({p,equipped:pack?.equipped,animationDelta:drawDt,enemies,drops,fx,texts,particles,chests,t,started,paused,over,aim:aim(),showAim:inputMode==='mouse'||(!!skillGesture&&loadout[skillGesture.skill]!==null),previewSkill:loadout[skillGesture?.skill??2],previewRadius:SPELLS[loadout[skillGesture?.skill??2]]?.radius??0,bossDead,merchant:bossDead?merchantPosition():null,rift,cleared,activeRoom,shake,dungeon})}
p={x:0,y:110,hp:100,max:100,walk:0,inv:0};
function loop(now){let dt=Math.min((now-last)/1000,.1);last=now;music?.update(dt);if(paused||over||!started)soundEffects?.walk(false);drawDt=paused?0:dt;if(started&&!paused&&!over){accumulator+=dt;while(accumulator>=1/60&&!paused&&!over){update(1/60);accumulator-=1/60}}else accumulator=0;if(paused||over)accumulator=0;renderAlpha=accumulator/(1/60);draw();requestAnimationFrame(loop)}requestAnimationFrame(loop);
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'read_rift_status',description:'Read the current Ashen Rift game status.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({started,paused,over,wave,rift,bossDead,equippedSkills:loadout.filter(id=>id!==null).map(id=>SPELLS[id].name),inventoryItems:pack?.bag.length??0,health:p.hp,level:p.level||1,enemies:enemies.length,kills})})).catch(()=>{})}catch{}}

onLanguageChange(()=>{if(started){updateUI();if(!$('inventory').classList.contains('hidden'))renderInventory();}});
