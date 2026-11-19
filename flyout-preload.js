const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mediaFlyout', {
  onAppearance: (callback) => ipcRenderer.on('flyout:appearance', (_event, data) => callback(data)),
  onState: (callback) => ipcRenderer.on('flyout:state', (_event, data) => callback(data)),
  onArtwork: (callback) => ipcRenderer.on('flyout:artwork', (_event, data) => callback(data)),
  onSystem: (callback) => ipcRenderer.on('flyout:system', (_event, data) => callback(data)),
  onMode: (callback) => ipcRenderer.on('flyout:mode', (_event, mode) => callback(mode)),
  onLock: (callback) => ipcRenderer.on('flyout:lock', (_event, data) => callback(data)),
  onNotice: (callback) => ipcRenderer.on('flyout:notice', (_event, data) => callback(data)),
  select: (id) => ipcRenderer.send('flyout:select', id),
  mixer: (id, action, value) => ipcRenderer.send('flyout:mixer', { id, action, value }),
  command: (action, value) => ipcRenderer.send('flyout:command', { action, value }),
  hover: (hovered) => ipcRenderer.send('flyout:hover', hovered),
  dismiss: () => ipcRenderer.send('flyout:dismiss'),
});
