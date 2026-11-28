'use strict';
const $=id=>document.getElementById(id);
let target=null,previousTarget='',editing=new Set();
for(const id of ['seek','volume']){
 $(id).addEventListener('pointerdown',()=>editing.add(id));
 for(const event of ['pointerup','pointercancel','blur'])$(id).addEventListener(event,()=>editing.delete(id));
}
const clock=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
for(const id of ['seek','volume'])$(id).addEventListener('change',()=>{editing.delete(id);if(target)window.mediaFlyout.command({...target,action:id,value:Number($(id).value)});});
$('mute').addEventListener('click',()=>{if(target)window.mediaFlyout.command({...target,action:'mute'});});
$('dismiss').addEventListener('click',()=>window.mediaFlyout.command('dismiss'));
for(const id of ['prev','playpause','next','stop'])$(id).addEventListener('click',()=>{if(target)window.mediaFlyout.command({...target,action:id});});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();window.mediaFlyout.command('dismiss');}});
window.mediaFlyout.onState(state=>{
 document.documentElement.lang=state.lang;
 document.documentElement.dataset.theme=state.theme;
 target=state.title?{title:state.title,owner:state.owner}:null;
 const identity=JSON.stringify(target);
 if(identity!==previousTarget){editing.clear();previousTarget=identity;}
 const p=state.progress;
 for(const id of ['seek','volume','mute'])$(id).disabled=!target||!p||(id==='seek'&&!p.duration);
 for(const id of ['seek','volume'])$(id).setAttribute('aria-label',state.labels[id]);
 $('mute').textContent=p?.muted?'🔇':'🔊';$('mute').setAttribute('aria-label',p?.muted?state.labels.unmute:state.labels.mute);$('mute').setAttribute('aria-pressed',String(!!p?.muted));
 $('elapsed').textContent=clock(p?.position||0);$('duration').textContent=clock(p?.duration||0);
 if(!editing.has('seek')||!p?.duration)$('seek').value=String(p?.duration?Math.round(p.position/p.duration*1000):0);
 if(!editing.has('volume')||!p)$('volume').value=String(p?.volume??0);
 $('volume-level').textContent=(p?.volume??0)+'%';
 $('source').textContent=state.owner==='video'?state.labels.video:state.labels.audio;
 $('title').textContent=state.title||state.labels.empty;
 $('playpause').textContent=state.playing?'⏸':'▶';
 for(const [id,label] of [['prev',state.labels.prev],['next',state.labels.next],['playpause',state.playing?state.labels.pause:state.labels.play],['stop',state.labels.stop],['dismiss',state.labels.close]]){
  $(id).title=label;$(id).setAttribute('aria-label',label);
  if(id!=='dismiss')$(id).disabled=!state.title;
 }
});
