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

  var APP_VERSION = 'v44';
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
    await robustFlush(true);
  }

  // Describe a queued op for an on-screen error report (no console needed).
  function opDesc(op){
    try{
      var o = op.payload || {};
      if (op.type==='advance') return 'Advance ₹'+o.amount+' on '+o.date+' (by '+o.paidBy+')';
      if (op.type==='expense') return 'Expense ₹'+o.total+' on '+o.date+' (by '+o.loggedBy+')';
      if (op.type==='salary')  return 'Salary '+o.month+' ₹'+o.amount+' (by '+o.paidBy+')';
      if (op.type==='config')  return 'Setting: '+op.key;
      if (op.type==='delete')  return 'Delete from '+op.table;
    }catch(e){}
    return op.type || 'entry';
  }
  function errMsg(e){ return (e && (e.message||e.details||e.hint||e.code)) || 'unknown error'; }

  // Self-healing flush: upload every queued entry independently so one bad
  // entry can't block the rest (the original flush stopped at the first
  // failure). Failed entries stay queued and are reported on screen.
  var flushingNow = false;
  async function robustFlush(showReport){
    if (flushingNow) return; flushingNow = true;
    try{
      var P = g(function(){return pendingOps;});
      if (!P || !P.length){
        try{ if (typeof cloudFetchAll==='function'){ await cloudFetchAll(); if(typeof renderAll==='function') renderAll(); } }catch(e){}
        flashSynced(); return;
      }
      var ops = P.slice(), remaining = [], report = [];
      var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for (var i=0;i<ops.length;i++){
        var op = ops[i];
        // A delete whose id is a local id (not a cloud UUID) can never match a
        // cloud row, so it would fail forever and jam the queue. The item is
        // already gone locally and was never in the cloud under that id — drop it.
        if (op.type==='delete' && (!op.id || !UUID_RE.test(String(op.id)))) continue;
        try{ await performCloudOp(op); }
        catch(e){
          if (op.type==='delete' && /invalid input syntax for type uuid/i.test(errMsg(e))) continue;
          remaining.push(op); report.push('• '+opDesc(op)+' → '+errMsg(e));
        }
      }
      P.length = 0; for (var j=0;j<remaining.length;j++) P.push(remaining[j]);
      try{ savePendingOps(); }catch(e){}
      try{ if (typeof cloudFetchAll==='function'){ await cloudFetchAll(); if(typeof renderAll==='function') renderAll(); } }catch(e){}
      if (!remaining.length){ try{ online = true; }catch(_){ } flashSynced(); }
      else {
        try{ online = false; }catch(_){ } render();
        if (showReport) alert(remaining.length+' entr'+(remaining.length>1?'ies':'y')+" couldn't sync (everything else did):\n\n"+report.join('\n')+"\n\nPlease screenshot this and send it to me.");
      }
    } finally { flushingNow = false; }
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

  // Automatic cross-device sync (a fallback for the realtime websocket, which
  // mobile browsers kill on background). Pulls from the cloud on a short timer
  // AND on any interaction/resume. diag lets the badge show if it's running.
  var diag = { ticks:0, lastTick:0, pulls:0, lastPull:0, skip:'', err:'' };
  var pulling = false;
  function cloudRefresh(){
    diag.ticks++; diag.lastTick = Date.now();
    if (document.hidden){ diag.skip='hidden'; return; }
    if (hasUnsavedInput()){ diag.skip='typing'; return; }
    if (!g(function(){return USE_CLOUD;}) || !g(function(){return sb;})){ diag.skip='no-cloud'; return; }
    if (typeof cloudFetchAll !== 'function'){ diag.skip='no-fn'; return; }
    if (pulling){ diag.skip='busy'; return; }
    diag.skip=''; pulling=true;
    Promise.resolve(cloudFetchAll()).then(function(){
      diag.pulls++; diag.lastPull = Date.now();
      if (typeof renderAll==='function') renderAll();
    }).catch(function(e){ diag.err = (e&&(e.message||e.name))||'err'; })
      .then(function(){ pulling=false; });
  }
  setInterval(cloudRefresh, 8000);
  // Backstop: also pull on interaction/focus/resume (throttled), in case the
  // timer is throttled while the app is a backgrounded mobile PWA.
  var lastKick = 0;
  function kick(){ var n=Date.now(); if (n-lastKick<2500) return; lastKick=n; cloudRefresh(); }
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
        try{ if (g(function(){return USE_CLOUD;}) && g(function(){return sb;})){ flushPendingOps(); cloudFetchAll().then(renderAll).catch(function(){}); } }catch(e){}
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
            +'  online='+g(function(){return online;})
            +'  pending='+((g(function(){return pendingOps;})||[]).length));
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
        if (typeof cloudFetchAll==='function'){ await cloudFetchAll(); if(typeof renderAll==='function') renderAll(); L.push('applied to screen: ok'); }
      }catch(e){ L.push('EXCEPTION: '+(e&&(e.message||e.name||e))); }
      alert(L.join('\n'));
    };
    document.body.appendChild(b);
  }
  addBadge();

  try{ flushPendingOps = robustFlush; }catch(e){}
  ensureBar(); render();
})();
