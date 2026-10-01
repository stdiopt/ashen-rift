const json = (body, status=200) => new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const database = env => {if(!env.DB)throw new Error('D1 unavailable');return env.DB;};
export async function handleApi(request, env) {
  const path = new URL(request.url).pathname, db=database(env);
  if(path==='/api/highscores' && request.method==='GET') {
    const {results}=await db.prepare('SELECT name, score, rifts, kills, level, seconds FROM highscores ORDER BY score DESC, rifts DESC, kills DESC, created_at ASC LIMIT 20').all();
    return json({scores:results});
  }
  if(request.method!=='POST')return json({error:'Not found'},404);
  if(request.headers.get('Origin') && request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Invalid origin'},403);
  if(path==='/api/runs') {
    const ip=request.headers.get('CF-Connecting-IP')||'unknown';
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));
    const visitor=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
    const now=Date.now();
    const recent=await db.prepare('SELECT COUNT(*) AS count FROM runs WHERE visitor=? AND started_at>?').bind(visitor,now-3600000).first();
    if(recent.count>=30)return json({error:'Too many runs. Try again later.'},429);
    const id=crypto.randomUUID();
    await db.batch([
      db.prepare('INSERT INTO runs (id, started_at, visitor) VALUES (?, ?, ?)').bind(id,now,visitor),
      db.prepare('DELETE FROM runs WHERE started_at<? AND id NOT IN (SELECT run_id FROM highscores)').bind(now-86400000),
    ]);
    return json({runId:id},201);
  }
  if(path!=='/api/highscores')return json({error:'Not found'},404);
  if(!request.headers.get('Content-Type')?.includes('application/json'))return json({error:'JSON required'},415);
  const raw=await request.text();if(raw.length>1024)return json({error:'Submission too large'},413);
  let data;try{data=JSON.parse(raw)}catch{return json({error:'Invalid submission'},400)}
  const {runId,kills,rifts,level,seconds}=data;
  const name=typeof data.name==='string'?data.name.normalize('NFKC').trim().replace(/\s+/gu,' '):'';
  if(!/^[\p{L}\p{N} ._'’-]{1,16}$/u.test(name))return json({error:'Use 1–16 letters, numbers or simple punctuation for your name.'},400);
  if(typeof runId!=='string'||runId.length>64||![kills,rifts,level,seconds].every(Number.isSafeInteger)||kills<0||kills>100000||rifts<0||rifts>1000||rifts>kills||level<1||level>kills+1||seconds<0||seconds>86400)return json({error:'Invalid run stats'},400);
  const run=await db.prepare('SELECT started_at FROM runs WHERE id=?').bind(runId).first();
  if(!run)return json({error:'This run could not be registered. Start a new journey.'},400);
  const elapsed=(Date.now()-run.started_at)/1000;
  if(elapsed>86400||seconds>elapsed+10||kills>elapsed*12+20||rifts>elapsed/10)return json({error:'Run stats could not be accepted'},400);
  const score=rifts*10000+kills*100+(level-1)*250;
  await db.prepare('INSERT INTO highscores (run_id, name, score, rifts, kills, level, seconds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(run_id) DO NOTHING').bind(runId,name,score,rifts,kills,level,seconds,Date.now()).run();
  const saved=await db.prepare('SELECT name, score FROM highscores WHERE run_id=?').bind(runId).first();
  const rank=await db.prepare('SELECT COUNT(*)+1 AS rank FROM highscores WHERE score>?').bind(saved.score).first();
  return json({...saved,rank:rank.rank});
}
export default {async fetch(request,env) {
  if(new URL(request.url).pathname.startsWith('/api/')) {
    try{return await handleApi(request,env)}catch(error){console.error('Leaderboard storage failed',error);return json({error:'Leaderboard unavailable. Please try again.'},503)}
  }
  return env.ASSETS.fetch(request);
}};
