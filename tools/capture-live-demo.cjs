const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const out = process.env.GS_LIVE_DEMO_DIR;
if (!out) throw Error('GS_LIVE_DEMO_DIR missing');
const frames=path.join(out,'frames');
fs.mkdirSync(frames,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  let win;
  const deadline=Date.now()+60000;
  while(Date.now()<deadline){
    win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/renderer/index.html')&&!w.webContents.isLoading());
    if(win)break;
    await sleep(300);
  }
  if(!win)throw Error('Actual application window missing');
  win.setSize(1280,800);
  await sleep(1200);
  const exec=code=>win.webContents.executeJavaScript(code,true);
  async function tab(id){
    const result=await exec("document.querySelector('.tab-btn[data-tab="+id+"]').click(); document.querySelector('#tab-"+id+"').classList.contains('active')");
    if(!result)throw Error('Tab did not activate: '+id);
  }
  async function preset(index){
    const result=await exec("(()=>{const b=document.querySelectorAll('.preset-card')["+index+"]; if(!b)throw Error('Preset missing'); b.click();return {active:b.classList.contains('active'),name:b.textContent};})()");
    if(!result.active)throw Error('Preset did not activate');
    return result.name;
  }
  const events=[];
  const samples=[];
  const fps=8, total=240;
  const start=performance.now();
  function mark(event,detail=''){events.push({frame:frameIndex,event,detail,elapsedMs:Math.round(performance.now()-start)})}
  let frameIndex=0;
  let previousDigest='';
  const crypto=require('node:crypto');
  const unique=new Set();
  for(frameIndex=0;frameIndex<total;frameIndex++){
    switch(frameIndex){
      case 0: await tab('player'); mark('player-open'); break;
      case 16: await exec("document.getElementById('btnTestTone').click()");mark('built-in-test-tone');break;
      case 40: await exec("document.getElementById('btnVisPicker').click()");mark('visualizer-picker-open');break;
      case 56: await exec("document.querySelector('.vis-picker-card[data-mode=circular]').click();document.getElementById('btnVisPicker').click()");mark('circular-visualizer-selected');break;
      case 80: await tab('enhance');mark('enhancement-open');break;
      case 100: mark('preset-selected',await preset(1));break;
      case 128: mark('preset-selected',await preset(3));break;
      case 156: await tab('converter');mark('converter-open');break;
      case 180: await tab('video');mark('video-open');break;
      case 200: await tab('photo');mark('photo-open');break;
      case 220: await tab('settings');mark('settings-open');break;
    }
    const im=await win.webContents.capturePage();
    if(im.isEmpty())throw Error('Blank capture at '+frameIndex);
    const png=im.resize({width:960,quality:'good'}).toPNG();
    const digest=crypto.createHash('sha256').update(png).digest('hex');
    unique.add(digest);
    fs.writeFileSync(path.join(frames,'frame-'+String(frameIndex).padStart(4,'0')+'.png'),png);
    if(frameIndex%8===0){
      const metrics=app.getAppMetrics();
      samples.push({frame:frameIndex,elapsedMs:Math.round(performance.now()-start),processes:metrics.map(m=>({type:m.type,pid:m.pid,cpuPercent:m.cpu?.percentCPUUsage??null,workingSetKiB:m.memory?.workingSetSize??null,peakWorkingSetKiB:m.memory?.peakWorkingSetSize??null}))});
    }
    const wait=start+(frameIndex+1)*1000/fps-performance.now();
    if(wait>0)await sleep(wait);
  }
  if(unique.size<12)throw Error('Insufficient actual frame changes');
  fs.writeFileSync(path.join(out,'capture.json'),JSON.stringify({sourceCommit:process.env.GITHUB_SHA,version:app.getVersion(),fps,frames:total,uniqueFrames:unique.size,elapsedMs:Math.round(performance.now()-start),events,samples,notes:'Real Electron renderer capture while invoking actual application controls. Video is sampled at 8 fps, silent and uses built-in test tone. CPU/memory samples are observational, include renderer capture overhead, and are not an idle benchmark.'},null,2));
  app.exit(0);
})().catch(err=>{console.error(err);try{fs.writeFileSync(path.join(out,'capture-error.txt'),String(err.stack||err))}catch{};app.exit(1)});
setTimeout(()=>app.exit(2),150000).unref();
