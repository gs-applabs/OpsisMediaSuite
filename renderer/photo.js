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
    ['black', 0, 254, 1], ['white', 1, 255, 1], ['gamma', 0.2, 3, 0.01], ['vibrance', -100, 100, 1], ['sepia', 0, 100, 1], ['vignette', 0, 100, 1],
  ];
  const CROPS = [['none', null], ['1:1', 1], ['4:3', 4 / 3], ['3:2', 3 / 2], ['16:9', 16 / 9], ['3:4', 3 / 4], ['2:3', 2 / 3], ['9:16', 9 / 16]];
  const fmt = (s, vars) => Object.entries(vars || {}).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

  let openGeneration = 0;
  let bmp = null, name = 'photo', params = P.defaults(), cropKey = 'none', preview = null, orig = null, raf = 0, comparing = false, built = false, busy = false;

  let history=P.createHistory({params,cropKey});
  function updateHistory(){ $('phUndo').disabled=!history.canUndo();$('phRedo').disabled=!history.canRedo(); }
  function checkpoint(){if(!orig)return;history.push({params,cropKey});updateHistory();}
  function restore(snapshot){params=snapshot.params;cropKey=snapshot.cropKey;$('phCrop').value=cropKey;syncSliders();updateHistory();schedule();}
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
    $('phOpen').addEventListener('click', async () => { const p = await api.photoPick(); if (p) openPath(p); });
    $('phAuto').addEventListener('click', () => { if (!preview) return; params = P.applyAuto(preview,params); syncSliders(); checkpoint(); schedule(); });
    $('phReset').addEventListener('click', () => { params = P.defaults(); cropKey = 'none'; $('phCrop').value = 'none'; syncSliders(); checkpoint(); schedule(); });
    $('phRotL').addEventListener('click', () => { params.rotate = (params.rotate + 270) % 360; checkpoint(); schedule(); });
    $('phRotR').addEventListener('click', () => { params.rotate = (params.rotate + 90) % 360; checkpoint(); schedule(); });
    $('phFlipH').addEventListener('click', () => { params.flipH = !params.flipH; checkpoint(); schedule(); });
    $('phFlipV').addEventListener('click', () => { params.flipV = !params.flipV; checkpoint(); schedule(); });
    $('phCrop').addEventListener('change', () => { cropKey = $('phCrop').value; checkpoint(); schedule(); });
    $('phUndo').addEventListener('click',()=>{if(orig)restore(history.undo());});$('phRedo').addEventListener('click',()=>{if(orig)restore(history.redo());});updateHistory();
    const cmp = $('phCompare');
    const down = () => { comparing = true; schedule(); }, up = () => { comparing = false; schedule(); };
    cmp.addEventListener('pointerdown', down); cmp.addEventListener('pointerup', up); cmp.addEventListener('pointerleave', up); cmp.addEventListener('pointercancel',up);cmp.addEventListener('blur',up);window.addEventListener('blur',up);
    cmp.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') down(); }); cmp.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') up(); });
    $('phFormat').addEventListener('change', () => { $('phQualityField').classList.toggle('dep-hidden', $('phFormat').value === 'png'); });
    $('phSave').addEventListener('click', save);
    $('phResize').addEventListener('change',exportSize);
    const drop = $('phDrop');
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault(); drop.classList.remove('drag');
      const f = e.dataTransfer.files[0]; if (!f) return;
      const p = api.pathForFile(f);
      if (p) openPath(p); else openBlob(f, f.name);
    });
    document.addEventListener('waveframe:language-changed', () => { $('phCrop').options[0].textContent = t('ph.cropNone'); });
  }

  function syncSliders() {
    for (const [key] of SLIDERS) {
      const i = $(`ph_${key}`); i.value = String(params[key]);
      const o = i.nextElementSibling; o.textContent = key === 'exposure' || key === 'gamma' ? Number(params[key]).toFixed(2) : String(params[key]);
    }
  }

  async function openPath(p) {
    if (busy) return;
    const generation = ++openGeneration;
    info(t('ph.loading'));
    const r = await api.photoRead(p).catch(() => null);
    if (generation !== openGeneration || busy) return;
    if (!r || r.error) { info(r && r.error === 'too-large' ? t('ph.tooLarge') : t('ph.cantOpen')); return; }
    await openBlob(new Blob([r.bytes]), r.name, generation);
  }

  async function openBlob(blob, nm, generation = ++openGeneration) {
    if (busy) return;
    if (blob.size > P.LIMITS.maxFileBytes) { info(t('ph.tooLarge')); return; }
    try {
      const b = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      if (generation !== openGeneration || busy) { b.close(); return; }
      if (b.width * b.height > P.LIMITS.maxPixels) { b.close(); info(t('ph.tooLarge')); return; }
      if (bmp) bmp.close();
      bmp = b; name = nm || 'photo'; params = P.defaults(); cropKey = 'none'; $('phCrop').value = 'none'; syncSliders();
      const sz = P.previewSize(b.width, b.height);
      const c = document.createElement('canvas'); c.width = sz.width; c.height = sz.height;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(b, 0, 0, sz.width, sz.height);
      const d = g.getImageData(0, 0, sz.width, sz.height);
      orig = { data: d.data, width: d.width, height: d.height };
      preview = orig; history=P.createHistory({params,cropKey});comparing=false;updateHistory();
      $('phDrop').classList.add('has-media');
      info(fmt(t('ph.opened'), { name, w: b.width, h: b.height, mp: (b.width * b.height / 1e6).toFixed(1) }));
      schedule();
    } catch (_) { if (generation === openGeneration && !busy) info(t('ph.cantOpen')); }
  }

  // Centered crop of the wanted aspect ratio, in the orientation of the ORIGINAL (rotation happens after the crop).
  function cropParams() {
    const e = CROPS.find((c) => c[0] === cropKey); if (!e || !e[1] || !orig) return null;
    const turned = params.rotate === 90 || params.rotate === 270, want = turned ? 1 / e[1] : e[1], ar = orig.width / orig.height;
    if (Math.abs(ar - want) < 0.001) return null;
    return ar > want ? { x: (1 - want / ar) / 2, y: 0, w: want / ar, h: 1 } : { x: 0, y: (1 - ar / want) / 2, w: 1, h: ar / want };
  }
  const full = () => ({ ...params, crop: cropParams() });

  function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
  function render() {
    if (!orig) return;
    const out = comparing ? P.geometry(orig, { ...P.defaults(), rotate: params.rotate, flipH: params.flipH, flipV: params.flipV, crop: cropParams() }) : P.process(orig, full());
    const c = $('phCanvas'); c.width = out.width; c.height = out.height;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(out.data), out.width, out.height), 0, 0);
    drawHist(out.data);
    exportSize();
    const dimensions=P.outputSize(bmp.width,bmp.height,full());
    const o=P.resizeOutput(dimensions.width,dimensions.height,Number($('phResize').value));
    $('phSave').title = fmt(t('ph.outputSize'), { w: o.width, h: o.height });
  }
  function drawHist(data) {
    const c = $('phHist'), g = c.getContext('2d'), bins = P.histogram(data);
    let max = 1; for (let i = 1; i < 255; i++) max = Math.max(max, bins[i]);
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c6cf0';
    for (let i = 0; i < 256; i++) { const h = Math.round(Math.min(1, bins[i] / max) * (c.height - 2)); g.fillRect(i, c.height - h, 1, h); }
  }

  function processExport(img,snapshot,maxEdge) {
    return new Promise((resolve,reject)=>{
      const worker=new Worker('photo-worker.js');
      let timer;
      const finish=(err,value)=>{clearTimeout(timer);worker.terminate();err?reject(err):resolve(value);};
      timer=setTimeout(()=>finish(Error('photo-timeout')),120000);
      worker.onerror=()=>finish(Error('photo-worker'));
      worker.onmessage=({data:r})=>{if(!r?.ok){finish(Error(r?.error||'photo-worker'));return;}finish(null,{width:r.width,height:r.height,data:new Uint8ClampedArray(r.buffer)});};
      try{worker.postMessage({width:img.width,height:img.height,buffer:img.data.buffer,params:snapshot,maxEdge},[img.data.buffer]);}catch(e){finish(e);}
    });
  }
  function exportSize(){if(!bmp)return;const s=P.outputSize(bmp.width,bmp.height,full()),o=P.resizeOutput(s.width,s.height,Number($('phResize').value));$('phDimensions').textContent=o.width+' × '+o.height+' px';}
  async function save() {
    if (!bmp || busy) return;
    busy = true; ++openGeneration;
    const snapshot = full(), source = bmp, sourceName = name, f = $('phFormat').value, q = Number($('phQuality').value) / 100, maxEdge=Number($('phResize').value);
    if(!P.exportBudget(source.width,source.height,snapshot,maxEdge)){busy=false;info(t('ph.tooLarge'));return;}
    $('phSave').disabled = true; info(t('ph.processing'));
    await new Promise((r) => setTimeout(r, 30)); // let the message paint before the heavy work
    try {
      const c = document.createElement('canvas'); c.width = source.width; c.height = source.height;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(source, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height);
      c.width=0;c.height=0;
      const out = await processExport(d,snapshot,maxEdge);
      const oc = document.createElement('canvas'); oc.width = out.width; oc.height = out.height;
      oc.getContext('2d').putImageData(new ImageData(out.data, out.width, out.height), 0, 0);
      const size=P.resizeOutput(out.width,out.height,maxEdge);
      let target=oc;
      if(size.width!==out.width||size.height!==out.height){target=document.createElement('canvas');target.width=size.width;target.height=size.height;const ctx=target.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(oc,0,0,size.width,size.height);oc.width=0;oc.height=0;}
      const blob = await new Promise((res) => target.toBlob(res, P.OUT_FORMATS[f].mime, q));
      target.width=0;target.height=0;
      if (!blob) { info(t('ph.saveFailed')); return; }
      const r = await api.photoSave({ format: f, name: sourceName, bytes: await blob.arrayBuffer() });
      info(r && r.ok ? fmt(t('ph.saved'), { w: size.width, h: size.height }) : r && r.canceled ? '' : t('ph.saveFailed'));
    } catch (_) { info(t('ph.saveFailed')); } finally { busy = false; $('phSave').disabled = false; }
  }

  window.WaveframePhotoUi = { processExport, show() { build(); }, open: (p) => { build(); return openPath(p); } };
  build();
})();
