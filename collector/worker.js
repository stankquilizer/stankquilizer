const ORIGIN = "https://stankquilizer.stankquilizer.workers.dev";
const ALLOWED_TYPES = new Set([
  "session_start","session_end","radio_play","track_started","track_changed","meaningful_play","track_completed","track_skipped",
  "player_toggle","shuffle","theme_toggle","share","fullscreen_open","fullscreen_close","album_entered","title_interaction",
  "reset_action","page_hidden","page_visible","memory_snapshot","site_state","temperature_change","archetype_change","rediscovery",
  "avoidance_change","affinity_change","decay","memory_ghost","memory_corruption","milestone","unlock","completion",
  "session_evolution","late_night","analyser_state","gain_change","media_session","volume_change","playback_error","qa_event"
]);
const requestOrigin=req=>req.headers.get('Origin')||'';
const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json","cache-control":"no-store","Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"content-type","Access-Control-Max-Age":"86400"}});
export default {async fetch(req,env){
  const u=new URL(req.url);
  if(req.method==='OPTIONS') return json({},204);
  if(u.pathname!=='/collect'||req.method!=='POST') return json({error:'not found'},404);
  if(requestOrigin(req)!==ORIGIN) return json({error:'forbidden origin'},403);
  if(u.origin===ORIGIN){};
  let body; try{body=await req.json()}catch{return json({error:'bad json'},400)}
  if(!Array.isArray(body?.events)) return json({error:'events required'},400);
  const events=body.events.slice(0,25), now=Date.now(), stm=[];
  for(const e of events){
    if(!e||typeof e!=='object') continue;
    const sid=String(e.sessionId||'').slice(0,64), vid=String(e.visitorKey||'').slice(0,64);
    if(!/^[a-f0-9]{12,64}$/i.test(sid)||!/^[a-f0-9]{12,64}$/i.test(vid)) continue;
    const type=String(e.type||'').slice(0,64); if(!ALLOWED_TYPES.has(type)) continue;
    const surface=String(e.surface||'').slice(0,40), subject=String(e.subject||'').slice(0,120);
    const ts=Math.max(now-30*864e5,Math.min(now,Number(e.ts)||now));
    const meta=JSON.stringify(e.meta&&typeof e.meta==='object'?e.meta:{});
    if(meta.length>3000) continue;
    stm.push(env.DB.prepare('INSERT INTO events(session_id,ts,type,surface,subject,meta_json) VALUES(?,?,?,?,?,?)').bind(sid,ts,type,surface,subject,meta));
    stm.push(env.DB.prepare(`INSERT INTO sessions(id,visitor_key,started_at,last_seen,build,event_count) VALUES(?,?,?,?,?,1)
      ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen,event_count=sessions.event_count+1,build=excluded.build`).bind(sid,vid,ts,ts,String(e.build||'unknown').slice(0,50)));
  }
  if(stm.length) await env.DB.batch(stm);
  return json({ok:true,accepted:Math.floor(stm.length/2)},202);
}};
