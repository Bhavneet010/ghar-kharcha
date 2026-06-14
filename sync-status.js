// Cloud connection status, cross-device refresh, and automatic app updates.
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

  var APP_VERSION = 'v67';
  var updateReady = false, refreshing = false;

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
    var cloud = g(function(){return USE_CLOUD;}), s = g(function(){return sb;});
    var st = window.cloudSyncState;
    if (!cloud || !s) return ['warn','Cloud unavailable — tap to retry'];
    if (st && st.status==='error') return ['warn',(st.operation||'Cloud sync failed')+' — tap to retry'];
    if (st && (st.status==='loading'||st.status==='syncing') && st.operation==='Checking for changes from other devices') return null;
    if (st && (st.status==='loading'||st.status==='syncing')) return ['update',st.operation||'Syncing cloud data…'];
    return null;
  }
  function render(){
    var bar = ensureBar(), s = state();
    if (!s){ bar.className = 'syncbar hidden'; return; }
    bar.className = 'syncbar '+s[0];
    bar.innerHTML = '<span class="dot"></span><span>'+s[1]+'</span>';
  }
  async function manualSync(){
    if (updateReady){ location.reload(); return; }
    if (!g(function(){return USE_CLOUD;}) || !g(function(){return sb;})){ location.reload(); return; }
    var bar = ensureBar();
    bar.className = 'syncbar ok'; bar.innerHTML = '<span class="dot"></span><span>Syncing…</span>';
    if (typeof manualCloudSync==='function') await manualCloudSync('Manual cloud refresh');
    render();
  }
  function hasUnsavedInput(){
    var a = document.activeElement;
    if (a && (a.tagName==='INPUT'||a.tagName==='TEXTAREA') && a.value && a.value.trim()) return true;
    return Array.prototype.some.call(document.querySelectorAll('#view-shop input'),
      function(i){ return i.value && i.value.trim(); });
  }

  setInterval(render, 1000);

  // Automatic cross-device sync (a fallback for the realtime websocket, which
  // mobile browsers kill on background). Pulls from the cloud on a short timer
  // AND on any interaction/resume. diag lets the badge show if it's running.
  var diag = { ticks:0, lastTick:0, pulls:0, lastPull:0, skip:'', err:'' };
  var pulling = false;
  function cloudRefresh(){
    diag.ticks++; diag.lastTick = Date.now();
    if (document.hidden){ diag.skip='hidden'; return; }
    if (hasUnsavedInput()){ diag.skip='typing'; return; }
    if (window.appBusy){ diag.skip='saving'; return; }
    if (window.cloudSyncState && (window.cloudSyncState.status==='loading'||window.cloudSyncState.status==='syncing')){
      diag.skip='syncing'; return;
    }
    if (!g(function(){return USE_CLOUD;}) || !g(function(){return sb;})){ diag.skip='no-cloud'; return; }
    if (typeof manualCloudSync !== 'function'){ diag.skip='no-fn'; return; }
    if (pulling){ diag.skip='busy'; return; }
    diag.skip=''; pulling=true;
    Promise.resolve(manualCloudSync('Checking for changes from other devices')).then(function(ok){
      if (!ok) throw new Error('refresh failed');
      diag.pulls++; diag.lastPull = Date.now();
      diag.err = '';
    }).catch(function(e){ diag.err = (e&&(e.message||e.name))||'err'; })
      .then(function(){ pulling=false; });
  }
  setInterval(cloudRefresh, 8000);
  // Backstop: also pull on interaction/focus/resume (throttled), in case the
  // timer is throttled while the app is a backgrounded mobile PWA.
  var lastKick = 0;
  function kick(e){
    if (e && e.target && e.target.closest &&
        e.target.closest('#saveShop,#saveTop,#saveSal,[data-del],[data-retry-cloud]')) return;
    var n=Date.now(); if (n-lastKick<2500) return; lastKick=n; cloudRefresh();
  }
  ['pointerdown','touchstart','click'].forEach(function(ev){ window.addEventListener(ev, kick, true); });
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) cloudRefresh(); });
  window.addEventListener('focus', cloudRefresh);
  window.addEventListener('online', cloudRefresh);

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
        try{ if (g(function(){return USE_CLOUD;}) && g(function(){return sb;})) manualCloudSync('App resumed; refreshing cloud data'); }catch(e){}
      });
      setInterval(poll, 30*60*1000);
    });
  }

  // Tiny always-visible version badge. Tap it to run a live read-test and see
  // exactly what this device gets back from the cloud (for diagnosing sync).
  function addBadge(){
    if (document.getElementById('verBadge')) return;
    var b = document.createElement('button');
    b.id = 'verBadge'; b.textContent = APP_VERSION;
    b.style.cssText = 'position:fixed;right:6px;bottom:6px;z-index:99999;'
      + 'font:600 10px inherit;opacity:.5;background:transparent;border:none;'
      + 'color:var(--text);padding:5px;cursor:pointer';
    b.onclick = async function(){
      var L = ['Ghar Kharcha '+APP_VERSION];
      L.push('cloud='+(g(function(){return USE_CLOUD;})?'on':'off')
            +'  sb='+(g(function(){return sb;})?'yes':'no')
            +'  status='+((window.cloudSyncState&&window.cloudSyncState.status)||'unknown'));
      L.push('auto-pull: ticks='+diag.ticks+' pulls='+diag.pulls
            +' lastTick='+(diag.lastTick?Math.round((Date.now()-diag.lastTick)/1000)+'s':'never')
            +' lastPull='+(diag.lastPull?Math.round((Date.now()-diag.lastPull)/1000)+'s':'never')
            +(diag.skip?' skip='+diag.skip:'')+(diag.err?' err='+diag.err:''));
      var S = g(function(){return sb;});
      if (!S){ alert(L.join('\n')+'\n\nNo cloud client.'); return; }
      try{
        var t0 = Date.now();
        var r = await Promise.all([
          S.from('advances').select('*'),
          S.from('expenses').select('*'),
          S.from('salaries').select('*')
        ]);
        var ms = Date.now()-t0;
        L.push('read test ('+ms+'ms): advances='+(r[0].data?r[0].data.length:'?')
              +' expenses='+(r[1].data?r[1].data.length:'?')
              +' salaries='+(r[2].data?r[2].data.length:'?'));
        var errs = r.map(function(x){return x.error;}).filter(Boolean);
        if (errs.length) L.push('READ ERROR: '+errs.map(function(e){return (e.message||e.code||JSON.stringify(e));}).join(' | '));
        if (typeof manualCloudSync==='function'){ await manualCloudSync('Diagnostic cloud refresh'); L.push('applied to screen: ok'); }
      }catch(e){ L.push('EXCEPTION: '+(e&&(e.message||e.name||e))); }
      alert(L.join('\n'));
    };
    document.body.appendChild(b);
  }
  addBadge();

  ensureBar(); render();
})();
