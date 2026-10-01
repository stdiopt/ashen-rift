// Ten mage spells. Three secondary slots come from gems in staff and offhand sockets.
export const SPELLS = [
  {name:'Arcane Bolt',short:'Bolt',icon:'✧',cooldown:.28,range:360,radius:12,color:'#bd9aff',description:'Rapid arcane projectile.'},
  {name:'Fireball',short:'Fireball',icon:'✺',cooldown:3.5,range:320,radius:105,color:'#ffac62',description:'Explosion, knockback and burning damage.'},
  {name:'Frost Nova',short:'Nova',icon:'❄',cooldown:8,range:320,radius:145,color:'#80cbe1',description:'Freezes enemies in a wide circle.'},
  {name:'Blink',short:'Blink',icon:'➤',cooldown:2.5,range:180,radius:22,color:'#b3d3e1',description:'Teleport with brief invulnerability.'},
  {name:'Ice Lance',short:'Lance',icon:'◆',cooldown:2,range:360,radius:15,color:'#98eaff',description:'Ice projectile; freezes and hits frozen foes harder.'},
  {name:'Chain Lightning',short:'Chain',icon:'ϟ',cooldown:5,range:350,radius:45,color:'#c9c0ff',description:'Jumps between five enemies and briefly stuns.'},
  {name:'Meteor',short:'Meteor',icon:'☄',cooldown:10,range:360,radius:125,color:'#ff8952',description:'Delayed fiery impact with burning damage.'},
  {name:'Poison Cloud',short:'Poison',icon:'☣',cooldown:9,range:320,radius:120,color:'#8ccc72',description:'Lingering poison damages and slows enemies.'},
  {name:'Blizzard',short:'Blizzard',icon:'❅',cooldown:11,range:320,radius:155,color:'#a4e6ff',description:'Chilling storm slows enemies with light frost damage.'},
  {name:'Arcane Shield',short:'Shield',icon:'⬡',cooldown:14,range:0,radius:75,color:'#b59aff',description:'Absorbs incoming damage for six seconds.'}
];
export const RARITIES = {Common:'#d6d4c8',Rare:'#70b9ff',Epic:'#c18bff',Legendary:'#ffc76b'};
export function cooldownFor(spell,level,reduction){return SPELLS[spell].cooldown*Math.max(.4,1-Math.min(.45,reduction)-Math.min(.18,level*.025));}
export function riftScale(rift){const depth=Math.max(0,rift-1);return {health:1+depth*1.5+depth*depth*.45,damage:1+depth*.55+depth*depth*.10,reward:1+depth*.25};}
