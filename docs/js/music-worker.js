// Sintetizador das trilhas próprias do Nosso Valle Studio.
// Todas as músicas são geradas por este código (nenhuma gravação de terceiros),
// por isso são livres de direitos autorais (CC0 — domínio público).

const SR = 44100;

const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
function midi(name) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(name);
  return 12 * (parseInt(m[2], 10) + 1) + NOTE[m[1]];
}
const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Gerador pseudoaleatório determinístico (mesma música em todo aparelho)
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Mix {
  constructor(seconds) {
    this.n = Math.ceil(seconds * SR);
    this.L = new Float32Array(this.n);
    this.R = new Float32Array(this.n);
  }
  add(buf, t, gain = 1, pan = 0) {
    const start = Math.floor(t * SR);
    const gl = gain * Math.cos((pan + 1) * Math.PI / 4);
    const gr = gain * Math.sin((pan + 1) * Math.PI / 4);
    const end = Math.min(this.n, start + buf.length);
    for (let i = Math.max(0, start); i < end; i++) {
      const v = buf[i - start];
      this.L[i] += v * gl;
      this.R[i] += v * gr;
    }
  }
}

// ---------- Instrumentos ----------

// Corda dedilhada (Karplus-Strong) — lembra violão/viola
function pluck(freq, dur, bright = 0.5, r = Math.random) {
  const len = Math.floor(dur * SR);
  const out = new Float32Array(len);
  const p = Math.max(2, Math.round(SR / freq));
  const buf = new Float32Array(p);
  for (let i = 0; i < p; i++) buf[i] = r() * 2 - 1;
  // suaviza o ataque
  for (let k = 0; k < 2; k++) for (let i = 1; i < p; i++) buf[i] = buf[i] * bright + buf[i - 1] * (1 - bright);
  let idx = 0;
  const decay = 0.996;
  for (let i = 0; i < len; i++) {
    const nxt = (idx + 1) % p;
    const v = buf[idx];
    out[i] = v;
    buf[idx] = decay * 0.5 * (v + buf[nxt]);
    idx = nxt;
  }
  const rel = Math.min(len, Math.floor(0.05 * SR));
  for (let i = 0; i < rel; i++) out[len - 1 - i] *= i / rel;
  return out;
}

// Piano elétrico suave (parciais senoidais com decaimento)
function keys(freq, dur) {
  const len = Math.floor((dur + 0.6) * SR);
  const out = new Float32Array(len);
  const partials = [[1, 1, 1.6], [2, 0.35, 2.6], [3, 0.12, 3.5], [4, 0.06, 5]];
  for (const [m, a, d] of partials) {
    const w = 2 * Math.PI * freq * m / SR;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const env = Math.exp(-t * d) * Math.min(1, t * 200);
      out[i] += a * Math.sin(w * i) * env;
    }
  }
  const relStart = Math.floor(dur * SR);
  for (let i = relStart; i < len; i++) out[i] *= Math.max(0, 1 - (i - relStart) / (0.6 * SR));
  return out;
}

// Pad com osciladores levemente desafinados e filtro passa-baixa
function pad(freqs, dur, cutoff = 1200, attack = 0.8) {
  const len = Math.floor((dur + 1.2) * SR);
  const out = new Float32Array(len);
  const a = 1 - Math.exp(-2 * Math.PI * cutoff / SR);
  for (const f of freqs) {
    for (const det of [-0.12, 0.1]) {
      const fr = f * Math.pow(2, det / 12);
      let ph = Math.random(), lp = 0, lp2 = 0;
      for (let i = 0; i < len; i++) {
        ph += fr / SR; if (ph >= 1) ph -= 1;
        // triângulo + um pouco de serra
        const tri = 1 - 4 * Math.abs(ph - 0.5);
        const saw = 2 * ph - 1;
        const v = tri * 0.7 + saw * 0.3;
        lp += a * (v - lp); lp2 += a * (lp - lp2);
        out[i] += lp2;
      }
    }
  }
  const atk = attack * SR, rs = dur * SR, rl = 1.2 * SR;
  const norm = 1 / (freqs.length * 2);
  for (let i = 0; i < len; i++) {
    let e = Math.min(1, i / atk);
    if (i > rs) e *= Math.max(0, 1 - (i - rs) / rl);
    out[i] *= e * norm;
  }
  return out;
}

// Baixo redondo
function bass(freq, dur) {
  const len = Math.floor((dur + 0.1) * SR);
  const out = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    ph += freq / SR;
    const v = Math.sin(2 * Math.PI * ph) + 0.25 * Math.sin(4 * Math.PI * ph);
    const env = Math.min(1, t * 120) * (t < dur ? Math.exp(-t * 1.2) : Math.exp(-dur * 1.2) * Math.max(0, 1 - (t - dur) / 0.1));
    out[i] = v * env;
  }
  return out;
}

// Sino/estrela (FM)
function bell(freq, dur = 2.5) {
  const len = Math.floor(dur * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const mod = Math.sin(2 * Math.PI * freq * 3.5 * t) * 2.2 * Math.exp(-t * 3);
    out[i] = Math.sin(2 * Math.PI * freq * t + mod) * Math.exp(-t * 2.2) * Math.min(1, t * 400);
  }
  return out;
}

function kick(soft = 1) {
  const len = Math.floor(0.45 * SR);
  const out = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const f = 45 + 95 * Math.exp(-t * 28);
    ph += f / SR;
    out[i] = Math.sin(2 * Math.PI * ph) * Math.exp(-t * (7 + 3 * (1 - soft))) * Math.min(1, t * 2000);
  }
  return out;
}

function noiseHit(dur, decay, hp, r) {
  const len = Math.floor(dur * SR);
  const out = new Float32Array(len);
  let prev = 0, lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const n = r() * 2 - 1;
    // passa-alta simples
    const h = n - prev; prev = n;
    lp += 0.5 * (h - lp);
    out[i] = (hp ? lp : n) * Math.exp(-t * decay);
  }
  return out;
}
const hat = (r) => noiseHit(0.08, 55, true, r);
const shaker = (r) => { const o = noiseHit(0.12, 30, true, r); for (let i = 0; i < 200 && i < o.length; i++) o[i] *= i / 200; return o; };
function clap(r) {
  const o = noiseHit(0.25, 18, false, r);
  // três batidas rápidas
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    const g = t < 0.01 ? 1 : t < 0.02 ? 0.5 : 1;
    o[i] *= g * 0.8;
  }
  let lp = 0;
  for (let i = 0; i < o.length; i++) { lp += 0.35 * (o[i] - lp); o[i] = o[i] - lp * 0.6; }
  return o;
}

// ---------- Efeitos de mixagem ----------

function reverb(mix, wet = 0.25) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356];
  const aps = [225, 556, 441];
  for (const [ch, off] of [[mix.L, 0], [mix.R, 23]]) {
    const n = ch.length;
    const acc = new Float32Array(n);
    for (const c0 of combs) {
      const d = c0 + off;
      const buf = new Float32Array(d);
      let j = 0, filt = 0;
      for (let i = 0; i < n; i++) {
        const y = buf[j];
        filt = y * 0.8 + filt * 0.2;
        buf[j] = ch[i] + filt * 0.82;
        acc[i] += y;
        if (++j >= d) j = 0;
      }
    }
    for (const a0 of aps) {
      const d = a0 + off;
      const buf = new Float32Array(d);
      let j = 0;
      for (let i = 0; i < n; i++) {
        const b = buf[j];
        const y = -acc[i] + b;
        buf[j] = acc[i] + b * 0.5;
        acc[i] = y;
        if (++j >= d) j = 0;
      }
    }
    const g = wet / combs.length;
    for (let i = 0; i < n; i++) ch[i] += acc[i] * g;
  }
}

function master(mix, fadeIn = 0.02) {
  let peak = 0;
  for (const ch of [mix.L, mix.R]) for (let i = 0; i < ch.length; i++) {
    ch[i] = Math.tanh(ch[i] * 1.2);
    const a = Math.abs(ch[i]); if (a > peak) peak = a;
  }
  const g = peak > 0 ? 0.89 / peak : 1;
  const fi = fadeIn * SR, fo = 1.5 * SR, n = mix.n;
  for (const ch of [mix.L, mix.R]) for (let i = 0; i < n; i++) {
    let e = g;
    if (i < fi) e *= i / fi;
    if (i > n - fo) e *= (n - i) / fo;
    ch[i] *= e;
  }
}

// ---------- Harmonia ----------

function chord(root, quality = 'maj', oct = 3) {
  const r = midi(root + oct);
  const iv = { maj: [0, 4, 7], min: [0, 3, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], sus2: [0, 2, 7], add9: [0, 4, 7, 14], dom7: [0, 4, 7, 10] }[quality];
  return iv.map((x) => r + x);
}

// ---------- Faixas ----------

function trackAmanhecer() {
  // Folk suave, dedilhado de violão, 90 BPM, Sol maior
  const bpm = 90, beat = 60 / bpm, bars = 22, r = rng(11);
  const mix = new Mix(bars * 4 * beat + 3);
  const prog = [['G', 'add9'], ['D', 'maj'], ['E', 'min7'], ['C', 'maj7']];
  for (let b = 0; b < bars; b++) {
    const [root, q] = prog[b % 4];
    const notes = chord(root, q, root === 'G' || root === 'E' ? 3 : 3);
    const t0 = b * 4 * beat;
    const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
    for (let k = 0; k < 8; k++) {
      const n = notes[pattern[k] % notes.length] + (k % 4 === 3 ? 12 : 0);
      mix.add(pluck(hz(n), beat * 2.2, 0.5, r), t0 + k * beat / 2, k === 0 ? 0.55 : 0.4, (k % 2 ? 0.25 : -0.2));
    }
    mix.add(bass(hz(notes[0] - 12), beat * 3.5), t0, 0.35);
    if (b >= 4) mix.add(pad(notes.map(hz), 4 * beat, 900, 1.2), t0, 0.18);
    if (b >= 8 && b < 20) {
      for (let k = 0; k < 8; k++) mix.add(shaker(r), t0 + k * beat / 2, k % 2 ? 0.07 : 0.11, 0.4);
    }
  }
  reverb(mix, 0.35); master(mix);
  return { mix, bpm };
}

function trackCafe() {
  // Alegre, viola e batida leve, 100 BPM, Ré maior
  const bpm = 100, beat = 60 / bpm, bars = 24, r = rng(22);
  const mix = new Mix(bars * 4 * beat + 3);
  const prog = [['D', 'maj'], ['A', 'maj'], ['B', 'min'], ['G', 'maj']];
  for (let b = 0; b < bars; b++) {
    const [root, q] = prog[b % 4];
    const notes = chord(root, q, root === 'B' || root === 'A' ? 3 : 4).map((n) => (n > 66 ? n - 12 : n));
    const t0 = b * 4 * beat;
    // batida de violão: baixo-cima-baixo-cima
    const strums = [0, 1, 1.5, 2.5, 3, 3.5];
    for (const s of strums) {
      notes.forEach((n, i) => mix.add(pluck(hz(n + 12), beat * 1.2, 0.6, r), t0 + s * beat + i * 0.012, 0.18, -0.3 + i * 0.25));
    }
    mix.add(bass(hz(notes[0] - 12), beat * 1.5), t0, 0.4);
    mix.add(bass(hz(notes[0] - 12 + 7), beat * 1.2), t0 + 2 * beat, 0.32);
    if (b >= 2) {
      for (let k = 0; k < 4; k++) mix.add(kick(1), t0 + k * beat, k % 2 ? 0.25 : 0.45);
      for (let k = 0; k < 8; k++) mix.add(shaker(r), t0 + k * beat / 2, k % 2 ? 0.12 : 0.07, 0.3);
      mix.add(clap(r), t0 + beat, 0.12); mix.add(clap(r), t0 + 3 * beat, 0.12);
    }
    if (b >= 8 && b % 2 === 0) {
      const mel = [notes[2] + 12, notes[1] + 12, notes[0] + 12, notes[1] + 12];
      mel.forEach((n, i) => mix.add(bell(hz(n + 12), 1.5), t0 + i * beat, 0.06, 0.35));
    }
  }
  reverb(mix, 0.22); master(mix);
  return { mix, bpm };
}

function trackPorDoSol() {
  // Lo-fi quente, piano elétrico, 80 BPM, Fá maior
  const bpm = 80, beat = 60 / bpm, bars = 18, r = rng(33);
  const mix = new Mix(bars * 4 * beat + 3);
  const prog = [['F', 'maj7'], ['E', 'min7'], ['D', 'min7'], ['C', 'add9']];
  for (let b = 0; b < bars; b++) {
    const [root, q] = prog[b % 4];
    const notes = chord(root, q, 3);
    const t0 = b * 4 * beat;
    notes.forEach((n, i) => mix.add(keys(hz(n + 12), beat * 1.6), t0 + i * 0.02, 0.18, -0.2 + i * 0.13));
    notes.forEach((n, i) => mix.add(keys(hz(n + 12), beat * 1.2), t0 + 2.5 * beat + i * 0.02, 0.12, -0.2 + i * 0.13));
    mix.add(bass(hz(notes[0] - 12), beat * 3), t0, 0.42);
    mix.add(pad(notes.map(hz), 4 * beat, 700, 1), t0, 0.12);
    if (b >= 2) {
      mix.add(kick(1), t0, 0.5); mix.add(kick(1), t0 + 2.5 * beat, 0.35);
      mix.add(clap(r), t0 + beat, 0.16); mix.add(clap(r), t0 + 3 * beat, 0.16);
      for (let k = 0; k < 8; k++) mix.add(hat(r), t0 + k * beat / 2 + (k % 2 ? 0.03 : 0), k % 2 ? 0.05 : 0.09, 0.2);
    }
  }
  reverb(mix, 0.3); master(mix);
  return { mix, bpm };
}

function trackNoite() {
  // Ambiente sonhador, pads e sinos, 70 BPM, Lá menor
  const bpm = 70, beat = 60 / bpm, bars = 16, r = rng(44);
  const mix = new Mix(bars * 4 * beat + 4);
  const prog = [['A', 'min7'], ['F', 'maj7'], ['C', 'maj7'], ['G', 'sus2']];
  const scale = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79];
  for (let b = 0; b < bars; b++) {
    const [root, q] = prog[b % 4];
    const notes = chord(root, q, 3);
    const t0 = b * 4 * beat;
    mix.add(pad(notes.map(hz), 4 * beat, 800, 1.5), t0, 0.32);
    mix.add(bass(hz(notes[0] - 12), beat * 4), t0, 0.22);
    for (let k = 0; k < 4; k++) {
      if (r() < 0.75) mix.add(bell(hz(scale[Math.floor(r() * scale.length)] + 12), 3), t0 + k * beat + (r() < 0.3 ? beat / 2 : 0), 0.07, r() * 1.4 - 0.7);
    }
    if (b >= 4 && b < 14) for (let k = 0; k < 4; k++) mix.add(shaker(r), t0 + k * beat + beat / 2, 0.035, 0.5);
    mix.add(kick(1), t0, b >= 4 ? 0.25 : 0.12);
  }
  reverb(mix, 0.55); master(mix, 0.3);
  return { mix, bpm };
}

function trackFimDeSemana() {
  // Animada, 116 BPM, Mi maior — energia de passeio
  const bpm = 116, beat = 60 / bpm, bars = 28, r = rng(55);
  const mix = new Mix(bars * 4 * beat + 3);
  const prog = [['E', 'maj'], ['B', 'maj'], ['C#', 'min'], ['A', 'maj']];
  for (let b = 0; b < bars; b++) {
    const [root, q] = prog[b % 4];
    const notes = chord(root, q, 3).map((n) => (n > 62 ? n - 12 : n));
    const t0 = b * 4 * beat;
    for (let k = 0; k < 4; k++) mix.add(kick(0.8), t0 + k * beat, 0.5);
    mix.add(clap(r), t0 + beat, 0.2); mix.add(clap(r), t0 + 3 * beat, 0.2);
    for (let k = 0; k < 8; k++) mix.add(hat(r), t0 + k * beat / 2 + beat / 4, 0.09, 0.25);
    for (let k = 0; k < 8; k++) mix.add(bass(hz(notes[0] - 12 + (k === 7 ? 7 : 0)), beat * 0.4), t0 + k * beat / 2, 0.32);
    // acordes em síncope
    for (const s of [0.5, 1.5, 2.5, 3.0, 3.5]) notes.forEach((n, i) => mix.add(pluck(hz(n + 12), beat * 0.8, 0.7, r), t0 + s * beat + i * 0.008, 0.13, -0.3 + i * 0.3));
    if (b >= 8 && b < 24) {
      const mel = [notes[2] + 24, notes[1] + 24, notes[2] + 24, notes[0] + 24];
      mel.forEach((n, i) => mix.add(keys(hz(n), beat * 0.6), t0 + i * beat + (i % 2 ? beat / 2 : 0), 0.09, 0.3));
    }
  }
  reverb(mix, 0.18); master(mix);
  return { mix, bpm };
}

function trackRitmo() {
  // Batida marcada para cortes rápidos, 124 BPM, Lá menor
  const bpm = 124, beat = 60 / bpm, bars = 28, r = rng(66);
  const mix = new Mix(bars * 4 * beat + 3);
  const prog = [['A', 'min'], ['F', 'maj'], ['C', 'maj'], ['G', 'maj']];
  for (let b = 0; b < bars; b++) {
    const [root, q] = prog[b % 4];
    const notes = chord(root, q, 3).map((n) => (n > 62 ? n - 12 : n));
    const t0 = b * 4 * beat;
    for (let k = 0; k < 4; k++) mix.add(kick(0.4), t0 + k * beat, 0.62);
    mix.add(clap(r), t0 + beat, 0.26); mix.add(clap(r), t0 + 3 * beat, 0.26);
    for (let k = 0; k < 16; k++) mix.add(hat(r), t0 + k * beat / 4, k % 4 === 2 ? 0.12 : 0.05, 0.2);
    for (let k = 0; k < 8; k++) if (k !== 3) mix.add(bass(hz(notes[0] - 12), beat * 0.35), t0 + k * beat / 2, 0.38);
    // stabs de acorde
    for (const s of [0, 0.75, 1.5, 2.5, 3.25]) notes.forEach((n, i) => mix.add(keys(hz(n + 12), beat * 0.25), t0 + s * beat, 0.11, -0.25 + i * 0.25));
    if (b % 4 === 3) for (let k = 0; k < 4; k++) mix.add(clap(r), t0 + 3 * beat + k * beat / 4, 0.06 + k * 0.03);
  }
  reverb(mix, 0.14); master(mix);
  return { mix, bpm };
}

const TRACKS = {
  amanhecer: trackAmanhecer,
  cafe: trackCafe,
  'por-do-sol': trackPorDoSol,
  noite: trackNoite,
  'fim-de-semana': trackFimDeSemana,
  ritmo: trackRitmo,
};

self.onmessage = (e) => {
  const { id } = e.data;
  try {
    const { mix, bpm } = TRACKS[id]();
    self.postMessage({ id, sampleRate: SR, bpm, left: mix.L, right: mix.R }, [mix.L.buffer, mix.R.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
