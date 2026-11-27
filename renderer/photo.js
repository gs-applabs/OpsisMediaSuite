'use strict';
// Photo enhancement tab (2.3.0): live preview on a downscaled copy, export at the original resolution. The maths is in photolib.js (unit-tested);
// this file only handles files, canvases and the controls. The original file is never modified: export always asks for a new file name.

(function () {
  const P = window.WaveframePhoto;
  const api = window.waveframe;
  const $ = (id) => document.getElementById(id);
  const SLIDERS = [
    ['exposure', -2, 2, 0.05], ['contrast', -100, 100, 1], ['highlights', -100, 100, 1], ['shadows', -100, 100, 1],
    ['saturation', -100, 100, 1], ['temperature', -100, 100, 1], ['tint', -100, 100, 1], ['sharpen', 0, 100, 1], ['denoise', 0, 100, 1],
    ['black', 0, 254, 1], ['white', 1, 255, 1], ['gamma', 0.2, 3, 0.01], ['vibrance', -100, 100, 1], ['sepia', 0, 100, 1], ['vignette', 0, 100, 1], ['red',-100,100,1], ['green',-100,100,1], ['blue',-100,100,1], ['clarity',-100,100,1],
  ];
  const CROPS = [['none', null], ['1:1', 1], ['4:3', 4 / 3], ['3:2', 3 / 2], ['16:9', 16 / 9], ['3:4', 3 / 4], ['2:3', 2 / 3], ['9:16', 9 / 16]];
  const fmt = (s, vars) => Object.entries(vars || {}).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

  let openGeneration = 0,opening=false,exportController=null,exportPhase='idle';
  let bmp = null, name = 'photo', params = P.defaults(), cropKey = 'none', preview = null, orig = null, raf = 0, comparing = false, built = false, busy = false;

  let history=P.createHistory({params,cropKey});
  function updateHistory(){ $('phUndo').disabled=!history.canUndo();$('phRedo').disabled=!history.canRedo(); }
  function checkpoint(){if(!orig)return;history.push({params,cropKey});updateHistory();}
  function restore(snapshot){params=snapshot.params;cropKey=snapshot.cropKey;$('phCrop').value=cropKey;syncCrop();syncSliders();updateHistory();schedule();}
  const info = (text) => { $('phInfo').textContent = text || ''; };

  function build() {
    if (built) return; built = true;
    const box = $('phSliders');
    for (const [key, min, max, step] of SLIDERS) {
      const row = document.createElement('div'); row.className = 'ph-slider';
      const label = document.createElement('label'); label.htmlFor = `ph_${key}`; label.setAttribute('data-i18n', `ph.${key}`); label.textContent = t(`ph.${key}`);
      const input = document.createElement('input'); input.type = 'range'; input.id = `ph_${key}`; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(P.defaults()[key]);
      const out = document.createElement('output'); out.htmlFor = input.id; out.textContent = input.value;
      input.addEventListener('input', () => { params[key] = Number(input.value); out.textContent = key === 'exposure' || key === 'gamma' ? Number(input.value).toFixed(2) : input.value; schedule(); });
      input.addEventListener('change',checkpoint);
      input.addEventListener('dblclick', () => { input.value = String(P.defaults()[key]); input.dispatchEvent(new Event('input')); checkpoint(); });
      row.append(label, input, out); box.append(row);
    }
    for (const [k] of CROPS) { const o = document.createElement('option'); o.value = k; o.textContent = k === 'none' ? t('ph.cropNone') : k; $('phCrop').append(o); }
    $('phOpen').addEventListener('click', async () => { if(opening||busy)return;const p = await api.photoPick(); if (p) openPath(p); });
    $('phLookApply').addEventListener('click',()=>{if(!orig||busy)return;params={...P.applyLook(params,$('phLook').value,Number($('phLookStrength').value)),anchorX:params.anchorX,anchorY:params.anchorY};syncSliders();checkpoint();schedule();});
    $('phAuto').addEventListener('click', () => { if (!preview) return; params = P.applyAuto(preview,params); syncSliders(); checkpoint(); schedule(); });
    $('phReset').addEventListener('click', () => { params = P.defaults(); cropKey = 'none'; $('phCrop').value = 'none'; syncCrop();syncSliders(); checkpoint(); schedule(); });
    $('phRotL').addEventListener('click', () => { params.rotate = (params.rotate + 270) % 360; checkpoint(); schedule(); });
    $('phRotR').addEventListener('click', () => { params.rotate = (params.rotate + 90) % 360; checkpoint(); schedule(); });
    $('phFlipH').addEventListener('click', () => { params.flipH = !params.flipH; checkpoint(); schedule(); });
    $('phFlipV').addEventListener('click', () => { params.flipV = !params.flipV; checkpoint(); schedule(); });
    $('phCrop').addEventListener('change', () => { cropKey = $('phCrop').value;syncCrop();checkpoint();schedule(); });
    for(const [id,key] of [['phCropX','anchorX'],['phCropY','anchorY']]){ $(id).addEventListener('input',()=>{params[key]=Number($(id).value);schedule();});$(id).addEventListener('change',checkpoint);}
    $('phHistMode').addEventListener('change',schedule);syncCrop();
    $('phUndo').addEventListener('click',()=>{if(orig)restore(history.undo());});$('phRedo').addEventListener('click',()=>{if(orig)restore(history.redo());});updateHistory();
    const cmp = $('phCompare');
    const down = () => { comparing = true; schedule(); }, up = () => { comparing = false; schedule(); };
    cmp.addEventListener('pointerdown', down); cmp.addEventListener('pointerup', up); cmp.addEventListener('pointerleave', up); cmp.addEventListener('pointercancel',up);cmp.addEventListener('blur',up);window.addEventListener('blur',up);
    cmp.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') down(); }); cmp.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') up(); });
    $('phFormat').addEventListener('change', () => { $('phQualityField').classList.toggle('dep-hidden', $('phFormat').value === 'png');$('phMatteField').hidden=$('phFormat').value!=='jpeg'; });
    $('phSave').addEventListener('click', save);
    $('phCancelExport').addEventListener('click',()=>{if(exportPhase==='processing')exportController?.abort();});
    $('phCloseMedia').addEventListener('click',async()=>{
      if(!bmp||busy||opening)return;
      const current=bmp;
      const greek=document.documentElement.lang==='el';
      if(!await showConfirmDialog(greek?'Κλείσιμο φωτογραφίας':'Close photo',greek?'Οι μη αποθηκευμένες αλλαγές θα χαθούν. Το αρχικό αρχείο δεν επηρεάζεται.':'Unsaved edits will be discarded. The original file is unaffected.'))return;
      if(bmp===current&&!busy&&!opening)releasePhoto();
    });
    $('phResize').addEventListener('change',exportSize);
    const drop = $('phDrop');
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault(); drop.classList.remove('drag');
      const f = e.dataTransfer.files[0]; if (!f) return;
      // A real drag/drop File is already authorized by the browser. Do not
      // turn its path into a general-purpose filesystem read capability.
      openBlob(f, f.name);
    });
    document.addEventListener('waveframe:language-changed', () => { $('phCrop').options[0].textContent = t('ph.cropNone');if(orig)schedule(); });
  }

  function releasePhoto(){
    ++openGeneration;if(raf)cancelAnimationFrame(raf);raf=0;
    bmp?.close();bmp=null;orig=null;preview=null;comparing=false;
    name='photo';params=P.defaults();cropKey='none';history=P.createHistory({params,cropKey});
    $('phCanvas').width=0;$('phCanvas').height=0;
    const hist=$('phHist');hist.getContext('2d').clearRect(0,0,hist.width,hist.height);
    $('phDrop').classList.remove('has-media');$('phCloseMedia').disabled=true;
    $('phCrop').value='none';syncCrop();syncSliders();updateHistory();
    $('phClipping').textContent='';$('phDimensions').textContent='';$('phSave').title='';info('');
  }
  function syncCrop(){ $('phCropX').value=String(params.anchorX??50);$('phCropY').value=String(params.anchorY??50);$('phCropX').disabled=$('phCropY').disabled=cropKey==='none'; }
  function syncSliders() {
    for (const [key] of SLIDERS) {
      const i = $(`ph_${key}`); i.value = String(params[key]);
      const o = i.nextElementSibling; o.textContent = key === 'exposure' || key === 'gamma' ? Number(params[key]).toFixed(2) : String(params[key]);
    }
  }

  async function openPath(p) {
    if (busy||opening) return;
    opening=true;$('phOpen').disabled=true;
    const generation = ++openGeneration;
    try{
      info(t('ph.loading'));
      const r = await api.photoRead(p).catch(() => null);
      if (generation !== openGeneration || busy) return;
      if (!r || r.error) { info(r && r.error === 'too-large' ? t('ph.tooLarge') : t('ph.cantOpen')); return; }
      await decodeBlob(new Blob([r.bytes]),r.name,generation);
    }finally{opening=false;$('phOpen').disabled=false;}
  }

  async function openBlob(blob,nm){
    if(busy||opening)return;
    opening=true;$('phOpen').disabled=true;
    try{await decodeBlob(blob,nm,++openGeneration);}finally{opening=false;$('phOpen').disabled=false;}
  }
  async function decodeBlob(blob, nm, generation) {
    if (busy) return;
    if (blob.size > P.LIMITS.maxFileBytes) { info(t('ph.tooLarge')); return; }
    let candidate=null;
    try {
      const header=P.headerSize(new Uint8Array(await blob.slice(0,1024*1024).arrayBuffer()));
      if(generation!==openGeneration||busy)return;
      if(header&&!P.validImageSize(header.width,header.height)){info(t('ph.tooLarge'));return;}
      const b = candidate=await createImageBitmap(blob, { imageOrientation: 'from-image' });
      if (generation !== openGeneration || busy) return;
      if (!P.validImageSize(b.width,b.height)) { info(t('ph.tooLarge')); return; }
      // Build preview before replacing the current document.
      const sz = P.previewSize(b.width, b.height);
      const c = document.createElement('canvas'); c.width = sz.width; c.height = sz.height;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(b, 0, 0, sz.width, sz.height);
      const d = g.getImageData(0, 0, sz.width, sz.height);
      c.width=0;c.height=0;
      const previous=bmp;bmp=b;candidate=null;previous?.close();
      name=nm||'photo';params=P.defaults();cropKey='none';$('phCrop').value='none';syncCrop();syncSliders();
      orig = { data: d.data, width: d.width, height: d.height };
      preview = orig; history=P.createHistory({params,cropKey});comparing=false;updateHistory();
      $('phDrop').classList.add('has-media');$('phCloseMedia').disabled=false;
      info(fmt(t('ph.opened'), { name, w: b.width, h: b.height, mp: (b.width * b.height / 1e6).toFixed(1) }));
      schedule();
    } catch (_) { if (generation === openGeneration && !busy) info(t('ph.cantOpen')); }finally{candidate?.close();}
  }

  // Centered crop of the wanted aspect ratio, in the orientation of the ORIGINAL (rotation happens after the crop).
  function cropParams() {
    const e = CROPS.find((c) => c[0] === cropKey); if (!e || !e[1] || !orig) return null;
    return P.aspectCrop(bmp.width,bmp.height,e[1],params.rotate,params.anchorX??50,params.anchorY??50);
  }
  const full = () => ({ ...params, crop: cropParams() });

  let previewDirty=false;
  function photoVisible(){return !document.hidden&&$('tab-photo').classList.contains('active');}
  function schedule(){previewDirty=true;if(!raf&&photoVisible())raf=requestAnimationFrame(()=>{raf=0;if(photoVisible()&&previewDirty){previewDirty=false;render();}});}
  function syncPreviewVisibility(){
    if(!photoVisible()){
      if(raf)cancelAnimationFrame(raf);raf=0;
      // Retain original bitmap, edit history and preview source; only drop
      // the reconstructible rendered surface while the tab is hidden.
      const canvas=$('phCanvas');
      if(orig&&(canvas.width||canvas.height)){canvas.width=0;canvas.height=0;previewDirty=true;}
    }else if(previewDirty)schedule();
  }
  window.addEventListener('waveframe:tab-selected',syncPreviewVisibility);
  document.addEventListener('visibilitychange',syncPreviewVisibility);
  function render() {
    if (!orig) return;
    const out = comparing ? P.geometry(orig, { ...P.defaults(), rotate: params.rotate, flipH: params.flipH, flipV: params.flipV, crop: cropParams() }) : P.process(orig, full());
    const c = $('phCanvas'); if(c.width!==out.width||c.height!==out.height){c.width=out.width;c.height=out.height;}
    c.getContext('2d').putImageData(new ImageData(out.data, out.width, out.height), 0, 0);
    drawHist(out.data);
    exportSize();
    const dimensions=P.outputSize(bmp.width,bmp.height,full());
    const o=P.resizeOutput(dimensions.width,dimensions.height,Number($('phResize').value));
    $('phSave').title = fmt(t('ph.outputSize'), { w: o.width, h: o.height });
  }
  function drawHist(data) {
    const c=$('phHist'),g=c.getContext('2d'),stats=P.colorHistogram(data);
    const mode=$('phHistMode').value,channels=mode==='rgb'?[[stats.red,'#ef5350'],[stats.green,'#4caf50'],[stats.blue,'#42a5f5']]:[[stats.luma,getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#7c6cf0']];
    let max=1;for(const [bins] of channels)for(let i=1;i<255;i++)max=Math.max(max,bins[i]);
    g.clearRect(0,0,c.width,c.height);g.globalAlpha=mode==='rgb'?.65:1;
    for(const [bins,color] of channels){g.fillStyle=color;for(let i=0;i<256;i++){const height=Math.round(Math.min(1,bins[i]/max)*(c.height-2));g.fillRect(i,c.height-height,1,height);}}
    g.globalAlpha=1;
    const pct=n=>stats.total?(100*n/stats.total).toFixed(1)+'%':'—';
    $('phClipping').textContent=t('ph.nearBlack')+': '+pct(stats.shadow)+' · '+t('ph.nearSaturation')+': '+pct(stats.highlight);
  }

  function processExport(img,snapshot,maxEdge,signal) {
    if(signal?.aborted)return Promise.reject(Error('cancelled'));
    return new Promise((resolve,reject)=>{
      const worker=new Worker('photo-worker.js');
      let timer,finished=false;
      const finish=(err,value)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);worker.terminate();err?reject(err):resolve(value);};
      const cancel=()=>finish(Error('cancelled'));signal?.addEventListener('abort',cancel,{once:true});
      timer=setTimeout(()=>finish(Error('photo-timeout')),120000);
      worker.onerror=()=>finish(Error('photo-worker'));
      worker.onmessage=({data:r})=>{if(!r?.ok||!P.validImageSize(r.width,r.height)||!(r.buffer instanceof ArrayBuffer)||r.buffer.byteLength!==r.width*r.height*4){finish(Error(r?.error||'photo-worker'));return;}finish(null,{width:r.width,height:r.height,data:new Uint8ClampedArray(r.buffer)});};
      try{worker.postMessage({width:img.width,height:img.height,buffer:img.data.buffer,params:snapshot,maxEdge},[img.data.buffer]);}catch(e){finish(e);}
    });
  }
  // Shared production export and test path: release all temporary canvas
  // surfaces on success, encoder failure, or unsupported output format.
  async function encodeExport(out,f,q,maxEdge=0,matte='#ffffff'){
    if(!Object.hasOwn(P.OUT_FORMATS,f)||!P.validImageSize(out.width,out.height)||
       !(out.data instanceof Uint8ClampedArray)||out.data.length!==out.width*out.height*4)throw Error('photo-output');
    const size=P.resizeOutput(out.width,out.height,maxEdge);
    const oc=document.createElement('canvas');let target=oc;
    try{
      oc.width=out.width;oc.height=out.height;
      oc.getContext('2d').putImageData(new ImageData(out.data,out.width,out.height),0,0);
      if(size.width!==out.width||size.height!==out.height){
        target=document.createElement('canvas');target.width=size.width;target.height=size.height;
        const ctx=target.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(oc,0,0,size.width,size.height);
        oc.width=0;oc.height=0;
      }
      if(f==='jpeg'){
        const ctx=target.getContext('2d');ctx.globalCompositeOperation='destination-over';
        ctx.fillStyle=/^#[0-9a-f]{6}$/i.test(matte)?matte:'#ffffff';
        ctx.fillRect(0,0,target.width,target.height);ctx.globalCompositeOperation='source-over';
      }
      const quality=Number.isFinite(q)?Math.max(0,Math.min(1,q)):.92;
      const blob=await new Promise(res=>target.toBlob(res,P.OUT_FORMATS[f].mime,quality));
      if(!blob||blob.type!==P.OUT_FORMATS[f].mime)throw Error('photo-encode');
      return {blob,size};
    }finally{oc.width=0;oc.height=0;if(target!==oc){target.width=0;target.height=0;}}
  }
  function exportSize(){if(!bmp)return;const s=P.outputSize(bmp.width,bmp.height,full()),o=P.resizeOutput(s.width,s.height,Number($('phResize').value));$('phDimensions').textContent=o.width+' × '+o.height+' px';}
  async function save() {
    if (!bmp || busy || opening) return;
    busy = true; ++openGeneration;
    const snapshot = full(), source = bmp, sourceName = name, f = $('phFormat').value, q = Number($('phQuality').value) / 100, maxEdge=Number($('phResize').value),matte=$('phMatte').value;
    if(!P.exportBudget(source.width,source.height,snapshot,maxEdge)){busy=false;info(t('ph.tooLarge'));return;}
    const controller=exportController=new AbortController();exportPhase='processing';
    const check=()=>{if(controller.signal.aborted)throw Error('cancelled');};
    $('phSave').disabled=true;$('phCancelExport').hidden=false;$('phCancelExport').disabled=false;info(t('ph.processing'));
    await new Promise((r) => setTimeout(r, 30)); // let the message paint before the heavy work
    try {
      check();const plan=P.exportReadPlan(source.width,source.height,snapshot);
      const c=document.createElement('canvas');let pixels;
      try{
        c.width=plan.width;c.height=plan.height;
        const g=c.getContext('2d',{willReadFrequently:true});
        g.drawImage(source,plan.x,plan.y,plan.width,plan.height,0,0,plan.width,plan.height);
        pixels=g.getImageData(0,0,c.width,c.height);
      }finally{c.width=0;c.height=0;}
      check();const out=await processExport(pixels,plan.params,maxEdge,controller.signal);
      check();const {blob,size}=await encodeExport(out,f,q,maxEdge,matte);
      check();const bytes=await blob.arrayBuffer();check();
      exportPhase='saving';$('phCancelExport').disabled=true;
      const r=await api.photoSave({format:f,name:sourceName,bytes});
      info(r?.ok?fmt(t('ph.saved'),{w:size.width,h:size.height}):r?.canceled?'':r?.code==='exists'?'Choose a new filename / Επιλέξτε νέο όνομα αρχείου':t('ph.saveFailed'));
    }catch(error){info(controller.signal.aborted?'Export cancelled / Ακυρώθηκε η εξαγωγή':t('ph.saveFailed'));}
    finally{busy=false;exportController=null;exportPhase='idle';$('phSave').disabled=false;$('phCancelExport').hidden=true;$('phCancelExport').disabled=false;}
  }

  window.WaveframePhotoUi = { processExport, encodeExport, show() { build(); }, open: (p) => { build(); return openPath(p); } };
  build();
})();
