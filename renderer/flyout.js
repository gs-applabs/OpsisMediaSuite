'use strict';
const $=id=>document.getElementById(id);
for(const id of ['prev','playpause','next','stop','dismiss'])$(id).addEventListener('click',()=>window.mediaFlyout.command(id));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();window.mediaFlyout.command('dismiss');}});
window.mediaFlyout.onState(state=>{
 document.documentElement.lang=state.lang;
 document.documentElement.dataset.theme=state.theme;
 $('source').textContent=state.owner==='video'?state.labels.video:state.labels.audio;
 $('title').textContent=state.title||state.labels.empty;
 $('playpause').textContent=state.playing?'⏸':'▶';
 for(const [id,label] of [['prev',state.labels.prev],['next',state.labels.next],['playpause',state.playing?state.labels.pause:state.labels.play],['stop',state.labels.stop],['dismiss',state.labels.close]]){
  $(id).title=label;$(id).setAttribute('aria-label',label);
  if(id!=='dismiss')$(id).disabled=!state.title;
 }
});
