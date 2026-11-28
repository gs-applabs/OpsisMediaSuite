'use strict';
// Photo enhancement maths (2.3.0). Pure functions over RGBA byte arrays ({ data, width, height }), so the same code produces the live preview (on a
// downscaled copy) and the export at the original resolution, and is unit-tested in Node without a browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WaveframePhoto = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const LIMITS = { maxPixels: 80e6, previewEdge: 1400, maxFileBytes: 200 * 1024 * 1024, exportWorkBytes: 768 * 1024 * 1024, maxExportEdge: 16384 };
  const RANGE = {
    exposure: [-2, 2], contrast: [-100, 100], saturation: [-100, 100], temperature: [-100, 100], tint: [-100, 100],
    highlights: [-100, 100], shadows: [-100, 100], sharpen: [0, 100], denoise: [0, 100],
    black: [0, 254], white: [1, 255], gamma: [0.2, 5], vibrance: [-100, 100], sepia: [0, 100], vignette: [0, 100], red: [-100,100], green: [-100,100], blue: [-100,100], clarity: [-100,100],
  };
  function defaults() {
    return { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, sharpen: 0, denoise: 0, black: 0, white: 255, gamma: 1, vibrance: 0, sepia: 0, vignette: 0, red:0, green:0, blue:0, clarity:0, rotate: 0, flipH: false, flipV: false, crop: null };
  }
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  function clampParams(p) {
    const d = defaults(), o = { ...d };
    for (const k of Object.keys(RANGE)) o[k] = Math.min(RANGE[k][1], Math.max(RANGE[k][0], num(p && p[k], d[k])));
    if (o.white <= o.black) o.white = Math.min(255, o.black + 1);
    o.rotate = [0, 90, 180, 270].includes(Number(p && p.rotate)) ? Number(p.rotate) : 0;
    o.flipH = !!(p && p.flipH); o.flipV = !!(p && p.flipV);
    const c = p && p.crop;
    if (c && [c.x, c.y, c.w, c.h].every(Number.isFinite)) {
      const x = Math.min(0.99, Math.max(0, c.x)), y = Math.min(0.99, Math.max(0, c.y));
      o.crop = { x, y, w: Math.min(1 - x, Math.max(0.01, c.w)), h: Math.min(1 - y, Math.max(0.01, c.h)) };
    }
    return o;
  }
  const isNeutral = (p) => JSON.stringify(clampParams(p)) === JSON.stringify(defaults());

  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  // One 256-entry curve for the tonal controls: levels -> gamma -> exposure -> shadows/highlights -> contrast (S-curve around the middle).
  function toneLut(p) {
    const lut = new Uint8ClampedArray(256), gain = Math.pow(2, p.exposure), c = p.contrast / 100;
    for (let i = 0; i < 256; i++) {
      let v = Math.min(1, Math.max(0, (i - p.black) / (p.white - p.black)));
      v = Math.pow(v, 1 / p.gamma);
      v = Math.min(1, v * gain);
      v += (p.shadows / 100) * 0.35 * (1 - smooth(0, 0.55, v)) * (1 - v) * 1.4;      // lifts / deepens the dark half
      v += (p.highlights / 100) * 0.35 * smooth(0.45, 1, v) * v;              // recovers / pushes the bright half
      v = Math.min(1, Math.max(0, v));
      if (c > 0) v = v < 0.5 ? 0.5 * Math.pow(2 * v, 1 + c * 1.2) : 1 - 0.5 * Math.pow(2 * (1 - v), 1 + c * 1.2);
      else if (c < 0) v = 0.5 + (v - 0.5) * (1 + c * 0.6);
      lut[i] = Math.round(Math.min(1, Math.max(0, v)) * 255);
    }
    return lut;
  }

  // Colour: white balance (warm/cool, green/magenta), then saturation around the pixel's luma.
  function applyColor(data, params) {
    const p = clampParams(params), lut = toneLut(p);
    const t = p.temperature / 100, g = p.tint / 100, sat = 1 + p.saturation / 100;
    const mr = (1 + 0.25*t + 0.06*g)*(1+p.red/200), mg=(1-0.12*g)*(1+p.green/200), mb=(1-0.25*t+0.06*g)*(1+p.blue/200);
    const neutral = t===0&&g===0&&p.saturation===0&&!p.red&&!p.green&&!p.blue;
    for (let i = 0; i < data.length; i += 4) {
      let r = lut[data[i]], gg = lut[data[i + 1]], b = lut[data[i + 2]];
      if (!neutral) {
        r *= mr; gg *= mg; b *= mb;
        const y = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        r = y + (r - y) * sat; gg = y + (gg - y) * sat; b = y + (b - y) * sat;
      }
      data[i] = r < 0 ? 0 : r > 255 ? 255 : r; data[i + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg; data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b; // Uint8ClampedArray rounds
    }
    return data;
  }

  // Edge-preserving 3x3 smoothing: neighbours count less the more their colour differs (so edges and texture survive, flat noise is averaged).
  function denoise(img, amount) {
    if (!(amount > 0)) return img;
    const { data, width: w, height: h } = img, out = new Uint8ClampedArray(data.length), k = amount / 100;
    const sigma = 12 + 60 * k, inv = 1 / (2 * sigma * sigma);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; let sr = 0, sg = 0, sb = 0, sw = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx)), j = (yy * w + xx) * 4;
          const dr = data[j] - data[i], dg = data[j + 1] - data[i + 1], db = data[j + 2] - data[i + 2];
          const wt = Math.exp(-(dr * dr + dg * dg + db * db) * inv);
          sr += data[j] * wt; sg += data[j + 1] * wt; sb += data[j + 2] * wt; sw += wt;
        }
      }
      out[i] = data[i] + (sr / sw - data[i]) * k; out[i + 1] = data[i + 1] + (sg / sw - data[i + 1]) * k; out[i + 2] = data[i + 2] + (sb / sw - data[i + 2]) * k; out[i + 3] = data[i + 3];
    }
    return { data: out, width: w, height: h };
  }

  // Unsharp mask (3x3 blur): original + amount * (original - blurred).
  function sharpen(img, amount) {
    if (!(amount > 0)) return img;
    const { data, width: w, height: h } = img, out = new Uint8ClampedArray(data.length), a = amount / 100 * 1.6;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) { const yy = Math.min(h - 1, Math.max(0, y + dy)); for (let dx = -1; dx <= 1; dx++) s += data[(yy * w + Math.min(w - 1, Math.max(0, x + dx))) * 4 + c] * (dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1); }
        const blur = s / 16;
        out[i + c] = data[i + c] + a * (data[i + c] - blur);
      }
      out[i + 3] = data[i + 3];
    }
    return { data: out, width: w, height: h };
  }

  // Crop (normalised rectangle of the ORIGINAL orientation), then flip, then rotate by multiples of 90 degrees.
  function cropBounds(w,h,c){
    if(!c)return {x:0,y:0,width:w,height:h};
    const x=Math.min(w-1,Math.round(c.x*w)),y=Math.min(h-1,Math.round(c.y*h));
    return {x,y,width:Math.max(1,Math.min(w-x,Math.round(c.w*w))),height:Math.max(1,Math.min(h-y,Math.round(c.h*h)))};
  }
  function geometry(img, params) {
    const p = clampParams(params);
    if (!p.crop && !p.flipH && !p.flipV && !p.rotate) return img;
    let { data, width: w, height: h } = img;
    if (p.crop) {
      const {x:cx,y:cy,width:cw,height:ch}=cropBounds(w,h,p.crop);
      const o = new Uint8ClampedArray(cw * ch * 4);
      for (let y = 0; y < ch; y++) o.set(data.subarray(((cy + y) * w + cx) * 4, ((cy + y) * w + cx + cw) * 4), y * cw * 4);
      data = o; w = cw; h = ch;
    }
    if(!p.rotate&&!p.flipH&&!p.flipV)return {data,width:w,height:h};
    const nw = p.rotate === 90 || p.rotate === 270 ? h : w, nh = p.rotate === 90 || p.rotate === 270 ? w : h;
    const out = new Uint8ClampedArray(nw * nh * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = p.flipH ? w - 1 - x : x, sy = p.flipV ? h - 1 - y : y;
      let dx, dy;
      if (p.rotate === 0) { dx = x; dy = y; } else if (p.rotate === 90) { dx = h - 1 - y; dy = x; } else if (p.rotate === 180) { dx = w - 1 - x; dy = h - 1 - y; } else { dx = y; dy = w - 1 - x; }
      const s = (sy * w + sx) * 4, d = (dy * nw + dx) * 4;
      out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = data[s + 3];
    }
    return { data: out, width: nw, height: nh };
  }

  // Creative controls: adaptive saturation, sepia blend and radial vignette. Alpha is never changed.
  function creative(img, p) {
    if (!p.vibrance && !p.sepia && !p.vignette) return img;
    const { data, width: w, height: h } = img;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = data[i], g = data[i+1], b = data[i+2];
      if (p.vibrance) {
        const l = 0.2126*r + 0.7152*g + 0.0722*b;
        const max = Math.max(r,g,b), min = Math.min(r,g,b);
        const s = max ? (max-min)/max : 0;
        const k = 1 + p.vibrance/100 * (p.vibrance > 0 ? 1-s : 1);
        r = l+(r-l)*k; g = l+(g-l)*k; b = l+(b-l)*k;
      }
      if (p.sepia) {
        const k = p.sepia/100, sr = Math.min(255, .393*r+.769*g+.189*b);
        const sg = Math.min(255, .349*r+.686*g+.168*b), sb = Math.min(255, .272*r+.534*g+.131*b);
        r += (sr-r)*k; g += (sg-g)*k; b += (sb-b)*k;
      }
      if (p.vignette) {
        const nx = (2*(x+.5)/w-1), ny = (2*(y+.5)/h-1);
        const k = 1-.85*p.vignette/100*smooth(.25,1,Math.hypot(nx,ny)/Math.SQRT2);
        r*=k; g*=k; b*=k;
      }
      data[i]=r; data[i+1]=g; data[i+2]=b;
    }
    return img;
  }

  // Local luma contrast, scaled to the current image size; preserve alpha.
  // A cross-shaped neighbourhood avoids expensive full-image convolutions.
  function clarity(img,amount){
    if(!amount)return img;
    const {data,width:w,height:h}=img,out=new Uint8ClampedArray(data.length);
    const radius=Math.max(1,Math.min(32,Math.round(Math.min(w,h)/140)));
    const k=amount/100*.65;
    const lum=i=>.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4,l=lum(i);
      const n=(lum((y*w+Math.max(0,x-radius))*4)+lum((y*w+Math.min(w-1,x+radius))*4)+lum((Math.max(0,y-radius)*w+x)*4)+lum((Math.min(h-1,y+radius)*w+x)*4))/4;
      const weight=1-Math.abs(l-127.5)/127.5,delta=(l-n)*k*weight;
      out[i]=data[i]+delta;out[i+1]=data[i+1]+delta;out[i+2]=data[i+2]+delta;out[i+3]=data[i+3];
    }
    return {data:out,width:w,height:h};
  }
  // Whole pipeline. The source is never modified (a copy is made).
  function process(img, params) {
    const p = clampParams(params);
    let cur = geometry(img, p);
    if (cur.data === img.data) cur = { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
    cur = denoise(cur, p.denoise);
    if(['exposure','contrast','saturation','temperature','tint','highlights','shadows','black','white','gamma','red','green','blue'].some(k=>p[k]!==defaults()[k]))applyColor(cur.data,p);
    return sharpen(creative(clarity(cur,p.clarity),p),p.sharpen);
  }

  function histogram(data) {
    const bins = new Uint32Array(256);
    for (let i = 0; i < data.length; i += 4) bins[Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])]++;
    return bins;
  }

  // Channel histograms and clipping counts ignore fully transparent pixels.
  function colorHistogram(data){
    const red=new Uint32Array(256),green=new Uint32Array(256),blue=new Uint32Array(256),luma=new Uint32Array(256);
    let total=0,shadow=0,highlight=0;
    for(let i=0;i+3<data.length;i+=4){
      if(!data[i+3])continue;
      const r=data[i],g=data[i+1],b=data[i+2];red[r]++;green[g]++;blue[b]++;
      luma[Math.round(.2126*r+.7152*g+.0722*b)]++;
      total++;if(Math.max(r,g,b)<=5)shadow++;if(Math.max(r,g,b)>=250)highlight++;
    }
    return {red,green,blue,luma,total,shadow,highlight};
  }
  // Width/height are percentages of the oriented source before edit rotation.
  // Anchors position the selected rectangle within the remaining margins.
  function freeCrop(width=100,height=100,anchorX=50,anchorY=50){
    const percent=(v,fallback,min)=>Math.max(min,Math.min(100,Number.isFinite(Number(v))?Number(v):fallback))/100;
    const w=percent(width,100,1),h=percent(height,100,1);
    if(w===1&&h===1)return null;
    return {x:(1-w)*percent(anchorX,50,0),y:(1-h)*percent(anchorY,50,0),w,h};
  }
  function aspectCrop(w,h,ratio,rotate=0,anchorX=50,anchorY=50){
    if(![w,h,ratio].every(Number.isFinite)||w<=0||h<=0||ratio<=0)return null;
    const target=rotate===90||rotate===270?1/ratio:ratio,ar=w/h;
    const x=Math.max(0,Math.min(100,Number(anchorX)||0))/100,y=Math.max(0,Math.min(100,Number(anchorY)||0))/100;
    if(Math.abs(ar-target)<.001)return null;
    return ar>target?{x:(1-target/ar)*x,y:0,w:target/ar,h:1}:{x:0,y:(1-ar/target)*y,w:1,h:ar/target};
  }
  // "Auto": stretch the levels to the 0.5 % / 99.5 % percentiles and move the mean towards the middle with gamma.
  function autoParams(img) {
    const stats=colorHistogram(img.data),bins=stats.luma,total=stats.total;if(!total)return defaults();const lo=total*.005,hi=total*.995;
    let acc = 0, black = 0, white = 255;
    for (let i = 0; i < 256; i++) { acc += bins[i]; if (acc >= lo) { black = i; break; } }
    acc = 0; for (let i = 0; i < 256; i++) { acc += bins[i]; if (acc >= hi) { white = i; break; } }
    if (white - black < 16) { black = 0; white = 255; }
    let mean = 0; for (let i = 0; i < 256; i++) mean += bins[i] * Math.min(1, Math.max(0, (i - black) / (white - black)));
    mean /= total;
    const gamma = Math.min(1.6, Math.max(0.7, mean > 0.01 && mean < 0.99 ? Math.log(0.45) / Math.log(mean) : 1));
    return clampParams({ ...defaults(), black: Math.min(black, 120), white: Math.max(white, 135), gamma: Math.round(gamma * 100) / 100, saturation: 8 });
  }

  // Store parameter snapshots only, never full-resolution image copies.
  function createHistory(initial,limit=60) {
    limit=Number.isInteger(limit)?Math.max(1,Math.min(60,limit)):60;
    const clone=v=>JSON.parse(JSON.stringify(v));
    let items=[clone(initial)],index=0;
    return {
      current:()=>clone(items[index]),
      canUndo:()=>index>0,canRedo:()=>index<items.length-1,
      push(v){const next=clone(v);if(JSON.stringify(next)===JSON.stringify(items[index]))return false;items=items.slice(0,index+1);items.push(next);if(items.length>limit)items.shift();index=items.length-1;return true;},
      undo(){if(index>0)index--;return clone(items[index]);},
      redo(){if(index<items.length-1)index++;return clone(items[index]);}
    };
  }
  function applyAuto(img,params) {
    const a=autoParams(img);
    return {...params,black:a.black,white:a.white,gamma:a.gamma,saturation:a.saturation};
  }
  function previewSize(w, h, maxEdge) {
    const m = maxEdge || LIMITS.previewEdge, s = Math.min(1, m / Math.max(w, h));
    return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)), scale: s };
  }
  function outputSize(w, h, params) {
    const p = clampParams(params);
    const {width:cw,height:ch}=cropBounds(w,h,p.crop);
    return p.rotate === 90 || p.rotate === 270 ? { width: ch, height: cw } : { width: cw, height: ch };
  }
  function resizeOutput(w,h,maxEdge=0) {
    if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1)throw Error('invalid-size');
    const edge=Number(maxEdge)||0;
    const limit=edge>0?Math.min(LIMITS.maxExportEdge,Math.max(1,Math.floor(edge))):Math.max(w,h);
    const scale=Math.min(1,limit/Math.max(w,h));
    return {width:Math.max(1,Math.round(w*scale)),height:Math.max(1,Math.round(h*scale))};
  }
  // Conservative estimate includes decoded bitmap, readback, processing and
  // output surfaces. Not an OS memory guarantee; reject oversized jobs early.
  // Geometry crops first, before every filter. Read back that exact region
  // rather than a full-resolution canvas. No resize before effects.
  function exportReadPlan(w,h,params){
    if(!validImageSize(w,h))throw Error('invalid-size');
    const p=clampParams(params),bounds=cropBounds(w,h,p.crop);
    return {...bounds,params:{...p,crop:null}};
  }
  function exportBudget(w,h,params,maxEdge=0) {
    if(!validImageSize(w,h))return false;
    const size=outputSize(w,h,params),out=resizeOutput(size.width,size.height,maxEdge);
    const read=exportReadPlan(w,h,params);
    // Source bitmap stays resident; cropped readback/processing and output are bounded separately.
    return w*h*4+read.width*read.height*8+size.width*size.height*8+out.width*out.height*8<=LIMITS.exportWorkBytes && out.width<=LIMITS.maxExportEdge&&out.height<=LIMITS.maxExportEdge;
  }
  const LOOKS=Object.freeze({
    neutral:{}, portrait:{contrast:5,highlights:-15,shadows:12,vibrance:10,clarity:-8,temperature:5},
    landscape:{contrast:12,vibrance:24,clarity:18,highlights:-12,shadows:10},
    monochrome:{saturation:-100,contrast:15,clarity:10},
    vintage:{sepia:32,contrast:-12,vignette:20,saturation:-20,temperature:12},
    document:{contrast:25,sharpen:25,saturation:-100,white:235}
  });
  function applyLook(params,name,strength=100){
    if(!Object.hasOwn(LOOKS,name))return clampParams(params);
    const old=clampParams(params),base=defaults(),weight=Math.max(0,Math.min(100,Number(strength)||0))/100;
    for(const k of Object.keys(RANGE))old[k]=base[k]+((LOOKS[name][k]??base[k])-base[k])*weight;
    return clampParams(old);
  }
  // Read bounded image headers before invoking the browser decoder.
  // AVIF and unusual JPEG headers may require decoder fallback.
  function headerSize(bytes){
    if(!(bytes instanceof Uint8Array)||bytes.length<10)return null;
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=bytes.length;
    const ascii=(o,s)=>o+s.length<=n&&[...s].every((c,i)=>bytes[o+i]===c.charCodeAt(0));
    const size=(width,height)=>({width,height});
    if(n>=24&&bytes[0]===137&&ascii(1,'PNG\r\n\x1a\n')&&ascii(12,'IHDR'))return size(v.getUint32(16),v.getUint32(20));
    if(ascii(0,'GIF87a')||ascii(0,'GIF89a'))return size(v.getUint16(6,true),v.getUint16(8,true));
    if(n>=26&&ascii(0,'BM')){
      const dib=v.getUint32(14,true);
      if(dib===12)return size(v.getUint16(18,true),v.getUint16(20,true));
      if(dib>=40)return size(v.getInt32(18,true),Math.abs(v.getInt32(22,true)));
    }
    if(n>=30&&ascii(0,'RIFF')&&ascii(8,'WEBP')){
      if(ascii(12,'VP8X'))return size(1+bytes[24]+bytes[25]*256+bytes[26]*65536,1+bytes[27]+bytes[28]*256+bytes[29]*65536);
      if(ascii(12,'VP8L')&&bytes[20]===47){const b=v.getUint32(21,true);return size((b&16383)+1,((b>>>14)&16383)+1);}
      if(ascii(12,'VP8 ')&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42)return size(v.getUint16(26,true)&16383,v.getUint16(28,true)&16383);
    }
    if(bytes[0]===255&&bytes[1]===216){
      let i=2;
      while(i+4<=n){
        if(bytes[i++]!==255)break;
        while(i<n&&bytes[i]===255)i++;
        const marker=bytes[i++];if(marker===217||marker===218||i+2>n)break;
        if(marker===1||marker>=208&&marker<=215)continue;
        const len=v.getUint16(i);if(len<2||i+len>n)break;
        if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&len>=7)return size(v.getUint16(i+5),v.getUint16(i+3));
        i+=len;
      }
    }
    return null;
  }
  function validImageSize(w,h){return Number.isSafeInteger(w)&&Number.isSafeInteger(h)&&w>0&&h>0&&w*h<=LIMITS.maxPixels&&Math.max(w,h)<=32768;}
  const EXTS = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'avif'];
  const OUT_FORMATS = { jpeg: { mime: 'image/jpeg', ext: 'jpg' }, png: { mime: 'image/png', ext: 'png' }, webp: { mime: 'image/webp', ext: 'webp' } };

  function previewViewport(scale,x,y,width,height,boxWidth,boxHeight){
    const finite=v=>Number.isFinite(v)?v:0;
    scale=Math.max(1,Math.min(3,finite(scale)||1));
    const mx=Math.max(0,(Math.max(0,finite(width))*scale-Math.max(0,finite(boxWidth)))/2),my=Math.max(0,(Math.max(0,finite(height))*scale-Math.max(0,finite(boxHeight)))/2);
    return {scale,x:Math.max(-mx,Math.min(mx,finite(x))),y:Math.max(-my,Math.min(my,finite(y)))};
  }
  return { freeCrop,previewViewport,headerSize,validImageSize,colorHistogram, aspectCrop, applyLook, clarity, resizeOutput, exportReadPlan, exportBudget, createHistory, applyAuto, LIMITS, RANGE, EXTS, OUT_FORMATS, defaults, clampParams, isNeutral, toneLut, applyColor, denoise, sharpen, geometry, process, histogram, autoParams, previewSize, outputSize };
});
