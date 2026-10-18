// Exportação do reel em MP4 1080x1920, 30 fps.
// 1º caminho: WebCodecs (VideoEncoder + AudioEncoder) + mp4-muxer — Safari 26+/Chrome.
// 2º caminho: MediaRecorder do canvas (Safari mais antigo grava MP4 nativamente).

import { Muxer, ArrayBufferTarget } from '../vendor/mp4-muxer.mjs';
import { W, H, FPS, Renderer, buildTimeline, clipWindows } from './engine.js';
import { renderMix, audioCtx } from './audio.js';

const VIDEO_CODECS = [
  { codec: 'avc1.640028', mux: 'avc' },
  { codec: 'avc1.4d0028', mux: 'avc' },
  { codec: 'avc1.42e028', mux: 'avc' },
  { codec: 'avc1.640032', mux: 'avc' },
];

async function pickVideoConfig() {
  if (typeof VideoEncoder === 'undefined') return null;
  for (const c of VIDEO_CODECS) {
    const cfg = { codec: c.codec, width: W, height: H, bitrate: 10_000_000, framerate: FPS, avc: { format: 'avc' } };
    try {
      const r = await VideoEncoder.isConfigSupported(cfg);
      if (r.supported) return { cfg, mux: c.mux };
    } catch (e) { /* tenta o próximo */ }
  }
  // Sem H.264 (ex.: Chromium de teste): VP9 em MP4
  const vp9 = { codec: 'vp09.00.40.08', width: W, height: H, bitrate: 10_000_000, framerate: FPS };
  try { if ((await VideoEncoder.isConfigSupported(vp9)).supported) return { cfg: vp9, mux: 'vp9' }; } catch (e) { /* ignora */ }
  return null;
}

async function pickAudioConfig(allowOpus) {
  if (typeof AudioEncoder === 'undefined') return null;
  for (const sampleRate of [48000, 44100]) {
    const cfg = { codec: 'mp4a.40.2', sampleRate, numberOfChannels: 2, bitrate: 160_000 };
    try { if ((await AudioEncoder.isConfigSupported(cfg)).supported) return { cfg, mux: 'aac' }; } catch (e) { /* ignora */ }
  }
  if (allowOpus) {
    const cfg = { codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 160_000 };
    try { if ((await AudioEncoder.isConfigSupported(cfg)).supported) return { cfg, mux: 'opus' }; } catch (e) { /* ignora */ }
  }
  return null;
}

function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  const list = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm',
  ];
  for (const m of list) if (MediaRecorder.isTypeSupported(m)) return m;
  return null;
}

export async function exportCapabilities() {
  const v = await pickVideoConfig();
  const a = v ? await pickAudioConfig(v.mux === 'vp9') : null;
  return { webcodecs: !!(v && a), recorder: pickRecorderMime() };
}

async function wakeLock() {
  try { if (navigator.wakeLock) return await navigator.wakeLock.request('screen'); } catch (e) { /* ignora */ }
  return null;
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// state: { project, musicBuf, clipBufs, watermark }, pool: MediaPool
export async function exportReel({ state, pool, canvas, onProgress, signal }) {
  const project = state.project;
  const tl = buildTimeline(project);
  const wins = clipWindows(tl);
  canvas.width = W; canvas.height = H;
  const renderer = new Renderer(canvas);
  const lock = await wakeLock();
  try {
    onProgress({ stage: 'Preparando o áudio…', p: 0 });
    await pool.preparePhotos(project);
    const v = await pickVideoConfig();
    const a = v ? await pickAudioConfig(v.mux === 'vp9') : null;
    const mixRate = a ? a.cfg.sampleRate : 48000;
    const mix = await renderMix({ project, tl, wins, musicBuf: state.musicBuf, clipBufs: state.clipBufs }, mixRate);
    if (signal.aborted) throw new DOMException('cancelado', 'AbortError');
    const ctx = { project, tl, wins, renderer, pool, state, onProgress, signal, mix };
    if (v && a) return await viaWebCodecs(ctx, v, a);
    const mime = pickRecorderMime();
    if (mime) return await viaRecorder(ctx, mime);
    throw new Error('Este navegador não consegue gerar vídeo. Atualize o iPhone (iOS 16 ou mais recente) e use o Safari.');
  } finally {
    pool.pauseAll();
    if (lock) lock.release().catch(() => {});
  }
}

function renderOpts(c) {
  return {
    project: c.project, tl: c.tl,
    getSource: (i) => c.pool.source(i, c.project),
    labels: false,
    watermark: c.state.watermark,
  };
}

async function viaWebCodecs(c, v, a) {
  const { tl, wins, project, pool, renderer, signal, onProgress, mix } = c;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: v.mux, width: W, height: H, frameRate: FPS },
    audio: { codec: a.mux, sampleRate: a.cfg.sampleRate, numberOfChannels: 2 },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let failure = null;
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failure = e; } });
  venc.configure(v.cfg);
  const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { failure = e; } });
  aenc.configure(a.cfg);

  // Áudio (rápido, não precisa ser em tempo real)
  const sr = mix.sampleRate, L = mix.getChannelData(0), R = mix.getChannelData(1);
  const block = 1024;
  for (let i = 0; i < L.length; i += block) {
    const n = Math.min(block, L.length - i);
    const data = new Float32Array(n * 2);
    data.set(L.subarray(i, i + n), 0);
    data.set(R.subarray(i, i + n), n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / sr) * 1e6), data });
    aenc.encode(ad);
    ad.close();
  }

  // Vídeo: a linha do tempo anda em tempo real (os vídeos tocam de verdade),
  // mas congela enquanto algum vídeo ainda está carregando.
  const frames = Math.ceil(tl.total * FPS);
  const opts = renderOpts(c);
  let i = 0;
  let clock = 0; // tempo da linha do tempo
  let last = performance.now();
  pool.sync(0, false, project, wins);
  // espera os primeiros quadros
  for (let k = 0; k < 200 && !pool.ready(0, project, wins); k++) await new Promise((r) => setTimeout(r, 30));
  while (i < frames) {
    if (signal.aborted) { venc.close(); aenc.close(); throw new DOMException('cancelado', 'AbortError'); }
    if (failure) throw failure;
    await nextFrame();
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const ready = pool.ready(clock, project, wins) && venc.encodeQueueSize < 6;
    if (!ready) { pool.sync(clock, false, project, wins); continue; }
    clock = Math.min(tl.total, clock + dt);
    pool.sync(clock, true, project, wins);
    const target = Math.min(frames, Math.floor(clock * FPS) + 1);
    if (i < target) {
      renderer.render(Math.min(i / FPS, tl.total - 0.001), opts);
      while (i < target) {
        const frame = new VideoFrame(renderer.canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
        venc.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
        frame.close();
        i++;
      }
    }
    onProgress({ stage: 'Gerando o vídeo…', p: i / frames });
  }
  onProgress({ stage: 'Finalizando…', p: 1 });
  await venc.flush();
  await aenc.flush();
  if (failure) throw failure;
  muxer.finalize();
  venc.close(); aenc.close();
  return { blob: new Blob([target.buffer], { type: 'video/mp4' }), ext: 'mp4', mime: 'video/mp4' };
}

async function viaRecorder(c, mime) {
  const { tl, wins, project, pool, renderer, signal, onProgress, mix } = c;
  const actx = audioCtx();
  if (actx.state !== 'running') await actx.resume().catch(() => {});
  const dest = actx.createMediaStreamDestination();
  const src = actx.createBufferSource();
  src.buffer = mix;
  src.connect(dest);
  const vstream = renderer.canvas.captureStream(FPS);
  const stream = new MediaStream([...vstream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 9_000_000, audioBitsPerSecond: 160_000 });
  const parts = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
  const stopped = new Promise((r) => { rec.onstop = r; });
  const opts = renderOpts(c);
  // pré-carrega o início
  pool.sync(0, false, project, wins);
  for (let k = 0; k < 200 && !pool.ready(0, project, wins); k++) await new Promise((r) => setTimeout(r, 30));
  renderer.render(0, opts);
  rec.start(250);
  const t0 = actx.currentTime + 0.15;
  src.start(t0);
  let aborted = false;
  while (true) {
    await nextFrame();
    if (signal.aborted) { aborted = true; break; }
    const t = actx.currentTime - t0;
    if (t >= tl.total) break;
    const tt = Math.max(0, t);
    pool.sync(tt, true, project, wins);
    renderer.render(tt, opts);
    onProgress({ stage: 'Gravando o vídeo… (tempo real)', p: tt / tl.total });
  }
  renderer.render(tl.total - 0.001, opts);
  await new Promise((r) => setTimeout(r, 120));
  rec.stop();
  try { src.stop(); } catch (e) { /* ignora */ }
  await stopped;
  vstream.getTracks().forEach((t) => t.stop());
  if (aborted) throw new DOMException('cancelado', 'AbortError');
  const type = mime.split(';')[0];
  return { blob: new Blob(parts, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm', mime: type };
}
