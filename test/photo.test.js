'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../renderer/photolib.js');

const img = (w, h, fn) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = fn(x, y); const i = (y * w + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; } return { data: d, width: w, height: h }; };
const flat = (v, w = 8, h = 8) => img(w, h, () => [v, v, v]);
const mean = (im) => { let s = 0; for (let i = 0; i < im.data.length; i += 4) s += im.data[i]; return s / (im.data.length / 4); };

test('neutral parameters leave the pixels untouched and never modify the source', () => {
  const src = img(6, 4, (x, y) => [x * 40, y * 60, 128]);
  const copy = new Uint8ClampedArray(src.data);
  const out = P.process(src, P.defaults());
  assert.deepEqual([...out.data], [...copy]);
  assert.deepEqual([...src.data], [...copy]);
  assert.notEqual(out.data, src.data);
  assert.equal(P.isNeutral({}), true); assert.equal(P.isNeutral({ exposure: 0.5 }), false);
});

test('parameters are clamped and sanitised', () => {
  const p = P.clampParams({ exposure: 99, contrast: -500, gamma: 'x', black: 300, white: 10, rotate: 45, crop: { x: -1, y: 2, w: 5, h: 0 }, flipH: 1 });
  assert.equal(p.exposure, 2); assert.equal(p.contrast, -100); assert.equal(p.gamma, 1); assert.ok(p.white > p.black);
  assert.equal(p.rotate, 0); assert.equal(p.flipH, true);
  assert.ok(p.crop.x >= 0 && p.crop.y <= 0.99 && p.crop.x + p.crop.w <= 1.0001 && p.crop.h >= 0.01);
  assert.equal(P.clampParams({ crop: { x: 'a' } }).crop, null);
});

test('exposure, contrast, shadows and highlights move the tones in the right direction', () => {
  assert.ok(mean(P.process(flat(100), { exposure: 1 })) > 150);
  assert.ok(mean(P.process(flat(100), { exposure: -1 })) < 70);
  const lut = P.toneLut(P.clampParams({ contrast: 60 }));
  assert.ok(lut[40] < 40 && lut[220] > 220, 'contrast darkens darks and brightens brights');
  const low = P.toneLut(P.clampParams({ contrast: -60 }));
  assert.ok(low[40] > 40 && low[220] < 220, 'negative contrast flattens');
  assert.ok(P.toneLut(P.clampParams({ shadows: 80 }))[40] > 40, 'shadows lifted');
  assert.ok(P.toneLut(P.clampParams({ highlights: -80 }))[220] < 220, 'highlights recovered');
  assert.ok(P.toneLut(P.clampParams({ shadows: 80 }))[250] === 250 || Math.abs(P.toneLut(P.clampParams({ shadows: 80 }))[250] - 250) <= 3, 'bright end barely moved by shadows');
  const l = P.toneLut(P.clampParams({ black: 50, white: 200 }));
  assert.equal(l[50], 0); assert.equal(l[200], 255);
  for (let i = 1; i < 256; i++) assert.ok(P.toneLut(P.clampParams({ exposure: 0.7, contrast: 40, shadows: 30, highlights: -30 }))[i] >= P.toneLut(P.clampParams({ exposure: 0.7, contrast: 40, shadows: 30, highlights: -30 }))[i - 1] - 1, 'curve stays (almost) monotonic');
});

test('saturation and white balance', () => {
  const px = img(2, 2, () => [200, 100, 50]);
  const gray = P.process(px, { saturation: -100 });
  assert.ok(Math.abs(gray.data[0] - gray.data[1]) <= 1 && Math.abs(gray.data[1] - gray.data[2]) <= 1, 'fully desaturated is gray');
  const sat = P.process(px, { saturation: 60 });
  assert.ok(sat.data[0] - sat.data[2] > px.data[0] - px.data[2]);
  const warm = P.process(flat(120), { temperature: 60 });
  assert.ok(warm.data[0] > warm.data[2]);
  const cool = P.process(flat(120), { temperature: -60 });
  assert.ok(cool.data[2] > cool.data[0]);
  const mag = P.process(flat(120), { tint: 60 });
  assert.ok(mag.data[1] < mag.data[0]);
});

test('sharpen raises edge contrast, flat areas stay flat', () => {
  const edge = img(8, 8, (x) => (x < 4 ? [80, 80, 80] : [160, 160, 160]));
  const out = P.process(edge, { sharpen: 100 });
  assert.ok(out.data[(3) * 4] < 80 && out.data[(4) * 4] > 160, 'overshoot on both sides of the edge');
  assert.equal(out.data[0], 80); assert.equal(out.data[7 * 4], 160);
});

test('denoise lowers noise but keeps a strong edge', () => {
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const noisy = img(24, 24, (x) => { const base = x < 12 ? 60 : 190, n = Math.round((rnd() - 0.5) * 24); return [base + n, base + n, base + n]; });
  const variance = (im, x0, x1) => { let s = 0, s2 = 0, n = 0; for (let y = 2; y < 22; y++) for (let x = x0; x < x1; x++) { const v = im.data[(y * 24 + x) * 4]; s += v; s2 += v * v; n++; } return s2 / n - (s / n) ** 2; };
  const out = P.process(noisy, { denoise: 100 });
  assert.ok(variance(out, 2, 10) < variance(noisy, 2, 10) * 0.6, 'noise reduced');
  assert.ok(out.data[(10 * 24 + 15) * 4] - out.data[(10 * 24 + 8) * 4] > 100, 'edge kept');
});

test('geometry: crop, flips and rotations', () => {
  const src = img(4, 2, (x, y) => [x * 10 + y, 0, 0]);   // values 0 10 20 30 / 1 11 21 31
  const val = (im, x, y) => im.data[(y * im.width + x) * 4];
  const r90 = P.process(src, { rotate: 90 });
  assert.deepEqual([r90.width, r90.height], [2, 4]);
  assert.equal(val(r90, 1, 0), 0, 'top-left of the source ends up top-right after a clockwise turn');
  assert.equal(val(r90, 0, 0), 1);
  const r180 = P.process(src, { rotate: 180 });
  assert.equal(val(r180, 0, 0), 31); assert.equal(val(r180, 3, 1), 0);
  const r270 = P.process(src, { rotate: 270 });
  assert.equal(val(r270, 0, 0), 30);
  const fh = P.process(src, { flipH: true }); assert.equal(val(fh, 0, 0), 30);
  const fv = P.process(src, { flipV: true }); assert.equal(val(fv, 0, 0), 1);
  const cr = P.process(src, { crop: { x: 0.5, y: 0, w: 0.5, h: 1 } });
  assert.deepEqual([cr.width, cr.height], [2, 2]); assert.equal(val(cr, 0, 0), 20);
  assert.deepEqual(P.outputSize(4000, 3000, { rotate: 90, crop: { x: 0, y: 0, w: 0.5, h: 1 } }), { width: 3000, height: 2000 });
});

test('auto enhance stretches a dull image and leaves a full-range one nearly alone', () => {
  const dull = img(32, 32, (x) => { const v = 90 + Math.floor((x / 31) * 70); return [v, v, v]; });
  const p = P.autoParams(dull);
  assert.ok(p.black > 60 && p.white < 200 + 60);
  const out = P.process(dull, p);
  const range = (im) => { let lo = 255, hi = 0; for (let i = 0; i < im.data.length; i += 4) { lo = Math.min(lo, im.data[i]); hi = Math.max(hi, im.data[i]); } return hi - lo; };
  assert.ok(range(out) > range(dull) * 1.4);
  const full = img(32, 32, (x) => { const v = Math.floor((x / 31) * 255); return [v, v, v]; });
  const pf = P.autoParams(full);
  assert.ok(pf.black <= 10 && pf.white >= 245 && pf.gamma > 0.85 && pf.gamma < 1.2);
});

test('preview size keeps the aspect ratio and never upscales; histogram counts every pixel', () => {
  assert.deepEqual(P.previewSize(6000, 3000, 1500), { width: 1500, height: 750, scale: 0.25 });
  assert.equal(P.previewSize(800, 600, 1500).scale, 1);
  const h = P.histogram(flat(10, 5, 5).data); assert.equal(h[10], 25); assert.equal(h.reduce((a, b) => a + b, 0), 25);
});

test('creative photo controls preserve alpha, source and neutral output', () => {
  const P = require('../renderer/photolib.js');
  const img = {data: new Uint8ClampedArray([80,100,120,99, 120,80,40,255]), width:2,height:1};
  const source = Array.from(img.data);
  assert.deepEqual(Array.from(P.process(img,P.defaults()).data),source);
  const out=P.process(img,{vibrance:75,sepia:50});
  assert.notDeepEqual(Array.from(out.data),source);
  assert.equal(out.data[3],99); assert.equal(out.data[7],255);
  assert.deepEqual(Array.from(img.data),source);
  const uniform={data:new Uint8ClampedArray(5*5*4).fill(200),width:5,height:5};
  const v=P.process(uniform,{vignette:100});
  assert.ok(v.data[0]<v.data[(2*5+2)*4]); assert.equal(v.data[3],200);
});

test('parameter history is bounded, independent and clears redo after new edits',()=>{
 const h=P.createHistory({x:0},3);h.push({x:1});h.push({x:2});h.push({x:3});
 assert.equal(h.undo().x,2);assert.equal(h.undo().x,1);assert.equal(h.canUndo(),false);
 const v=h.current();v.x=99;assert.equal(h.current().x,1);h.push({x:4});assert.equal(h.canRedo(),false);
});
test('auto enhance preserves geometry and creative adjustments',()=>{
 const p=P.applyAuto(flat(8,8,90),{...P.defaults(),rotate:90,flipH:true,vignette:70});
 assert.equal(p.rotate,90);assert.equal(p.flipH,true);assert.equal(p.vignette,70);
});

test('resize output preserves aspect ratio, never upscales and validates budget',()=>{
 assert.deepEqual(P.resizeOutput(4000,3000,2048),{width:2048,height:1536});
 assert.deepEqual(P.resizeOutput(100,50,2048),{width:100,height:50});
 assert.equal(P.exportBudget(8000,10000,{},0),false);
 assert.equal(P.exportBudget(4000,3000,{},2048),true);
 assert.equal(P.exportBudget(0,10,{},0),false);
});

test('RGB channels and clarity preserve alpha and source data',()=>{
 const img={width:3,height:1,data:new Uint8ClampedArray([80,80,80,90,120,120,120,100,80,80,80,110])};
 const c=P.process(img,{...P.defaults(),red:100,blue:-100});
 assert.equal(c.data[0],120);assert.equal(c.data[2],40);assert.equal(c.data[3],90);assert.equal(img.data[0],80);
 const crisp=P.process(img,{...P.defaults(),clarity:100});
 assert.ok(crisp.data[4]>120);assert.equal(crisp.data[7],100);
 assert.deepEqual(P.process(img,P.defaults()).data,img.data);
});

test('photo looks retain geometry and blend from neutral',()=>{const p={...P.defaults(),rotate:90,flipH:true,crop:{x:.1,y:.1,w:.5,h:.5}};const q=P.applyLook(p,'monochrome',50);assert.equal(q.saturation,-50);assert.equal(q.rotate,90);assert.equal(q.flipH,true);assert.deepEqual(q.crop,p.crop);assert.equal(p.saturation,0);assert.equal(P.applyLook(q,'portrait',0).contrast,0);});

test('RGB histogram ignores transparent pixels and crop anchors stay inside original',()=>{const r=P.colorHistogram(new Uint8ClampedArray([0,0,0,255,255,0,0,255,0,0,255,0]));assert.equal(r.total,2);assert.equal(r.shadow,1);assert.equal(r.highlight,1);assert.equal(r.blue[255],0);const c=P.aspectCrop(400,200,1,0,100,50);assert.deepEqual(c,{x:.5,y:0,w:.5,h:1});assert.equal(P.aspectCrop(400,200,1,0,0,50).x,0);});

test('crop output size always agrees with actual pixels on odd dimensions and near edges',()=>{for(const width of [3,5,9,13])for(const height of [3,7,11])for(const rotate of [0,90,180,270]){const data=new Uint8ClampedArray(width*height*4),params={...P.defaults(),rotate,crop:{x:.5,y:.5,w:.5,h:.5}};const out=P.geometry({width,height,data},params),size=P.outputSize(width,height,params);assert.equal(out.width,size.width);assert.equal(out.height,size.height);assert.equal(out.data.length,size.width*size.height*4);}});

test('image header preflight catches oversized PNG and reads GIF/JPEG dimensions',()=>{const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write('IHDR',12);png.writeUInt32BE(20000,16);png.writeUInt32BE(20000,20);assert.deepEqual(P.headerSize(png),{width:20000,height:20000});assert.equal(P.validImageSize(20000,20000),false);const gif=Buffer.from('47494638396140003000','hex');assert.deepEqual(P.headerSize(gif),{width:64,height:48});const jpg=Buffer.from('ffd8ffc0000b080030004001011100','hex');assert.deepEqual(P.headerSize(jpg),{width:64,height:48});assert.equal(P.headerSize(Buffer.alloc(4)),null);});


test('history limits are clamped and export rejects extreme single-axis images',()=>{
 const h=P.createHistory({x:0},0);h.push({x:1});assert.equal(h.canUndo(),false);assert.deepEqual(h.current(),{x:1});
 assert.equal(P.exportBudget(40000,10,P.defaults(),1024),false);
});


test('export readback crop preserves exact full-resolution pixels and geometry',()=>{
 const width=13,height=9,data=Uint8ClampedArray.from({length:width*height*4},(_,i)=>i%256);
 for(const rotate of [0,90,180,270]){
  const params={...P.defaults(),crop:{x:.37,y:.21,w:.5,h:.6},rotate,flipH:true,exposure:.3,denoise:20,sharpen:30,clarity:10};
  const plan=P.exportReadPlan(width,height,params),cropped=new Uint8ClampedArray(plan.width*plan.height*4);
  for(let y=0;y<plan.height;y++)cropped.set(data.subarray(((plan.y+y)*width+plan.x)*4,((plan.y+y)*width+plan.x+plan.width)*4),y*plan.width*4);
  assert.deepEqual(P.process({width:plan.width,height:plan.height,data:cropped},plan.params),P.process({width,height,data},params));
 }
 assert.equal(P.exportBudget(8000,10000,{...P.defaults(),crop:{x:0,y:0,w:.2,h:.2}},2048),true);
 assert.equal(P.exportBudget(8000,10000,P.defaults(),0),false);
});

test('recovered capture date helper writes a single minimal EXIF date in JPEG and PNG',()=>{
 const assert=require('node:assert/strict'),M=require('../photo-metadata');
 const date='2024:07:18 09:14:30',jpeg=Buffer.from([0xff,0xd8,0xff,0xd9]);
 const png=Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000049454e44ae426082','hex');
 for(const [format,bytes] of [['jpeg',jpeg],['png',png]]){
  assert.equal(M.captureDate(bytes),null);
  const out=M.attachCaptureDate(bytes,format,date);
  assert.notEqual(out,bytes);assert.equal(M.captureDate(out),date);
  assert.equal(M.attachCaptureDate(out,format,date),out);
  assert.equal(M.attachCaptureDate(bytes,format,'bad'),bytes);
 }
 assert.equal(M.captureDate(Buffer.alloc(2)),null);
 assert.equal(M.captureDate(null),null);
});

test('preview-only zoom clamps pan and never changes image dimensions',()=>{
 assert.deepEqual(P.previewViewport(2,500,-500,300,200,400,300),{scale:2,x:100,y:-50});
 assert.deepEqual(P.previewViewport(1,500,-500,300,200,400,300),{scale:1,x:0,y:0});
 assert.deepEqual(P.previewViewport(99,0,0,300,200,400,300),{scale:3,x:0,y:0});
});

test('free crop uses bounded source-relative dimensions and the existing export path',()=>{
 assert.deepEqual(P.freeCrop(50,25,100,0),{x:.5,y:0,w:.5,h:.25});
 assert.equal(P.freeCrop(100,100),null);
 assert.deepEqual(P.freeCrop(0,200,100,50),{x:.99,y:0,w:.01,h:1});
 const crop=P.freeCrop(50,50,100,100),plan=P.exportReadPlan(800,600,{crop,rotate:90});
 assert.equal(plan.x,400);assert.equal(plan.y,300);assert.equal(plan.width,400);assert.equal(plan.height,300);
 assert.deepEqual(P.outputSize(800,600,{crop,rotate:90}),{width:300,height:400});
});
