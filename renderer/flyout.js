const $ = (id) => document.getElementById(id);
const api = window.mediaFlyout;
const controls = [...document.querySelectorAll('[data-action]')];
const labelled = [...document.querySelectorAll('[data-label]')];
const bars = [...document.querySelectorAll('.flyout-spectrum i')];
const repeatLabels = { off: 'vp.repeatOff', all: 'vp.repeatList', one: 'vp.repeatFile' };
let state;
let system;
let mode = 'media';
let noticeTimer;
const mixerRows = new Map();

function setLabel(element, label) {
  element.title = label;
  element.setAttribute('aria-label', label);
}

function formatTime(seconds) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function render() {
  $('title').textContent = state?.title || t('player.noTrack');
  if (!state) return;
  $('artist').textContent = state.artist;
  $('upcoming').textContent = state.upcoming;
  $('up-next').hidden = !state.upcoming;
  $('playpause').textContent = state.playing ? '⏸' : '▶';
  setLabel($('playpause'), state.playing ? t('vp.pause') : t('vp.play'));
  $('mute').textContent = state.muted ? '🔇' : '🔊';
  setLabel($('mute'), state.muted ? t('vp.unmute') : t('vp.mute'));
  $('repeat').textContent = state.repeat === 'one' ? '↻¹' : '↻';
  setLabel($('repeat'), `${t('vp.repeat')} · ${t(repeatLabels[state.repeat])}`);
  $('shuffle').setAttribute('aria-pressed', String(state.shuffle));
  $('mute').setAttribute('aria-pressed', String(state.muted));
  $('repeat').setAttribute('aria-pressed', String(state.repeat !== 'off'));
  $('playpause').disabled = !state.canPlay;
  $('prev').disabled = !(state.canPrev ?? state.canPlay);
  $('shuffle').disabled = state.external && !state.canShuffle;
  $('repeat').disabled = state.external && !state.canRepeat;
  $('player-volume').hidden = state.external === true;
  $('next').disabled = !state.canNext;
  $('seek').disabled = state.canSeek === false || state.duration <= 0;
  if (!dragging.has($('seek'))) {
    $('elapsed').textContent = formatTime(state.position);
    $('seek').value = state.duration ? state.position / state.duration : 0;
  }
  $('duration').textContent = formatTime(state.duration);
  if (!dragging.has($('volume'))) {
    $('volume').value = state.volume / 100;
    $('volume-level').value = `${Math.round(state.volume)}%`;
  }
  bars.forEach((bar, i) => { bar.style.transform = `scaleY(${0.12 + 0.88 * (state.spectrum[i] || 0)})`; });
}

function translate() {
  for (const element of labelled) setLabel(element, t(element.dataset.label));
  render();
  renderDesktop();
}

const dragging = new Set();
for (const id of ['volume', 'seek']) {
  const slider = $(id);
  slider.addEventListener('pointerdown', () => dragging.add(slider));
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    slider.addEventListener(event, () => dragging.delete(slider));
  }
  slider.addEventListener('input', () => {
    const value = slider.valueAsNumber;
    if (id === 'volume') {
      $('volume-level').value = `${Math.round(value * 100)}%`;
      api.command(id, value);
    } else if (state) {
      $('elapsed').textContent = formatTime(value * state.duration);
    }
  });
  if (id === 'seek') slider.addEventListener('change', () => api.command(id, slider.valueAsNumber));
}
for (const button of controls) button.addEventListener('click', () => api.command(button.dataset.action));
$('dismiss').addEventListener('click', api.dismiss);
window.addEventListener('keydown', (event) => { if (event.key === 'Escape') api.dismiss(); });
window.addEventListener('blur', () => dragging.clear());
document.body.addEventListener('pointerenter', () => api.hover(true));
document.body.addEventListener('pointerleave', () => api.hover(false));
$('cover').addEventListener('error', () => { $('cover').hidden = true; });

api.onAppearance(({ lang, theme, accent }) => {
  document.documentElement.dataset.theme = theme;
  if (accent) document.documentElement.style.setProperty('--accent', accent);
  else document.documentElement.style.removeProperty('--accent');
  applyLanguage(lang);
});
function mixerRow(id) {
  if (mixerRows.has(id)) return mixerRows.get(id);
  const row = document.createElement('div');
  row.className = 'mixer-row';
  const label = document.createElement('div');
  label.className = 'mixer-row-label flyout-ellipsis';
  const body = document.createElement('div');
  body.className = 'flyout-volume';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = 0;
  slider.max = 1;
  slider.step = 0.01;
  const output = document.createElement('output');
  const controls = { row, label, toggle, slider, output };
  slider.addEventListener('pointerdown', () => dragging.add(slider));
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
    slider.addEventListener(event, () => dragging.delete(slider));
  slider.addEventListener('input', () => { output.value = `${Math.round(slider.valueAsNumber * 100)}%`; });
  slider.addEventListener('change', () => api.mixer(id, 'volume', slider.valueAsNumber));
  toggle.addEventListener('click', () => api.mixer(id, 'mute', controls.muted ? 0 : 1));
  body.append(toggle, slider, output);
  row.append(label, body);
  $('mixer-controls').append(row);
  mixerRows.set(id, controls);
  return controls;
}

function renderMixer() {
  const { mixer } = system || {};
  const rows = mixer?.master ? [mixer.master, ...mixer.apps] : [];
  $('mixer-empty').hidden = rows.length > 0;
  const current = new Set(rows.map((item) => item.id));
  for (const [id, controls] of mixerRows) {
    if (current.has(id)) continue;
    controls.row.remove();
    dragging.delete(controls.slider);
    mixerRows.delete(id);
  }
  for (const item of rows) {
    const controls = mixerRow(item.id);
    const name = item.id === 'master' ? t('desktop.master') + (item.name ? ' · ' + item.name : '') : item.name || t('vp.volume');
    controls.label.textContent = name;
    controls.label.title = name;
    setLabel(controls.slider, `${name} · ${t('vp.volume')}`);
    setLabel(controls.toggle, `${name} · ${item.muted ? t('vp.unmute') : t('vp.mute')}`);
    controls.muted = item.muted;
    controls.toggle.textContent = item.muted ? '🔇' : '🔊';
    controls.toggle.setAttribute('aria-pressed', String(item.muted));
    if (!dragging.has(controls.slider) && document.activeElement !== controls.slider) {
      controls.slider.value = item.volume;
      controls.output.value = `${Math.round(item.volume * 100)}%`;
    }
  }
}

function renderDesktop() {
  const select = $('source');
  const isMixer = mode === 'mixer' && system?.available;
  $('mixer-mode').hidden = !system?.available;
  $('mixer-mode').setAttribute('aria-pressed', String(!!isMixer));
  $('mixer-panel').hidden = !isMixer;
  $('player-panel').hidden = !!isMixer;
  select.hidden = !!isMixer || !system?.sessions.length;
  if (system) {
    const sources = [{ id: '', name: 'Opsis Media Suite' }, ...system.sessions];
    const labels = sources.map(({ id, name, title }) => [id, title ? `${name} · ${title}` : name]);
    if (JSON.stringify(labels) !== select.dataset.labels) {
      select.replaceChildren(...labels.map(([id, name]) => new Option(name, id)));
      select.dataset.labels = JSON.stringify(labels);
    }
    select.value = system.selected;
  }
  if (isMixer) renderMixer();
}

$('source').addEventListener('change', () => api.select($('source').value));
$('mixer-mode').addEventListener('click', () => {
  mode = mode === 'mixer' ? 'media' : 'mixer';
  renderDesktop();
});
api.onSystem((data) => { system = data; renderDesktop(); });
api.onMode((value) => { mode = value; renderDesktop(); });
api.onNotice(() => {
  clearTimeout(noticeTimer);
  $('notice').hidden = false;
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 3500);
});

api.onState((data) => { state = data; render(); });
api.onArtwork((image) => {
  if (image && image === $('cover').getAttribute('src')) return;
  $('cover').hidden = !image;
  if (image) $('cover').src = image;
  else $('cover').removeAttribute('src');
});
function applyLanguage(lang) {
  currentLang = resolveDesktopLanguage(lang);
  applyI18n();
  translate();
}
applyLanguage(new URLSearchParams(location.search).get('lang'));
