'use strict';
// Video player helpers (2.3.0): subtitle conversion to WebVTT (the browser shows it natively, with a delay), resume / recent / bookmark rules,
// file-kind detection and the wfmedia: URL. Pure functions, unit-tested in Node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WaveframeVp = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const VIDEO = ['mp4', 'm4v', 'mkv', 'webm', 'mov', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', 'm2ts', 'ogv', '3gp'];
  const AUDIO = ['mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'wma', 'aiff', 'aif'];
  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 4];
  const LIMITS = { recent: 30, playlist: 2000, bookmarks: 2000, resume: 2000, cues: 20000 };

  const extOf = (p) => { const m = /\.([A-Za-z0-9]{1,5})$/.exec(String(p || '')); return m ? m[1].toLowerCase() : ''; };
  const kindOf = (p) => (VIDEO.includes(extOf(p)) ? 'video' : AUDIO.includes(extOf(p)) ? 'audio' : /^https?:\/\//i.test(String(p || '')) ? 'video' : '');
  const titleOf = (p) => { const s = String(p || ''); const n = s.split(/[\\/]/).pop().replace(/\?.*$/, ''); return n.replace(/\.[A-Za-z0-9]{1,5}$/, '') || s; };
  const isUrl = (p) => /^https?:\/\//i.test(String(p || ''));

  // Local playback requires an opaque main-process ticket, never a path in a URL.
  function mediaUrl(p) { return isUrl(p) ? String(p) : null; }

  function clock(ms) {
    const s = Number.isFinite(Number(ms)) ? Math.max(0, Math.floor(Number(ms) / 1000)) : 0, h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(r).padStart(2, '0');
  }

  // Track the original index, not the path: duplicate playlist entries
  // must retain the exact active occurrence when sorting or moving.
  function reorderPlaylist(items,selected,mode,from=selected,to=selected){
    const rows=items.map((value,index)=>({value,index}));
    if(mode==='title')rows.sort((a,b)=>titleOf(a.value).localeCompare(titleOf(b.value),undefined,{numeric:true,sensitivity:'base'})||a.index-b.index);
    else if(mode==='move'&&Number.isInteger(from)&&Number.isInteger(to)&&from>=0&&to>=0&&from<rows.length&&to<rows.length){rows.splice(to,0,rows.splice(from,1)[0]);}
    return {items:rows.map(r=>r.value),selected:rows.findIndex(r=>r.index===selected)};
  }
  function clipboardUrl(value){
    if(typeof value!=='string'||value.length>2048||/[\x00-\x1f\x7f]/.test(value.trim()))return null;
    try{const u=new URL(value.trim());return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}
  }
  function streamRetryDelay(attempt){return Number.isInteger(attempt)&&attempt>=0&&attempt<3?[2000,5000,10000][attempt]:null;}
  function parseSeekTime(value){
    const s=typeof value==='string'?value.trim():'';
    if(!/^\d{1,6}(?::[0-5]\d){0,2}(?:[.,]\d{1,3})?$/.test(s))return null;
    const n=s.replace(',','.').split(':').reduce((a,b)=>a*60+Number(b),0);
    return Number.isFinite(n)&&n>=0&&n<=360000?n:null;
  }
  function displayTime(position,duration,remaining=false){
    const pos=Number.isFinite(position)?Math.max(0,position):0,finite=Number.isFinite(duration)&&duration>0;
    return (remaining&&finite?'-'+clock(Math.max(0,duration-pos)*1000):clock(pos*1000))+' / '+(duration===Infinity?'LIVE':clock(duration*1000));
  }
  const TS = /^\s*(?:(\d{1,3}):)?([0-5]?\d):([0-5]\d)[,.](\d{1,3})(?=\s|$)/;
  function toMs(h, m, s, f) { return ((+h * 60 + +m) * 60 + +s) * 1000 + +String(f).padEnd(3, '0'); }
  function vttTime(ms) {
    ms = Math.max(0, Math.round(ms));
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, f = ms % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(3, '0')}`;
  }
  const cleanText = (t) => t.replace(/\{\\[^}]*\}/g, '').replace(/\\N/g, '\n').replace(/\\n/g, '\n').replace(/\0/g, '').trim();

  // SubRip (.srt) or WebVTT text -> WebVTT text, every cue moved by shiftMs (negative = earlier). Cues that would start before 0 are clamped.
  function srtToVtt(text, shiftMs, scale=1) {
    scale=Number.isFinite(Number(scale))?Math.max(.5,Math.min(2,Number(scale))):1;
    const shift = Number.isFinite(Number(shiftMs)) ? Math.max(-3600000, Math.min(3600000, Number(shiftMs))) : 0;
    const src = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/^WEBVTT[^\n]*\n/, '');
    const out = ['WEBVTT', ''];
    let cues = 0; const entries = [];
    for (const block of src.split(/\n[\t ]*\n+/)) {
      if (/^(NOTE(?:\s|$)|STYLE(?:\s|$)|REGION(?:\s|$))/.test(block.trimStart())) continue;
      const lines = block.split('\n').filter((l, i, a) => !(i === 0 && /^\d+$/.test(l.trim()) && a.length > 1 && /-->/.test(a[1])));
      const k = lines.findIndex((l) => l.includes('-->'));
      if (k < 0) continue;
      const parts = lines[k].split('-->');
      const a = TS.exec(parts[0]), b = TS.exec(parts[1] || '');
      if (!a || !b) continue;
      const s = toMs(a[1] || 0, a[2], a[3], a[4])*scale + shift, e = toMs(b[1] || 0, b[2], b[3], b[4])*scale + shift;
      if (e <= 0 || e <= s) continue;
      const body = cleanText(lines.slice(k + 1).join('\n'));
      if (!body) continue;
      const settings = parts[1].slice(b[0].length).trim().split(/\s+/).filter(x => /^(?:align|line|position|size|vertical):[-a-z0-9.,%]+$/i.test(x)).join(' ');
      out.push(`${vttTime(s)} --> ${vttTime(e)}${settings ? ' ' + settings : ''}`, body, '');
      entries.push({start: Math.max(0,s)/1000, end:e/1000, text:body, settings});
      if (++cues >= LIMITS.cues) break;
    }
    return { vtt: out.join('\n') + '\n', cues, entries };
  }

  // Advanced SubStation (.ass / .ssa): dialogue lines only, styling is dropped.
  function assToSrt(text) {
    const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/);
    let fmt = null, inEvents = false; const out = []; let n = 0;
    const t = (v) => { const m = /(\d+):(\d{2}):(\d{2})[.](\d{1,2})/.exec(v); return m ? `${String(m[1]).padStart(2, '0')}:${m[2]}:${m[3]},${String(m[4]).padEnd(3, '0')}` : null; };
    for (const l of lines) {
      if (/^\[events\]/i.test(l)) { inEvents = true; continue; }
      if (/^\[/.test(l)) inEvents = false;
      if (!inEvents) continue;
      if (/^format:/i.test(l)) { fmt = l.slice(7).split(',').map((x) => x.trim().toLowerCase()); continue; }
      if (!/^dialogue:/i.test(l) || !fmt) continue;
      const cols = l.slice(9).split(','), iS = fmt.indexOf('start'), iE = fmt.indexOf('end'), iT = fmt.indexOf('text');
      if (iS < 0 || iE < 0 || iT < 0) continue;
      const a = t(cols[iS]), b = t(cols[iE]), body = cleanText(cols.slice(iT).join(','));
      if (a && b && body) out.push(`${++n}\n${a} --> ${b}\n${body}\n`);
      if (n >= LIMITS.cues) break;
    }
    return out.join('\n');
  }

  // MicroDVD text uses frame numbers; optional {1}{1} header supplies FPS.
  // Never treat image-based VobSub .sub as text.
  function microDvdToVtt(text,shiftMs,scale=1,fps=0) {
    const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/);
    let rate=Number(fps),start=0;
    const header=/^\{(?:0|1)\}\{(?:0|1)\}(\d+(?:\.\d+)?)\s*$/.exec(lines[0]||'');
    if(header){if(!(rate>0))rate=Number(header[1]);start=1;}
    if(!Number.isFinite(rate)||rate<10||rate>120)return {vtt:'WEBVTT\n\n',cues:0,entries:[],needsFps:true};
    const out=[];
    for(let i=start;i<lines.length&&out.length<LIMITS.cues;i++){
      const match=/^\{(\d{1,9})\}\{(\d{1,9})\}(.*)$/.exec(lines[i]);
      if(!match)continue;
      const a=Number(match[1]),b=Number(match[2]);if(b<=a||b/rate>3600000)continue;
      const body=match[3].replace(/\{[a-zA-Z]:[^}]{0,80}\}/g,'').replace(/\|/g,'\n').trim();
      if(body)out.push(vttTime(a*1000/rate)+' --> '+vttTime(b*1000/rate)+'\n'+body+'\n');
    }
    return srtToVtt(out.join('\n'),shiftMs,scale);
  }
  function ttmlSeconds(value){
    const s=String(value||'').trim();
    let m=/^(\d{1,3}):([0-5]\d):([0-5]\d)(?:\.(\d{1,6}))?$/.exec(s);
    if(m)return +m[1]*3600+ +m[2]*60+ +m[3]+Number('0.'+(m[4]||0));
    m=/^(\d+(?:\.\d+)?)(ms|h|m|s)$/.exec(s);
    if(!m)return null;const t=Number(m[1])*({ms:.001,h:3600,m:60,s:1}[m[2]]);return Number.isFinite(t)&&t<=3600000?t:null;
  }
  // Simple absolute media-time TTML profile. No DTD/external entities,
  // frame/tick units, sequential containers, ancestor timing or timed spans.
  function ttmlToVtt(text,shiftMs,scale){
    const empty=()=>({vtt:'WEBVTT\n\n',cues:0,entries:[]});
    if(typeof DOMParser==='undefined'||typeof text!=='string'||text.length>5*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(text))return empty();
    const doc=new DOMParser().parseFromString(text,'application/xml'),root=doc.documentElement;
    if(!root||root.localName!=='tt'||!['http://www.w3.org/ns/ttml','http://www.w3.org/2006/10/ttaf1',''].includes(root.namespaceURI||'')||doc.getElementsByTagName('parsererror').length)return empty();
    const nodes=Array.from(root.getElementsByTagName('*'));if(nodes.length>80000)return empty();
    const out=[],timing=n=>n.hasAttribute('begin')||n.hasAttribute('end')||n.hasAttribute('dur')||n.getAttribute('timeContainer')==='seq';
    function body(p){
      const parts=[],stack=[...p.childNodes].reverse();let count=0;
      while(stack.length){const n=stack.pop();if(++count>10000)return null;
        if(n.nodeType===3||n.nodeType===4)parts.push(n.nodeValue||'');
        else if(n.nodeType===1){if(timing(n)||!['span','br'].includes(n.localName))return null;if(n.localName==='br')parts.push('\n');else for(let i=n.childNodes.length-1;i>=0;i--)stack.push(n.childNodes[i]);}
      }
      return parts.join('').split('\n').map(s=>s.replace(/[\t\r ]+/g,' ').trim()).filter(Boolean).join('\n').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
    }
    for(const p of nodes){if(p.localName!=='p')continue;
      let parent=p.parentElement,unsupported=false,depth=0;while(parent){if(timing(parent)||++depth>64){unsupported=true;break;}parent=parent.parentElement;}
      if(unsupported||p.getAttribute('timeContainer')==='seq')continue;
      const start=ttmlSeconds(p.getAttribute('begin')),end=ttmlSeconds(p.getAttribute('end')),dur=ttmlSeconds(p.getAttribute('dur'));
      const finish=end??(start!==null&&dur!==null?start+dur:null);
      if(start===null||finish===null||finish<=start||finish>3600000)continue;
      const value=body(p);if(!value)continue;
      out.push(vttTime(start*1000)+' --> '+vttTime(finish*1000)+'\n'+value+'\n');if(out.length>=LIMITS.cues)break;
    }
    return srtToVtt(out.join('\n'),shiftMs,scale);
  }
  function subtitleToVtt(text, ext, shiftMs, scale=1, fps=0) {
    const e = String(ext || '').toLowerCase();
    if(e==='sub')return microDvdToVtt(text,shiftMs,scale,fps);
    if(e==='ttml'||e==='dfxp')return ttmlToVtt(text,shiftMs,scale);
    return srtToVtt(e === 'ass' || e === 'ssa' ? assToSrt(text) : text, shiftMs, scale);
  }

  // Two correspondences map original subtitle time to actual video time.
  // Reject implausible drift and ambiguous or reversed markers.
  function twoPointSync(a,b){
    if(!a||!b||![a.subtitle,a.video,b.subtitle,b.video].every(Number.isFinite)||Math.min(a.subtitle,a.video,b.subtitle,b.video)<0)return null;
    const ds=b.subtitle-a.subtitle,dv=b.video-a.video;
    if(ds<2||dv<=0)return null;
    const scale=dv/ds,delay=a.video-a.subtitle*scale;
    if(scale<.5||scale>2||Math.abs(delay)>3600)return null;
    return {scale,delay};
  }
  function editCue(entries,index,patch){
    if(!Array.isArray(entries)||!Number.isInteger(index)||index<0||index>=entries.length||!patch)return null;
    const {start,end}=patch;
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>3599999||end-start<.05||typeof patch.text!=='string'||patch.text.length>4000)return null;
    const text=patch.text.replace(/\r\n?/g,'\n').replace(/\0/g,'').replace(/\n[\t ]*\n+/g,'\n').trim();
    if(!text||text.includes('-->'))return null;
    return entries.map((c,i)=>i===index?{...c,start:Math.round(start*1000)/1000,end:Math.round(end*1000)/1000,text}:c);
  }
  function exportSubtitles(entries,format='srt'){
    if(!['srt','vtt'].includes(format)||!Array.isArray(entries))return '';
    const out=format==='vtt'?['WEBVTT','']:[];
    let count=0;
    for(const cue of entries.slice(0,LIMITS.cues)){
      if(!Number.isFinite(cue.start)||!Number.isFinite(cue.end)||cue.start<0||cue.end<=cue.start||cue.end>3600000||typeof cue.text!=='string')continue;
      const body=cue.text.replace(/\0/g,'').replace(/\r\n?/g,'\n').replace(/\n[\t ]*\n+/g,'\n').trim();if(!body)continue;
      const ts=n=>format==='srt'?vttTime(n*1000).replace('.',','):vttTime(n*1000);
      if(format==='srt')out.push(String(++count));else count++;
      const settings=format==='vtt'&&typeof cue.settings==='string'?cue.settings.split(/\s+/).filter(x=>/^(?:align|line|position|size|vertical):[-a-z0-9.,%]+$/i.test(x)).join(' '):'';
      out.push(ts(cue.start)+' --> '+ts(cue.end)+(settings?' '+settings:''),body,'');
    }
    return count?out.join('\n')+'\n':'';
  }
  // Conservative single-episode recognition; do not guess multi-episode ranges.
  function releaseInfo(value){
    const raw=String(value||'').split(/[\\/]/).pop().slice(0,400).replace(/\.(mkv|mp4|avi|mov|wmv|webm|m4v|srt|vtt|ass|ssa)$/i,'');
    const ep=/(?:^|[ ._-])(?:s(\d{1,2})e(\d{1,3})|(\d{1,2})x(\d{1,3}))(?=$|[ ._-]|e\d)/i.exec(raw);
    const rest=ep?raw.slice(ep.index+ep[0].length):'';
    const multiple=!!ep&&/^(?:e\d|[ ._-]+(?:e\d|s\d{1,2}e\d|\d{1,2}x\d)|-\d)/i.test(rest);
    const words=raw.replace(/_/g,' ');
    const source=/\bweb[ .-]?dl\b/i.test(words)?'WEB-DL':/\bweb[ .-]?rip\b/i.test(words)?'WEBRip':/\bblu[ .-]?ray\b|\bbdrip\b|\bbrrip\b/i.test(words)?'BluRay':/\bhdtv\b/i.test(words)?'HDTV':'';
    const resolution=/\b(2160p|1080p|720p|480p|4k)\b/i.exec(words)?.[1]?.toLowerCase()||'';
    const group=/-([a-z0-9]{2,20})$/i.exec(raw)?.[1]?.toLowerCase()||'';
    const cut=ep?ep.index:raw.search(/(?:[ ._-]+)(?:2160p|1080p|720p|480p|4k|web[ ._-]?dl|web[ ._-]?rip|blu[ ._-]?ray|hdtv)(?=$|[ ._-])/i);
    const title=(cut>=0?raw.slice(0,cut):raw).replace(/[._]+/g,' ').replace(/\s+/g,' ').trim();
    return {title,season:ep&&!multiple?Number(ep[1]||ep[3]):null,episode:ep&&!multiple?Number(ep[2]||ep[4]):null,multiple,source,resolution,group};
  }
  function releaseScore(video,candidate){
    const a=releaseInfo(video),b=releaseInfo(candidate);
    if(a.season!==null&&b.season!==null&&(a.season!==b.season||a.episode!==b.episode))return -1000;
    let score=0;
    if(a.season!==null&&b.season===a.season&&b.episode===a.episode)score+=50;
    if(a.source&&b.source)score+=a.source===b.source?20:-15;
    if(a.resolution&&b.resolution)score+=a.resolution===b.resolution?5:-3;
    if(a.group&&b.group&&a.group===b.group)score+=25;
    return score;
  }
  function subtitleLanguages(value){const supported=['el','en','fr','de','it','es'];return Array.isArray(value)?[...new Set(value.filter(x=>supported.includes(x)))].slice(0,6):['el','en'];}
  function preferredSubtitle(sources,languages=['el','en']) {
    const aliases={el:['el','ell','gre','gr','greek'],en:['en','eng','english'],fr:['fr','fra','fre','french'],de:['de','deu','ger','german'],it:['it','ita','italian'],es:['es','spa','spanish']};
    const rows=Array.isArray(sources)?sources:[];
    for(const l of subtitleLanguages(languages)){if(typeof l!=='string')continue;const tokens=aliases[l.toLowerCase()]||[l.toLowerCase()];const i=rows.findIndex(s=>typeof s?.name==='string'&&s.name.replace(/\.[^.]+$/,'').toLowerCase().split(/[. _-]/).some(x=>tokens.includes(x)));if(i>=0)return i;}
    return rows.length?0:-1;
  }
  // Resume position: remembered after the first 5 s, forgotten when the end is near (last 10 s or 95 %).
  function resumeAction(posMs, durMs) {
    if (!Number.isFinite(durMs) || !Number.isFinite(posMs) || !(durMs > 0) || posMs < 0) return 'keep';
    if (posMs < 5000) return 'clear';
    if (durMs - posMs < 10000 || posMs / durMs > 0.95) return 'clear';
    return 'save';
  }

  // Periodic checkpoints skip small advances; explicit pause/close checkpoints
  // save exact position. Return null if no persistent change is needed.
  function resumeUpdate(map,file,pos,dur,force=false){
    if(typeof file!=='string'||!file||!map||typeof map!=='object'||Array.isArray(map))return null;
    const act=resumeAction(pos,dur),old=Object.hasOwn(map,file)?map[file]:null;
    if(act==='keep')return null;
    if(act==='clear'){if(old===null)return null;const next={...map};delete next[file];return next;}
    const value=Math.round(pos);
    if(old===value||(!force&&Number.isFinite(old)&&Math.abs(value-old)<15000))return null;
    const next={...map};delete next[file];Object.defineProperty(next,file,{value,enumerable:true,writable:true,configurable:true});return limitResume(next);
  }
  function pushRecent(list, p, max) {
    const l = (Array.isArray(list) ? list : []).filter((x) => x !== p);
    l.unshift(p);
    return l.slice(0, max || LIMITS.recent);
  }
  function addBookmark(list, p, ms) {
    const l = Array.isArray(list) ? list.slice() : [];
    const t = Math.round(ms);
    if (!l.some((b) => b.path === p && Math.abs(b.ms - t) < 1000)) l.push({ path: p, ms: t });
    return l.slice(-LIMITS.bookmarks);
  }
  function sortedBookmarks(list, p) { return (Array.isArray(list) ? list : []).filter((b) => b.path === p).sort((a, b) => a.ms - b.ms); }
  function limitResume(map) {
    const e = Object.entries(map || {});
    return Object.fromEntries(e.slice(Math.max(0, e.length - LIMITS.resume)));
  }
  // A path from storage is only offered for playback when it looks like something the main process would serve.
  const playable = (p) => typeof p === 'string' && ((isUrl(p)&&clipboardUrl(p)!==null) || (/^[A-Za-z]:[\\/]/.test(p) && !p.slice(2).includes(':') && kindOf(p) !== '')) && p.length < 2048 && !/[\0\r\n]/.test(p);

  // What plays after the current item. mode: off | list | file | shuffle. rnd: a number in [0,1) (injected for tests).
  function nextIndex(mode, idx, len, rnd) {
    if (len <= 0) return -1;
    if (mode === 'file') return idx;
    if (mode === 'shuffle') { if (len === 1) return 0; let k = Math.floor((rnd == null ? Math.random() : rnd) * (len - 1)); if (k >= idx) k++; return Math.min(k, len - 1); }
    if (idx < len - 1) return idx + 1;
    return mode === 'list' ? 0 : -1;
  }
  // Picture controls: values are percentages (100 = unchanged); rotate in degrees; flips are booleans. Returns the CSS filter / transform strings.
  function pictureCss(p, boxW, boxH) {
    const c = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) ? Number(v) : 100));
    const filter = (c(p.brightness, 50, 150) === 100 && c(p.contrast, 50, 150) === 100 && c(p.saturation, 0, 200) === 100) ? ''
      : `brightness(${c(p.brightness, 50, 150)}%) contrast(${c(p.contrast, 50, 150)}%) saturate(${c(p.saturation, 0, 200)}%)`;
    const rot = [0, 90, 180, 270].includes(Number(p.rotate)) ? Number(p.rotate) : 0;
    const k = rot === 90 || rot === 270 ? (boxW > 0 && boxH > 0 ? Math.min(boxW / boxH, boxH / boxW) : 0.56) : 1;
    const parts = [];
    const zoom=Number.isFinite(p.zoom)?Math.max(1,Math.min(2,p.zoom)):1;
    if(zoom!==1)parts.push(`scale(${zoom})`);
    if (rot) parts.push(`rotate(${rot}deg)`);
    if (k !== 1) parts.push(`scale(${Math.round(k * 1000) / 1000})`);
    if (p.flipH) parts.push('scaleX(-1)');
    if (p.flipV) parts.push('scaleY(-1)');
    return { filter, transform: parts.join(' ') };
  }
  // A-B loop state machine: none -> A set -> loop A..B -> none.
  function videoSleepMinutes(value){
    if(typeof value!=='string')return null;
    const s=value.trim();
    return /^\d{1,3}$/.test(s)&&Number(s)<=480?Number(s):null;
  }
  function exportAB(state,duration){
    if(state?.stage!=='loop'||!Number.isFinite(duration)||duration<=0||!Number.isFinite(state.a)||!Number.isFinite(state.b)||state.a<0||state.b>duration||state.b>360000||state.b-state.a<=0.2)return null;
    const start=Math.round(state.a*1000)/1000,end=Math.round(state.b*1000)/1000;
    return end>start?{start,end}:null;
  }
  function abStep(state, nowSec) {
    if (!state || state.stage === 'off') return { stage: 'a', a: nowSec, b: 0 };
    if (state.stage === 'a') return nowSec > state.a + 0.2 ? { stage: 'loop', a: state.a, b: nowSec } : state;
    return { stage: 'off', a: 0, b: 0 };
  }

  return { releaseInfo,releaseScore,ttmlSeconds,editCue, twoPointSync, exportSubtitles, subtitleLanguages, preferredSubtitle, nextIndex, pictureCss, abStep, exportAB, videoSleepMinutes, VIDEO, AUDIO, SPEEDS, LIMITS, extOf, kindOf, titleOf, isUrl, mediaUrl, clock, clipboardUrl, streamRetryDelay, reorderPlaylist, parseSeekTime, displayTime, vttTime, srtToVtt, assToSrt, subtitleToVtt, resumeAction, resumeUpdate, pushRecent, addBookmark, sortedBookmarks, limitResume, playable };
});
