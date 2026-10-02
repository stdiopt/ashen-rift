import {SPELLS,RARITIES} from './skills.js?v=61';
export const GEAR_SLOTS=['staff','offhand','robes','legs','head'];
export const GEAR_ICONS={staff:'⚚',offhand:'◈',robes:'♜',legs:'Ⅱ',head:'♛'};
export const GEM_QUALITIES={Common:{name:'White',power:1,color:'#e6e1d6'},Rare:{name:'Blue',power:1.3,color:'#70b9ff'},Epic:{name:'Purple',power:1.7,color:'#c18bff'},Legendary:{name:'Orange',power:2.2,color:'#ff9957'}};
export const FUSION_RECIPES={Common:{count:2,next:'Rare'},Rare:{count:3,next:'Epic'},Epic:{count:4,next:'Legendary'}};
export function gemPower(gem){return gem?GEM_QUALITIES[gem.rarity].power*(1+(gem.level-1)*.14):1;}
let serial=0;
export function createGem(skill,rarity='Rare',level=1){level=Math.min(10,Math.max(1,level));return{uid:'loot-'+(++serial),type:'gem',skill,level,rarity,name:GEM_QUALITIES[rarity].name+' '+SPELLS[skill].name+' Gem',color:GEM_QUALITIES[rarity].color,power:level*10*GEM_QUALITIES[rarity].power,icon:SPELLS[skill].icon};}
export function createGear(slot,rarity='Common',rift=1,rng=Math.random){
  const quality={Common:1,Rare:1.25,Epic:1.6,Legendary:2}[rarity],budget=(5+rift*3+rng()*5)*quality,style=Math.floor(rng()*3);
  const names={staff:['Ember Staff','Windcarved Staff','Runic Staff'],offhand:['Astral Focus','Chronicle Orb','Warden Grimoire'],robes:['Runewoven Robes','Chronomancer Robes','Sentinel Robes'],legs:['Runic Leggings','Windweave Leggings','Warden Leggings'],head:['Arcanist Hood','Chronomancer Crown','Sentinel Cowl']};
  const weapon=slot==='staff'||slot==='offhand';
  const stats=weapon?{power:Math.round(budget*(style===1?.5:style===2?.75:1)),armor:style===2?Math.round(budget*.2):0,cooldown:style===1?.04*quality:style===2?.015*quality:0}:{power:style===0?Math.round(budget*.35):0,armor:Math.round(budget*(style===2?.6:.25)),cooldown:style===1?.035*quality:0};
  return{uid:'loot-'+(++serial),type:'gear',slot,level:1,rarity,name:rarity+' '+names[slot][style],color:RARITIES[rarity],stats,power:Math.round(budget),cooldown:stats.cooldown,icon:GEAR_ICONS[slot],sockets:weapon?Array(slot==='staff'?2:1).fill(null):[]};
}
export function createInventory(){
  const equipped=Object.fromEntries(GEAR_SLOTS.map(slot=>{const item=createGear(slot);item.name='Apprentice '+({staff:'Staff',offhand:'Focus',robes:'Robes',legs:'Leggings',head:'Hood'}[slot]);item.stats={power:0,armor:0,cooldown:0};return[slot,item];}));
  return{equipped,bag:[],capacity:40,scraps:0,powder:0};
}
export function gemAt(state,slot){return slot<1||slot>3?null:slot<3?state.equipped.staff.sockets[slot-1]:state.equipped.offhand.sockets[0];}
function socketAt(state,slot){return slot<1||slot>3?null:{weapon:slot<3?state.equipped.staff:state.equipped.offhand,index:slot<3?slot-1:0};}
export function allItems(state){return[...state.bag,...Object.values(state.equipped),...Object.values(state.equipped).flatMap(item=>item.sockets.filter(Boolean)),...state.bag.flatMap(item=>item.sockets?.filter(Boolean)||[])];}
export function inventoryStats(state){return Object.values(state.equipped).reduce((sum,item)=>{for(const key of ['power','armor','cooldown'])sum[key]+=item.stats[key];return sum;},{power:0,armor:0,cooldown:0});}
export function collectItem(state,item){if(state.bag.length>=state.capacity)return false;state.bag.push(item);return true;}
export function wearItem(state,uid){const index=state.bag.findIndex(item=>item.uid===uid&&item.type==='gear');if(index<0)return false;const item=state.bag[index],previous=state.equipped[item.slot];if(item.slot==='staff'||item.slot==='offhand'){const incoming=item.sockets;item.sockets=previous.sockets;previous.sockets=incoming;}state.equipped[item.slot]=item;state.bag[index]=previous;return true;}
export function socketGem(state,slot,uid){
  const target=socketAt(state,slot);if(!target)return false;
  const index=state.bag.findIndex(item=>item.uid===uid&&item.type==='gem');
  if(index>=0){const previous=target.weapon.sockets[target.index];target.weapon.sockets[target.index]=state.bag[index];if(previous)state.bag[index]=previous;else state.bag.splice(index,1);return true;}
  for(let source=1;source<=3;source++){const from=socketAt(state,source);if(from.weapon.sockets[from.index]?.uid===uid){const previous=target.weapon.sockets[target.index];target.weapon.sockets[target.index]=from.weapon.sockets[from.index];from.weapon.sockets[from.index]=previous;return true;}}
  return false;
}
export function removeGem(state,weaponUid,index){const weapon=allItems(state).find(item=>item.uid===weaponUid&&item.type==='gear');const gem=weapon?.sockets[index];if(!gem||state.bag.length>=state.capacity)return false;state.bag.push(gem);weapon.sockets[index]=null;return true;}
export const MATERIAL_NAMES={scraps:'scraps',powder:'arcane powder'};
export function salvageReward(item){return{material:item.type==='gem'?'powder':'scraps',amount:({Common:1,Rare:2,Epic:4,Legendary:8}[item.rarity])*(item.level||1)};}
export function salvageItem(state,uid){
  const index=state.bag.findIndex(item=>item.uid===uid);if(index<0)return null;
  const item=state.bag[index];if(item.locked)return null;const gems=item.sockets?.filter(Boolean)||[];
  if(state.bag.length-1+gems.length>state.capacity)return null;
  const reward=salvageReward(item);state.bag.splice(index,1,...gems);state[reward.material]+=reward.amount;return reward;
}
export function upgradeCost(item){return{gold:5*4**(item.level-1),material:item.type==='gem'?'powder':'scraps',amount:Math.ceil(1.6**(item.level-1))};}
export function upgradeGem(state,uid,gold){
  const gem=allItems(state).find(item=>item.uid===uid&&item.type==='gem');if(!gem||gem.level>=10)return null;
  const cost=upgradeCost(gem);if(gold<cost.gold||state.powder<cost.amount)return null;
  state.powder-=cost.amount;gem.level++;gem.power=gem.level*10*GEM_QUALITIES[gem.rarity].power;return cost;
}
export function upgradeEquipment(state,uid,gold){
  const item=allItems(state).find(item=>item.uid===uid&&item.type==='gear');if(!item||item.level>=10)return null;
  const cost=upgradeCost(item);if(gold<cost.gold||state.scraps<cost.amount)return null;
  state.scraps-=cost.amount;item.level++;const stats=item.stats;
  if(item.slot==='staff'||item.slot==='offhand')stats.power+=Math.max(1,Math.round(stats.power*.2));else stats.armor+=Math.max(1,Math.round(stats.armor*.2));
  if(stats.cooldown)stats.cooldown=Math.min(.18,stats.cooldown+.003);item.power+=2;item.cooldown=stats.cooldown;return cost;
}

export function fusionOptions(state,uid){
  const gem=state.bag.find(item=>item.uid===uid&&item.type==='gem'),recipe=gem&&FUSION_RECIPES[gem.rarity];if(!recipe)return null;
  const matches=state.bag.filter(item=>item.type==='gem'&&item.skill===gem.skill&&item.rarity===gem.rarity);
  return{gem,recipe,matches,ready:matches.length>=recipe.count};
}
export function fuseGems(state,uid){
  const option=fusionOptions(state,uid);if(!option?.ready)return null;
  const {gem,recipe,matches}=option,others=matches.filter(item=>item!==gem).sort((a,b)=>a.level-b.level),consumed=[gem,...others.slice(0,recipe.count-1)],ids=new Set(consumed.map(item=>item.uid));
  const result=createGem(gem.skill,recipe.next,Math.max(...consumed.map(item=>item.level))),position=state.bag.indexOf(gem);
  state.bag=state.bag.filter(item=>!ids.has(item.uid));state.bag.splice(Math.min(position,state.bag.length),0,result);return result;
}
export function sortedBagItems(state,filter='all'){
  const quality={Common:0,Rare:1,Epic:2,Legendary:3};
  const typeOrder=item=>item.type==='gear'?GEAR_SLOTS.indexOf(item.slot):GEAR_SLOTS.length+item.skill;
  return state.bag.filter(item=>filter==='all'||item.type===filter).sort((a,b)=>typeOrder(a)-typeOrder(b)||quality[b.rarity]-quality[a.rarity]||b.level-a.level||a.uid.localeCompare(b.uid));
}

export function discardItem(state,uid){
  const index=state.bag.findIndex(item=>item.uid===uid);if(index<0)return false;
  if(state.bag[index].locked)return false;
  const gems=state.bag[index].sockets?.filter(Boolean)||[];
  if(state.bag.length-1+gems.length>state.capacity)return false;
  state.bag.splice(index,1,...gems);return true;
}

export function toggleGearLock(state,uid){const item=allItems(state).find(item=>item.uid===uid&&item.type==='gear');if(!item)return false;item.locked=!item.locked;return true;}
export function bulkSalvagePreview(state){
  const items=state.bag.filter(item=>item.type==='gear'&&!item.locked),gems=items.flatMap(item=>item.sockets?.filter(Boolean)||[]);
  return{items,gems,count:items.length,scraps:items.reduce((sum,item)=>sum+salvageReward(item).amount,0),fits:state.bag.length-items.length+gems.length<=state.capacity};
}
export function salvageAllGear(state){
  const preview=bulkSalvagePreview(state);if(!preview.count||!preview.fits)return null;
  const ids=new Set(preview.items.map(item=>item.uid));state.bag=state.bag.filter(item=>!ids.has(item.uid)).concat(preview.gems);state.scraps+=preview.scraps;
  return{count:preview.count,scraps:preview.scraps,gems:preview.gems.length};
}
