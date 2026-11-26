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

  let ab = { stage: 'off', a: 0, b: 0 }, pic = { brightness: 100, contrast: 100, saturation: 100, rotate: 0, flipH: false, flipV: false }, stopAfter = false;
  let generation = 0, subRevision = 0, resumePath = null, eventController = null;
  let video, list = [], idx = -1, subSrc = [], subSel = -1, subDelay = 0, saveTimer = 0, built = false, fx = null;

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
  function stop() { saveResume(); ++generation; resumePath = null; ab = { stage: 'off', a: 0, b: 0 }; seeking = false; clearSubs(); video.pause(); video.removeAttribute('src'); video.load(); $('vpFrame').classList.remove('has-media'); syncTime(); syncTransport(); }

  async function playAt(i) {
    if (i < 0 || i >= list.length) return;
    saveResume();
    const g = ++generation;
    resumePath = null; ab = { stage: 'off', a: 0, b: 0 }; seeking = false;
    idx = i; const p = list[i];
    clearSubs();
    // A media element bound to Web Audio remains bound even after bypass. Replace
    // it on source change, so non-CORS streams have a fresh native audio path.
    const restoreFx = !VP.isUrl(p) && $('vpFx').getAttribute('aria-pressed') === 'true';
    replaceVideo();
    renderList(); renderBookmarks();
    const source = VP.isUrl(p) ? p : await api.vpOpenSource(p).catch(() => null);
    if (g !== generation) return;
    if (!source) { $('vpFrame').classList.remove('has-media'); say(t('vp.cantPlay')); return; }
    if (!VP.isUrl(p)) video.crossOrigin = 'anonymous';
    video.src = source;
    if (restoreFx) toggleFx();
    $('vpFrame').classList.add('has-media');
    video.playbackRate = Number($('vpSpeed').value) || 1;
    renderList(); renderBookmarks();
    put(K.recent, VP.pushRecent(get(K.recent, []), p)); fillRecent();
    say(fmt(t('vp.playing'), { name: VP.titleOf(p) }));
    window.dispatchEvent(new CustomEvent('waveframe:video-playing'));
    video.play().catch(() => { /* the error event reports unsupported media */ });
    if (!VP.isUrl(p)) loadSiblingSubs(p, g, subRevision);
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
  function clearSubs() { ++subRevision; subSrc = []; subSel = -1; subDelay = 0; $('vpSubDelay').textContent = '0 s'; rebuildTrack(); fillSubSelect(); }
  function fillSubSelect() {
    const sel = $('vpSubTrack'); sel.textContent = '';
    const off = document.createElement('option'); off.value = '-1'; off.textContent = t('vp.subOff'); sel.append(off);
    subSrc.forEach((s, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = s.name; sel.append(o); });
    sel.value = String(subSel);
  }
  function rebuildTrack() {
    video.querySelectorAll('track').forEach((tr) => { tr.track.mode = 'disabled'; if (tr.src.startsWith('blob:')) URL.revokeObjectURL(tr.src); tr.remove(); });
    if (subSel < 0 || !subSrc[subSel]) return;
    const s = subSrc[subSel], r = VP.subtitleToVtt(s.text, s.ext, subDelay * 1000);
    if (!r.cues) { say(t('vp.subEmpty')); return; }
    const tr = document.createElement('track');
    tr.kind = 'subtitles'; tr.label = s.name; tr.default = true;
    tr.src = URL.createObjectURL(new Blob([r.vtt], { type: 'text/vtt' }));
    const owner = video;
    tr.addEventListener('load', () => { if (tr.parentNode === owner && owner === video) tr.track.mode = 'showing'; });
    tr.addEventListener('error', () => { if (tr.parentNode === owner && owner === video) say(t('vp.subEmpty')); });
    owner.append(tr);
    tr.track.mode = 'showing';
  }
  function preferredIndex() {
    const stored = get(K.subs, {}) || {};
    const langs = Array.isArray(stored.languages) ? stored.languages.filter(l => typeof l === 'string' && /^[a-z]{2,3}$/i.test(l)) : ['el','en'];
    for (const l of langs) { const i = subSrc.findIndex(s => s.name.replace(/\.[^.]+$/, '').toLowerCase().split(/[._-]/).includes(l.toLowerCase())); if (i >= 0) return i; }
    return 0;
  }
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
    const old = subSrc.findIndex(s => s.name === f.name && s.text === f.text);
    if (old >= 0) subSel = old;
    else if (subSrc.length < 24) { subSrc.push({ name: f.name, ext: f.ext, text: f.text }); subSel = subSrc.length - 1; }
    fillSubSelect(); rebuildTrack();
  }
  function setDelay(d) { subDelay = Math.max(-3600, Math.min(3600, Math.round(d * 10) / 10)); $('vpSubDelay').textContent = `${subDelay > 0 ? '+' : ''}${subDelay} s`; rebuildTrack(); }
  function applySubStyle() {
    const s = get(K.subs, {});
    const size = Number($('vpSubSize').value) || 16, color = $('vpSubColor').value || '#ffffff';
    video.style.setProperty('--vp-sub-size', String(Math.round(size / 16 * 100)));
    video.style.setProperty('--vp-sub-color', color);
    put(K.subs, { ...s, fontSize: size, color });
  }

  /* ---------------- sound: the Suite's equaliser on the video ---------------- */
  function refreshFx() {
    const btn = $('vpFx'); if (!fx || !btn) return;
    const on = btn.getAttribute('aria-pressed') === 'true';
    const bands = (typeof engine !== 'undefined' && engine.state && engine.state.eqBands) || [];
    fx.filters.forEach((f, i) => { f.gain.value = on ? Number(bands[i]) || 0 : 0; });
    fx.bass.gain.value = on && typeof engine !== 'undefined' && engine.state ? Number(engine.state.bassBoost) || 0 : 0;
  }
  function toggleFx() {
    const btn = $('vpFx'), on = btn.getAttribute('aria-pressed') !== 'true';
    if (on && VP.isUrl(current())) { say(t('vp.fxLocalOnly')); return; }
    if (!fx) {
      try {
        const ctx = new AudioContext(), src = ctx.createMediaElementSource(video), freqs = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
        const filters = freqs.map((f, i) => { const n = ctx.createBiquadFilter(); n.type = i === 0 ? 'lowshelf' : i === 9 ? 'highshelf' : 'peaking'; n.frequency.value = f; n.Q.value = 1; return n; });
        const bass = ctx.createBiquadFilter(); bass.type = 'lowshelf'; bass.frequency.value = 100;
        let node = src; for (const f of [...filters, bass]) { node.connect(f); node = f; }
        node.connect(ctx.destination);
        fx = { ctx, filters, bass };
      } catch (_) { say(t('vp.fxFailed')); return; }
    }
    btn.setAttribute('aria-pressed', String(on)); btn.classList.toggle('active', on);
    if (fx.ctx.state === 'suspended') fx.ctx.resume();
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
    const lines = [VP.titleOf(it)];
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
    const playing = video && !video.paused && !video.ended, p = $('vpPlay');
    p.textContent = playing ? '⏸' : '▶';
    const lbl = playing ? t('vp.pause') : t('vp.play'); p.title = lbl; p.setAttribute('aria-label', lbl);
    const m = $('vpMute'), muted = video.muted || video.volume === 0;
    m.textContent = muted ? '🔇' : '🔊'; m.classList.toggle('active', muted);
    const ml = muted ? t('vp.unmute') : t('vp.mute'); m.title = ml; m.setAttribute('aria-label', ml); m.setAttribute('aria-pressed', String(muted));
  }
  function syncTime() {
    const d = video.duration, c = video.currentTime || 0, finite = Number.isFinite(d) && d > 0;
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
    on('timeupdate', syncTime); video.addEventListener('durationchange', syncTime);
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
    old.pause(); old.removeAttribute('src'); old.load();
    if (fx) { fx.ctx.close().catch(() => {}); fx = null; }
    const fresh = old.cloneNode(false);
    fresh.removeAttribute('crossorigin');
    old.replaceWith(fresh); video = fresh;
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
    $('vpPlay').addEventListener('click', () => { if (!current() && list.length) playAt(0); else if (video.paused) video.play().catch(() => {}); else video.pause(); });
    $('vpStop').addEventListener('click', () => { video.pause(); seekTo(0); syncTime(); syncTransport(); });
    $('vpMute').addEventListener('click', () => { video.muted = !video.muted; syncTransport(); });
    $('vpVolume').addEventListener('input', () => { video.volume = Number($('vpVolume').value) / 100; video.muted = video.volume === 0; syncTransport(); });

    $('vpSeek').addEventListener('input', () => { seeking = true; seekTo(Number($('vpSeek').value) / 1000 * video.duration); });
    $('vpSeek').addEventListener('change', () => { seeking = false; });




    $('vpSpeed').addEventListener('change', () => { video.playbackRate = Number($('vpSpeed').value) || 1; put(K.speed, video.playbackRate); });
    $('vpFx').addEventListener('click', toggleFx);
    $('vpFull').addEventListener('click', () => { const f = $('vpStage'); if (document.fullscreenElement) document.exitFullscreen(); else f.requestFullscreen().catch(() => {}); });
    $('vpSubTrack').addEventListener('change', () => { ++subRevision; subSel = Number($('vpSubTrack').value); rebuildTrack(); });
    $('vpSubLoad').addEventListener('click', loadSubFile);
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
    const picIn = () => { pic.brightness = Number($('vpBright').value); pic.contrast = Number($('vpContrast').value); pic.saturation = Number($('vpSat').value); applyPicture(); };
    for (const id of ['vpBright', 'vpContrast', 'vpSat']) $(id).addEventListener('input', picIn);
    $('vpRot').addEventListener('click', () => { pic.rotate = (pic.rotate + 90) % 360; applyPicture(); });
    $('vpFlipH').addEventListener('click', () => { pic.flipH = !pic.flipH; applyPicture(); });
    $('vpFlipV').addEventListener('click', () => { pic.flipV = !pic.flipV; applyPicture(); });
    $('vpPicReset').addEventListener('click', () => { pic = { brightness: 100, contrast: 100, saturation: 100, rotate: 0, flipH: false, flipV: false }; $('vpBright').value = $('vpContrast').value = $('vpSat').value = '100'; applyPicture(); });
    $('vpRepeat').value = get('waveframe.video.repeat', 'off'); $('vpRepeat').addEventListener('change', () => put('waveframe.video.repeat', $('vpRepeat').value));
    aria(); document.addEventListener('waveframe:language-changed', aria);


    saveTimer = setInterval(() => { if (!video.paused) saveResume(); }, 5000);
    window.addEventListener('beforeunload', saveResume);
    window.addEventListener('waveframe:storage-changed', () => { fillPlaylists(); fillRecent(); renderBookmarks(); const s = get(K.subs, {}); if (s.fontSize) $('vpSubSize').value = String(s.fontSize); if (s.color) $('vpSubColor').value = s.color; applySubStyle(); });
    document.addEventListener('waveframe:language-changed', () => { fillSubSelect(); fillPlaylists(); fillRecent(); });

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
