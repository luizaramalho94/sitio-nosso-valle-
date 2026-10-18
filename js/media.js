// Importação de fotos/vídeos, miniaturas e fontes de imagem para o motor.

import { uid } from './db.js';

const THUMB_W = 180, THUMB_H = 320;

function coverDraw(ctx, el, sw, sh, w, h) {
  const s = Math.max(w / sw, h / sh);
  ctx.drawImage(el, (w - sw * s) / 2, (h - sh * s) / 2, sw * s, sh * s);
}

function thumbFrom(el, sw, sh) {
  const c = document.createElement('canvas');
  c.width = THUMB_W; c.height = THUMB_H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2f4a36';
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);
  try { coverDraw(ctx, el, sw, sh, THUMB_W, THUMB_H); } catch (e) { /* ignora */ }
  return c.toDataURL('image/jpeg', 0.7);
}

export function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Não foi possível abrir a imagem'));
    img.src = url;
  });
}

function probeVideo(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
    let done = false;
    const finish = (ok) => {
      if (done) return; done = true;
      clearTimeout(timer);
      if (!ok && !v.videoWidth) { reject(new Error('Não foi possível abrir o vídeo')); return; }
      const info = { duration: v.duration || 0, w: v.videoWidth, h: v.videoHeight, thumb: thumbFrom(v, v.videoWidth, v.videoHeight) };
      v.removeAttribute('src'); v.load();
      resolve(info);
    };
    const timer = setTimeout(() => finish(false), 12000);
    v.onloadedmetadata = () => {
      const t = Math.min(1, (v.duration || 0) * 0.2);
      v.currentTime = t || 0.05;
    };
    v.onseeked = () => finish(true);
    v.onerror = () => { done = true; clearTimeout(timer); reject(new Error('Formato de vídeo não suportado')); };
    v.src = url;
    v.load();
  });
}

// Converte arquivos escolhidos em registros de mídia (salvos depois no IndexedDB)
export async function importFile(file) {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(file.name)) {
      const info = await probeVideo(url);
      return { id: uid(), type: 'video', name: file.name, blob: file, ...info, created: Date.now() };
    }
    if (file.type.startsWith('audio/')) {
      return { id: uid(), type: 'audio', name: file.name, blob: file, created: Date.now() };
    }
    const img = await loadImage(url);
    return { id: uid(), type: 'image', name: file.name, blob: file, w: img.naturalWidth, h: img.naturalHeight, duration: 0, thumb: thumbFrom(img, img.naturalWidth, img.naturalHeight), created: Date.now() };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Reduz fotos grandes uma única vez (desenhar 12 MP por quadro seria lento)
export async function preparePhoto(blob, maxSide = 2160) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const sw = img.naturalWidth, sh = img.naturalHeight;
    const s = Math.min(1, maxSide / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.round(sw * s); c.height = Math.round(sh * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { el: c, w: c.width, h: c.height, kind: 'image' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function fmtTime(s) {
  s = Math.max(0, s || 0);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1).replace('.', ',')}`;
}
export function fmtSec(s) {
  return `${(Math.round(s * 10) / 10).toString().replace('.', ',')}s`;
}
