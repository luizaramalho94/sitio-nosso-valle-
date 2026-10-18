// Motor de composição: transforma um projeto (template + mídias + ajustes)
// em quadros desenhados num canvas 9:16.

import { artCanvas, drawRidgeLine } from './art.js';

export const W = 1080;
export const H = 1920;
export const FPS = 30;

export const LAYOUT_CELLS = { full: 1, split2: 2, split3: 3, beforeafter: 2, frame: 1, card: 0 };

export const TRANSITIONS = {
  cut: { label: 'Corte seco', dur: 0 },
  fade: { label: 'Fade', dur: 0.5 },
  zoom: { label: 'Zoom', dur: 0.45 },
  slide: { label: 'Deslizar', dur: 0.45 },
  flash: { label: 'Flash branco', dur: 0.35 },
  blur: { label: 'Desfoque', dur: 0.6 },
  wipe: { label: 'Cortina', dur: 0.5 },
};

export const FONT_STYLES = {
  elegante: { label: 'Elegante', family: 'Playfair Display', weight: 500, italic: true, base: 92, lh: 1.15 },
  classica: { label: 'Clássica', family: 'Cormorant Garamond', weight: 600, base: 96, lh: 1.08 },
  moderna: { label: 'Moderna', family: 'Montserrat', weight: 700, base: 64, lh: 1.2, upper: true, spacing: 0.08 },
  manuscrita: { label: 'Manuscrita', family: 'Caveat', weight: 700, base: 104, lh: 1.05 },
  impacto: { label: 'Impacto', family: 'Bebas Neue', weight: 400, base: 128, lh: 1.0, spacing: 0.03 },
  suave: { label: 'Suave', family: 'Josefin Sans', weight: 300, base: 60, lh: 1.3, upper: true, spacing: 0.22 },
};

export const TEXT_ANIMS = {
  aparecer: 'Aparecer',
  subir: 'Subir',
  zoom: 'Zoom',
  digitar: 'Digitar',
  deslizar: 'Deslizar',
  nenhuma: 'Nenhuma',
};

export const TEXT_COLORS = ['#ffffff', '#f4ede0', '#e2c27a', '#2f4a36', '#8a5a3b', '#1b1f1a'];

// Filtros de cor (camadas de mistura — funcionam no Safari sem ctx.filter)
export const FILTERS = {
  nenhum: { label: 'Original', swatch: '#cfcfcf', layers: [] },
  serra: { label: 'Verde da serra', swatch: '#5b7a4f', layers: [['soft-light', 'rgba(60,120,55,0.55)'], ['multiply', 'rgba(250,246,228,1)']], vignette: 0.25 },
  dourada: { label: 'Luz dourada', swatch: '#d9a441', layers: [['soft-light', 'rgba(255,160,50,0.6)'], ['screen', 'rgba(70,35,0,0.14)']], vignette: 0.3 },
  terra: { label: 'Terra', swatch: '#8a5a3b', layers: [['saturation', 'hsla(0,0%,50%,0.3)'], ['soft-light', 'rgba(170,95,50,0.55)']], vignette: 0.3 },
  creme: { label: 'Creme suave', swatch: '#efe2c6', layers: [['saturation', 'hsla(0,0%,50%,0.25)'], ['screen', 'rgba(70,55,35,0.2)'], ['soft-light', 'rgba(255,236,200,0.5)']] },
  neblina: { label: 'Neblina', swatch: '#b9c3b4', layers: [['saturation', 'hsla(0,0%,50%,0.35)'], ['screen', 'rgba(190,205,195,0.28)']] },
  noite: { label: 'Noite azul', swatch: '#2b3d5a', layers: [['soft-light', 'rgba(40,70,150,0.55)'], ['multiply', 'rgba(215,225,240,1)']], vignette: 0.4 },
  pb: { label: 'P&B quente', swatch: '#8d8174', layers: [['saturation', 'hsl(0,0%,50%)'], ['soft-light', 'rgba(210,150,90,0.45)']], vignette: 0.35 },
};

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

// ---------- Linha do tempo ----------

export function buildTimeline(project) {
  const beat = project.beatSync && project.bpm ? 60 / project.bpm : 0;
  const scenes = [];
  let t = 0, clip = 0;
  project.scenes.forEach((s, i) => {
    let dur = s.dur;
    if (beat) dur = Math.max(1, Math.round(dur / beat)) * beat;
    const n = LAYOUT_CELLS[s.layout || 'full'] ?? 1;
    const cells = [];
    for (let k = 0; k < n; k++) cells.push(clip++);
    scenes.push({ ...s, index: i, start: t, dur, end: t + dur, cells });
    t += dur;
  });
  scenes.forEach((s, i) => {
    let tr = s.transition || 'cut';
    if (i === 0) tr = tr === 'cut' ? 'cut' : 'fadein';
    let td = tr === 'fadein' ? 0.5 : (TRANSITIONS[tr]?.dur || 0);
    if (i > 0) td = Math.min(td, s.dur * 0.6, scenes[i - 1].dur * 0.6);
    s.tr = tr;
    s.td = td;
  });
  return { scenes, total: t, clipCount: clip, beat };
}

// Intervalo em que cada clipe aparece na tela (inclui transições)
export function clipWindows(tl) {
  const win = [];
  tl.scenes.forEach((s, i) => {
    const next = tl.scenes[i + 1];
    const a = s.start - (i > 0 ? s.td / 2 : 0);
    const b = s.end + (next ? next.td / 2 : 0);
    for (const c of s.cells) win[c] = { start: a, end: b, sceneStart: s.start, scene: s };
  });
  return win;
}

export function sceneAt(tl, t) {
  const sc = tl.scenes;
  for (let i = 0; i < sc.length; i++) if (t < sc[i].end) return i;
  return sc.length - 1;
}

// ---------- Renderizador ----------

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.s = canvas.width / W;
    this.layerA = makeCanvas(canvas.width, canvas.height);
    this.layerB = makeCanvas(canvas.width, canvas.height);
    this.small = makeCanvas(Math.max(2, canvas.width >> 3), Math.max(2, canvas.height >> 3));
    this.wrapCache = new Map();
  }

  // opts: { project, tl, getSource(clipIndex), labels:boolean, watermark:{...}|null, art }
  render(t, opts) {
    const { tl } = opts;
    const ctx = this.ctx;
    const s = this.s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!tl.scenes.length) return;
    t = clamp(t, 0, Math.max(0, tl.total - 0.001));
    const i = sceneAt(tl, t);
    const cur = tl.scenes[i];
    const next = tl.scenes[i + 1];
    let from = null, to = null, p = 0, type = 'cut';
    if (next && next.td > 0 && t > cur.end - next.td / 2) {
      from = cur; to = next; p = (t - (cur.end - next.td / 2)) / next.td; type = next.tr;
    } else if (i > 0 && cur.td > 0 && t < cur.start + cur.td / 2) {
      from = tl.scenes[i - 1]; to = cur; p = (t - (cur.start - cur.td / 2)) / cur.td; type = cur.tr;
    }
    if (!from) {
      this.drawScene(this.layerA, cur, t, opts);
      ctx.drawImage(this.layerA, 0, 0);
      if (cur.tr === 'fadein' && i === 0 && t < cur.td) {
        ctx.fillStyle = '#000';
        ctx.globalAlpha = 1 - easeOut(t / cur.td);
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.globalAlpha = 1;
      }
    } else {
      p = clamp(p);
      this.drawScene(this.layerA, from, t, opts);
      this.drawScene(this.layerB, to, t, opts);
      this.composite(type, p);
    }
    // filtro de cor
    this.applyFilter(opts.project.filter, opts.project.filterAmount ?? 1);
    // fade final
    if (opts.project.endFade !== false && tl.total - t < 0.45) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.globalAlpha = clamp(1 - (tl.total - t) / 0.45) * 0.9;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
    }
    // textos
    ctx.setTransform(s, 0, 0, s, 0, 0);
    for (const tx of opts.project.texts) this.drawText(tx, t, tl, opts);
    if (opts.watermark) this.drawWatermark(opts.watermark);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  composite(type, p) {
    const ctx = this.ctx;
    const cw = this.canvas.width, ch = this.canvas.height;
    const A = this.layerA, B = this.layerB;
    const e = easeInOut(p);
    switch (type) {
      case 'fade':
        ctx.drawImage(A, 0, 0);
        ctx.globalAlpha = e;
        ctx.drawImage(B, 0, 0);
        break;
      case 'zoom': {
        const za = 1 + e * 0.35, zb = 1.35 - e * 0.35;
        ctx.globalAlpha = 1;
        ctx.drawImage(A, (cw - cw * za) / 2, (ch - ch * za) / 2, cw * za, ch * za);
        ctx.globalAlpha = e;
        ctx.drawImage(B, (cw - cw * zb) / 2, (ch - ch * zb) / 2, cw * zb, ch * zb);
        break;
      }
      case 'slide':
        ctx.drawImage(A, -e * cw, 0);
        ctx.drawImage(B, cw - e * cw, 0);
        break;
      case 'wipe': {
        ctx.drawImage(A, 0, 0);
        const x = cw * (1 - e);
        ctx.drawImage(B, x, 0, cw - x, ch, x, 0, cw - x, ch);
        ctx.fillStyle = '#f4ede0';
        ctx.fillRect(x - 3 * this.s, 0, 6 * this.s, ch);
        break;
      }
      case 'flash': {
        ctx.drawImage(p < 0.5 ? A : B, 0, 0);
        ctx.fillStyle = '#fffaf0';
        ctx.globalAlpha = 1 - Math.abs(p - 0.5) * 2;
        ctx.fillRect(0, 0, cw, ch);
        break;
      }
      case 'blur': {
        const amt = 1 - Math.abs(p - 0.5) * 2;
        this.blurInto(A, amt);
        ctx.globalAlpha = 1;
        ctx.drawImage(A, 0, 0);
        this.blurInto(B, amt);
        ctx.globalAlpha = e;
        ctx.drawImage(B, 0, 0);
        break;
      }
      default:
        ctx.drawImage(p < 0.5 ? A : B, 0, 0);
    }
    ctx.globalAlpha = 1;
  }

  // desfoque barato: reduz e amplia de volta (funciona em qualquer navegador)
  blurInto(layer, amt) {
    if (amt < 0.02) return;
    const k = 1 + amt * 23;
    const w = Math.max(2, Math.round(layer.width / k)), h = Math.max(2, Math.round(layer.height / k));
    const sm = this.small;
    if (sm.width < w || sm.height < h) { sm.width = w; sm.height = h; }
    const sc = sm.getContext('2d');
    sc.imageSmoothingQuality = 'high';
    sc.drawImage(layer, 0, 0, w, h);
    const lc = layer.getContext('2d');
    lc.imageSmoothingQuality = 'high';
    lc.drawImage(sm, 0, 0, w, h, 0, 0, layer.width, layer.height);
  }

  applyFilter(name, amount) {
    const f = FILTERS[name];
    if (!f || !f.layers.length || amount <= 0) return;
    const ctx = this.ctx;
    const cw = this.canvas.width, ch = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const [op, color] of f.layers) {
      ctx.globalCompositeOperation = op;
      ctx.globalAlpha = amount;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, cw, ch);
    }
    if (f.vignette) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = f.vignette * amount;
      const g = this._vig || (this._vig = (() => {
        const gr = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.25, cw / 2, ch / 2, ch * 0.75);
        gr.addColorStop(0, '#ffffff');
        gr.addColorStop(1, '#3a2a1a');
        return gr;
      })());
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  drawScene(layer, scene, t, opts) {
    const ctx = layer.getContext('2d');
    const s = this.s;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const local = t - scene.start;
    const layout = scene.layout || 'full';
    if (layout === 'card') return this.drawCard(ctx, scene, local);
    ctx.fillStyle = '#1b1f1a';
    ctx.fillRect(0, 0, W, H);
    const c = scene.cells;
    if (layout === 'full') {
      this.drawCell(ctx, c[0], 0, 0, W, H, scene, local, opts);
    } else if (layout === 'split2') {
      const g = 10;
      this.drawCell(ctx, c[0], 0, 0, W, H / 2 - g / 2, scene, local, opts);
      this.drawCell(ctx, c[1], 0, H / 2 + g / 2, W, H / 2 - g / 2, scene, local, opts);
      ctx.fillStyle = '#f4ede0';
      ctx.fillRect(0, H / 2 - g / 2, W, g);
    } else if (layout === 'split3') {
      const g = 10, bh = (H - 2 * g) / 3;
      ctx.fillStyle = '#f4ede0';
      ctx.fillRect(0, 0, W, H);
      c.forEach((ci, k) => {
        const appear = easeOut(clamp((local - k * 0.35) / 0.5));
        const dir = k % 2 ? 1 : -1;
        ctx.save();
        ctx.globalAlpha = appear;
        ctx.translate(dir * (1 - appear) * W * 0.6, 0);
        this.drawCell(ctx, ci, 0, k * (bh + g), W, bh, scene, local, opts);
        ctx.restore();
      });
    } else if (layout === 'beforeafter') {
      this.drawCell(ctx, c[0], 0, 0, W, H, scene, local, opts);
      const p = easeInOut(clamp((local - scene.dur * 0.3) / (scene.dur * 0.35)));
      const x = W * (1 - p);
      if (x < W) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, 0, W - x, H);
        ctx.clip();
        this.drawCell(ctx, c[1], 0, 0, W, H, scene, local, opts);
        ctx.restore();
        ctx.fillStyle = '#f4ede0';
        ctx.fillRect(x - 4, 0, 8, H);
        ctx.beginPath();
        ctx.arc(x, H / 2, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2f4a36';
        ctx.beginPath();
        ctx.moveTo(x - 20, H / 2); ctx.lineTo(x - 6, H / 2 - 12); ctx.lineTo(x - 6, H / 2 + 12);
        ctx.moveTo(x + 20, H / 2); ctx.lineTo(x + 6, H / 2 - 12); ctx.lineTo(x + 6, H / 2 + 12);
        ctx.fill();
      }
    } else if (layout === 'frame') {
      ctx.fillStyle = '#f4ede0';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(138,90,59,0.08)';
      for (let y = 0; y < H; y += 24) ctx.fillRect(0, y, W, 2);
      const appear = easeOut(clamp(local / 0.7));
      ctx.save();
      ctx.translate(W / 2, 760 + (1 - appear) * 80);
      ctx.rotate((-2.5 + (1 - appear) * 4) * Math.PI / 180);
      ctx.shadowColor = 'rgba(40,30,20,0.35)';
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 16;
      ctx.fillStyle = '#fffdf8';
      ctx.fillRect(-430, -560, 860, 1080);
      ctx.shadowColor = 'transparent';
      this.drawCell(ctx, c[0], -390, -520, 780, 880, scene, local, opts);
      ctx.restore();
    }
  }

  drawCell(ctx, clipIndex, x, y, w, h, scene, local, opts) {
    const src = opts.getSource ? opts.getSource(clipIndex) : null;
    const clip = opts.project.clips[clipIndex] || {};
    let el, sw, sh, isPhoto;
    if (src && src.el && src.w) {
      el = src.el; sw = src.w; sh = src.h; isPhoto = src.kind === 'image';
    } else {
      el = artCanvas(scene.art || opts.project.art || 'day', clipIndex + 1);
      sw = el.width; sh = el.height; isPhoto = true;
    }
    const prog = clamp((local + 0.3) / (scene.dur + 0.6));
    let z = 1, px = 0, py = 0;
    const eff = scene.effect || '';
    const kb = isPhoto ? clip.kb !== false : eff === 'kenburns';
    if (kb) {
      const dir = clipIndex % 4;
      z = dir % 2 ? 1.16 - 0.14 * prog : 1.02 + 0.14 * prog;
      px = (dir < 2 ? 1 : -1) * (prog - 0.5) * 0.05;
      py = (dir === 1 || dir === 2 ? 1 : -1) * (prog - 0.5) * 0.03;
    }
    if (eff === 'push') z *= 1 + 0.08 * prog;
    if (eff === 'punch') z *= 1 + 0.12 * Math.exp(-Math.max(0, local) * 7);
    const cover = Math.max(w / sw, h / sh) * z;
    const dw = sw * cover, dh = sh * cover;
    const dx = x + (w - dw) / 2 + px * w;
    const dy = y + (h - dh) / 2 + py * h;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    try { ctx.drawImage(el, dx, dy, dw, dh); } catch (e) { /* quadro ainda não disponível */ }
    if (!(src && src.el) && opts.labels) {
      ctx.fillStyle = 'rgba(20,30,22,0.35)';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#f4ede0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fs = Math.min(110, h * 0.12);
      ctx.font = `600 ${fs}px "Cormorant Garamond", serif`;
      ctx.fillText(`Clipe ${clipIndex + 1}`, x + w / 2, y + h / 2 - fs * 0.35);
      ctx.font = `500 ${fs * 0.36}px Montserrat, sans-serif`;
      ctx.fillText('toque em + para adicionar', x + w / 2, y + h / 2 + fs * 0.5);
    }
    ctx.restore();
  }

  drawCard(ctx, scene, local) {
    const bg = scene.bg || '#2f4a36';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H * 0.4, 50, W / 2, H * 0.4, H * 0.8);
    g.addColorStop(0, 'rgba(255,240,200,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const draw = easeOut(clamp(local / 1.2));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W * draw, H);
    ctx.clip();
    drawRidgeLine(ctx, W, H * 0.86, 220, 'rgba(226,194,122,0.55)', 5);
    drawRidgeLine(ctx, W, H * 0.9, 140, 'rgba(244,237,224,0.25)', 3);
    ctx.restore();
    ctx.strokeStyle = 'rgba(226,194,122,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(54, 54, W - 108, H - 108);
  }

  // ---------- Textos ----------

  textInterval(tx, tl) {
    const a = tl.scenes[clamp(tx.scene ?? 0, 0, tl.scenes.length - 1)];
    const b = tl.scenes[clamp((tx.scene ?? 0) + (tx.span || 1) - 1, 0, tl.scenes.length - 1)];
    if (!a || !b) return null;
    return { start: a.start + (tx.delay || 0) + 0.05, end: b.end - (b === tl.scenes[tl.scenes.length - 1] ? 0 : 0.08) };
  }

  setFont(ctx, st, px) {
    ctx.font = `${st.italic ? 'italic ' : ''}${st.weight} ${px}px "${st.family}", Georgia, serif`;
  }

  measure(ctx, str, spacing) {
    return ctx.measureText(str).width + Math.max(0, str.length - 1) * spacing;
  }

  wrap(ctx, text, maxW, spacing) {
    const lines = [];
    for (const para of String(text).split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (line && this.measure(ctx, test, spacing) > maxW) { lines.push(line); line = w; }
        else line = test;
      }
      lines.push(line);
    }
    return lines;
  }

  drawSpaced(ctx, str, x, y, spacing, align) {
    if (!spacing) { ctx.textAlign = align; ctx.fillText(str, x, y); return; }
    const w = this.measure(ctx, str, spacing);
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ctx.textAlign = 'left';
    for (const ch of str) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing; }
  }

  drawText(tx, t, tl, opts) {
    if (!tx.text || !tx.text.trim()) return;
    const iv = this.textInterval(tx, tl);
    if (!iv || t < iv.start || t > iv.end) return;
    const ctx = this.ctx;
    const st = FONT_STYLES[tx.style] || FONT_STYLES.classica;
    const px = st.base * (tx.size || 1);
    this.setFont(ctx, st, px);
    const spacing = (st.spacing || 0) * px;
    const content = st.upper ? tx.text.toUpperCase() : tx.text;
    const lines = this.wrap(ctx, content, W * 0.84, spacing);
    const lh = px * st.lh;
    const align = tx.align || 'center';
    const ax = align === 'left' ? W * 0.08 : align === 'right' ? W * 0.92 : W / 2;
    const cy = (tx.y ?? 0.5) * H;
    const top = cy - (lines.length * lh) / 2 + lh * 0.5;
    const anim = tx.anim || 'aparecer';
    const inP = anim === 'nenhuma' ? 1 : clamp((t - iv.start) / 0.6);
    const outP = clamp((iv.end - t) / 0.3);
    const e = easeOut(inP);
    let alpha = Math.min(anim === 'digitar' ? 1 : e, outP);
    let dx = 0, dy = 0, sc = 1;
    if (anim === 'subir') dy = (1 - e) * 60;
    if (anim === 'zoom') sc = 0.7 + 0.3 * e + (1 - outP) * 0.08;
    if (anim === 'deslizar') dx = (1 - e) * -120;
    let visibleChars = Infinity;
    if (anim === 'digitar') {
      const total = lines.join('').length;
      visibleChars = Math.floor(clamp((t - iv.start) / Math.max(0.4, total * 0.045)) * total + 0.001);
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(ax + dx, cy + dy);
    ctx.scale(sc, sc);
    ctx.translate(-ax, -cy);
    ctx.textBaseline = 'middle';
    const color = tx.color || '#ffffff';
    if (tx.bg) {
      ctx.fillStyle = tx.bgColor || 'rgba(244,237,224,0.92)';
      lines.forEach((ln, i) => {
        const w = this.measure(ctx, ln, spacing) + px * 0.7;
        const x = align === 'left' ? ax - px * 0.35 : align === 'right' ? ax - w + px * 0.35 : ax - w / 2;
        const y = top + i * lh - lh / 2 + lh * 0.04;
        roundRect(ctx, x, y, w, lh * 0.94, Math.min(26, lh * 0.3));
        ctx.fill();
      });
    } else {
      ctx.shadowColor = isDark(color) ? 'rgba(255,250,240,0.35)' : 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 3;
    }
    ctx.fillStyle = color;
    let shown = 0;
    lines.forEach((ln, i) => {
      let str = ln;
      if (visibleChars !== Infinity) {
        str = ln.slice(0, Math.max(0, visibleChars - shown));
        shown += ln.length;
      }
      if (str) this.drawSpaced(ctx, str, ax, top + i * lh, spacing, align);
    });
    ctx.restore();
  }

  drawWatermark(wm) {
    const ctx = this.ctx;
    const m = 56;
    const sz = wm.size || 1;
    ctx.save();
    ctx.globalAlpha = wm.opacity ?? 0.85;
    ctx.textBaseline = 'middle';
    const fs = 52 * sz;
    ctx.font = `600 ${fs}px "Cormorant Garamond", Georgia, serif`;
    const text = wm.text || '';
    const tw = text ? ctx.measureText(text).width : 0;
    const logo = wm.logoImg && wm.logoImg.width ? wm.logoImg : null;
    const lh = logo ? 110 * sz : 0;
    const lw = logo ? (logo.width / logo.height) * lh : 0;
    const gap = logo && text ? 18 : 0;
    const totalW = lw + gap + tw;
    const blockH = Math.max(lh, fs);
    const pos = wm.pos || 'br';
    const x = pos.endsWith('l') ? m : W - m - totalW;
    const y = pos.startsWith('t') ? m + 60 + blockH / 2 : H - m - 90 - blockH / 2;
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 16;
    if (logo) ctx.drawImage(logo, x, y - lh / 2, lw, lh);
    if (text) {
      ctx.fillStyle = '#f4ede0';
      ctx.textAlign = 'left';
      ctx.fillText(text, x + lw + gap, y);
    }
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function isDark(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l < 110;
}
