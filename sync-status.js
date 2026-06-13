// sync-status.js — visible cloud-sync status bar + automatic app updates.
// Loaded into the page by the service worker (see sw.js), so index.html does
// not need to change. Uses globals declared in index.html:
// USE_CLOUD, sb, online, pendingOps, flushPendingOps, cloudFetchAll, renderAll.
(function(){
  var css = `
  .syncbar{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;
    border:none;font-family:inherit;font-size:12px;font-weight:600;padding:7px 12px;
    cursor:pointer;text-align:center;line-height:1.3}
  .syncbar.hidden{display:none}
  .syncbar .dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
  .syncbar.ok{background:var(--info-bg);color:var(--accent)}
  .syncbar.ok .dot{background:var(--accent)}
  .syncbar.warn{background:var(--warn-bg);color:var(--warn)}
  .syncbar.warn .dot{background:var(--warn)}
  .syncbar.update{background:var(--info-bg);color:var(--accent)}
  .syncbar.update .dot{background:var(--accent);animation:syncpulse 1.2s ease-in-out infinite}
  @keyframes syncpulse{0%,100%{opacity:1}50%{opacity:.35}}`;
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var updateReady = false, syncedFlash = null, prevBad = false, refreshing = false;

  function ensureBar(){
    var bar = document.getElementById('syncBar');
    if (bar) return bar;
    bar = document.createElement('button');
    bar.id = 'syncBar'; bar.className = 'syncbar hidden';
    bar.setAttribute('aria-live','polite');
    bar.onclick = manualSync;
    var header = document.querySelector('#app header') || document.querySelector('header');
    if (header && header.parentNode) header.parentNode.insertBefore(bar, header.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);
    return bar;
  }
  function g(fn){ try{ return fn(); }catch(e){ return undefined; } }
  function state(){
    if (updateReady) return ['update','New version ready — tap to update'];
    var cloud = g(function(){return USE_CLOUD;}), s = g(function(){return sb;}),
        p = g(function(){return pendingOps;}), on = g(function(){return online;});
    if (!cloud || !s) return ['warn','Local only — not syncing to other devices'];
    if (p && p.length) return ['warn', p.length+' change'+(p.length>1?'s':'')+' waiting — tap to retry'];
    if (on === false) return ['warn','Offline — tap to retry'];
    if (syncedFlash) return ['ok','Synced ✓'];
    return null;
  }
  function render(){
    var bar = ensureBar(), s = state();
    if (!s){ bar.className = 'syncbar hidden'; return; }
    bar.className = 'syncbar '+s[0];
    bar.innerHTML = '<span class="dot"></span><span>'+s[1]+'</span>';
  }
  function flashSynced(){
    syncedFlash = true; render();
    clearTimeout(flashSynced._t);
    flashSynced._t = setTimeout(function(){ syncedFlash = null; render(); }, 2500);
  }
  async function manualSync(){
    if (updateReady){ location.reload(); return; }
    if (!g(function(){return USE_CLOUD;}) || !g(function(){return sb;})){ location.reload(); return; }
    var bar = ensureBar();
    bar.className = 'syncbar ok'; bar.innerHTML = '<span class="dot"></span><span>Syncing…</span>';
    try{
      if (typeof flushPendingOps === 'function') await flushPendingOps();
      if (typeof cloudFetchAll === 'function') await cloudFetchAll();
      if (typeof renderAll === 'function') renderAll();
      flashSynced();
    }catch(e){ try{ online = false; }catch(_){ } render(); }
  }
  function hasUnsavedInput(){
    var a = document.activeElement;
    if (a && (a.tagName==='INPUT'||a.tagName==='TEXTAREA') && a.value && a.value.trim()) return true;
    return Array.prototype.some.call(document.querySelectorAll('#view-shop input'),
      function(i){ return i.value && i.value.trim(); });
  }

  // Light poll keeps the bar current and flashes "Synced ✓" on recovery.
  setInterval(function(){
    var bad = false;
    try{ bad = g(function(){return USE_CLOUD;}) && (!g(function(){return sb;}) || (g(function(){return pendingOps;})&&pendingOps.length) || g(function(){return online;})===false); }catch(e){}
    if (prevBad && !bad && !updateReady) flashSynced();
    prevBad = bad; render();
  }, 1500);

  // ---- automatic updates: pick up new versions without a manual hard refresh ----
  if ('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('controllerchange', function(){
      if (refreshing || !updateReady) return;
      refreshing = true;
      if (!hasUnsavedInput()) location.reload();
    });
    navigator.serviceWorker.getRegistration().then(function(reg){
      if (!reg) return;
      reg.addEventListener('updatefound', function(){
        var nw = reg.installing; if(!nw) return;
        nw.addEventListener('statechange', function(){
          if (nw.state==='installed' && navigator.serviceWorker.controller){ updateReady = true; render(); }
        });
      });
      var poll = function(){ try{ reg.update(); }catch(e){} };
      poll();
      document.addEventListener('visibilitychange', function(){
        if (document.hidden) return;
        poll();
        try{ if (g(function(){return USE_CLOUD;}) && g(function(){return sb;})){ flushPendingOps(); cloudFetchAll().then(renderAll).catch(function(){}); } }catch(e){}
      });
      setInterval(poll, 30*60*1000);
    });
  }

  ensureBar(); render();
})();
