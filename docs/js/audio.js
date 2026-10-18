// Músicas, decodificação de áudio, detecção de batida e mixagem.

export const TRACKS = [
  { id: 'amanhecer', name: 'Amanhecer na Serra', mood: 'Folk suave · violão', bpm: 90 },
  { id: 'cafe', name: 'Café com Viola', mood: 'Alegre · acústica', bpm: 100 },
  { id: 'por-do-sol', name: 'Pôr do Sol Dourado', mood: 'Lo-fi quente', bpm: 80 },
  { id: 'noite', name: 'Noite Estrelada', mood: 'Ambiente · sonhadora', bpm: 70 },
  { id: 'fim-de-semana', name: 'Fim de Semana', mood: 'Animada · pop', bpm: 116 },
  { id: 'ritmo', name: 'Ritmo do Valle', mood: 'Batida marcada', bpm: 124 },
];

let ctx = null;
export function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'playback' });
  }
  return ctx;
}
// Precisa ser chamado dentro de um toque (iPhone)
export function unlockAudio() {
  const c = audioCtx();
  if (c.state !== 'running') c.resume().catch(() => {});
  try {
    const b = c.createBuffer(1, 1, 22050);
    const s = c.createBufferSource();
    s.buffer = b; s.connect(c.destination); s.start(0);
  } catch (e) { /* ignora */ }
}

// ---------- Trilhas geradas ----------

let worker = null;
const trackCache = new Map();
const pending = new Map();

export function getTrackBuffer(id) {
  if (trackCache.has(id)) return Promise.resolve(trackCache.get(id));
  if (pending.has(id)) return pending.get(id);
  if (!worker) {
    worker = new Worker(new URL('./music-worker.js', import.meta.url));
    worker.onmessage = (e) => {
      const { id: tid, error, left, right, sampleRate } = e.data;
      const p = pending.get(tid);
      if (!p) return;
      pending.delete(tid);
      if (error) return p.reject(new Error(error));
      const buf = audioCtx().createBuffer(2, left.length, sampleRate);
      buf.copyToChannel(left, 0);
      buf.copyToChannel(right, 1);
      trackCache.set(tid, buf);
      p.resolve(buf);
    };
  }
  let resolve, reject;
  const prom = new Promise((a, b) => { resolve = a; reject = b; });
  prom.resolve = resolve; prom.reject = reject;
  pending.set(id, prom);
  worker.postMessage({ id });
  return prom;
}

// ---------- Decodificação ----------

const decoded = new Map();
export async function decodeBlob(key, blob) {
  if (decoded.has(key)) return decoded.get(key);
  const p = (async () => {
    if (blob.size > 200 * 1024 * 1024) return null; // grande demais para a memória do celular
    const ab = await blob.arrayBuffer();
    const c = audioCtx();
    return await new Promise((res) => {
      try {
        const r = c.decodeAudioData(ab, (b) => res(b), () => res(null));
        if (r && r.catch) r.catch(() => res(null));
      } catch (e) { res(null); }
    });
  })();
  decoded.set(key, p);
  return p;
}

// ---------- Detecção de batida (para áudio importado) ----------

export function detectBeat(buffer) {
  const sr = buffer.sampleRate;
  const hop = 512;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const maxSamples = Math.min(ch0.length, sr * 60);
  const n = Math.floor(maxSamples / hop);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let j = 0; j < hop; j++) { const k = i * hop + j; const v = (ch0[k] + ch1[k]) * 0.5; e += v * v; }
    env[i] = Math.sqrt(e / hop);
  }
  const onset = new Float32Array(n);
  for (let i = 1; i < n; i++) onset[i] = Math.max(0, env[i] - env[i - 1]);
  const fps = sr / hop;
  let best = 0, bestLag = 0;
  for (let bpm = 70; bpm <= 160; bpm += 0.5) {
    const lag = (60 / bpm) * fps;
    let s = 0;
    for (let i = 0; i + lag * 4 < n; i++) {
      const a = onset[i];
      if (!a) continue;
      s += a * (onset[Math.round(i + lag)] + 0.5 * onset[Math.round(i + 2 * lag)] + 0.25 * onset[Math.round(i + 4 * lag)]);
    }
    if (s > best) { best = s; bestLag = lag; }
  }
  if (!bestLag) return { bpm: 120, offset: 0 };
  // fase: deslocamento que maximiza a energia nas batidas
  let bestPh = 0, bestS = -1;
  const L = Math.round(bestLag);
  for (let ph = 0; ph < L; ph++) {
    let s = 0;
    for (let i = ph; i < n; i += bestLag) s += onset[Math.round(i)] || 0;
    if (s > bestS) { bestS = s; bestPh = ph; }
  }
  return { bpm: Math.round((60 * fps / bestLag) * 10) / 10, offset: bestPh / fps };
}

// ---------- Mixagem ----------

// Agenda música + som original dos clipes num contexto (tempo real ou offline).
// from: posição na linha do tempo; when: horário do contexto em que "from" toca.
export function scheduleAudio(c, dest, { project, tl, wins, musicBuf, clipBufs, from = 0, when = 0 }) {
  const nodes = [];
  const total = tl.total;
  const remain = total - from;
  if (remain <= 0) return nodes;
  if (musicBuf && (project.musicVolume ?? 1) > 0) {
    const src = c.createBufferSource();
    src.buffer = musicBuf;
    src.loop = true;
    const g = c.createGain();
    const vol = project.musicVolume ?? 1;
    g.gain.setValueAtTime(vol, when);
    const fadeAt = when + remain - Math.min(1.2, remain);
    if (remain > 0.3) {
      g.gain.setValueAtTime(vol, Math.max(when, fadeAt));
      g.gain.linearRampToValueAtTime(0.0001, when + remain);
    }
    src.connect(g).connect(dest);
    const off = ((project.musicStart || 0) + from) % musicBuf.duration;
    src.start(when, off);
    src.stop(when + remain + 0.05);
    nodes.push(src);
  }
  project.clips.forEach((clip, i) => {
    const buf = clipBufs[i];
    const w = wins[i];
    if (!buf || !w || !(clip.volume > 0)) return;
    if (from >= w.end) return;
    const speed = clip.speed || 1;
    const t0 = Math.max(from, w.start);
    const off = (clip.trim || 0) + (t0 - w.start) * speed;
    if (off >= buf.duration) return;
    const len = (w.end - t0);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = speed;
    const g = c.createGain();
    const at = when + (t0 - from);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(clip.volume, at + 0.08);
    g.gain.setValueAtTime(clip.volume, Math.max(at + 0.08, at + len - 0.12));
    g.gain.linearRampToValueAtTime(0.0001, at + len);
    src.connect(g).connect(dest);
    src.start(at, off);
    src.stop(at + len + 0.02);
    nodes.push(src);
  });
  return nodes;
}

export async function renderMix(opts, sampleRate = 48000) {
  const len = Math.ceil(opts.tl.total * sampleRate);
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const oc = new OAC(2, Math.max(1, len), sampleRate);
  scheduleAudio(oc, oc.destination, { ...opts, from: 0, when: 0 });
  return await oc.startRendering();
}
