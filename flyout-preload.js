const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mediaFlyout', {
  onAppearance: (callback) => ipcRenderer.on('flyout:appearance', (_event, data) => callback(data)),
  onState: (callback) => ipcRenderer.on('flyout:state', (_event, data) => callback(data)),
  onArtwork: (callback) => ipcRenderer.on('flyout:artwork', (_event, data) => callback(data)),
  command: (action, value) => ipcRenderer.send('flyout:command', { action, value }),
  hover: (hovered) => ipcRenderer.send('flyout:hover', hovered),
  dismiss: () => ipcRenderer.send('flyout:dismiss'),
});
