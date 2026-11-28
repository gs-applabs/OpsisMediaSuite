'use strict';
// Local Opsis playback only. On-demand window; no second player, polling,
// Windows hook or helper process. One listener exists only while open.
const {BrowserWindow,ipcMain,screen}=require('electron');
const path=require('node:path');
const {command:validateCommand}=require('./flyout-policy');
function attachFlyout(owner,getState){
 let win=null,ready=false,timer=null,manual=false,loading=null;
 const stopTimer=()=>{clearTimeout(timer);timer=null;};
 const live=()=>win&&!win.isDestroyed();
 const send=()=>{if(live()&&ready)win.webContents.send('flyout:state',getState());};
 function close(){stopTimer();if(live())win.destroy();}
 function visibility(value){if(!owner.isDestroyed())owner.webContents.send('flyout:visible',value);}
 function command(e,action){
  if(!live()||!ready||e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame||owner.isDestroyed())return;
  const cmd=validateCommand(action,getState());if(!cmd)return;
  if(cmd.action==='dismiss'){close();return;}
  owner.webContents.send('media-key',cmd.action,cmd.value,cmd.owner?{owner:cmd.owner,title:cmd.title}:null);
  if(!manual)arm();
 }
 function arm(){stopTimer();if(!manual)timer=setTimeout(close,6500);}
 function open(explicit=true){
  if(owner.isDestroyed())return Promise.resolve(false);
  if(live()){
   manual=manual||explicit;
   if(ready){send();if(explicit)win.focus();arm();}
   return loading||Promise.resolve(true);
  }
  manual=explicit;ready=false;
  const work=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const width=Math.min(360,work.width),height=Math.min(300,work.height);
  const local=new BrowserWindow({
   width,height,x:work.x+Math.max(0,work.width-width-12),y:work.y+Math.max(0,work.height-height-12),
   show:false,frame:false,skipTaskbar:true,resizable:false,alwaysOnTop:true,
   minimizable:false,maximizable:false,fullscreenable:false,backgroundColor:'#14141f',
   webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,preload:path.join(__dirname,'flyout-preload.js')},
  });
  win=local;ipcMain.on('flyout:command',command);
  local.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  local.webContents.on('will-navigate',e=>e.preventDefault());
  local.webContents.on('render-process-gone',()=>{if(win===local)close();});
  local.on('closed',()=>{
   ipcMain.removeListener('flyout:command',command);
   if(win===local){stopTimer();win=null;ready=false;manual=false;loading=null;visibility(false);}
  });
  loading=local.loadFile(path.join(__dirname,'renderer','flyout.html')).then(()=>{
   if(win!==local||local.isDestroyed())return false;
   ready=true;send();if(manual)local.show();else local.showInactive();visibility(true);arm();return true;
  }).catch(()=>{if(win===local)close();return false;});
  return loading;
 }
 owner.once('closed',close);
 owner.webContents.on('did-start-navigation',(_e,_url,inPlace,mainFrame)=>{if(mainFrame&&!inPlace)close();});
 return {open,send,close,closeAutomatic:()=>{if(!manual)close();},window:()=>live()?win:null};
}
module.exports={attachFlyout};
