'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('mediaFlyout',{
 onState:callback=>ipcRenderer.on('flyout:state',(_event,state)=>callback(state)),
 command:action=>ipcRenderer.send('flyout:command',action),
});
