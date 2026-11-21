(() => {
  'use strict';
  const endpoint = 'https://stankquilizer-observatory.stankquilizer.workers.dev/public-api/albums';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const canonical = value => String(value || '').trim().toLowerCase();
  const usableArtwork = value => /^https:\/\/raw\.githubusercontent\.com\/stankquilizer\/stankquilizer\/(?:main|codex\/site-hardening)\/[\w./-]+\.(?:png|jpe?g|webp|avif)$/i.test(value || '');

  function createCard(release) {
    const article = document.createElement('article');
    article.className = 'album';
    article.dataset.releaseId = release.id;
    article.dataset.databaseRelease = 'true';
    article.style.setProperty('--release-accent', release.accent || '#777777');
    article.innerHTML = '<div class="portal-art" aria-hidden="true"></div><div class="album-body"><div class="album-top"><div class="cover" aria-hidden="true"></div><div class="album-info"><div class="album-number"></div><h3></h3></div><div class="waveform" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div></div><div class="genre-tags" aria-label="genres"></div><div class="release-date"></div><div class="portal-info" aria-hidden="true"></div></div><a class="album-link" target="_blank" rel="noopener noreferrer"></a><span class="last-played-badge" aria-hidden="true">last played</span>';
    return article;
  }

  function updateCard(card, release) {
    card.dataset.releaseId = release.id;
    card.dataset.databaseRelease = 'true';
    card.style.setProperty('--release-accent', release.accent || '#777777');
    const features=release.features||{};
    for(const key of ['shuffle_enabled','keyboard_enabled','portal_enabled','glitch_enabled','memory_enabled','radio_eligible','artwork_reveal_enabled','cursor_tint_enabled','vhs_enabled'])card.dataset[key.replaceAll('_','-')]=features[key]===false?'false':'true';
    const title = card.querySelector('h3'); if (title) title.textContent = release.title;
    const url = release.destination === 'native' && release.tracks?.some(track => track.stream_type)
      ? '/album/' + encodeURIComponent(release.slug) : release.untitled_url;
    const link = card.querySelector('.album-link');
    if (link) { link.href = url || '#'; link.target = url?.startsWith('https://') ? '_blank' : '_self'; link.rel = 'noopener noreferrer'; link.textContent = release.destination === 'native' ? 'listen here' : 'listen →'; }
    const share = card.querySelector('.share-btn'); if (share && url) share.dataset.shareUrl = url;
    const artUrl = usableArtwork(release.artwork_url) ? release.artwork_url : '';
    const cover = card.querySelector('.cover'), portalArt = card.querySelector('.portal-art');
    if (cover) cover.style.backgroundImage = artUrl ? 'url("' + artUrl + '")' : '';
    if (portalArt) portalArt.style.backgroundImage = artUrl ? 'url("' + artUrl + '")' : '';
    const tags=card.querySelector('.genre-tags'); if(tags){tags.replaceChildren(...(release.genres||[]).map(genre=>{const span=document.createElement('span');span.className='genre-tag';span.textContent=genre;return span;}));}
    const date=card.querySelector('.release-date'); if(date) date.textContent=release.release_date ? 'released '+new Date(release.release_date+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}).toLowerCase() : 'tba';
    const portal=card.querySelector('.portal-info'); if(portal) portal.textContent=(release.track_count_override ?? release.tracks?.length ?? 0)+' tracks';
    if (!release.untitled_url && release.destination !== 'native') card.classList.add('is-draft');
    else card.classList.remove('is-draft');
    card.classList.toggle('is-featured',!!release.featured);
    card.dataset.albumFeatures=JSON.stringify(features);
  }

  function bindDynamicEffects(container) {
    if (container.dataset.catalogEffects) return;
    container.dataset.catalogEffects = '1';
    container.addEventListener('pointermove', event => {
      const card=event.target.closest('.album[data-database-release]'); if(!card) return;
      if(card.dataset.artworkRevealEnabled==='false')return;
      const rect=card.getBoundingClientRect(); if(!rect.width||!rect.height)return;
      card.style.setProperty('--mx',((event.clientX-rect.left)/rect.width*100)+'%');
      card.style.setProperty('--my',((event.clientY-rect.top)/rect.height*100)+'%');
    });
    container.addEventListener('pointerleave',event=>{const card=event.target.closest?.('.album[data-database-release]');if(card){card.style.setProperty('--mx','50%');card.style.setProperty('--my','50%');}},true);
    container.addEventListener('click',event=>{const link=event.target.closest('.album[data-database-release] .album-link');if(link)document.dispatchEvent(new CustomEvent('stankquilizer:album-open',{detail:{id:link.closest('.album').dataset.releaseId,href:link.href}}));});
    container.addEventListener('pointerover',event=>{const title=event.target.closest('.album[data-database-release] h3');if(!title||title.contains(event.relatedTarget)||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;const card=title.closest('.album');if(card.dataset.glitchEnabled==='false')return;const original=title.textContent;if(!/o/i.test(original))return;title.dataset.glitchOriginal=original;title.textContent=original.replace(/o/gi,'0');window.clearTimeout(Number(title.dataset.glitchTimer));title.dataset.glitchTimer=String(window.setTimeout(()=>{if(title.isConnected)title.textContent=title.dataset.glitchOriginal||original;},220));});
    container.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;const links=[...container.querySelectorAll('.album:not(.shuffle-album) .album-link')].filter(link=>link.closest('.album')?.dataset.keyboardEnabled!=='false');const i=links.indexOf(document.activeElement);if(i<0)return;event.preventDefault();links[(i+(['ArrowRight','ArrowDown'].includes(event.key)?1:links.length-1))%links.length]?.focus();});
  }

  async function refresh() {
    const container=document.querySelector('.albums'); if(!container)return;
    try {
      const response=await fetch(endpoint,{headers:{'if-none-match':sessionStorage.getItem('sq_album_etag')||''},credentials:'omit'});
      if(response.status===304)return;
      if(!response.ok)throw new Error('catalog unavailable');
      const etag=response.headers.get('etag');if(etag)sessionStorage.setItem('sq_album_etag',etag);
      const payload=await response.json(), releases=payload.releases||[];
      const shuffle=document.getElementById('shuffleBtn');
      for(const release of releases){
        let card=[...container.querySelectorAll('.album:not(.shuffle-album)')].find(node=>node.dataset.releaseId===release.id || canonical(node.querySelector('h3')?.textContent)===canonical(release.title));
        if(!card){card=createCard(release);container.insertBefore(card,shuffle||null);}
        updateCard(card,release);
      }
      bindDynamicEffects(container);
      document.dispatchEvent(new CustomEvent('stankquilizer:album-catalog-ready',{detail:{releases}}));
    } catch (_) { /* keep the built-in cards as an offline fallback */ }
  }
  refresh();
  setInterval(refresh,60000);
})();
