'use strict';

const banner = document.querySelector('#song-banner');
const cover = document.querySelector('#album-cover');
const coverFallback = document.querySelector('#cover-fallback');
const titleNode = document.querySelector('#song-title');
const artistNode = document.querySelector('#song-artist');
const currentTimeNode = document.querySelector('#current-time');
const totalTimeNode = document.querySelector('#total-time');
const progressFill = document.querySelector('#progress-fill');
const progressDot = document.querySelector('#progress-dot');
const connectionWarning = document.querySelector('#connection-warning');
const eyebrowLabel = document.querySelector('#eyebrow-label');
const stage = document.querySelector('.stage');
const visualizerPanel = document.querySelector('#audio-visualizer-panel');
const visualizerCanvas = document.querySelector('#audio-visualizer-canvas');
const visualizerContext = visualizerCanvas.getContext('2d');
const floatingCloseButton = document.querySelector('#floating-overlay-close');
const inlineVisualizer = document.querySelector('#audio-visualizer-inline');

let overlayConfig = {
  notificationEnabled: true, preset: 'classic', notificationMode: 'timed', visualizerPlacement: 'separate',
  durationSeconds: 8, style: 'vinyl', position: 'top-left',
  accentColor: '#1ed760', cardOpacity: 92, showCover: true, showArtist: true, showProgress: true,
  visualizerEnabled: true, visualizerStyle: 'bars', visualizerColor: '#ff6b9a',
  visualizerSensitivity: 1.2, visualizerHeight: 34
};
let audioVisualizer = { active: false, levels: Array(32).fill(0), rms: 0 };
const floatingMode = new URLSearchParams(window.location.search).get('floating') === '1';
if (floatingMode) {
  document.body.classList.add('floating-mode');
  floatingCloseButton.hidden = false;
}

let lastTrackKey = null;
let wasPlaying = false;
let hasReceivedState = false;
let hideTimer = null;
let exitTimer = null;
let spinTimer = null;
let baseProgressMs = 0;
let trackDurationMs = 0;
let receivedAtPerformance = 0;
let isPlayingNow = false;
let currentTrack = null;
let currentError = '';
let lastPlaybackTimestamp = null;
let trackChangeAnimationTimer = null;

function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function beginBannerExit() {
  if (overlayConfig.notificationMode === 'persistent' && overlayConfig.notificationEnabled) {
    banner.classList.remove('is-leaving');
    return;
  }
  clearTimeout(spinTimer);
  banner.classList.remove('is-opening', 'is-spinning');
  banner.classList.add('is-leaving');
  clearTimeout(exitTimer);
  exitTimer = setTimeout(() => {
    banner.classList.remove('is-visible', 'is-leaving');
  }, 620);
}

function showBanner() {
  clearTimeout(hideTimer);
  clearTimeout(exitTimer);
  clearTimeout(spinTimer);

  // Reinicia la secuencia: el vinilo aparece, la tarjeta se despliega y
  // después entran los textos y controles en cascada.
  banner.classList.remove('is-visible', 'is-opening', 'is-leaving', 'is-spinning', 'is-track-changing');
  void banner.offsetWidth;
  banner.classList.add('is-visible', 'is-opening');

  spinTimer = setTimeout(() => {
    if (banner.classList.contains('is-visible') && !banner.classList.contains('is-leaving')) {
      banner.classList.remove('is-opening');
      banner.classList.add('is-spinning');
    }
  }, 1100);

  if (overlayConfig.notificationMode !== 'persistent') hideTimer = setTimeout(beginBannerExit, Math.max(3, Number(overlayConfig.durationSeconds) || 8) * 1000);
}

function animateTrackChange() {
  clearTimeout(trackChangeAnimationTimer);
  banner.classList.remove('is-track-changing');
  void banner.offsetWidth;
  banner.classList.add('is-track-changing');
  trackChangeAnimationTimer = setTimeout(() => banner.classList.remove('is-track-changing'), 760);
}

function hideBannerSoon(delay = 1200) {
  clearTimeout(hideTimer);
  if (overlayConfig.notificationMode === 'persistent' && overlayConfig.notificationEnabled) return;
  hideTimer = setTimeout(beginBannerExit, delay);
}

function setCover(url) {
  cover.onerror = () => {
    cover.hidden = true;
    coverFallback.hidden = false;
  };
  if (url) {
    coverFallback.hidden = true;
    cover.hidden = false;
    if (cover.src !== url) cover.src = url;
  } else {
    cover.removeAttribute('src');
    cover.hidden = true;
    coverFallback.hidden = false;
  }
}

function drawProgress() {
  let position = baseProgressMs;
  if (isPlayingNow) position += performance.now() - receivedAtPerformance;
  if (trackDurationMs > 0) position = Math.min(position, trackDurationMs);
  const percent = trackDurationMs > 0 ? Math.max(0, Math.min(100, position / trackDurationMs * 100)) : 0;
  progressFill.style.width = `${percent}%`;
  progressDot.style.left = `${percent}%`;
  currentTimeNode.textContent = formatTime(position);
  totalTimeNode.textContent = formatTime(trackDurationMs);
  requestAnimationFrame(drawProgress);
}

function applyState(state) {
  currentError = state.error || '';
  connectionWarning.hidden = Boolean(state.connected) || !currentError;
  if (currentError && !state.connected) connectionWarning.textContent = 'Comprueba la conexión con Spotify desde el panel.';
  else if (!state.connected) connectionWarning.textContent = 'Esperando conexión con Spotify…';

  const track = state.track;
  const isPlaying = Boolean(state.is_playing && track);
  const key = track ? (track.id || `${track.title}|${track.artists}`) : null;
  const trackChanged = Boolean(key && key !== lastTrackKey);
  const justResumed = isPlaying && !wasPlaying;
  const firstActiveTrack = !hasReceivedState && isPlaying;
  const incomingProgressMs = Number(state.progress_ms || 0);
  const timestampChanged = state.playback_timestamp && lastPlaybackTimestamp !== null && state.playback_timestamp !== lastPlaybackTimestamp;
  const repeatedTrackRestart = Boolean(isPlaying && key && key === lastTrackKey && timestampChanged && incomingProgressMs < baseProgressMs - 5000);

  if (track) {
    currentTrack = track;
    titleNode.textContent = track.title || 'Título desconocido';
    artistNode.textContent = track.artists || 'Artista desconocido';
    setCover(track.image || '');
    banner.title = track.album ? `${track.title} — ${track.album}` : track.title;
    eyebrowLabel.textContent = track.type === 'episode' ? 'NOW PLAYING · PODCAST' : 'NOW PLAYING';
  } else if (!state.connected) {
    titleNode.textContent = 'Esperando reproducción';
    artistNode.textContent = 'Conecta Spotify desde el panel';
    setCover('');
  }

  baseProgressMs = incomingProgressMs;
  trackDurationMs = Number(state.duration_ms || 0);
  receivedAtPerformance = performance.now();
  isPlayingNow = isPlaying;
  banner.classList.toggle('is-paused', !isPlaying);

  const songEvent = isPlaying && (trackChanged || justResumed || firstActiveTrack || repeatedTrackRestart);
  if (overlayConfig.notificationEnabled && songEvent) {
    if (overlayConfig.notificationMode === 'persistent' && banner.classList.contains('is-visible')) animateTrackChange();
    else showBanner();
  } else if (!overlayConfig.notificationEnabled) hideBannerSoon(0);
  else if (!track && !isPlaying && overlayConfig.notificationMode !== 'persistent') hideBannerSoon();
  else if (overlayConfig.notificationMode === 'persistent' && track && !banner.classList.contains('is-visible')) showBanner();

  if (key) lastTrackKey = key;
  if (state.playback_timestamp) lastPlaybackTimestamp = state.playback_timestamp;
  wasPlaying = isPlaying;
  hasReceivedState = true;
}

const events = new EventSource('/api/events');
events.addEventListener('message', event => {
  try { applyState(JSON.parse(event.data)); }
  catch (error) { console.error('No se pudo interpretar el estado de Spotify:', error); }
});
events.addEventListener('error', () => {
  // EventSource vuelve a conectarse automáticamente; no bloqueamos la animación.
});

function hexToRgb(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!match) return '30, 215, 96';
  const value = parseInt(match[1], 16);
  return ((value >> 16) & 255) + ', ' + ((value >> 8) & 255) + ', ' + (value & 255);
}

function applyOverlayConfig(config) {
  overlayConfig = { ...overlayConfig, ...(config || {}) };
  stage.dataset.position = overlayConfig.position || 'top-left';
  stage.dataset.preset = overlayConfig.preset || 'classic';
  banner.dataset.preset = overlayConfig.preset || 'classic';
  banner.dataset.visualizerPlacement = overlayConfig.visualizerPlacement || 'separate';
  banner.classList.toggle('is-persistent', overlayConfig.notificationMode === 'persistent');
  banner.dataset.style = overlayConfig.style || 'vinyl';
  banner.style.setProperty('--green', overlayConfig.accentColor || '#1ed760');
  banner.style.setProperty('--green-rgb', hexToRgb(overlayConfig.accentColor || '#1ed760'));
  banner.style.setProperty('--card-opacity', String(Math.max(40, Math.min(100, Number(overlayConfig.cardOpacity) || 92)) / 100));
  visualizerPanel.style.setProperty('--visualizer-color', overlayConfig.visualizerColor || '#ff6b9a');
  visualizerPanel.style.setProperty('--visualizer-rgb', hexToRgb(overlayConfig.visualizerColor || '#ff6b9a'));
  banner.style.setProperty('--visualizer-color', overlayConfig.visualizerColor || '#ff6b9a');
  banner.style.setProperty('--visualizer-rgb', hexToRgb(overlayConfig.visualizerColor || '#ff6b9a'));
  banner.style.setProperty('--visualizer-height', (Number(overlayConfig.visualizerHeight) || 34) + 'px');
  visualizerPanel.style.setProperty('--visualizer-height', (Number(overlayConfig.visualizerHeight) || 34) + 'px');
  banner.classList.toggle('hide-cover', overlayConfig.showCover === false);
  banner.classList.toggle('hide-artist', overlayConfig.showArtist === false);
  banner.classList.toggle('hide-progress', overlayConfig.showProgress === false);
  if (!overlayConfig.notificationEnabled) {
    clearTimeout(hideTimer);
    beginBannerExit();
  } else if (overlayConfig.notificationMode === 'persistent') {
    clearTimeout(hideTimer);
    if (currentTrack && (!banner.classList.contains('is-visible') || banner.classList.contains('is-leaving'))) showBanner();
  }
  drawAudioVisualizer();
}

function ensureInlineVisualizerBars() {
  if (inlineVisualizer.childElementCount) return;
  for (let i = 0; i < 32; i += 1) {
    const bar = document.createElement('span');
    bar.className = 'inline-spectrum-bar';
    inlineVisualizer.appendChild(bar);
  }
}

function drawInlineVisualizer() {
  const visible = Boolean(
    overlayConfig.visualizerEnabled &&
    audioVisualizer.active &&
    overlayConfig.visualizerPlacement === 'inside' &&
    banner.classList.contains('is-visible') &&
    overlayConfig.notificationEnabled
  );
  inlineVisualizer.hidden = !visible;
  if (!visible) return;
  ensureInlineVisualizerBars();
  const levels = Array.isArray(audioVisualizer.levels) ? audioVisualizer.levels : [];
  const sensitivity = Math.max(0.5, Math.min(2, Number(overlayConfig.visualizerSensitivity) || 1.2));
  const height = Math.max(20, Math.min(80, Number(overlayConfig.visualizerHeight) || 34));
  for (let i = 0; i < inlineVisualizer.children.length; i += 1) {
    const level = Math.max(0.035, Math.min(1, Number(levels[i] || 0) * sensitivity));
    inlineVisualizer.children[i].style.height = Math.max(2, level * height * 0.78) + 'px';
    inlineVisualizer.children[i].style.opacity = String(0.46 + level * 0.54);
  }
}

function drawAudioVisualizer() {
  const visible = Boolean(
    overlayConfig.visualizerEnabled &&
    audioVisualizer.active &&
    overlayConfig.visualizerPlacement !== 'inside'
  );
  visualizerPanel.hidden = !visible;
  drawInlineVisualizer();
  if (!visible) return;
  const bounds = visualizerCanvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const ratio = window.devicePixelRatio || 1;
  const targetWidth = Math.round(bounds.width * ratio);
  const targetHeight = Math.round(bounds.height * ratio);
  if (visualizerCanvas.width !== targetWidth || visualizerCanvas.height !== targetHeight) {
    visualizerCanvas.width = targetWidth;
    visualizerCanvas.height = targetHeight;
  }
  const ctx = visualizerContext;
  const width = bounds.width;
  const height = bounds.height;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const levels = Array.isArray(audioVisualizer.levels) ? audioVisualizer.levels : [];
  const count = Math.min(32, levels.length);
  const sensitivity = Math.max(0.5, Math.min(2, Number(overlayConfig.visualizerSensitivity) || 1.2));
  const style = overlayConfig.visualizerStyle || 'bars';
  const rgb = hexToRgb(overlayConfig.visualizerColor || '#ff6b9a');
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = overlayConfig.visualizerColor || '#ff6b9a';
  ctx.fillStyle = overlayConfig.visualizerColor || '#ff6b9a';
  ctx.shadowColor = 'rgba(' + rgb + ',.55)';
  ctx.shadowBlur = 7;
  if (style === 'wave') {
    ctx.beginPath();
    for (let i = 0; i < count; i += 1) {
      const x = count <= 1 ? 0 : i / (count - 1) * width;
      const amplitude = Math.max(1, Math.min(height * 0.46, Number(levels[i] || 0) * sensitivity * height));
      const y = height / 2 + Math.sin((i / Math.max(1, count - 1)) * Math.PI * 3) * amplitude;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else if (style === 'circle') {
    const cx = width / 2;
    const cy = height / 2;
    const baseRadius = Math.max(2, Math.min(height * 0.18, width * 0.08));
    const maxRadius = Math.max(baseRadius + 2, Math.min(height * 0.46, width * 0.18));
    for (let i = 0; i < count; i += 1) {
      const angle = (i / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
      const level = Math.max(0, Math.min(1, Number(levels[i] || 0) * sensitivity));
      const inner = baseRadius + level * (maxRadius - baseRadius) * 0.25;
      const outer = baseRadius + 3 + level * (maxRadius - baseRadius);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
    }
  } else {
    const gap = style === 'mirror' ? 3 : 4;
    const barWidth = Math.max(2, (width - gap * (count - 1)) / Math.max(1, count));
    for (let i = 0; i < count; i += 1) {
      const level = Math.max(0.025, Math.min(1, Number(levels[i] || 0) * sensitivity));
      const barHeight = Math.max(2, level * height * 0.9);
      const x = i * (barWidth + gap);
      const y = style === 'mirror' ? height / 2 - barHeight / 2 : height - barHeight;
      const radius = Math.min(3, barWidth / 2);
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, barWidth, barHeight, radius);
      else ctx.rect(x, y, barWidth, barHeight);
      ctx.fill();
    }
  }
}

function consumeOverlayEvent(packet) {
  if (!packet || typeof packet !== 'object') return;
  if (packet.type === 'init' || packet.type === 'config') applyOverlayConfig(packet.config || {});
  if (packet.type === 'init' || packet.type === 'audio') {
    audioVisualizer = packet.audio || audioVisualizer;
    drawAudioVisualizer();
  }
}

const overlayEvents = new EventSource('/api/overlay/events');
overlayEvents.addEventListener('message', event => {
  try { consumeOverlayEvent(JSON.parse(event.data)); }
  catch (error) { console.error('No se pudo aplicar el estado del visualizador:', error); }
});

floatingCloseButton.addEventListener('click', () => {
  if (window.noteLiveDesktop && window.noteLiveDesktop.closeFloatingOverlay) window.noteLiveDesktop.closeFloatingOverlay();
});

window.addEventListener('resize', drawAudioVisualizer);
setInterval(drawAudioVisualizer, 80);
applyOverlayConfig({});
drawProgress();
