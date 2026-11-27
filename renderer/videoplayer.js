'use strict';
// Video player tab (2.3.0): playlist, resume position, bookmarks, recent files, saved playlists,
// subtitles (SRT/VTT/ASS next to the video or chosen by hand, delay, size, colour) and the Suite's equaliser on the video's sound.
// Local files stream through the read-only wfmedia: protocol of the main process; the pure helpers live in vplib.js (unit-tested).

(function () {
  const VP = window.WaveframeVp;
  const api = window.waveframe;
  const $ = (id) => document.getElementById(id);
  const K = { recent: 'waveframe.video.recent', resume: 'waveframe.video.resume', bookmarks: 'waveframe.video.bookmarks', subs: 'waveframe.video.subs', playlists: 'waveframe.video.playlists', speed: 'waveframe.video.speed', queue: 'waveframe.video.queue' };
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* storage unavailable */ } };
  const fmt = (s, vars) => Object.entries(vars || {}).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

  let session = null, playbackEngine = null;
  let ab = { stage: 'off', a: 0, b: 0 }, pic = { brightness: 100, contrast: 100, saturation: 100, rotate: 0, flipH: false, flipV: false }, stopAfter = false;
  let generation = 0, subRevision = 0, resumePath = null, eventController = null, activeTicket = null, nativeSubtitleTrack = null;
  let video, list = [], idx = -1, subSrc = [], subSel = -1, subDelay = 0, subScale = 1, subFps=0, saveTimer = 0, built = false, fx = null;

  const say = (text) => { const e = $('vpStatus'); if (e) e.textContent = text || ''; };
  const current = () => (idx >= 0 ? list[idx] : null);

  /* ---------------- playlist ---------------- */
  function renderList() {
    const ul = $('vpList'); ul.textContent = '';
    list.forEach((p, i) => {
      const li = document.createElement('li'); if (i === idx) li.classList.add('current');
      const b = document.createElement('button'); b.className = 'vp-name'; b.textContent = VP.titleOf(p); b.title = p; b.addEventListener('click', () => playAt(i));
      const x = document.createElement('button'); x.className = 'vp-x'; x.textContent = '✕'; x.setAttribute('aria-label', t('vp.remove')); x.addEventListener('click', () => removeAt(i));
      li.append(b, x); ul.append(li);
    });
    put(K.queue, list.slice(0, VP.LIMITS.playlist));
  }
  function addPaths(paths, play) {
    const ok = (paths || []).filter(VP.playable);
    if (!ok.length) { say(t('vp.unsupported')); return; }
    const first = list.length;
    for (const p of ok) if (list.length < VP.LIMITS.playlist) list.push(p);
    renderList();
    if (play && first < list.length) playAt(first);
  }
  function removeAt(i) {
    if (i === idx) { stop(); idx = -1; }
    else if (i < idx) idx--;
    list.splice(i, 1);
    renderList();
  }
  function chromiumAdapter() {
    const el=video;
    let opening=null,closed=false;
    return {
      open(source){return new Promise(resolve=>{
        if(closed){resolve({ok:false});return;}
        let timer; const finish=ok=>{clearTimeout(timer);el.removeEventListener('loadeddata',loaded);el.removeEventListener('error',failed);opening=null;resolve({ok});};
        const loaded=()=>finish(true),failed=()=>finish(false);opening=failed;
        el.addEventListener('loadeddata',loaded,{once:true});el.addEventListener('error',failed,{once:true});
        timer=setTimeout(failed,15000);el.src=source;el.load();
      });},
      play:()=>el.play(),pause:()=>el.pause(),seek:seconds=>{if(Number.isFinite(el.duration))el.currentTime=Math.max(0,Math.min(el.duration,seconds));},
      stop:()=>el.pause(),dispose:()=>{if(closed)return;closed=true;if(opening)opening();el.pause();el.removeAttribute('src');el.load();}
    };
  }
  function releaseTicket() { if (activeTicket) { api.vpReleaseSource(activeTicket).catch(() => {}); activeTicket = null; } }
  function stop() { stopNative();saveResume(); releaseTicket(); ++generation; if(session)session.stop().catch(()=>{}); playbackEngine=null; resumePath = null; ab = { stage: 'off', a: 0, b: 0 }; seeking = false; clearSubs(); video.pause(); video.removeAttribute('src'); video.load(); $('vpFrame').classList.remove('has-media'); syncTime(); syncTransport(); }

  let handoff=null,nativePoll=null;
  async function nativeHandoff(engine,p,g){
    if(handoff||!p||VP.isUrl(p))return false;
    const wasPlaying=!video.paused,pos=Number.isFinite(video.currentTime)?Math.round(video.currentTime*1000):0;
    const resume=pos||Number(get(K.resume,{})[p])||0;
    saveResume();video.pause();
    const marker={p,g,session:null,commands:[],dispatching:false};handoff=marker;
    $('vpNativeStop').hidden=false;
    say(engine+' — opening native player…');
    const sub=subSrc[subSel];
    const text=engine==='libvlc'&&sub?VP.exportSubtitles(VP.subtitleToVtt(sub.text,sub.ext,subDelay*1000,subScale,subFps).entries,'srt'):null;
    marker.subtitle={track:sub,text:sub?.text,scale:subScale,fps:subFps,delay:subDelay,transferred:!!text,requested:0};
    marker.subtitleDesired=marker.subtitle;
    const r=await api.vpNativeOpen(p,engine,resume,text||null).catch(()=>null);
    if(handoff!==marker||g!==generation)return false;
    if(!r?.ok){handoff=null;$('vpNativeStop').hidden=true;say(engine+' — '+(r?.code||'unavailable'));if(wasPlaying)video.play().catch(()=>{});return false;}
    marker.session=r.session;marker.engine=engine;marker.subtitle.accepted=r.subtitleAccepted===true;playbackEngine=engine;resumePath=null;
    say(engine+' — native playback ready'+(text?(r.subtitleAccepted?' · synced subtitle accepted':' · subtitle not accepted'):'')+(engine!=='libvlc'&&sub?' · subtitle handoff unavailable':''));
    const poll=async()=>{
      if(handoff!==marker)return;
      const s=await api.vpNativeStatus().catch(()=>null);
      if(handoff!==marker)return;
      if(s?.session===marker.session&&s.durationMs>0){const map=get(K.resume,{}),act=VP.resumeAction(s.positionMs,s.durationMs);if(act==='save'){map[p]=Math.round(s.positionMs);put(K.resume,VP.limitResume(map));}else if(act==='clear'){delete map[p];put(K.resume,map);}}
      if(s?.session===marker.session){marker.status=s;syncTime();syncTransport();if(!seeking&&Number.isFinite(s.volume))$('vpVolume').value=String(s.volume);}
      if(!s||['closed','error','stopping'].includes(s.phase)||s.session!==marker.session){handoff=null;playbackEngine=null;$('vpNativeStop').hidden=true;syncTime();syncTransport();say(engine+(s?.phase==='error'?' — native playback failed':' — native window closed'));return;}
      nativePoll=setTimeout(poll,1000);
    };
    syncNativeSubtitle();poll();return true;
  }
  // Serialize transport commands per handoff instead of silently dropping fast clicks.
  async function drainNativeCommands(marker){
    if(marker.dispatching)return;marker.dispatching=true;
    try{
      while(handoff===marker&&marker.commands.length){
        const {name,value}=marker.commands.shift();
        let result;
        if(name==='subtitle-sync'){
          const base=marker.subtitle,next=value;
          const same=base.track===next.track&&base.text===next.text&&base.scale===next.scale&&base.fps===next.fps;
          const delta=Math.round((next.delay-base.delay)*1000);
          if(same&&delta===base.requested)continue;
          if(same&&base.transferred&&base.accepted&&base.delay>=0){
            result=await api.vpNativeCommand(marker.session,'subtitle-delay',delta).catch(()=>null);
            if(result?.ok)base.requested=delta;
          }else{
            const body=next.track?VP.exportSubtitles(VP.subtitleToVtt(next.text,next.track.ext,next.delay*1000,next.scale,next.fps).entries,'srt'):null;
            result=next.track&&!body?{ok:false,code:'no-valid-cues'}:await api.vpNativeSubtitle(marker.session,body).catch(()=>null);
            if(result?.ok)marker.subtitle={...next,transferred:!!body,accepted:!!body,requested:0};
          }
          if(handoff!==marker)return;
          if(marker.subtitleDesired===next)say(result?.ok?'LibVLC subtitle update accepted / Ελέγξτε την εμφάνιση':'Subtitle update failed: '+(result?.code||'unavailable'));
        }else result=await api.vpNativeCommand(marker.session,name,value).catch(()=>null);
        if(handoff!==marker)return;
        if(!result?.ok){if(name!=='subtitle-sync')say('Native command unavailable');if(!result||['timeout','unavailable','pipe-error','native-closed','native-playback-failed'].includes(result.code)){marker.commands.length=0;break;}}
      }
    }finally{marker.dispatching=false;}
  }
  function nativeCommand(name,value){
    const marker=handoff;if(!marker?.session)return;
    const queue=marker.commands,last=queue[queue.length-1];
    if(last?.name===name&&['seek','volume','rate','subtitle-sync'].includes(name))last.value=value;
    else if(queue.length<8)queue.push({name,value});
    else{say('Native command queue full');return false;}
    drainNativeCommands(marker);return true;
  }
  function syncNativeSubtitle(){
    const m=handoff;if(!m?.session||!m.subtitle)return;
    const track=subSrc[subSel],next={track,text:track?.text,scale:subScale,fps:subFps,delay:subDelay};
    const last=m.subtitleDesired;
    if(last.track===next.track&&last.text===next.text&&last.scale===next.scale&&last.fps===next.fps&&last.delay===next.delay)return;
    if(m.engine!=='libvlc'){say(m.engine+' subtitle handoff unavailable');return;}
    if(nativeCommand('subtitle-sync',next))m.subtitleDesired=next;
  }
  function stopNative(){if(!handoff)return;handoff=null;clearTimeout(nativePoll);playbackEngine=null;$('vpNativeStop').hidden=true;api.vpNativeStop().catch(()=>{});}
  async function playAt(i) {
    if (i < 0 || i >= list.length) return;
    stopNative();saveResume(); releaseTicket();
    const g = ++generation;
    if(session)session.stop().catch(()=>{}); playbackEngine=null;
    resumePath = null; ab = { stage: 'off', a: 0, b: 0 }; seeking = false;
    idx = i; const p = list[i];
    clearSubs();
    // A media element bound to Web Audio remains bound even after bypass. Replace
    // it on source change, so non-CORS streams have a fresh native audio path.
    const restoreFx = !VP.isUrl(p) && $('vpFx').getAttribute('aria-pressed') === 'true';
    replaceVideo();
    renderList(); renderBookmarks();
    const source = VP.isUrl(p) ? p : await api.vpOpenSource(p).catch(() => null);
    if (g !== generation) { if (source && !VP.isUrl(p)) api.vpReleaseSource(source).catch(() => {}); return; }
    if (!source) { $('vpFrame').classList.remove('has-media'); say(t('vp.cantPlay')); return; }
    if (!VP.isUrl(p)) { video.crossOrigin = 'anonymous'; activeTicket = source; }
    session = new window.OpsisPlayback.PlaybackSession({chromium: chromiumAdapter});
    const opening=session.open(source,{local:!VP.isUrl(p)});
    // The adapter sets the source synchronously on its first microtask. Wait
    // for actual decoded data before declaring the engine ready.
    if (!VP.isUrl(p)) loadSiblingSubs(p, g, subRevision);
    const result=await opening;
    if(g!==generation)return;
    if(!result.ok){releaseTicket();say(t('vp.cantPlay'));if(!VP.isUrl(p)&&$('vpNativeFallback').checked){await nativeHandoff('libvlc',p,g);}return;}
    playbackEngine=result.engine;
    if (restoreFx) toggleFx();
    $('vpFrame').classList.add('has-media');
    video.playbackRate = Number($('vpSpeed').value) || 1;
    renderList(); renderBookmarks();
    put(K.recent, VP.pushRecent(get(K.recent, []), p)); fillRecent();
    say(fmt(t('vp.playing'), { name: VP.titleOf(p) }));
    window.dispatchEvent(new CustomEvent('waveframe:video-playing'));
    session.play().catch(err => { if (g === generation && err.name !== 'AbortError') say(t('vp.cantPlay') + ' (' + err.name + ')'); });
    refreshFx();
  }
  const next = (d) => { if (list.length) playAt((idx + d + list.length) % list.length); };

  /* ---------------- resume ---------------- */
  function saveResume() {
    const it = resumePath; if (!it || it !== current() || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const pos = video.currentTime * 1000, act = VP.resumeAction(pos, video.duration * 1000);
    const map = get(K.resume, {});
    if (act === 'save') { const value = Math.round(pos); if (map[it] === value) return; map[it] = value; } else if (act === 'clear') { if (!Object.hasOwn(map, it)) return; delete map[it]; } else return;
    put(K.resume, VP.limitResume(map));
  }

  /* ---------------- bookmarks ---------------- */
  function renderBookmarks() {
    const ul = $('vpBookmarks'); ul.textContent = '';
    const it = current(); if (!it) return;
    for (const b of VP.sortedBookmarks(get(K.bookmarks, []), it)) {
      const li = document.createElement('li');
      const go = document.createElement('button'); go.className = 'vp-name'; go.textContent = VP.clock(b.ms); go.addEventListener('click', () => { seekTo(b.ms / 1000); });
      const x = document.createElement('button'); x.className = 'vp-x'; x.textContent = '✕'; x.setAttribute('aria-label', t('vp.remove'));
      x.addEventListener('click', () => { put(K.bookmarks, get(K.bookmarks, []).filter((m) => !(m.path === it && m.ms === b.ms))); renderBookmarks(); });
      li.append(go, x); ul.append(li);
    }
  }
  function addBookmark() {
    const it = current(); if (!it) return;
    put(K.bookmarks, VP.addBookmark(get(K.bookmarks, []), it, video.currentTime * 1000)); renderBookmarks();
    say(fmt(t('vp.bookmarkAdded'), { time: VP.clock(video.currentTime * 1000) }));
  }

  /* ---------------- subtitles ---------------- */
  let syncAnchor=null,autoSuggestion=null;
  function clearSuggestion(){autoSuggestion=null;$('vpSubApplySync').disabled=true;$('vpSubAutoStatus').textContent='';}
  function clearAnchors(){clearSuggestion();syncAnchor=null;$('vpSubAnchorStatus').textContent='';}
  function clearSubs() { if(!$('vpSubAutoCancel').disabled)api.vpSubAutoCancel().catch(()=>{});clearAnchors(); $('vpSubQuery').value='';$('vpSubResults').textContent='';$('vpSubDownload').disabled=true;$('vpSubCue').textContent='';$('vpSubDelayExact').value='0'; ++subRevision; subSrc = []; subSel = -1;editUndo=null;$('vpSubEditStatus').textContent=''; subDelay = 0; subScale=1;subFps=0;$('vpSubFps').value='1';$('vpMicroFps').value='0'; $('vpSubDelay').textContent = '0 s'; rebuildTrack(); fillSubSelect(); }
  function fillSubSelect() {
    const sel = $('vpSubTrack'); sel.textContent = '';
    const off = document.createElement('option'); off.value = '-1'; off.textContent = t('vp.subOff'); sel.append(off);
    subSrc.forEach((s, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = s.name; sel.append(o); });
    sel.value = String(subSel);
  }
  let rawCues=[],editUndo=null,cuePage=0;
  const CUE_PAGE=500;
  function cueIndex(){return $('vpSubCue').selectedIndex<0?-1:cuePage*CUE_PAGE+$('vpSubCue').selectedIndex;}
  function fillCuePage(index=0){const pages=$('vpSubCuePage'),sel=$('vpSubCue');pages.textContent='';sel.textContent='';const count=Math.ceil(rawCues.length/CUE_PAGE);cuePage=Math.max(0,Math.min(count-1,Math.floor(Math.max(0,index)/CUE_PAGE)));for(let page=0;page<count;page++){const o=document.createElement('option');o.value=String(page);o.textContent=(page*CUE_PAGE+1)+'–'+Math.min((page+1)*CUE_PAGE,rawCues.length);pages.append(o);}pages.value=String(cuePage);pages.disabled=count<=1;for(let i=cuePage*CUE_PAGE;i<Math.min(rawCues.length,(cuePage+1)*CUE_PAGE);i++){const c=rawCues[i],o=document.createElement('option');o.value=String(c.start);o.textContent=(i+1)+' · '+VP.clock(c.start*1000)+' · '+c.text.replace(/<[^>]*>/g,'').slice(0,65);sel.append(o);}if(sel.options.length)sel.selectedIndex=Math.max(0,Math.min(sel.options.length-1,index-cuePage*CUE_PAGE));showCueEditor();}
  function showCueEditor(){const c=rawCues[cueIndex()];$('vpSubEditStart').value=c?String(c.start):'';$('vpSubEditEnd').value=c?String(c.end):'';$('vpSubEditText').value=c?c.text:'';$('vpSubEditApply').disabled=!c;$('vpSubEditUndo').disabled=!editUndo||editUndo.track!==subSrc[subSel];}
  function rebuildTrack() {
    syncNativeSubtitle();
    // Programmatic WebVTT cues avoid the asynchronous blob: fetch and the
    // file-origin/CORS differences between Electron releases.
    if (nativeSubtitleTrack) {
      nativeSubtitleTrack.mode = 'hidden';
      for (const cue of Array.from(nativeSubtitleTrack.cues || [])) nativeSubtitleTrack.removeCue(cue);
      nativeSubtitleTrack.mode = 'disabled';
    }
    const selectedCue=cueIndex();
    $('vpSubCue').textContent='';rawCues=[];
    if (subSel < 0 || !subSrc[subSel]) {fillCuePage();return;}
    const s = subSrc[subSel], r = VP.subtitleToVtt(s.text,s.ext,subDelay*1000,subScale,subFps);
    rawCues=VP.subtitleToVtt(s.text,s.ext,0,1,subFps).entries;
    fillCuePage(Math.max(0,selectedCue));
    if (!r.cues) { say(r.needsFps?'MicroDVD: choose source FPS / Επιλέξτε αρχικά FPS':t('vp.subEmpty')); return; }
    if (!nativeSubtitleTrack) nativeSubtitleTrack = video.addTextTrack('subtitles','OPSIS subtitles');
    // Hidden mode allows cues to be populated before native rendering begins.
    nativeSubtitleTrack.mode = 'hidden';
    for (const entry of r.entries) {
      const cue = new VTTCue(entry.start, entry.end, entry.text);
      for (const item of entry.settings.split(/\s+/)) {
        const [key,value] = item.split(':');
        try {
          if (key === 'align' && ['start','center','end','left','right'].includes(value)) cue.align=value;
          if (key === 'vertical' && ['rl','lr'].includes(value)) cue.vertical=value;
          if (key === 'size' && /^\d+(?:\.\d+)?%$/.test(value)) cue.size=parseFloat(value);
          if (key === 'position' && /^\d+(?:\.\d+)?%$/.test(value)) cue.position=parseFloat(value);
          if (key === 'line' && /^-?\d+(?:\.\d+)?%?$/.test(value)) { cue.snapToLines=!value.endsWith('%'); cue.line=parseFloat(value); }
        } catch (_) { /* invalid optional cue setting */ }
      }
      nativeSubtitleTrack.addCue(cue);
    }
    nativeSubtitleTrack.mode = 'showing';

  }
  function preferredIndex() { return VP.preferredSubtitle(subSrc,(get(K.subs,{})||{}).languages); }
  async function loadSiblingSubs(p, g, revision) {
    const found = await api.vpSubsFor(p).catch(() => []);
    if (generation !== g || current() !== p || !Array.isArray(found) || !found.length) return;
    const manual = subRevision !== revision;
    for (const s of found) if (subSrc.length < 24 && !subSrc.some(x => x.name === s.name && x.text === s.text)) subSrc.push(s);
    if (!manual) subSel = preferredIndex();
    fillSubSelect(); if (!manual) rebuildTrack();
  }
  async function loadSubFile() {
    if (!current()) return;
    const g = generation; ++subRevision;
    const f = await api.vpPickSub().catch(() => null);
    if (!f || g !== generation) return;
    attachSubtitle(f);
  }
  function attachSubtitle(f){
    clearAnchors();
    const old = subSrc.findIndex(s => s.name === f.name && s.text === f.text);
    if (old >= 0) subSel = old;
    else { if(subSrc.length>=24){subSrc.shift();}subSrc.push({ name: f.name, ext: f.ext, text: f.text }); subSel = subSrc.length - 1; }
    fillSubSelect(); rebuildTrack();
  }
  function setDelay(d) { if(!Number.isFinite(d))return;clearSuggestion();subDelay = Math.max(-3600, Math.min(3600, Math.round(d * 1000) / 1000)); $('vpSubDelay').textContent = `${subDelay > 0 ? '+' : ''}${subDelay} s`; $('vpSubDelayExact').value=String(subDelay);rebuildTrack(); }
  function applySubStyle() {
    const s = get(K.subs, {}) || {};
    const size = Number($('vpSubSize').value) || 16, color = $('vpSubColor').value || '#ffffff';
    video.style.setProperty('--vp-sub-size', String(Math.round(size / 16 * 100)));
    video.style.setProperty('--vp-sub-color', color);
    put(K.subs, { ...s, fontSize: size, color });
  }

  /* ---------------- sound: the Suite's equaliser on the video ---------------- */
  function refreshFx() {
    const btn = $('vpFx'); if (!fx || !btn) return;
    const on = btn.getAttribute('aria-pressed') === 'true' && (typeof engine === 'undefined' || (engine.state.masterEnabled&&!engine.state.routeBypass));
    const bands = (typeof engine !== 'undefined' && engine.state && engine.state.eqBands) || [];
    fx.filters.forEach((f, i) => { f.gain.value = on ? Number(bands[i]) || 0 : 0; });
    fx.bass.gain.value = on && typeof engine !== 'undefined' && engine.state ? Number(engine.state.bassBoost) || 0 : 0;
    if(fx.presence)fx.presence.gain.value=on&&typeof engine!=='undefined'?WaveframeAudio.presenceParams(engine.state.presence).gain:0;
    if(fx.balance)fx.balance.pan.value=on&&typeof engine!=='undefined'?WaveframeAudio.balanceValue(engine.state.balance):0;
  }
  function toggleFx() {
    if (!current() || !video.getAttribute('src')) return;
    const btn = $('vpFx'), on = btn.getAttribute('aria-pressed') !== 'true';
    if (on && VP.isUrl(current())) { say(t('vp.fxLocalOnly')); return; }
    if (!fx) {
      try {
        const ctx = new AudioContext(), src = ctx.createMediaElementSource(video), freqs = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
        const filters = freqs.map((f, i) => { const n = ctx.createBiquadFilter(); n.type = i === 0 ? 'lowshelf' : i === 9 ? 'highshelf' : 'peaking'; n.frequency.value = f; n.Q.value = 1; return n; });
        const bass = ctx.createBiquadFilter(); bass.type = 'lowshelf'; bass.frequency.value = 100;
        const presence=ctx.createBiquadFilter();presence.type='peaking';presence.frequency.value=2800;presence.Q.value=.85;
        const balance=ctx.createStereoPanner();
        let node = src; for (const f of [...filters, bass,presence,balance]) { node.connect(f); node = f; }
        node.connect(ctx.destination);
        fx = { ctx, filters, bass,presence,balance };
      } catch (_) { say(t('vp.fxFailed')); return; }
    }
    btn.setAttribute('aria-pressed', String(on)); btn.classList.toggle('active', on);
    if (fx.ctx.state === 'suspended') fx.ctx.resume().catch(() => say(t('vp.fxFailed')));
    refreshFx();
  }

  /* ---------------- saved playlists, recent ---------------- */
  function fillPlaylists() {
    const sel = $('vpPlSelect'); sel.textContent = '';
    const names = Object.keys(get(K.playlists, {}));
    if (!names.length) { const o = document.createElement('option'); o.value = ''; o.textContent = t('vp.none'); sel.append(o); return; }
    for (const n of names) { const o = document.createElement('option'); o.value = n; o.textContent = `${n} (${get(K.playlists, {})[n].length})`; sel.append(o); }
  }
  function fillRecent() {
    const sel = $('vpRecent'); sel.textContent = '';
    const r = get(K.recent, []).filter(VP.playable);
    const o0 = document.createElement('option'); o0.value = ''; o0.textContent = r.length ? t('vp.choose') : t('vp.none'); sel.append(o0);
    for (const p of r) { const o = document.createElement('option'); o.value = p; o.textContent = VP.titleOf(p); o.title = p; sel.append(o); }
  }
  async function savePlaylist() {
    if (!list.length) return;
    const name = await showInputDialog(t('vp.plName'));
    if (!name) return;
    const all = get(K.playlists, {}); all[String(name).slice(0, 60)] = list.slice(0, VP.LIMITS.playlist); put(K.playlists, all); fillPlaylists();
    say(fmt(t('vp.plSaved'), { name }));
  }
  async function importM3u() {
    const lists = await api.vpPickM3u(); if (!lists.length) return;
    const all = get(K.playlists, {}); let n = 0;
    for (const l of lists) { all[l.name] = l.items; n++; }
    put(K.playlists, all); fillPlaylists();
    say(fmt(t('vp.m3uImported'), { n }));
  }

  /* ---------------- repeat, frame step, A-B, snapshot, picture, info (2.3.1) ---------------- */
  function applyPicture() {
    const css = VP.pictureCss(pic, video.clientWidth, video.clientHeight);
    video.style.filter = css.filter; video.style.transform = css.transform;
  }
  function onEnded() {
    saveResume();
    if (stopAfter) { stopAfter = false; $('vpStopAfter').checked = false; return; }
    const n = VP.nextIndex($('vpRepeat').value, idx, list.length);
    if (n === idx && n >= 0) { video.currentTime = 0; video.play().catch(() => {}); } else if (n >= 0) playAt(n);
  }
  function stepFrame(d) { if (!Number.isFinite(video.duration)) return; video.pause(); seekTo(video.currentTime + d / 25); }
  function toggleAB() {
    ab = VP.abStep(ab, video.currentTime);
    if (ab.stage === 'a') say(fmt(t('vp.abA'), { time: VP.clock(ab.a * 1000) }));
    else if (ab.stage === 'loop') say(fmt(t('vp.abB'), { a: VP.clock(ab.a * 1000), b: VP.clock(ab.b * 1000) }));
    else say(t('vp.abOff'));
  }
  async function snapshot() {
    if (!current() || !video.videoWidth) return;
    try {
      const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      if (!blob) throw new Error('empty');
      const r = await api.photoSave({ format: 'png', name: VP.titleOf(current()), bytes: await blob.arrayBuffer() });
      say(r && r.ok ? t('vp.snapSaved') : r && r.canceled ? '' : t('ph.saveFailed'));
    } catch (_) { say(t('ph.saveFailed')); }
  }
  async function fileInfo() {
    const it = current(); if (!it) return;
    const p = VP.isUrl(it) ? null : await api.vidProbe(it).catch(() => null);
    if (it !== current()) return;
    const lines = [VP.titleOf(it), 'Playback engine: ' + (playbackEngine || '—')];
    if (video.videoWidth) lines.push(`${video.videoWidth}×${video.videoHeight} · ${VP.clock(video.duration * 1000)}`);
    if (p) {
      if (p.video) lines.push(`${p.video.codec} ${p.video.width}×${p.video.height}${p.video.fps ? ' · ' + p.video.fps + ' fps' : ''}`);
      for (const a of p.audio) lines.push(`${a.codec}${a.channels ? ' · ' + a.channels : ''}${a.lang ? ' · ' + a.lang : ''}`);
      for (const sb of p.subtitles) lines.push(`${sb.codec}${sb.lang ? ' · ' + sb.lang : ''}`);
    } else lines.push(t('vp.infoNone'));
    await showAlertDialog(t('vp.info'), lines.join('\n'));
  }
  // transport: icon buttons like the music player; labels / tooltips come from the language files
  function syncTransport() {
    const playing = handoff?!!handoff.status?.playing:video && !video.paused && !video.ended, p = $('vpPlay');
    p.textContent = playing ? '⏸' : '▶';
    const lbl = playing ? t('vp.pause') : t('vp.play'); p.title = lbl; p.setAttribute('aria-label', lbl);
    const m = $('vpMute'), muted = handoff?!!handoff.status?.muted||handoff.status?.volume===0:video.muted || video.volume === 0;
    m.textContent = muted ? '🔇' : '🔊'; m.classList.toggle('active', muted);
    const ml = muted ? t('vp.unmute') : t('vp.mute'); m.title = ml; m.setAttribute('aria-label', ml); m.setAttribute('aria-pressed', String(muted));
  }
  function syncTime() {
    const d = handoff?(handoff.status?.durationMs||0)/1000:video.duration, c = handoff?(handoff.status?.positionMs||0)/1000:video.currentTime || 0, finite = Number.isFinite(d) && d > 0;
    $('vpTime').textContent = VP.clock(c * 1000) + ' / ' + (d === Infinity ? 'LIVE' : VP.clock(d * 1000));
    $('vpSeek').disabled = !finite;
    if (!seeking) $('vpSeek').value = finite ? String(Math.round(c / d * 1000)) : '0';
  }
  let seeking = false;
  function seekTo(value) { if (Number.isFinite(value) && Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.max(0, Math.min(video.duration, value)); }
  function iconLabels() {
    for (const [id, key] of [['vpPrev', 'vp.prev'], ['vpNext', 'vp.next'], ['vpStop', 'vp.stop'], ['vpSnap', 'vp.snapshot'], ['vpFull', 'vp.fullscreen']]) { const b = $(id); b.title = t(key); b.setAttribute('aria-label', t(key)); }
    $('vpSeek').setAttribute('aria-label', t('vp.seek')); $('vpVolume').setAttribute('aria-label', t('vp.volume'));
    if (video) syncTransport();
  }
  function aria() {
    iconLabels(); $('vpFramePrev').setAttribute('aria-label', t('vp.framePrev')); $('vpFramePrev').title = t('vp.framePrev'); $('vpFrameNext').setAttribute('aria-label', t('vp.frameNext')); $('vpFrameNext').title = t('vp.frameNext'); }

  function bindVideoEvents() {
    eventController = new AbortController();
    const on = (name, handler) => video.addEventListener(name, handler, { signal: eventController.signal });
    on('volumechange', () => { $('vpVolume').value = String(Math.round((video.muted ? 0 : video.volume) * 100)); syncTransport(); });
    on('timeupdate', syncTime); on('durationchange', syncTime);
    for (const ev of ['play', 'pause', 'ended', 'emptied']) on(ev, syncTransport);
    on('click', () => { if (video.paused) video.play().catch(() => {}); else video.pause(); });
    on('dblclick', () => $('vpFull').click());
    on('error', () => say(t('vp.cantPlay')));
    on('ended', onEnded);
    on('timeupdate', () => { if (ab.stage === 'loop' && video.currentTime >= ab.b) video.currentTime = ab.a; });
    on('pause', saveResume);
    on('play', () => window.dispatchEvent(new CustomEvent('waveframe:video-playing')));
    on('loadedmetadata', () => {
      ab = { stage: 'off', a: 0, b: 0 };
      const it = current(); if (!it || !video.getAttribute('src')) return;
      resumePath = it;
      const pos = get(K.resume, {})[it];
      if (Number.isFinite(video.duration) && pos > 0 && pos / 1000 < video.duration - 10) { seekTo(pos / 1000); say(fmt(t('vp.resumed'), { time: VP.clock(pos) })); }
    });
  }
  function replaceVideo() {
    const old = video, volume = old.volume, muted = old.muted;
    if (eventController) eventController.abort();
    old.pause(); old.removeAttribute('src'); old.load(); $('vpFrame').classList.remove('has-media');
    if (fx) { fx.ctx.close().catch(() => {}); fx = null; }
    const fresh = old.cloneNode(false);
    fresh.removeAttribute('crossorigin');
    old.replaceWith(fresh); video = fresh; nativeSubtitleTrack = null;
    video.volume = volume; video.muted = muted;
    $('vpFx').setAttribute('aria-pressed','false'); $('vpFx').classList.remove('active');
    bindVideoEvents(); applyPicture(); applySubStyle(); syncTime(); syncTransport();
  }

  /* ---------------- build ---------------- */
  function build() {
    if (built) return; built = true;
    video = $('vpVideo');
    bindVideoEvents();
    for (const s of VP.SPEEDS) { const o = document.createElement('option'); o.value = String(s); o.textContent = `${s}×`; $('vpSpeed').append(o); }
    $('vpSpeed').value = String(get(K.speed, 1)); if (!$('vpSpeed').value) $('vpSpeed').value = '1';
    const subs = get(K.subs, {});
    if (subs.fontSize) $('vpSubSize').value = String(subs.fontSize);
    if (subs.color) $('vpSubColor').value = subs.color;
    applySubStyle();
    list = (get(K.queue, [])).filter(VP.playable).slice(0, VP.LIMITS.playlist);
    renderList(); fillPlaylists(); fillRecent(); fillSubSelect();

    $('vpOpen').addEventListener('click', async () => addPaths(await api.vpPick('files'), true));
    $('vpOpenFolder').addEventListener('click', async () => addPaths(await api.vpPick('folder'), true));
    $('vpOpenUrl').addEventListener('click', async () => { const u = await showInputDialog(t('vp.urlPrompt')); if (u && /^https?:\/\/\S+$/i.test(u.trim())) addPaths([u.trim()], true); else if (u) say(t('vp.unsupported')); });
    $('vpPrev').addEventListener('click', () => next(-1));
    $('vpNext').addEventListener('click', () => next(1));
    $('vpPlay').addEventListener('click', () => { if(handoff){nativeCommand('toggle');return;} if (!current() && list.length) playAt(0); else if (session && playbackEngine) { if(video.paused)session.play().catch(()=>{});else session.pause().catch(()=>{}); } else if(current())playAt(idx); });
    $('vpStop').addEventListener('click', () => { if(handoff){stopNative();playbackEngine=null;return;} video.pause(); seekTo(0); syncTime(); syncTransport(); });
    $('vpMute').addEventListener('click', () => { if(handoff){nativeCommand('mute');return;} video.muted = !video.muted; syncTransport(); });
    $('vpVolume').addEventListener('input', () => { if(handoff)return; video.volume = Number($('vpVolume').value) / 100; video.muted = video.volume === 0; syncTransport(); });

    $('vpVolume').addEventListener('change',()=>{if(handoff)nativeCommand('volume',Number($('vpVolume').value));});
    $('vpSeek').addEventListener('input', () => { seeking = true;if(handoff)return; seekTo(Number($('vpSeek').value) / 1000 * video.duration); });
    $('vpSeek').addEventListener('change', () => { if(handoff)nativeCommand('seek',Math.round(Number($('vpSeek').value)/1000*(handoff.status?.durationMs||0)));seeking = false; });




    $('vpSpeed').addEventListener('change', () => { if(handoff){nativeCommand('rate',Number($('vpSpeed').value)||1);return;} video.playbackRate = Number($('vpSpeed').value) || 1; put(K.speed, video.playbackRate); });
    $('vpFx').addEventListener('click', toggleFx);
    $('vpFull').addEventListener('click', () => { const f = $('vpStage'); if (document.fullscreenElement) document.exitFullscreen(); else f.requestFullscreen().catch(() => {}); });
    $('vpSubTrack').addEventListener('change', () => { clearAnchors();++subRevision; subSel = Number($('vpSubTrack').value); rebuildTrack(); });
    $('vpSubLoad').addEventListener('click', loadSubFile);
    let searchGeneration=0;
    const onlineStatus=t=>{$('vpSubOnlineStatus').textContent=t;};
    $('vpSubSaveBeside').checked=get('waveframe.video.subSaveBeside',true)!==false;
    $('vpSubSaveBeside').addEventListener('change',()=>put('waveframe.video.subSaveBeside',$('vpSubSaveBeside').checked));
    function providerStatus(result){const code=result?.code||'unavailable';return ['provider-blocked','provider-cooldown','quota','rate-limited'].includes(code)?'Provider paused / Περιορισμός παρόχου'+(result?.retryAfter?(' · '+result.retryAfter+' s'):'')+' — use browser or try later':code;}
    for(const [button,site] of [['vpSubs4Series','subs4series'],['vpSubs4Free','subs4free']]){
      $(button).addEventListener('click',async()=>{if(await api.vpSubWebsite(site).catch(()=>false))onlineStatus('Complete download in browser, then Import / Κατεβάστε και εισαγάγετε τον υπότιτλο');else onlineStatus('Browser unavailable');});
    }
    $('vpSubImportBeside').addEventListener('click',async()=>{
      const p=current(),g=generation,rev=++subRevision;if(!p||VP.isUrl(p)||(handoff&&handoff.engine!=='libvlc')){onlineStatus('Choose a local video first / Επιλέξτε τοπικό βίντεο');return;}
      $('vpSubImportBeside').disabled=true;
      try{const result=await api.vpSubImportBeside(p,$('vpSubLanguage').value);
        if(g!==generation||rev!==subRevision)return;
        if(!result?.ok){if(result?.code!=='cancelled')onlineStatus(providerStatus(result));return;}
        attachSubtitle(result.subtitle);onlineStatus('Imported and saved / Αποθηκεύτηκε: '+result.saved.name);
      }catch{onlineStatus('Import failed');}finally{$('vpSubImportBeside').disabled=false;}
    });
    $('vpSubOnlineToggle').addEventListener('click',()=>{$('vpSubOnline').hidden=!$('vpSubOnline').hidden;if(current()&&!$('vpSubQuery').value)$('vpSubQuery').value=VP.titleOf(current());});
    $('vpSubSearch').addEventListener('click',async()=>{
      const g=generation,n=++searchGeneration;
      $('vpSubResults').textContent='';$('vpSubDownload').disabled=true;$('vpSubSearch').disabled=true;
      const req={query:$('vpSubQuery').value,language:$('vpSubLanguage').value,apiKey:$('vpSubKey').value,username:$('vpSubUser').value,password:$('vpSubPassword').value,hashPath:$('vpSubHash').checked&&current()&&!VP.isUrl(current())?current():null};
      $('vpSubKey').value='';$('vpSubPassword').value='';$('vpSubUser').value='';onlineStatus('Searching…');
      try{
        const r=await api.vpSubSearch(req);if(g!==generation||n!==searchGeneration)return;
        if(!r?.ok){onlineStatus(providerStatus(r));return;}
        for(const row of r.items){const o=document.createElement('option');o.value=String(row.id);o.textContent=row.name+' — '+row.release+' · '+row.downloads+(row.hearingImpaired?' · SDH':'')+(row.hashMatch?' · exact hash match':'');$('vpSubResults').append(o);}
        $('vpSubDownload').disabled=!r.items.length;onlineStatus(r.items.length+' results / αποτελέσματα');
      }catch{onlineStatus('Search failed');}finally{$('vpSubSearch').disabled=false;}
    });
    $('vpSubDownload').addEventListener('click',async()=>{
      if(!current()||(handoff&&handoff.engine!=='libvlc'))return;const g=generation,n=searchGeneration,revision=++subRevision,id=Number($('vpSubResults').value);
      $('vpSubDownload').disabled=true;onlineStatus('Downloading…');
      try{const r=await api.vpSubDownload(id,current(),$('vpSubSaveBeside').checked&&!VP.isUrl(current()));if(g!==generation||n!==searchGeneration||revision!==subRevision)return;
        if(!r?.ok){onlineStatus(providerStatus(r));return;}
        attachSubtitle(r.subtitle);onlineStatus('Downloaded and selected / Λήψη και επιλογή'+(r.saved?.ok?' · Saved / Αποθηκεύτηκε: '+r.saved.name:r.saved?' · Not saved / Δεν αποθηκεύτηκε: '+r.saved.code:'')+(r.remaining===null?'':' · remaining '+r.remaining));
      }catch{onlineStatus('Download failed');}finally{if(g===generation&&n===searchGeneration)$('vpSubDownload').disabled=!$('vpSubResults').options.length;}
    });
    $('vpSubDisconnect').addEventListener('click',async()=>{if(await api.vpSubDisconnect()){++searchGeneration;$('vpSubResults').textContent='';$('vpSubDownload').disabled=true;onlineStatus('Disconnected');}});
    $('vpSubDelayExact').addEventListener('change',()=>setDelay(Number($('vpSubDelayExact').value)));
    function marker(){const pos=handoff?(handoff.engine==='libvlc'&&handoff.status?.playing===false?handoff.status.positionMs/1000:NaN):video.currentTime;return $('vpSubCue').options.length&&Number.isFinite(pos)?{subtitle:Number($('vpSubCue').value),video:pos}:null;}
    $('vpSubSyncHere').addEventListener('click',()=>{const a=marker();if(a)setDelay(a.video-a.subtitle*subScale);else if(handoff)say('Pause native playback before aligning a cue');});
    $('vpSubAnchorA').addEventListener('click',()=>{syncAnchor=marker();$('vpSubAnchorStatus').textContent=syncAnchor?'A: '+syncAnchor.subtitle.toFixed(2)+' → '+syncAnchor.video.toFixed(2)+' s':'Select a cue first';});
    $('vpSubAnchorB').addEventListener('click',()=>{const r=VP.twoPointSync(syncAnchor,marker());if(!r){$('vpSubAnchorStatus').textContent='Select two ordered cues at least 2s apart';return;}subScale=r.scale;$('vpSubFps').value='custom';setDelay(r.delay);$('vpSubAnchorStatus').textContent='Scale '+r.scale.toFixed(6)+' · '+subDelay.toFixed(3)+' s';});
    $('vpSubAutoSync').addEventListener('click',async()=>{
      const s=subSrc[subSel],p=current();if(!s||!p||VP.isUrl(p)||(handoff&&handoff.engine!=='libvlc'))return;
      const g=generation,rev=subRevision,selected=subSel,sourceFps=subFps,original=VP.subtitleToVtt(s.text,s.ext,0,1,subFps);
      clearSuggestion();$('vpSubAutoSync').disabled=true;$('vpSubAutoCancel').disabled=false;$('vpSubAutoStatus').textContent='Analyzing local audio (up to 30 min of media)…';
      try{
        const audioIndex=Math.max(0,Math.min(63,Math.floor(Number($('vpSubAudioIndex').value)||1)-1));
        const r=await api.vpSubAutoSync({path:p,audioIndex,cues:original.entries.map(c=>({start:c.start,end:c.end}))});
        if(g!==generation||rev!==subRevision||selected!==subSel||sourceFps!==subFps)return;
        if(!r?.ok){$('vpSubAutoStatus').textContent='No reliable suggestion: '+(r?.code||'unavailable');return;}
        autoSuggestion=r;$('vpSubApplySync').disabled=false;
        $('vpSubAutoStatus').textContent='Suggested '+r.delay.toFixed(3)+' s · scale '+r.scale.toFixed(6)+' · activity score '+r.score.toFixed(3)+' (verify dialogue manually)';
      }catch{$('vpSubAutoStatus').textContent='Audio analysis unavailable';}finally{$('vpSubAutoSync').disabled=false;$('vpSubAutoCancel').disabled=true;}
    });
    $('vpSubAutoCancel').addEventListener('click',()=>{api.vpSubAutoCancel().catch(()=>{});$('vpSubAutoCancel').disabled=true;});
    $('vpSubApplySync').addEventListener('click',()=>{if(!autoSuggestion)return;const r=autoSuggestion;clearAnchors();subScale=r.scale;$('vpSubFps').value='custom';setDelay(r.delay);$('vpSubAutoStatus').textContent='Suggestion applied — verify dialogue / Ελέγξτε την ομιλία';});
    $('vpSubCuePage').addEventListener('change',()=>fillCuePage(Number($('vpSubCuePage').value)*CUE_PAGE));
    $('vpSubCue').addEventListener('change',showCueEditor);
    $('vpSubEditApply').addEventListener('click',()=>{
      const original=subSrc[subSel],i=cueIndex();if(!original||(handoff&&handoff.engine!=='libvlc'))return;
      const start=$('vpSubEditStart').value,end=$('vpSubEditEnd').value;
      const next=start!==''&&end!==''?VP.editCue(rawCues,i,{start:Number(start),end:Number(end),text:$('vpSubEditText').value}):null;
      const text=next&&VP.exportSubtitles(next,'vtt');
      if(!text||new TextEncoder().encode(text).length>5*1024*1024){$('vpSubEditStatus').textContent='Invalid cue or subtitle too large';return;}
      let track=original;
      if(!track.edited){if(subSrc.length>=24){$('vpSubEditStatus').textContent='Subtitle track limit reached';return;}track={name:original.name.replace(/\.[^.]+$/,'')+'-edited.vtt',ext:'vtt',text:original.text,edited:true};subSrc.push(track);subSel=subSrc.length-1;}
      editUndo={track,text:track.text,original:original===track?null:original};track.text=text;++subRevision;clearAnchors();fillSubSelect();rebuildTrack();$('vpSubEditStatus').textContent='Edited copy updated / Ενημερώθηκε το αντίγραφο';
    });
    $('vpSubEditUndo').addEventListener('click',()=>{
      if(!editUndo||editUndo.track!==subSrc[subSel])return;
      const u=editUndo;editUndo=null;
      if(u.original){subSrc.splice(subSel,1);subSel=subSrc.indexOf(u.original);}else u.track.text=u.text;
      ++subRevision;clearAnchors();fillSubSelect();rebuildTrack();$('vpSubEditStatus').textContent='Last edit undone';
    });
    $('vpSubAnchorReset').addEventListener('click',()=>{clearAnchors();subScale=1;$('vpSubFps').value='1';setDelay(0);});
    async function saveSubtitle(format){
      const s=subSrc[subSel];if(!s){say(t('vp.subEmpty'));return;}
      const r=VP.subtitleToVtt(s.text,s.ext,subDelay*1000,subScale,subFps),text=VP.exportSubtitles(r.entries,format);
      if(!text){say(t('vp.subEmpty'));return;}
      const result=await api.vpSaveSub({format,text,name:s.name}).catch(()=>null);
      if(!result?.canceled)say(result?.ok?'Synced subtitles saved / Αποθηκεύτηκαν οι υπότιτλοι':'Subtitle save failed (choose a new filename) / Αποτυχία αποθήκευσης');
    }
    $('vpSubSaveSrt').addEventListener('click',()=>saveSubtitle('srt'));
    $('vpSubSaveVtt').addEventListener('click',()=>saveSubtitle('vtt'));
    $('vpSubReset').addEventListener('click',()=>setDelay(0));
    $('vpSubFps').addEventListener('change',()=>{if($('vpSubFps').value==='custom')return;clearAnchors();subScale=Number($('vpSubFps').value)||1;rebuildTrack();});
    $('vpMicroFps').addEventListener('change',()=>{clearAnchors();subFps=Number($('vpMicroFps').value)||0;rebuildTrack();});
    $('vpSubMinus').addEventListener('click', () => setDelay(subDelay - 0.5));
    $('vpSubPlus').addEventListener('click', () => setDelay(subDelay + 0.5));
    $('vpSubSize').addEventListener('input', applySubStyle);
    $('vpSubColor').addEventListener('input', applySubStyle);
    $('vpBookmark').addEventListener('click', addBookmark);
    $('vpClear').addEventListener('click', () => { stop(); list = []; idx = -1; renderList(); renderBookmarks(); });
    $('vpSavePl').addEventListener('click', savePlaylist);
    $('vpImportM3u').addEventListener('click', importM3u);
    $('vpPlLoad').addEventListener('click', () => { const l = get(K.playlists, {})[$('vpPlSelect').value]; if (Array.isArray(l)) { stop(); list = []; idx = -1; addPaths(l, true); } });
    $('vpPlDelete').addEventListener('click', () => { const all = get(K.playlists, {}); delete all[$('vpPlSelect').value]; put(K.playlists, all); fillPlaylists(); });
    $('vpRecent').addEventListener('change', () => { const p = $('vpRecent').value; if (p) addPaths([p], true); $('vpRecent').value = ''; });





    $('vpStopAfter').addEventListener('change', () => { stopAfter = $('vpStopAfter').checked; });
    $('vpFramePrev').addEventListener('click', () => stepFrame(-1));
    $('vpFrameNext').addEventListener('click', () => stepFrame(1));
    $('vpAB').addEventListener('click', toggleAB);
    $('vpSnap').addEventListener('click', snapshot);
    $('vpInfo').addEventListener('click', fileInfo);
    api.vpNativeStatus().then(r=>{$('vpNative').hidden=!r?.available;$('vpDirectShow').hidden=!r?.available;$('vpMediaFoundation').hidden=!r?.available;$('vpNativeFallbackLabel').hidden=!r?.available;}).catch(()=>{});
    $('vpDirectShow').addEventListener('click',()=>nativeHandoff('directshow',current(),generation));
    $('vpMediaFoundation').addEventListener('click',()=>nativeHandoff('media-foundation',current(),generation));
    $('vpNative').addEventListener('click',()=>nativeHandoff('libvlc',current(),generation));
    $('vpNativeStop').addEventListener('click',stopNative);
    $('vpCodecs').addEventListener('click', async () => {
      const report=await api.vpCodecInventory().catch(()=>null);
      if(!report){await showAlertDialog('Codec Manager','Inventory unavailable / Μη διαθέσιμη ανίχνευση');return;}
      const lines=['Active engine / Ενεργός μηχανισμός: '+(playbackEngine||'—'), 'Architecture: '+report.arch, 'Inventory only / Μόνο ανίχνευση — not loaded / χωρίς φόρτωση'];
      for(const row of report.packs)lines.push(row.name+' '+row.version+' ['+row.view+']');
      for(const row of report.filters)lines.push(row.name+' ['+row.view+']');
      for(const row of (report.lav||[]))lines.push(row.name+' ['+row.view+'] '+row.status+' ('+row.hive+')');
      for(const row of report.transforms)lines.push(row.name+' [Media Foundation '+row.view+']');
      if(report.status!=='ok')lines.push('Scan status: '+report.status);
      await showAlertDialog('Codec Manager',lines.join('\n'));
    });
    const picIn = () => { pic.brightness = Number($('vpBright').value); pic.contrast = Number($('vpContrast').value); pic.saturation = Number($('vpSat').value); applyPicture(); };
    for (const id of ['vpBright', 'vpContrast', 'vpSat']) $(id).addEventListener('input', picIn);
    $('vpRot').addEventListener('click', () => { pic.rotate = (pic.rotate + 90) % 360; applyPicture(); });
    $('vpFlipH').addEventListener('click', () => { pic.flipH = !pic.flipH; applyPicture(); });
    $('vpFlipV').addEventListener('click', () => { pic.flipV = !pic.flipV; applyPicture(); });
    $('vpPicReset').addEventListener('click', () => { pic = { brightness: 100, contrast: 100, saturation: 100, rotate: 0, flipH: false, flipV: false }; $('vpBright').value = $('vpContrast').value = $('vpSat').value = '100'; applyPicture(); });
    $('vpRepeat').value = get('waveframe.video.repeat', 'off'); $('vpRepeat').addEventListener('change', () => put('waveframe.video.repeat', $('vpRepeat').value));
    aria(); document.addEventListener('waveframe:language-changed', aria);


    saveTimer = setInterval(() => { if (!video.paused) saveResume(); }, 5000);
    window.addEventListener('beforeunload', () => { stopNative();saveResume(); releaseTicket(); });
    window.addEventListener('waveframe:storage-changed', () => { fillPlaylists(); fillRecent(); renderBookmarks(); const s = get(K.subs, {}); if (s.fontSize) $('vpSubSize').value = String(s.fontSize); if (s.color) $('vpSubColor').value = s.color; applySubStyle(); });
    document.addEventListener('waveframe:language-changed', () => { fillSubSelect(); fillPlaylists(); fillRecent(); });
    window.addEventListener('waveframe:dsp-route-changed',refreshFx);

    const frame = $('vpFrame');
    frame.addEventListener('dragover', (e) => { e.preventDefault(); frame.classList.add('drag'); });
    frame.addEventListener('dragleave', () => frame.classList.remove('drag'));
    frame.addEventListener('drop', (e) => {
      e.preventDefault(); frame.classList.remove('drag');
      const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
      const sub = paths.find((p) => /\.(srt|vtt|ass|ssa)$/i.test(p));
      const media = paths.filter((p) => !/\.(srt|vtt|ass|ssa)$/i.test(p));
      if (media.length) addPaths(media, true);
      else if (sub && current()) say(t('vp.dropSubUseButton'));
    });
    document.addEventListener('keydown', (e) => {
      if (!$('tab-video').classList.contains('active') || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.ctrlKey || e.altKey || e.metaKey) return;
      const k = e.key; let used = true;
      if(handoff){if(k===' '){nativeCommand('toggle');e.preventDefault();}else if(k==='m'||k==='M'){nativeCommand('mute');e.preventDefault();}return;}
      if (k === ' ') { if (video.paused) video.play().catch(() => {}); else video.pause(); }
      else if (k === 'ArrowRight') seekTo(video.currentTime + (e.shiftKey ? 30 : 5));
      else if (k === 'ArrowLeft') seekTo(video.currentTime - (e.shiftKey ? 30 : 5));
      else if (k === 'ArrowUp') video.volume = Math.min(1, video.volume + 0.05);
      else if (k === 'ArrowDown') video.volume = Math.max(0, video.volume - 0.05);
      else if (k === 'm' || k === 'M') video.muted = !video.muted;
      else if (k === 'f' || k === 'F') $('vpFull').click();
      else if (k === 'n' || k === 'N') next(1);
      else if (k === 'p' || k === 'P') next(-1);
      else if (k === 'b' || k === 'B') addBookmark();
      else if (k === '.') stepFrame(1);
      else if (k === ',') stepFrame(-1);
      else if (k === 'l' || k === 'L') toggleAB();
      else if (k === 's' || k === 'S') snapshot();
      else used = false;
      if (used) e.preventDefault();
    });
  }

  window.WaveframeVideoPlayer = {
    show() { build(); },
    open(p) { build(); addPaths([p], true); },
    pause() { if (built && video && !video.paused) video.pause(); },
    get playing() { return built && video && !video.paused; },
  };
  build();
})();
