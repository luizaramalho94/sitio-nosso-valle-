// Ilustrações procedurais da serra, usadas como prévia dos templates
// e como "lugar reservado" enquanto o clipe ainda não tem mídia.

const THEMES = {
  dawn: { sky: ['#f6c7a8', '#f3dcc0', '#e9e4d2'], sun: '#fff1d6', hills: ['#a9b49a', '#7f9473', '#56704f', '#34503a'] },
  day: { sky: ['#9cc3cf', '#c9dfd8', '#eef0e2'], sun: '#fffbe9', hills: ['#a6bf9c', '#7da06f', '#557f4c', '#2f5634'] },
  sunset: { sky: ['#e58a4e', '#f1b765', '#f7e0a6'], sun: '#fff0c2', hills: ['#a1735a', '#7a5444', '#563c33', '#33261f'] },
  night: { sky: ['#0f1a2b', '#1d2f45', '#36506a'], sun: '#f4efd8', hills: ['#2b3d4a', '#22323b', '#18252b', '#0f181c'], stars: true },
  mist: { sky: ['#cfd6cc', '#e1e4da', '#eeede4'], sun: '#ffffff', hills: ['#b9c3b4', '#95a590', '#6d836a', '#4a6249'] },
  interior: { interior: true, sky: ['#9cc3cf', '#e5ead9', '#f2eedf'], sun: '#fffbe9', hills: ['#a6bf9c', '#7da06f', '#557f4c', '#2f5634'] },
};
export const ART_THEMES = Object.keys(THEMES);

function rand(seed) {
  let s = (seed * 9301 + 49297) % 233280;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function ridge(ctx, w, h, baseY, amp, color, r, jag = 6) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  const pts = 7 + Math.floor(r() * jag);
  let prev = baseY - r() * amp;
  ctx.lineTo(0, prev);
  for (let i = 1; i <= pts; i++) {
    const x = (i / pts) * w;
    const y = baseY - r() * amp;
    const cx = x - w / pts / 2;
    ctx.quadraticCurveTo(cx, Math.min(prev, y) - amp * 0.35 * r(), x, y);
    prev = y;
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

function pines(ctx, w, h, baseY, color, r, count) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = r() * w;
    const th = h * (0.05 + r() * 0.07);
    const tw = th * 0.32;
    const y = baseY + r() * h * 0.05;
    ctx.beginPath();
    ctx.moveTo(x, y - th);
    ctx.lineTo(x - tw / 2, y);
    ctx.lineTo(x + tw / 2, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - tw * 0.06, y, tw * 0.12, th * 0.12);
  }
}

function landscape(ctx, w, h, th, r, x0 = 0, y0 = 0) {
  ctx.save();
  ctx.translate(x0, y0);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, th.sky[0]);
  g.addColorStop(0.55, th.sky[1]);
  g.addColorStop(1, th.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (th.stars) {
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 160; i++) {
      ctx.globalAlpha = 0.3 + r() * 0.7;
      const s = r() * 2.2 * (w / 540) + 0.4;
      ctx.fillRect(r() * w, r() * h * 0.6, s, s);
    }
    ctx.globalAlpha = 1;
  }
  // sol / lua
  const sx = w * (0.25 + r() * 0.5), sy = h * (0.3 + r() * 0.15), sr = w * (th.stars ? 0.06 : 0.09);
  const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 4);
  halo.addColorStop(0, th.sun);
  halo.addColorStop(0.25, th.sun + 'aa');
  halo.addColorStop(1, th.sun + '00');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = th.sun;
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();
  // camadas da serra
  ridge(ctx, w, h, h * 0.52, h * 0.12, th.hills[0], r);
  ridge(ctx, w, h, h * 0.62, h * 0.1, th.hills[1], r);
  ridge(ctx, w, h, h * 0.73, h * 0.08, th.hills[2], r);
  pines(ctx, w, h, h * 0.74, th.hills[3], r, 14);
  ridge(ctx, w, h, h * 0.86, h * 0.05, th.hills[3], r, 3);
  ctx.restore();
}

function interior(ctx, w, h, th, r) {
  // parede de madeira, janela com vista para a serra
  ctx.fillStyle = '#d9c6a5';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = i % 2 ? '#cdb690' : '#d4bf9b';
    ctx.fillRect(0, (i / 14) * h, w, h / 14 - 2);
  }
  const wx = w * 0.15, wy = h * 0.14, ww = w * 0.7, wh = h * 0.42;
  landscape(ctx, ww, wh, th, r, wx, wy);
  ctx.strokeStyle = '#6b4a31';
  ctx.lineWidth = w * 0.03;
  ctx.strokeRect(wx, wy, ww, wh);
  ctx.beginPath();
  ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh);
  ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2);
  ctx.lineWidth = w * 0.015;
  ctx.stroke();
  // mesa e xícara
  ctx.fillStyle = '#7b5537';
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
  ctx.fillStyle = '#f4ede0';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.8, w * 0.16, h * 0.022, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(w * 0.43, h * 0.735, w * 0.14, h * 0.06);
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.735, w * 0.07, h * 0.01, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#5a3a24';
  ctx.fill();
}

const cache = new Map();

// Retorna um canvas com a ilustração (cacheado)
export function artCanvas(theme = 'day', seed = 1, w = 540, h = 960) {
  const key = `${theme}|${seed}|${w}x${h}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const th = THEMES[theme] || THEMES.day;
  const r = rand(seed * 7 + theme.length * 13);
  if (th.interior) interior(ctx, w, h, th, r);
  else landscape(ctx, w, h, th, r);
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  cache.set(key, c);
  return c;
}

// Linha de montanhas para fundos de cartão
export function drawRidgeLine(ctx, w, y, amp, color, lineWidth) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const pts = [0, 0.4, 0.12, 0.85, 0.26, 0.3, 0.38, 1, 0.5, 0.55, 0.62, 0.9, 0.76, 0.35, 0.88, 0.7, 1, 0.2];
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i] * w, yy = y - pts[i + 1] * amp;
    i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
  }
  ctx.stroke();
  ctx.restore();
}
