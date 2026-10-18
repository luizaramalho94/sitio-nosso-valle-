// Gerencia os elementos de vídeo de cada clipe e a reprodução da prévia.

import { buildTimeline, clipWindows } from './engine.js';
import { audioCtx, scheduleAudio } from './audio.js';
import { preparePhoto, loadImage } from './media.js';

let hiddenHost = null;
function host() {
  if (!hiddenHost) {
    hiddenHost = document.createElement('div');
    hiddenHost.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1';
    document.body.appendChild(hiddenHost);
  }
  return hiddenHost;
}

export class MediaPool {
  constructor(getMedia) {
    this.getMedia = getMedia; // id -> registro de mídia
    this.urls = new Map();
    this.photos = new Map(); // mediaId -> promise/source
    this.thumbs = new Map();
    this.videos = new Map(); // clipIndex -> { el, mediaId }
    this.onUpdate = null; // chamado quando um vídeo ganha um quadro novo
  }

  url(mediaId) {
    if (!this.urls.has(mediaId)) {
      const m = this.getMedia(mediaId);
      if (!m) return null;
      this.urls.set(mediaId, URL.createObjectURL(m.blob));
    }
    return this.urls.get(mediaId);
  }

  async preparePhotos(project) {
    const jobs = [];
    for (const c of project.clips) {
      const m = c.mediaId && this.getMedia(c.mediaId);
      if (m && m.type === 'image' && !this.photos.has(m.id)) {
        const p = preparePhoto(m.blob).then((src) => { this.photos.set(m.id, src); return src; }).catch(() => null);
        this.photos.set(m.id, p);
        jobs.push(p);
      }
      if (m && m.type === 'video' && m.thumb && !this.thumbs.has(m.id)) {
        this.thumbs.set(m.id, null);
        jobs.push(loadImage(m.thumb).then((img) => this.thumbs.set(m.id, { el: img, w: img.naturalWidth, h: img.naturalHeight, kind: 'video' })).catch(() => {}));
      }
    }
    await Promise.all(jobs);
  }

  source(clipIndex, project) {
    const clip = project.clips[clipIndex];
    if (!clip || !clip.mediaId) return null;
    const m = this.getMedia(clip.mediaId);
    if (!m) return null;
    if (m.type === 'image') {
      const p = this.photos.get(m.id);
      return p && p.el ? p : null;
    }
    const v = this.videos.get(clipIndex);
    if (v && v.mediaId === m.id && v.el.readyState >= 2 && v.el.videoWidth) {
      v.used = true;
      return { el: v.el, w: v.el.videoWidth, h: v.el.videoHeight, kind: 'video' };
    }
    return this.thumbs.get(m.id) || null;
  }

  ensureVideo(clipIndex, mediaId) {
    let v = this.videos.get(clipIndex);
    if (v && v.mediaId === mediaId) return v.el;
    if (v) this.release(clipIndex);
    const el = document.createElement('video');
    el.muted = true; el.playsInline = true; el.preload = 'auto';
    el.setAttribute('playsinline', ''); el.setAttribute('muted', ''); el.setAttribute('webkit-playsinline', '');
    el.src = this.url(mediaId);
    const ping = () => { if (this.onUpdate) this.onUpdate(); };
    el.addEventListener('loadeddata', ping);
    el.addEventListener('seeked', ping);
    host().appendChild(el);
    el.load();
    this.videos.set(clipIndex, { el, mediaId });
    return el;
  }

  release(clipIndex) {
    const v = this.videos.get(clipIndex);
    if (!v) return;
    try { v.el.pause(); } catch (e) { /* ignora */ }
    v.el.removeAttribute('src');
    try { v.el.load(); } catch (e) { /* ignora */ }
    v.el.remove();
    this.videos.delete(clipIndex);
  }

  // Mantém cada vídeo na posição certa para o instante t
  sync(t, playing, project, wins) {
    const keep = new Set();
    project.clips.forEach((clip, i) => {
      const m = clip.mediaId && this.getMedia(clip.mediaId);
      const w = wins[i];
      if (!m || m.type !== 'video' || !w) return;
      if (t < w.start - 1.5 || t > w.end + 0.2) return;
      keep.add(i);
      const el = this.ensureVideo(i, m.id);
      const speed = clip.speed || 1;
      const dur = el.duration || m.duration || 0;
      let expected = (clip.trim || 0) + Math.max(0, t - w.start) * speed;
      if (dur) expected = Math.min(expected, Math.max(0, dur - 0.06));
      if (el.playbackRate !== speed) el.playbackRate = speed;
      const active = t >= w.start && t <= w.end;
      if (el.readyState < 1) return;
      if (playing && active) {
        if (el.paused && !(dur && expected >= dur - 0.07)) el.play().catch(() => {});
        if (!el.seeking && Math.abs(el.currentTime - expected) > 0.3) el.currentTime = expected;
      } else {
        if (!el.paused) el.pause();
        if (!el.seeking && Math.abs(el.currentTime - expected) > 0.04) el.currentTime = expected;
      }
    });
    for (const i of [...this.videos.keys()]) if (!keep.has(i)) this.release(i);
  }

  // Todos os vídeos visíveis em t já têm imagem?
  ready(t, project, wins) {
    for (let i = 0; i < project.clips.length; i++) {
      const w = wins[i];
      if (!w || t < w.start || t > w.end) continue;
      const v = this.videos.get(i);
      const m = project.clips[i].mediaId && this.getMedia(project.clips[i].mediaId);
      if (!m || m.type !== 'video') continue;
      if (!v || v.el.readyState < 2 || v.el.seeking) return false;
    }
    return true;
  }

  pauseAll() {
    for (const v of this.videos.values()) { try { v.el.pause(); } catch (e) { /* ignora */ } }
  }

  releaseAll() {
    for (const i of [...this.videos.keys()]) this.release(i);
  }

  dispose() {
    this.releaseAll();
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear();
    this.photos.clear();
    this.thumbs.clear();
  }
}

// Reprodução da prévia com música (tempo real)
export class Playback {
  constructor({ renderer, pool, getState, onTime, onEnd }) {
    this.renderer = renderer;
    this.pool = pool;
    this.getState = getState; // () => { project, musicBuf, clipBufs, watermark }
    this.onTime = onTime;
    this.onEnd = onEnd;
    this.t = 0;
    this.playing = false;
    this.nodes = [];
    this.raf = 0;
    this.labels = true;
    let pend = false;
    pool.onUpdate = () => {
      if (this.playing || pend) return;
      pend = true;
      requestAnimationFrame(() => { pend = false; if (!this.playing) this.draw(); });
    };
  }

  timeline() {
    const st = this.getState();
    const tl = buildTimeline(st.project);
    return { st, tl, wins: clipWindows(tl) };
  }

  draw(t = this.t) {
    const { st, tl, wins } = this.timeline();
    this.t = Math.max(0, Math.min(t, tl.total));
    this.pool.sync(this.t, this.playing, st.project, wins);
    this.renderer.render(this.t, {
      project: st.project, tl,
      getSource: (i) => this.pool.source(i, st.project),
      labels: this.labels,
      watermark: st.watermark,
    });
    return tl;
  }

  seek(t) {
    if (this.playing) { this.pause(); }
    this.draw(t);
    this.onTime && this.onTime(this.t);
  }

  play() {
    const { st, tl, wins } = this.timeline();
    if (this.t >= tl.total - 0.05) this.t = 0;
    const c = audioCtx();
    if (c.state !== 'running') c.resume().catch(() => {});
    this.playing = true;
    const when = c.currentTime + 0.08;
    this.nodes = scheduleAudio(c, c.destination, { project: st.project, tl, wins, musicBuf: st.musicBuf, clipBufs: st.clipBufs, from: this.t, when });
    this.startT = this.t;
    this.startCtx = when;
    this.pool.sync(this.t, true, st.project, wins);
    const loop = () => {
      if (!this.playing) return;
      const t = this.startT + Math.max(0, c.currentTime - this.startCtx);
      const total = this.draw(t).total;
      this.onTime && this.onTime(this.t);
      if (t >= total) { this.pause(); this.t = total; this.onEnd && this.onEnd(); return; }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    for (const n of this.nodes) { try { n.stop(); } catch (e) { /* ignora */ } }
    this.nodes = [];
    this.pool.pauseAll();
  }

  // Reinicia o áudio quando algo muda durante a reprodução
  refresh() {
    if (this.playing) { this.pause(); this.play(); } else this.draw();
  }
}
