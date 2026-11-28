'use strict';

const WaveframeBackup = (() => {
  const keys = [
    'accentColor', 'automaticFlyout', 'fxSoundMode', 'metadata.inferDisplay', 'video.nativeDecoder', 'video.remainingTime', 'video.subSaveBeside', 'bg', 'btnStyle', 'conv.opts', 'destFolder', 'destMode', 'hueMode', 'hueValue',
    'lang', 'lastDarkSkin', 'layout', 'lockFlyout', 'notifyUpdates', 'playlist', 'playlistHeight', 'preferManagedFfmpeg', 'skin',
    'taskbarWidget', 'taskbarWidgetCoverBackground', 'taskbarWidgetMinimizedOnly', 'taskbarWidgetOffset',
    'taskbarWidgetPosition', 'trackNotifications', 'tutorialSeen', 'userPresets', 'vid.opts', 'vidDestFolder',
    'vidDestMode', 'video.bookmarks', 'video.playlists', 'video.queue', 'video.recent', 'video.repeat',
    'video.resume', 'video.speed', 'video.subs', 'visMode',
  ].map((key) => 'waveframe.' + key);
  const allowed = new Set(keys);
  const outputFolders = new Set(['waveframe.destFolder', 'waveframe.vidDestFolder']);
  const maxBytes = 8 * 1024 * 1024;

  const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  const strings = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
  const schemas = {
    'waveframe.playlist': (list) => Array.isArray(list) && list.every((item) =>
      isRecord(item) && typeof item.name === 'string' &&
      (typeof item.path === 'string' || typeof item.url === 'string')),
    'waveframe.userPresets': (list) => Array.isArray(list) && list.every((item) =>
      isRecord(item) && typeof item.name === 'string' && Array.isArray(item.bands) &&
      item.bands.length <= 10 && item.bands.every(Number.isFinite)),
    'waveframe.video.bookmarks': (list) => Array.isArray(list) && list.every((item) =>
      isRecord(item) && typeof item.path === 'string' && Number.isFinite(item.ms)),
    'waveframe.video.playlists': (item) => isRecord(item) && Object.values(item).every(strings),
    'waveframe.video.recent': strings,
    'waveframe.video.queue': strings,
    'waveframe.video.resume': (item) => isRecord(item) && Object.values(item).every(v=>Number.isFinite(v)&&v>=0),
    'waveframe.video.subs': (item) => isRecord(item) && (item.languages == null || strings(item.languages)),
    'waveframe.video.speed': v => Number.isFinite(v)&&v>=0.25&&v<=4,
    'waveframe.conv.opts': isRecord,
    'waveframe.vid.opts': isRecord,
  };

  function validStoredValue(key, value) {
    if (typeof value !== 'string' || value.length >= 5 * 1024 * 1024) return false;
    if (outputFolders.has(key) && value && (!/^[a-z]:[\/]/i.test(value) || /[\u0000-\u001f:]/.test(value.slice(2)))) return false;
    if (!Object.hasOwn(schemas, key)) return true;
    try { return schemas[key](JSON.parse(value)); } catch { return false; }
  }

  function collect(storage) {
    return Object.fromEntries(keys.map((key) => [key, storage.getItem(key)]).filter(([key, value]) => value !== null && validStoredValue(key,value)));
  }

  function sanitize(data) {
    if (!isRecord(data)) return null;
    const entries = Object.entries(data).filter(([key]) => allowed.has(key));
    if (entries.some(([key, value]) => !validStoredValue(key, value))) return null;
    const clean = Object.fromEntries(entries);
    if (new TextEncoder().encode(JSON.stringify(clean,null,2)).byteLength > maxBytes) return null;
    return clean;
  }
  function restore(storage, data) {
    const clean=sanitize(data);if(!clean)return false;
    const entries=Object.entries(clean);
    const applied = [];
    try {
      for (const [key, value] of entries) {
        const original = storage.getItem(key);
        storage.setItem(key, value);
        applied.push([key, original]);
      }
      return true;
    } catch {
      for (const [key, value] of applied.reverse()) {
        try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); } catch { /* storage may have become unavailable */ }
      }
      return false;
    }
  }

  return { collect, restore, sanitize };
})();

if (typeof module !== 'undefined') module.exports = WaveframeBackup;
