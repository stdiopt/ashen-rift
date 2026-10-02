const FILES=['grass','stone','heal','fire-cast','explosion','hurt-1','hurt-2','hurt-3','hurt-4','death-1','death-2','death-3','death-4','chest','arcane-1','arcane-2','arcane-3','arcane-4'];
export class SoundEffects {
  constructor(){this.context=null;this.buffers=new Map();this.volume=.55;this.muted=false;this.walker=null;this.walkSurface=null;this.voiceUntil=0;this.lastExplosion=-10;this.lastDeath=-10;this.deathVariant=0;this.arcaneVariant=0;this.active=new Set();this.wantWalking=false;this.surface='stone';this.loading=null;this.lastStep=-10;try{const preference=JSON.parse(localStorage.getItem('ashen-rift-effects'));if(preference){this.volume=Math.max(0,Math.min(1,Number(preference.volume)||0));this.muted=!!preference.muted}}catch{}}
  unlock(){
    const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AudioContext)return;
    if(!this.context){this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=this.muted?0:this.volume;this.master.connect(this.context.destination);}
    this.context.resume().catch(()=>{});
    if(!this.loading)this.loading=Promise.all(FILES.map(async key=>{try{const response=await fetch('./audio/sfx/'+key+'.mp3?v=58');if(!response.ok)return;const buffer=await this.context.decodeAudioData(await response.arrayBuffer());this.buffers.set(key,buffer)}catch{}}));
  }
  play(key,{gain=.7,voice=false,rate=1,duration=null,filterHz=null}={}){
    const context=this.context,buffer=this.buffers.get(key);if(!context||context.state!=='running'||!buffer||this.muted||this.active.size>=8)return false;
    if(voice&&context.currentTime<this.voiceUntil)return false;
    if(key==='explosion'){if(context.currentTime-this.lastExplosion<.15)return false;this.lastExplosion=context.currentTime;}
    const source=context.createBufferSource(),level=context.createGain();source.buffer=buffer;source.playbackRate.value=rate;level.gain.value=gain;const filter=filterHz?context.createBiquadFilter():null;if(filter){filter.type='lowpass';filter.frequency.value=filterHz;source.connect(filter);filter.connect(level)}else source.connect(level);level.connect(this.master);this.active.add(source);
    source.onended=()=>{this.active.delete(source);source.disconnect();filter?.disconnect();level.disconnect()};if(duration)source.start(0,0,Math.min(duration,buffer.duration));else source.start();if(voice)this.voiceUntil=context.currentTime+buffer.duration/rate;return true;
  }
  arcane(skill){
    if(![0,4,5].includes(skill))return false;
    const key='arcane-'+(1+(this.arcaneVariant++%4));
    return this.play(key,{gain:skill===0?.14:skill===4?.21:.24,rate:(skill===4?1.15:skill===5?.9:1)+Math.random()*.06-.03,filterHz:skill===0?6500:skill===4?10000:4500});
  }
  death(kind){
    if(!this.context||this.context.currentTime-this.lastDeath<.1)return false;
    const key='death-'+(1+(this.deathVariant++%4)),rate=kind==='boss'?.78:kind==='spider'?1.15:kind==='demon'?.9:.96+Math.random()*.08;
    if(!this.play(key,{gain:kind==='boss'?.8:.5,rate}))return false;this.lastDeath=this.context.currentTime;return true;
  }
  hurt(){return this.play('hurt-'+(1+Math.floor(Math.random()*4)),{voice:true,gain:.65});}
  walk(moving,surface='stone'){
    this.wantWalking=moving;this.surface=surface;
    if(!moving)this.stopWalking();
  }
  step(){
    if(!this.wantWalking||!this.context||this.context.currentTime-this.lastStep<.22)return;
    if(this.play(this.surface,{gain:.3,rate:.96+Math.random()*.08,duration:.32}))this.lastStep=this.context.currentTime;
  }

  stopWalking(){if(!this.walker)return;const {source,level}=this.walker;source.stop();source.disconnect();filter?.disconnect();level.disconnect();this.walker=null;this.walkSurface=null;}
  setVolume(value){this.volume=Math.max(0,Math.min(1,value));if(this.master)this.master.gain.setTargetAtTime(this.muted?0:this.volume,this.context.currentTime,.02);this.save();}
  toggle(){this.muted=!this.muted;this.setVolume(this.volume);if(this.muted)this.stopWalking();else this.unlock();}
  save(){try{localStorage.setItem('ashen-rift-effects',JSON.stringify({volume:this.volume,muted:this.muted}))}catch{}}
  stop(){this.stopWalking();for(const source of this.active){source.stop();}this.active.clear();}
}
export const soundEffects=typeof document==='undefined'?null:new SoundEffects();
if(soundEffects){
  const button=document.getElementById('effects-toggle'),volume=document.getElementById('effects-volume');
  const sync=()=>{button.textContent=soundEffects.muted?'Effects off':'Effects on';button.setAttribute('aria-pressed',String(!soundEffects.muted));volume.value=String(Math.round(soundEffects.volume*100));};
  button.onclick=()=>{soundEffects.toggle();sync()};volume.oninput=()=>{soundEffects.setVolume(Number(volume.value)/100);soundEffects.unlock();};sync();
  document.addEventListener('visibilitychange',()=>{if(document.hidden)soundEffects.stop()});window.addEventListener('pagehide',()=>soundEffects.stop());
}
