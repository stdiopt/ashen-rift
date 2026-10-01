export const THEME_TRACKS={castle:'castle.mp3',jungle:'Jungle.mp3',hell:'hell_cave.mp3',frozen:'frozen_ice.mp3'};
// Reuse the player unlocked by Start: some mobile browsers authorize playback
// per media element. Waiting for a second player's readyState left old music playing.
export class RiftMusic {
  constructor(makeAudio=()=>new Audio()){
    this.player=makeAudio();this.player.loop=true;this.player.preload='none';this.player.volume=0;
    this.volume=.35;this.muted=false;this.unlocked=false;this.theme=null;this.loadedTheme=null;this.fade=null;this.hidden=false;this.blocked=false;this.onChange=null;this.playGeneration=0;
    try{const saved=JSON.parse(localStorage.getItem('ashen-rift-music'));if(saved){this.volume=Math.max(0,Math.min(1,Number(saved.volume)||0));this.muted=!!saved.muted}}catch{}
  }
  async play(){const generation=++this.playGeneration;try{await this.player.play();if(generation===this.playGeneration){this.blocked=false;this.onChange?.()}}catch(error){if(generation!==this.playGeneration||error.name==='AbortError')return;this.blocked=true;this.onChange?.()}}
  loadTrack(){
    this.playGeneration++;this.player.pause();this.player.src='./audio/'+THEME_TRACKS[this.theme]+'?v=48';this.player.load();this.player.currentTime=0;this.player.volume=0;this.loadedTheme=this.theme;this.fade={phase:'in',elapsed:0};
    if(this.unlocked&&!this.hidden)this.play();this.onChange?.();
  }
  unlock(){this.unlocked=true;if(!this.theme||this.hidden)return;if(this.loadedTheme!==this.theme)this.loadTrack();else this.play();}
  setTheme(theme){
    if(!THEME_TRACKS[theme]||theme===this.theme)return;
    this.theme=theme;
    if(!this.loadedTheme||!this.unlocked||this.hidden||this.muted)this.loadTrack();
    else this.fade={phase:'out',elapsed:0,startVolume:this.player.volume};
    this.onChange?.();
  }
  update(dt){
    const target=this.muted||this.hidden?0:this.volume;
    if(this.fade?.phase==='out'){
      this.fade.elapsed+=Math.max(0,dt);this.player.volume=Math.min(target,this.fade.startVolume)*Math.max(0,1-this.fade.elapsed/.35);
      if(this.fade.elapsed>=.35)this.loadTrack();return;
    }
    if(this.fade?.phase==='in'){
      if(typeof this.player.readyState==='number'&&this.player.readyState<2){this.player.volume=0;return;}
      this.fade.elapsed+=Math.max(0,dt);this.player.volume=target*Math.min(1,this.fade.elapsed/.6);if(this.fade.elapsed>=.6)this.fade=null;
    }else this.player.volume=target;
  }
  setVolume(value){this.volume=Math.max(0,Math.min(1,value));this.save();}
  toggle(){this.muted=!this.muted;this.save();if(!this.muted)this.unlock();}
  save(){try{localStorage.setItem('ashen-rift-music',JSON.stringify({volume:this.volume,muted:this.muted}))}catch{}}
  visibility(hidden){this.hidden=hidden;if(hidden){this.playGeneration++;this.player.pause()}else if(this.unlocked&&this.theme&&!this.muted)this.unlock();}
}
export const music=typeof Audio==='undefined'?null:new RiftMusic();
if(music){
  const button=document.getElementById('music-toggle'),volume=document.getElementById('music-volume');
  const sync=()=>{button.textContent=music.blocked?'Enable music':music.muted?'Music off':'Music on';button.title=music.theme?'Soundtrack: '+THEME_TRACKS[music.theme]:'Music';button.setAttribute('aria-pressed',String(!music.muted));volume.value=String(Math.round(music.volume*100));};
  music.onChange=sync;button.onclick=()=>{if(music.blocked)music.unlock();else music.toggle();sync()};volume.oninput=()=>{music.setVolume(Number(volume.value)/100);if(!music.unlocked)music.unlock();};sync();
  document.addEventListener('visibilitychange',()=>music.visibility(document.hidden));window.addEventListener('pagehide',()=>music.visibility(true));
}
