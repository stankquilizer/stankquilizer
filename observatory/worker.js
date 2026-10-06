const COOKIE='sq_obs';
const enc=new TextEncoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const ub64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
async function mac(secret,data){const k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);return crypto.subtle.sign('HMAC',k,enc.encode(data));}
async function makeCookie(secret){const value=b64(crypto.getRandomValues(new Uint8Array(18)));const exp=Date.now()+8*3600e3;const sig=b64(await mac(secret,value+'.'+exp));return `${value}.${exp}.${sig}`}
async function validCookie(secret,c){if(!c)return false;const [v,e,s]=c.split('.');if(!v||!e||!s||Number(e)<Date.now())return false;const expected=await mac(secret,v+'.'+e);const got=ub64(s);const exp=new Uint8Array(expected); if(got.length!==exp.length)return false; let d=0; for(let i=0;i<exp.length;i++) d|=got[i]^exp[i]; return d===0}
const headers={'content-type':'application/json','cache-control':'no-store'};
const json=(x,s=200,h={})=>new Response(JSON.stringify(x),{status:s,headers:{...headers,...h}});
const page=async(env)=>env.ASSETS.fetch(new Request(new URL('/index.html','https://observatory.local')));
async function auth(req,env){const c=req.headers.get('Cookie')||'';const m=c.match(new RegExp(`${COOKIE}=([^;]+)`));return !!(env.OBSERVATORY_PASSWORD&&await validCookie(env.OBSERVATORY_PASSWORD,m?.[1]||''))}
export default {async fetch(req,env){
 const u=new URL(req.url);
 if(u.pathname==='/api/login'&&req.method==='POST'){
   let b={};try{b=await req.json()}catch{}
   if(!env.OBSERVATORY_PASSWORD||b.password!==env.OBSERVATORY_PASSWORD)return json({ok:false},401);
   const cookie=await makeCookie(env.OBSERVATORY_PASSWORD);
   return json({ok:true},200,{'set-cookie':`${COOKIE}=${cookie}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`});
 }
 if(u.pathname==='/api/logout'){return json({ok:true},200,{'set-cookie':`${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`})}
 if(u.pathname.startsWith('/api/')){
   if(!(await auth(req,env)))return json({error:'unauthorized'},401);
   if(u.pathname==='/api/health')return json({ok:true,time:Date.now()});
   if(u.pathname==='/api/overview'){
     const since=Date.now()-864e5; const q=await env.DB.batch([
       env.DB.prepare('SELECT COUNT(*) n FROM sessions WHERE started_at>=?').bind(since),env.DB.prepare("SELECT COUNT(*) n FROM events WHERE ts>=? AND type='meaningful_play'").bind(since),
       env.DB.prepare("SELECT COUNT(*) n FROM events WHERE ts>=? AND type='track_completed'").bind(since),env.DB.prepare("SELECT COUNT(*) n FROM events WHERE ts>=? AND type='track_skipped'").bind(since),
       env.DB.prepare('SELECT COUNT(*) n FROM events WHERE ts>=?').bind(since),env.DB.prepare("SELECT COUNT(*) n FROM events WHERE ts>=? AND type='rediscovery'").bind(since),
       env.DB.prepare('SELECT COUNT(DISTINCT session_id) n FROM events WHERE ts>=? AND type IN (\'track_started\',\'radio_play\')').bind(since)
     ]);return json({sessions:q[0].results[0].n,meaningfulPlays:q[1].results[0].n,completions:q[2].results[0].n,skips:q[3].results[0].n,events:q[4].results[0].n,rediscoveries:q[5].results[0].n,radioSessions:q[6].results[0].n});
   }
   if(u.pathname==='/api/events'){const l=Math.min(200,Math.max(1,+u.searchParams.get('limit')||50));return json((await env.DB.prepare('SELECT * FROM events ORDER BY ts DESC LIMIT ?').bind(l).all()).results)}
   if(u.pathname==='/api/sessions'){const l=Math.min(100,Math.max(1,+u.searchParams.get('limit')||50));return json((await env.DB.prepare('SELECT * FROM sessions ORDER BY last_seen DESC LIMIT ?').bind(l).all()).results)}
   if(u.pathname==='/api/deployments'&&req.method==='POST'){let b={};try{b=await req.json()}catch{};await env.DB.prepare('INSERT INTO deployments(created_at,build,ref,note) VALUES(?,?,?,?)').bind(Date.now(),String(b.build||'').slice(0,80),String(b.ref||'').slice(0,120),String(b.note||'').slice(0,500)).run();return json({ok:true},201)}
   if(u.pathname==='/api/deployments'&&req.method==='GET'){return json((await env.DB.prepare('SELECT * FROM deployments ORDER BY created_at DESC LIMIT 100').all()).results)}
   if(u.pathname==='/api/flags'&&req.method==='POST'){let b={};try{b=await req.json()}catch{};await env.DB.prepare('INSERT INTO feature_flags(name,enabled,updated_at) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at').bind(String(b.name||'').slice(0,100),b.enabled?1:0,Date.now()).run();return json({ok:true})}
   if(u.pathname==='/api/flags'&&req.method==='GET'){return json((await env.DB.prepare('SELECT * FROM feature_flags ORDER BY name').all()).results)}
   if(u.pathname==='/api/qa'&&req.method==='POST'){let b={};try{b=await req.json()}catch{};const sid='qa'+crypto.randomUUID().replaceAll('-','').slice(0,30);const now=Date.now();await env.DB.prepare('INSERT INTO sessions(id,visitor_key,started_at,last_seen,build,event_count) VALUES(?,?,?,?,?,1)').bind(sid,'qa'+sid,now,now,'observatory-qa').run();await env.DB.prepare('INSERT INTO events(session_id,ts,type,surface,subject,meta_json) VALUES(?,?,?,?,?,?)').bind(sid,now,'qa_event','system',String(b.scenario||'scenario').slice(0,120),JSON.stringify({synthetic:true,scenario:b.scenario||'scenario'})).run();return json({ok:true,sessionId:sid},201)}
   if(u.pathname==='/api/feature-counts'){return json((await env.DB.prepare('SELECT type,COUNT(*) count FROM events GROUP BY type ORDER BY count DESC').all()).results)}
   if(u.pathname==='/api/session-events'){const id=u.searchParams.get('id')||'';return json((await env.DB.prepare('SELECT * FROM events WHERE session_id=? ORDER BY ts').bind(id).all()).results)}
   return json({error:'not found'},404);
 }
 const r=await env.ASSETS.fetch(req); const h=new Headers(r.headers); h.set('x-content-type-options','nosniff'); h.set('x-frame-options','DENY'); h.set('referrer-policy','no-referrer'); h.set('content-security-policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"); return new Response(r.body,{status:r.status,headers:h});
}};
