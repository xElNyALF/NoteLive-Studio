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

function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function beginBannerExit() {
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
  banner.classList.remove('is-visible', 'is-opening', 'is-leaving', 'is-spinning');
  void banner.offsetWidth;
  banner.classList.add('is-visible', 'is-opening');

  spinTimer = setTimeout(() => {
    if (banner.classList.contains('is-visible') && !banner.classList.contains('is-leaving')) {
      banner.classList.remove('is-opening');
      banner.classList.add('is-spinning');
    }
  }, 1100);

  hideTimer = setTimeout(beginBannerExit, 8500);
}

function hideBannerSoon(delay = 1200) {
  clearTimeout(hideTimer);
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

  if (isPlaying && (trackChanged || justResumed || firstActiveTrack || repeatedTrackRestart)) showBanner();
  else if (!track && !isPlaying) hideBannerSoon();

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

drawProgress();
