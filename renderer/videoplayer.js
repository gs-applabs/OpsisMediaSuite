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
  let video, list = [], idx = -1, subSrc = [], subSel = -1, subDelay = 0, saveTimer = 0, built = false, fx = null;

  const say = (text) => { const e = $('vpStatus'); if (e) e.textContent = text || ''; };
  const current = () => (idx >= 0 ? list[idx] : null);
  const setIcon = (button, icon) => button.querySelector('use').setAttribute('href', '#vpIcon' + icon);

  function syncHeading() {
    const name = current() ? VP.titleOf(current()) : '';
    const heading = $('vpNowPlaying');
    heading.textContent = name || t('vp.title');
    if (name) heading.title = name;
    else heading.removeAttribute('title');
  }

  function hidePanels() {
    for (const panel of document.querySelectorAll('#vpStage [popover]:popover-open')) panel.hidePopover();
  }

  function bindPanels() {
    const panel = $('vpSettingsMenu');
    const tabs = [...panel.querySelectorAll('.vp-settings-nav button')];
    let settingsAnchor = $('vpSettingsToggle');
    const menus = [[panel, () => settingsAnchor], [$('vpSources'), () => $('vpSourcesToggle')]];

    function placePanels() {
      for (const [menu, anchor] of menus) {
        if (!menu.matches(':popover-open')) continue;
        const box = anchor().getBoundingClientRect();
        const pad = 12;
        const left = Math.min(innerWidth - menu.offsetWidth - pad, box.right - menu.offsetWidth);
        const below = box.bottom + 6;
        const above = box.top - menu.offsetHeight - 6;
        const top = below + menu.offsetHeight <= innerHeight - pad ? below : above;
        menu.style.setProperty('--vp-popup-x', Math.max(pad, left) + 'px');
        menu.style.setProperty('--vp-popup-y', Math.max(pad, top) + 'px');
      }
    }

    function selectTab(selected) {
      for (const tab of tabs) {
        tab.setAttribute('aria-pressed', String(tab === selected));
        $(tab.getAttribute('aria-controls')).hidden = tab !== selected;
      }
      placePanels();
    }

    for (const tab of tabs) tab.addEventListener('click', () => selectTab(tab));
    $('vpSettingsToggle').addEventListener('click', (e) => { settingsAnchor = e.currentTarget; });
    $('vpCaptions').addEventListener('click', (e) => {
      settingsAnchor = e.currentTarget;
      selectTab($('vpSubtitlesOptionsTab'));
      if (panel.matches(':popover-open')) {
        e.preventDefault();
        $('vpSubTrack').focus();
      }
    });
    for (const [menu] of menus) menu.addEventListener('toggle', placePanels);
    window.addEventListener('resize', placePanels);
    document.addEventListener('scroll', placePanels, true);
  }

  /* ---------------- playlist ---------------- */
  function renderList() {
    const ul = $('vpList'); ul.textContent = '';
    $('vpQueueEmpty').hidden = list.length > 0;
    list.forEach((p, i) => {
      const li = document.createElement('li'); if (i === idx) li.classList.add('current');
      const b = document.createElement('button'); b.className = 'vp-name'; b.textContent = VP.titleOf(p); b.title = p; b.addEventListener('click', () => playAt(i));
      const x = document.createElement('button'); x.className = 'vp-x'; x.textContent = '✕'; x.setAttribute('aria-label', t('vp.remove')); x.addEventListener('click', () => removeAt(i));
      li.append(b, x); ul.append(li);
    });
    put(K.queue, list.slice(0, VP.LIMITS.playlist));
    syncHeading();
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
    list.splice(i, 1);
    if (i < idx) idx--; else if (i === idx) { idx = -1; stop(); }
    renderList();
  }
  function stop() { saveResume(); video.pause(); video.removeAttribute('src'); video.load(); $('vpFrame').classList.remove('has-media'); }

  function playAt(i) {
    if (i < 0 || i >= list.length) return;
    saveResume();
    idx = i; const p = list[i];
    clearSubs();
    if (VP.isUrl(p)) video.removeAttribute('crossorigin'); else video.crossOrigin = 'anonymous';
    video.src = VP.mediaUrl(p);
    $('vpFrame').classList.add('has-media');
    video.playbackRate = Number($('vpSpeed').value) || 1;
    renderList(); renderBookmarks();
    put(K.recent, VP.pushRecent(get(K.recent, []), p)); fillRecent();
    say('');
    window.dispatchEvent(new CustomEvent('waveframe:video-playing'));
    video.play().catch(() => { /* the error event reports unsupported media */ });
    if (!VP.isUrl(p)) loadSiblingSubs(p);
    refreshFx();
  }
  const next = (d) => { if (list.length) playAt((idx + d + list.length) % list.length); };

  /* ---------------- resume ---------------- */
  function saveResume() {
    const it = current(); if (!it || !video.duration) return;
    const pos = video.currentTime * 1000, act = VP.resumeAction(pos, video.duration * 1000);
    const map = get(K.resume, {});
    if (act === 'save') map[it] = Math.round(pos); else if (act === 'clear') delete map[it]; else return;
    put(K.resume, VP.limitResume(map));
  }

  /* ---------------- bookmarks ---------------- */
  function renderBookmarks() {
    const ul = $('vpBookmarks'); ul.textContent = '';
    const it = current(); if (!it) return;
    for (const b of VP.sortedBookmarks(get(K.bookmarks, []), it)) {
      const li = document.createElement('li');
      const go = document.createElement('button'); go.className = 'vp-name'; go.textContent = VP.clock(b.ms); go.addEventListener('click', () => { video.currentTime = b.ms / 1000; });
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
  function clearSubs() { subSrc = []; subSel = -1; subDelay = 0; $('vpSubDelay').textContent = '0 s'; rebuildTrack(); fillSubSelect(); }
  function fillSubSelect() {
    const sel = $('vpSubTrack'); sel.textContent = '';
    const off = document.createElement('option'); off.value = '-1'; off.textContent = t('vp.subOff'); sel.append(off);
    subSrc.forEach((s, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = s.name; sel.append(o); });
    sel.value = String(subSel);
    $('vpCaptions').setAttribute('aria-pressed', String(subSel >= 0));
  }
  function rebuildTrack() {
    video.querySelectorAll('track').forEach((tr) => { if (tr.src.startsWith('blob:')) URL.revokeObjectURL(tr.src); tr.remove(); });
    if (subSel < 0 || !subSrc[subSel]) return;
    const s = subSrc[subSel], r = VP.subtitleToVtt(s.text, s.ext, subDelay * 1000);
    if (!r.cues) { say(t('vp.subEmpty')); return; }
    const tr = document.createElement('track');
    tr.kind = 'subtitles'; tr.label = s.name; tr.default = true;
    tr.src = URL.createObjectURL(new Blob([r.vtt], { type: 'text/vtt' }));
    video.append(tr);
    tr.addEventListener('load', () => { if (video.textTracks[0]) video.textTracks[0].mode = 'showing'; });
    if (video.textTracks[0]) video.textTracks[0].mode = 'showing';
  }
  function preferredIndex() {
    const langs = (get(K.subs, {}).languages) || ['el', 'en'];
    for (const l of langs) { const i = subSrc.findIndex((s) => new RegExp(`[._-]${l}([._-]|$)`, 'i').test(s.name.replace(/\.[^.]+$/, ''))); if (i >= 0) return i; }
    return 0;
  }
  async function loadSiblingSubs(p) {
    const found = await api.vpSubsFor(p).catch(() => []);
    if (current() !== p || !found.length) return;
    subSrc = found; subSel = preferredIndex(); fillSubSelect(); rebuildTrack();
  }
  async function loadSubFile() {
    const f = await api.vpPickSub(); if (!f) return;
    subSrc.push({ name: f.name, ext: f.ext, text: f.text }); subSel = subSrc.length - 1; fillSubSelect(); rebuildTrack();
  }
  function setDelay(d) { subDelay = Math.round(d * 10) / 10; $('vpSubDelay').textContent = `${subDelay > 0 ? '+' : ''}${subDelay} s`; rebuildTrack(); }
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
  function stepFrame(d) { video.pause(); video.currentTime = Math.max(0, video.currentTime + d / 25); }
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
    setIcon(p, playing ? 'Pause' : 'Play');
    const lbl = playing ? t('vp.pause') : t('vp.play'); p.title = lbl; p.setAttribute('aria-label', lbl);
    const m = $('vpMute'), muted = video.muted || video.volume === 0;
    setIcon(m, muted ? 'Mute' : 'Volume');
    const ml = muted ? t('vp.unmute') : t('vp.mute'); m.title = ml; m.setAttribute('aria-label', ml); m.setAttribute('aria-pressed', String(muted));
  }
  function syncTime() {
    const d = Number.isFinite(video.duration) ? video.duration : 0, c = video.currentTime || 0;
    $('vpTime').textContent = VP.clock(c * 1000) + ' / ' + VP.clock(d * 1000);
    const seek = $('vpSeek');
    seek.disabled = d <= 0;
    if (!seeking || seek.disabled) seek.value = String(d > 0 ? Math.round(c / d * 1000) : 0);
  }
  let seeking = false;
  function iconLabels() {
    for (const [id, key] of [['vpPrev', 'vp.prev'], ['vpNext', 'vp.next'], ['vpStop', 'vp.stop'], ['vpSnap', 'vp.snapshot'], ['vpFull', 'vp.fullscreen']]) { const b = $(id); b.title = t(key); b.setAttribute('aria-label', t(key)); }
    $('vpSeek').setAttribute('aria-label', t('vp.seek')); $('vpVolume').setAttribute('aria-label', t('vp.volume'));
    if (video) syncTransport();
  }
  function aria() {
    iconLabels(); $('vpFramePrev').setAttribute('aria-label', t('vp.framePrev')); $('vpFramePrev').title = t('vp.framePrev'); $('vpFrameNext').setAttribute('aria-label', t('vp.frameNext')); $('vpFrameNext').title = t('vp.frameNext'); }

  /* ---------------- build ---------------- */
  function build() {
    if (built) return; built = true;
    video = $('vpVideo');
    bindPanels();
    for (const s of VP.SPEEDS) { const o = document.createElement('option'); o.value = String(s); o.textContent = `${s}×`; $('vpSpeed').append(o); }
    $('vpSpeed').value = String(get(K.speed, 1)); if (!$('vpSpeed').value) $('vpSpeed').value = '1';
    const subs = get(K.subs, {});
    if (subs.fontSize) $('vpSubSize').value = String(subs.fontSize);
    if (subs.color) $('vpSubColor').value = subs.color;
    applySubStyle();
    list = (get(K.queue, [])).filter(VP.playable).slice(0, VP.LIMITS.playlist);
    renderList(); fillPlaylists(); fillRecent(); fillSubSelect();

    $('vpOpen').addEventListener('click', async () => addPaths(await api.vpPick('files'), true));
    $('vpEmptyOpen').addEventListener('click', () => $('vpOpen').click());
    $('vpQueueAdd').addEventListener('click', () => $('vpOpen').click());
    $('vpQueueToggle').addEventListener('click', () => {
      const queue = $('vpQueue');
      queue.hidden = !queue.hidden;
      $('vpQueueToggle').setAttribute('aria-expanded', String(!queue.hidden));
      if (!queue.hidden) queue.scrollIntoView({ block: 'nearest' });
    });
    $('vpOpenFolder').addEventListener('click', async () => { hidePanels(); addPaths(await api.vpPick('folder'), true); });
    $('vpOpenUrl').addEventListener('click', async () => { hidePanels(); const u = await showInputDialog(t('vp.urlPrompt')); if (u && /^https?:\/\/\S+$/i.test(u.trim())) addPaths([u.trim()], true); else if (u) say(t('vp.unsupported')); });
    $('vpPrev').addEventListener('click', () => next(-1));
    $('vpNext').addEventListener('click', () => next(1));
    $('vpPlay').addEventListener('click', () => { if (!current() && list.length) playAt(0); else if (video.paused) video.play().catch(() => {}); else video.pause(); });
    $('vpStop').addEventListener('click', () => { video.pause(); video.currentTime = 0; syncTime(); syncTransport(); });
    $('vpMute').addEventListener('click', () => { video.muted = !video.muted; syncTransport(); });
    $('vpVolume').addEventListener('input', () => { video.volume = Number($('vpVolume').value) / 100; video.muted = video.volume === 0; syncTransport(); });
    video.addEventListener('volumechange', () => { $('vpVolume').value = String(Math.round((video.muted ? 0 : video.volume) * 100)); syncTransport(); });
    $('vpSeek').addEventListener('input', () => { seeking = true; if (video.duration) video.currentTime = Number($('vpSeek').value) / 1000 * video.duration; });
    $('vpSeek').addEventListener('change', () => { seeking = false; });
    video.addEventListener('timeupdate', syncTime); video.addEventListener('durationchange', syncTime);
    video.addEventListener('emptied', () => { seeking = false; syncTime(); });
    for (const ev of ['play', 'pause', 'ended', 'emptied']) video.addEventListener(ev, syncTransport);
    video.addEventListener('click', () => { if (video.paused) video.play().catch(() => {}); else video.pause(); });
    video.addEventListener('dblclick', () => $('vpFull').click());
    $('vpSpeed').addEventListener('change', () => { video.playbackRate = Number($('vpSpeed').value) || 1; put(K.speed, video.playbackRate); });
    $('vpFx').addEventListener('click', toggleFx);
    $('vpFull').addEventListener('click', () => {
      hidePanels();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else $('vpStage').requestFullscreen().catch(() => {});
    });
    document.addEventListener('fullscreenchange', () => {
      const fullscreen = document.fullscreenElement === $('vpStage');
      setIcon($('vpFull'), fullscreen ? 'ExitFull' : 'Full');
      $('vpFull').setAttribute('aria-pressed', String(fullscreen));
      applyPicture();
    });
    $('vpSubTrack').addEventListener('change', () => { subSel = Number($('vpSubTrack').value); $('vpCaptions').setAttribute('aria-pressed', String(subSel >= 0)); rebuildTrack(); });
    $('vpSubLoad').addEventListener('click', loadSubFile);
    $('vpSubMinus').addEventListener('click', () => setDelay(subDelay - 0.5));
    $('vpSubPlus').addEventListener('click', () => setDelay(subDelay + 0.5));
    $('vpSubSize').addEventListener('input', applySubStyle);
    $('vpSubColor').addEventListener('input', applySubStyle);
    $('vpBookmark').addEventListener('click', addBookmark);
    $('vpClear').addEventListener('click', () => { list = []; idx = -1; stop(); renderList(); renderBookmarks(); });
    $('vpSavePl').addEventListener('click', savePlaylist);
    $('vpImportM3u').addEventListener('click', importM3u);
    $('vpPlLoad').addEventListener('click', () => { const l = get(K.playlists, {})[$('vpPlSelect').value]; if (l) { list = []; idx = -1; addPaths(l, true); } });
    $('vpPlDelete').addEventListener('click', () => { const all = get(K.playlists, {}); delete all[$('vpPlSelect').value]; put(K.playlists, all); fillPlaylists(); });
    $('vpRecent').addEventListener('change', () => { const p = $('vpRecent').value; if (p) addPaths([p], true); $('vpRecent').value = ''; });

    video.addEventListener('loadedmetadata', () => {
      ab = { stage: 'off', a: 0, b: 0 };
      const it = current(); if (!it) return;
      const pos = get(K.resume, {})[it];
      if (pos > 0 && pos / 1000 < video.duration - 10) { video.currentTime = pos / 1000; say(fmt(t('vp.resumed'), { time: VP.clock(pos) })); }
    });
    video.addEventListener('error', () => say(t('vp.cantPlay')));
    video.addEventListener('ended', onEnded);
    video.addEventListener('timeupdate', () => { if (ab.stage === 'loop' && video.currentTime >= ab.b) video.currentTime = ab.a; });
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
    video.addEventListener('pause', saveResume);
    video.addEventListener('play', () => window.dispatchEvent(new CustomEvent('waveframe:video-playing')));
    saveTimer = setInterval(() => { if (!video.paused) saveResume(); }, 5000);
    window.addEventListener('beforeunload', saveResume);
    window.addEventListener('waveframe:storage-changed', () => { fillPlaylists(); fillRecent(); renderBookmarks(); const s = get(K.subs, {}); if (s.fontSize) $('vpSubSize').value = String(s.fontSize); if (s.color) $('vpSubColor').value = s.color; applySubStyle(); });
    document.addEventListener('waveframe:language-changed', () => { fillSubSelect(); fillPlaylists(); fillRecent(); syncHeading(); });

    const frame = $('vpFrame');
    for (const target of [frame, $('vpQueue')]) {
      target.addEventListener('dragover', (e) => { e.preventDefault(); target.classList.add('drag'); });
      target.addEventListener('dragleave', () => target.classList.remove('drag'));
      target.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        target.classList.remove('drag');
        const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
        const sub = paths.find((p) => /\.(srt|vtt|ass|ssa)$/i.test(p));
        const media = paths.filter((p) => !/\.(srt|vtt|ass|ssa)$/i.test(p));
        if (media.length) addPaths(media, target === frame || !current());
        else if (sub && current()) say(t('vp.dropSubUseButton'));
      });
    }
    document.addEventListener('keydown', (e) => {
      if (!$('tab-video').classList.contains('active') || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey ||
          e.target.closest('input, select, textarea, [popover], [contenteditable]') ||
          (e.key === ' ' && e.target.closest('button'))) return;
      const k = e.key; let used = true;
      if (k === ' ') $('vpPlay').click();
      else if (k === 'ArrowRight') video.currentTime += e.shiftKey ? 30 : 5;
      else if (k === 'ArrowLeft') video.currentTime -= e.shiftKey ? 30 : 5;
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
    hidePanels,
    open(p) { build(); addPaths([p], true); },
    pause() { if (built && video && !video.paused) video.pause(); },
    get playing() { return built && video && !video.paused; },
  };
  build();
})();
