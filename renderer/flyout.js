const $ = (id) => document.getElementById(id);
const api = window.mediaFlyout;
const controls = [...document.querySelectorAll('[data-action]')];
const labelled = [...document.querySelectorAll('[data-label]')];
const bars = [...document.querySelectorAll('.flyout-spectrum i')];
const repeatLabels = { off: 'vp.repeatOff', all: 'vp.repeatList', one: 'vp.repeatFile' };
let state;

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
  $('playpause').disabled = $('prev').disabled = !state.canPlay;
  $('next').disabled = !state.canNext;
  $('seek').disabled = state.duration <= 0;
  if (!dragging.has($('seek'))) {
    $('elapsed').textContent = formatTime(state.position);
    $('seek').value = state.duration ? state.position / state.duration : 0;
  }
  $('duration').textContent = formatTime(state.duration);
  if (!dragging.has($('volume'))) {
    $('volume').value = state.volume / 100;
    $('volume-level').value = `${Math.round(state.volume)}%`;
  }
  bars.forEach((bar, i) => { bar.style.transform = `scaleY(${0.12 + 0.88 * state.spectrum[i]})`; });
}

function translate() {
  for (const element of labelled) setLabel(element, t(element.dataset.label));
  render();
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
api.onState((data) => { state = data; render(); });
api.onArtwork((image) => {
  $('cover').hidden = !image;
  if (image) $('cover').src = image;
  else $('cover').removeAttribute('src');
});
function applyLanguage(lang) {
  currentLang = Object.hasOwn(I18N, lang) ? lang : 'el';
  applyI18n();
  translate();
}
applyLanguage(new URLSearchParams(location.search).get('lang'));
