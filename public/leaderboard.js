import {t,setText,setHTML,setTitle,onLanguageChange} from './i18n.js?v=61';
const $=id=>document.getElementById(id);
let generation=0,runPromise=null,pending=null,saving=false;
const request=async(path,options={})=>{const response=await fetch(path,{...options,signal:AbortSignal.timeout(12000)});const body=await response.json();if(!response.ok)throw new Error(body.error||'Leaderboard unavailable');return body;};
export const scoreFor=({rifts,kills,level})=>rifts*10000+kills*100+(level-1)*250;
export function beginScoreRun(){
  generation++;const current=generation;pending=null;saving=false;
  $('scoreform').reset();$('scoreform').classList.remove('hidden');$('score-submit').disabled=false;setText($('score-status'), '');
  runPromise=request('/api/runs',{method:'POST'}).then(result=>({id:result.runId})).catch(error=>({error:error.message}));
  return current;
}
export function endScoreRun(stats){
  pending={...stats};setText($('runscore'), scoreFor(stats).toLocaleString());
  setText($('runstats'), `${stats.rifts} rifts cleared · ${stats.kills} kills · Level ${stats.level}`);
  setText($('score-status'), 'Enter your name to join the leaderboard, or start a new journey.');
  loadLeaderboard('end-scores');
}
export async function loadLeaderboard(target){
  const host=$(target);host.replaceChildren();const message=document.createElement('p');setText(message, 'Loading scores…');host.append(message);
  try{
    const {scores}=await request('/api/highscores');host.replaceChildren();
    if(!scores.length){setText(message, 'No scores yet. Be the first arcanist on the board.');host.append(message);return;}
    const table=document.createElement('table');table.className='score-table';table.setAttribute('data-i18n-skip','');
    const head=table.createTHead().insertRow();for(const title of ['#','Name','Score','Rifts']){const cell=document.createElement('th');cell.textContent=t(title);head.append(cell);}
    const body=table.createTBody();scores.forEach((score,i)=>{const row=body.insertRow();for(const value of [i+1,score.name,score.score.toLocaleString(),score.rifts])row.insertCell().textContent=value;});host.append(table);
  }catch{setText(message, 'Leaderboard unavailable.');const retry=document.createElement('button');setText(retry, 'Retry');retry.onclick=()=>loadLeaderboard(target);host.replaceChildren(message,retry);}
}
$('scoreform').addEventListener('submit',async event=>{
  event.preventDefault();if(!pending||saving)return;const current=generation,submission={...pending,name:$('score-name').value},registration=runPromise;saving=true;
  $('score-submit').disabled=true;setText($('score-status'), 'Saving your score…');
  try{
    const run=await registration;if(current!==generation)return;if(run?.error||!run?.id)throw new Error('This run could not connect to the leaderboard. Start a new journey when your connection is available.');
    const result=await request('/api/highscores',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...submission,runId:run.id})});
    if(current!==generation)return;
    setText($('score-status'), '{name} · {score} points · Rank #{rank}',{name:result.name,score:result.score.toLocaleString(),rank:result.rank});
    $('scoreform').classList.add('hidden');loadLeaderboard('end-scores');loadLeaderboard('start-scores');
  }catch(error){if(current===generation)setText($('score-status'), error.message||'Could not save. Please try again.');}
  finally{if(current===generation){saving=false;$('score-submit').disabled=false;}}
});
$('leaderboard-toggle').onclick=()=>{const panel=$('start-leaderboard');panel.classList.toggle('hidden');if(!panel.classList.contains('hidden'))loadLeaderboard('start-scores');};

onLanguageChange(()=>{for(const table of document.querySelectorAll('.score-table'))[...table.querySelectorAll('thead th')].forEach((cell,index)=>cell.textContent=t(['#','Name','Score','Rifts'][index]));});
