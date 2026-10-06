/* stankquilizer — observatory telemetry bridge (additive; never replaces the public site) */
(() => {
  'use strict';
  const ENDPOINT = window.STANKQUILIZER_TELEMETRY_ENDPOINT || 'https://telemetry.stankquilizer.workers.dev/collect';
  const BUILD = window.STANKQUILIZER_BUILD || 'public-current';
  const SESSION_KEY='stankquilizer_observatory_session', VISITOR_KEY='stankquilizer_observatory_visitor';
  const started=Date.now(), queue=[]; let timer=null, ended=false;
  const id=bytes=>{try{const a=new Uint8Array(bytes);crypto.getRandomValues(a);return [...a].map(x=>x.toString(16).padStart(2,'0')).join('')}catch{return Math.random().toString(16).slice(2)+Date.now().toString(16)}};
  const get=(s,k)=>{try{return s.getItem(k)}catch{return null}}; const set=(s,k,v)=>{try{s.setItem(k,v)}catch{}};
  let sessionId=get(sessionStorage,SESSION_KEY); if(!sessionId){sessionId=id(12);set(sessionStorage,SESSION_KEY,sessionId)}
  let visitorKey=get(localStorage,VISITOR_KEY); if(!visitorKey){visitorKey=id(12);set(localStorage,VISITOR_KEY,visitorKey)}
  const clean=(v,n=120)=>String(v??'').slice(0,n);
  const send=(type,surface='',subject='',meta={})=>{queue.push({sessionId,visitorKey,ts:Date.now(),build:clean(BUILD,50),type:clean(type,64),surface:clean(surface,40),subject:clean(subject),meta:meta&&typeof meta==='object'?meta:{}});flushSoon()};
  const flush=()=>{timer=null;if(!queue.length)return;const body=JSON.stringify({events:queue.splice(0,25)});try{if(navigator.sendBeacon){const ok=navigator.sendBeacon(ENDPOINT,new Blob([body],{type:'application/json'}));if(ok)return}}catch{} fetch(ENDPOINT,{method:'POST',mode:'cors',headers:{'content-type':'application/json'},body,keepalive:true}).catch(()=>{})};
  const flushSoon=()=>{if(!timer)timer=setTimeout(flush,700)};
  window.stankquilizerObservatory={send,flush,sessionId};
  send('session_start','system','');

  const audio=document.getElementById('playerAudio'); const track=document.getElementById('playerTrack'); const album=document.getElementById('playerAlbum'); const fs=document.getElementById('fullscreenPlayer');
  let lastTrack='', meaningful=false, playStarted=0;
  const current=()=>({track:clean(track?.textContent),album:clean(album?.textContent)});
  const observeTrack=()=>{const c=current();if(!c.track||c.track===lastTrack)return;lastTrack=c.track;meaningful=false;playStarted=Date.now();send('track_started','radio',c.track,{album:c.album})};
  if(track||album)new MutationObserver(observeTrack).observe(track||album,{childList:true,subtree:true,characterData:true});
  audio?.addEventListener('play',()=>{observeTrack();send('radio_play','radio',current().track,{album:current().album})});
  audio?.addEventListener('pause',()=>send('radio_pause','radio',current().track));
  audio?.addEventListener('timeupdate',()=>{if(!meaningful&&audio.currentTime>=10){meaningful=true;send('meaningful_play','radio',current().track,{seconds:10,album:current().album})}});
  audio?.addEventListener('ended',()=>send('track_completed','radio',current().track,{album:current().album}));
  audio?.addEventListener('error',()=>send('playback_error','radio',current().track));
  document.getElementById('playerNext')?.addEventListener('click',()=>send('track_skipped','radio',current().track,{album:current().album}));
  document.getElementById('playerToggle')?.addEventListener('click',()=>send('player_toggle','radio',current().track));
  document.getElementById('shuffleBtn')?.addEventListener('click',()=>send('shuffle','radio'));
  document.getElementById('themeToggle')?.addEventListener('click',()=>send('theme_toggle','ui',document.documentElement.getAttribute('data-theme')||''));
  fs&&new MutationObserver(()=>send(fs.classList.contains('is-open')?'fullscreen_open':'fullscreen_close','radio',current().track,{album:current().album})).observe(fs,{attributes:true,attributeFilter:['class']});
  document.addEventListener('click',e=>{
    const a=e.target.closest('a.album-link,.album,.album-card,[data-album]'); if(a)send('album_entered','album',clean(a.getAttribute('data-album')||a.querySelector('h3,h2')?.textContent||a.textContent));
    const title=e.target.closest('h1,h2,.site-title,.brand-title'); if(title)send('title_interaction','ui',clean(title.textContent));
    const reset=e.target.closest('[data-c5-soft],[data-c5-full],[data-c5-rebirth],#memoryReset,#c5ResetPortal'); if(reset)send('reset_action','memory',clean(reset.textContent));
  },true);
  document.addEventListener('visibilitychange',()=>send(document.hidden?'page_hidden':'page_visible','system'));
  window.addEventListener('pagehide',()=>{if(ended)return;ended=true;send('session_end','system','',{durationMs:Date.now()-started});flush()});
  window.addEventListener('beforeunload',()=>{if(!ended){ended=true;send('session_end','system','',{durationMs:Date.now()-started});flush()}});
  // Optional additive hook: Category 5 systems can emit CustomEvents without exposing their private profile.
  window.addEventListener('stankquilizer:telemetry',e=>{const d=e.detail||{};if(typeof d.type==='string')send(d.type,d.surface||'system',d.subject||'',d.meta||{})});
})();
