'use strict';
// A narrow data contract; no paths, URLs, scripts, artwork or filesystem grants.
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const validOwner=x=>x==='audio'||x==='video';
function sameTarget(a,b){return plain(a)&&plain(b)&&validOwner(a.owner)&&a.owner===b.owner&&typeof a.title==='string'&&a.title.length<=300&&a.title===b.title;}
function progress(data,state){
 if(!sameTarget(data,state)||!data.title||!Number.isInteger(data.duration)||data.duration<0||data.duration>604800||
 !Number.isInteger(data.position)||data.position<0||data.position>data.duration||
 !Number.isInteger(data.volume)||data.volume<0||data.volume>100||typeof data.muted!=='boolean')return null;
 return {duration:data.duration,position:data.position,volume:data.volume,muted:data.muted};
}
function command(data,state){
 if(typeof data==='string'&&['prev','playpause','next','stop','dismiss'].includes(data))return {action:data};
 if(!sameTarget(data,state)||!data.title)return null;
 if(data.action==='mute')return {action:'mute',title:data.title,owner:data.owner};
 if(!['seek','volume'].includes(data.action)||!Number.isInteger(data.value)||data.value<0||data.value>(data.action==='seek'?1000:100))return null;
 return {action:data.action,value:data.value,title:data.title,owner:data.owner};
}
module.exports={progress,command,sameTarget};
