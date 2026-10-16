'use strict';

const $ = selector => document.querySelector(selector);
const form = $('#client-form');
const clientIdInput = $('#client-id');
const formMessage = $('#form-message');
const apiMessage = $('#api-message');
const connectButton = $('#connect-button');
const disconnectButton = $('#disconnect-button');
const tiktokMessage = $('#tiktok-message');
const voiceMessage = $('#voice-message');
const renderedMessageIds = new Set();
let unifiedChatMessages = [];
let unifiedChatFilter = 'all';
let unifiedChatConfig = {
  fontFamily: 'modern', fontSize: 15, usernameColor: '#f3f5fa', messageColor: '#e7ebf2',
  twitchAccent: '#b58aff', tiktokAccent: '#50e5c1', backgroundOpacity: 88, maxMessages: 8,
  showAvatars: true, showBadges: true, showPlatformBadge: true, showTimestamp: true, compact: false
};
let twitchVoiceCommandConfig = { enabled: true, moderatorsCanUse: false };

const UNIFIED_CHAT_FONT_STACKS = {
  modern: 'Inter, "Segoe UI", system-ui, sans-serif',
  windows: '"Segoe UI", Tahoma, sans-serif',
  rounded: '"Trebuchet MS", "Segoe UI", sans-serif',
  gaming: '"Arial Black", "Segoe UI", sans-serif',
  retro: '"Courier New", Consolas, monospace',
  serif: 'Georgia, "Times New Roman", serif',
  playful: '"Comic Sans MS", "Trebuchet MS", sans-serif',
  elegant: '"Palatino Linotype", Palatino, serif'
};

function message(element, text, kind = '') {
  if (!element) return;
  element.textContent = text;
  element.className = element === formMessage ? `inline-message ${kind}` : `api-message ${kind}`;
}

async function getStatus() {
  const response = await fetch('/api/status', { cache: 'no-store' });
  if (!response.ok) throw new Error('No se pudo leer el estado del servidor.');
  return response.json();
}

function renderTikTokStatus(data = {}) {
  const homeTikTokState = $('#home-tiktok-state');
  if (homeTikTokState) homeTikTokState.textContent = data.connected ? `Conectado: @${data.username || 'usuario'}` : (data.status === 'connecting' ? 'Conectando al directo…' : 'Chat y comentarios');
  const tag = $('#tiktok-status-tag');
  const title = $('#tiktok-status-title');
  const desc = $('#tiktok-status-desc');
  const disconnect = $('#tiktok-disconnect');
  const usernameInput = $('#tiktok-username');
  if (document.activeElement !== usernameInput && data.username) usernameInput.value = data.username;
  tag.classList.remove('online');
  disconnect.hidden = !data.connected;

  if (data.connected) {
    title.textContent = `Chat conectado: @${data.username || 'usuario'}`;
    desc.textContent = 'Recibiendo comentarios del directo.';
    tag.textContent = 'CONNECTED';
    tag.classList.add('online');
    message(tiktokMessage, data.error || '', data.error ? 'error' : '');
  } else if (data.status === 'connecting') {
    title.textContent = 'Conectando con TikTok LIVE…';
    desc.textContent = `Intentando abrir el chat de @${data.username || ''}.`;
    tag.textContent = 'CONNECTING';
    message(tiktokMessage, '', '');
  } else if (data.status === 'error') {
    title.textContent = 'No se pudo conectar';
    desc.textContent = 'Comprueba el usuario, que esté en directo y el estado del conector.';
    tag.textContent = 'ERROR';
    message(tiktokMessage, data.error || 'Error de conexión con TikTok.', 'error');
  } else {
    title.textContent = 'Chat desconectado';
    desc.textContent = 'Conecta con el usuario que está en directo para recibir mensajes.';
    tag.textContent = 'OFFLINE';
    message(tiktokMessage, data.error || '', data.error ? 'error' : '');
  }
}

function trustedChatImageUrl(value, platform) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return '';
    const host = url.hostname.toLowerCase();
    if (platform === 'twitch' && (host === 'jtvnw.net' || host.endsWith('.jtvnw.net'))) return url.href;
    if (platform === 'tiktok' && (host === 'tiktokcdn.com' || host.endsWith('.tiktokcdn.com'))) return url.href;
    return '';
  } catch {
    return '';
  }
}

function renderChatMessageContent(target, item) {
  target.replaceChildren();
  const segments = Array.isArray(item.segments) && item.segments.length
    ? item.segments
    : [{ type: 'text', text: item.comment || '' }];
  for (const segment of segments.slice(0, 120)) {
    if (segment && (segment.type === 'emote' || segment.type === 'image')) {
      const src = trustedChatImageUrl(segment.url, item.platform);
      if (src) {
        const image = document.createElement('img');
        image.className = 'chat-emote';
        image.src = src;
        image.alt = String(segment.alt || segment.text || (item.platform === 'tiktok' ? 'Sticker de TikTok' : 'Emote de Twitch')).slice(0, 80);
        image.title = image.alt;
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        target.appendChild(image);
      } else if (segment.text) {
        target.appendChild(document.createTextNode(String(segment.text)));
      }
    } else {
      target.appendChild(document.createTextNode(String(segment && segment.text || '')));
    }
  }
}

function makeChatAvatar(item, className = '') {
  const wrap = document.createElement('span');
  wrap.className = 'chat-avatar ' + className;
  wrap.title = item.username || 'Usuario';
  const imageUrl = trustedChatImageUrl(item.avatarUrl, item.platform);
  if (imageUrl) {
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = '';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      image.remove();
      wrap.textContent = (item.username || '?').trim().charAt(0).toLocaleUpperCase() || '?';
    }, { once: true });
    wrap.appendChild(image);
  } else {
    wrap.textContent = (item.username || '?').trim().charAt(0).toLocaleUpperCase() || '?';
  }
  return wrap;
}

function appendUnifiedRoleBadges(container, item) {
  if (!unifiedChatConfig.showBadges) return;
  const roles = [];
  if (item.isSelf) roles.push(['you', 'TÚ', 'Tu propia cuenta']);
  if (item.isBroadcaster) roles.push(['broadcaster', '👑', 'Streamer']);
  if (item.isModerator) roles.push(['moderator', '🛡', 'Moderador']);
  if (item.isVip) roles.push(['vip', '💎', 'VIP']);
  if (item.isSubscriber) roles.push(['subscriber', '⭐', 'Suscriptor']);
  if (item.isFounder) roles.push(['founder', '🏆', 'Fundador']);
  if (item.isPartner) roles.push(['partner', '✓', 'Partner']);
  for (const [kind, icon, title] of roles) {
    const badge = document.createElement('span');
    badge.className = 'unified-role-badge role-' + kind;
    badge.title = title;
    badge.setAttribute('aria-label', title);
    badge.textContent = icon;
    container.appendChild(badge);
  }
}

function appendChatMessage(item) {
  if (!item || !item.id || renderedMessageIds.has(item.id)) return;
  renderedMessageIds.add(item.id);
  if (renderedMessageIds.size > 250) renderedMessageIds.clear();

  const feed = $('#chat-feed');
  const empty = feed.querySelector('.empty-chat');
  if (empty) empty.remove();

  const row = document.createElement('article');
  row.className = 'chat-item';
  const user = document.createElement('div');
  user.className = 'chat-user';
  user.textContent = item.username || 'Usuario';
  const time = document.createElement('div');
  time.className = 'chat-time';
  time.textContent = new Date(item.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const comment = document.createElement('div');
  comment.className = 'chat-comment';
  renderChatMessageContent(comment, item);
  const status = document.createElement('div');
  status.className = 'chat-state';
  status.textContent = item.shouldSpeak ? '✓ Preparado para leerse en voz alta' : 'No se leerá (lector sin configurar o filtro antispam)';
  row.append(user, time, comment, status);
  feed.appendChild(row);

  while (feed.querySelectorAll('.chat-item').length > 30) feed.querySelector('.chat-item')?.remove();
  $('#chat-count').textContent = `${feed.querySelectorAll('.chat-item').length} mensajes`;
  feed.scrollTop = feed.scrollHeight;
}

function syncChatHistory(items = []) {
  items.slice(0, 30).reverse().forEach(appendChatMessage);
}

function renderChatHistory(items = []) {
  const feed = $('#chat-feed');
  feed.replaceChildren();
  renderedMessageIds.clear();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-chat';
    empty.textContent = 'Los comentarios aparecerán aquí cuando el chat esté conectado.';
    feed.appendChild(empty);
  } else {
    items.slice(0, 30).reverse().forEach(appendChatMessage);
  }
  $('#chat-count').textContent = `${items.length} mensajes`;
}

function applyVoiceStatus(voice = {}) {
  const keyState = $('#eleven-key-state');
  keyState.textContent = voice.hasApiKey
    ? 'API key guardada de forma local. Deja el campo vacío para conservarla.'
    : 'No hay API key guardada. Obtén una en elevenlabs.io/app/settings/api-keys.';
  if (document.activeElement !== $('#eleven-model')) $('#eleven-model').value = voice.modelId || 'eleven_multilingual_v2';
  if (document.activeElement !== $('#tts-template')) $('#tts-template').value = voice.template || '{username} dice: {message}';
  if (document.activeElement !== $('#tts-speed')) $('#tts-speed').value = String(voice.speed ?? 1);
  $('#tts-speed-value').textContent = `${Number(voice.speed ?? 1).toFixed(1)}×`;
  if (document.activeElement !== $('#tts-max-chars')) $('#tts-max-chars').value = String(voice.maxChars ?? 180);
  if (document.activeElement !== $('#tts-antispam')) $('#tts-antispam').checked = voice.antiSpam !== false;
  if (document.activeElement !== $('#tts-enabled')) $('#tts-enabled').checked = voice.enabled !== false;
  const selector = $('#eleven-voice-id');
  if (voice.voiceId && ![...selector.options].some(option => option.value === voice.voiceId)) {
    const savedOption = document.createElement('option');
    savedOption.value = voice.voiceId;
    savedOption.textContent = `Voz guardada (${voice.voiceId})`;
    selector.appendChild(savedOption);
  }
  if (document.activeElement !== selector && voice.voiceId) selector.value = voice.voiceId;
  if (voice.configured) {
    message(voiceMessage, 'ElevenLabs está configurado. Añade la fuente /tts a OBS para que la voz suene en directo.', 'success');
  } else if (voice.hasApiKey) {
    message(voiceMessage, 'API key guardada. Carga las voces, selecciona una y guarda los ajustes.', '');
  }
}

function renderStatus(data) {
  const homeSpotifyState = $('#home-spotify-state');
  if (homeSpotifyState) homeSpotifyState.textContent = data.authenticated ? (data.playback?.track ? `${data.playback.track.title}${data.playback.is_playing ? ' · Reproduciendo' : ' · En pausa'}` : 'Cuenta conectada') : 'Conecta tu música';
  if (document.activeElement !== clientIdInput && data.clientId) clientIdInput.value = data.clientId;
  $('#redirect-uri').textContent = data.redirectUri;
  $('#overlay-url').textContent = data.overlayUrl;

  connectButton.classList.toggle('disabled', !data.hasClientId);
  connectButton.setAttribute('aria-disabled', String(!data.hasClientId));
  disconnectButton.hidden = !data.authenticated;

  const tag = $('#connection-tag');
  const title = $('#connection-title');
  const desc = $('#connection-desc');
  const icon = $('#status-icon');
  tag.classList.remove('online');

  if (!data.hasClientId) {
    title.textContent = 'Falta configurar la aplicación';
    desc.textContent = 'Pega y guarda el Client ID de Spotify para continuar.';
    tag.textContent = 'SETUP';
    icon.textContent = '⚙';
  } else if (!data.authenticated) {
    title.textContent = 'Todavía no conectado';
    desc.textContent = 'Autoriza la lectura de tu reproducción actual.';
    tag.textContent = 'OFFLINE';
    icon.textContent = '♪';
  } else {
    title.textContent = data.playback?.is_playing && data.playback?.track
      ? `Reproduciendo: ${data.playback.track.title}`
      : 'Cuenta de Spotify conectada';
    desc.textContent = data.playback?.track
      ? `${data.playback.track.artists}${data.playback.is_playing ? ' · Reproduciendo ahora' : ' · En pausa'}`
      : 'Esperando una canción en reproducción.';
    tag.textContent = 'CONNECTED';
    tag.classList.add('online');
    icon.textContent = data.playback?.is_playing ? '♫' : '♪';
  }

  const error = data.playback?.error;
  if (error) message(apiMessage, error, 'error');
  else if (data.authenticated) message(apiMessage, 'La conexión de Spotify está activa.', '');
  else message(apiMessage, '', '');

  renderTikTokStatus(data.tiktok || {});
  renderTwitchStatus(data.twitch || {});
  applyVoiceStatus(data.voice || {});
  applyMusicDesignControls(data.overlay || {});
  updateAudioCaptureUI(Boolean(data.audioVisualizerActive));
  if (data.chatHistory) syncChatHistory(data.chatHistory);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : {};
  if (!response.ok) throw new Error(data.error || `La solicitud falló (HTTP ${response.status}).`);
  return data;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const clientId = clientIdInput.value.trim();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Guardando…';
  try {
    const data = await postJson('/api/config', { clientId });
    message(formMessage, 'Client ID guardado. Ahora puedes conectar Spotify.', 'success');
    await refreshStatus();
  } catch (error) {
    message(formMessage, error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Guardar ID';
  }
});

$('#copy-redirect').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#redirect-uri').textContent);
    message(formMessage, 'Redirect URI copiado.', 'success');
  } catch {
    message(formMessage, 'No se pudo copiar automáticamente. Selecciona el Redirect URI y cópialo.', 'error');
  }
});

$('#copy-overlay').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#overlay-url').textContent);
    $('#copy-overlay').textContent = 'Copiado ✓';
    setTimeout(() => { $('#copy-overlay').textContent = 'Copiar URL'; }, 1600);
  } catch {
    message(apiMessage, 'No se pudo copiar automáticamente. Copia manualmente la URL del overlay.', 'error');
  }
});

disconnectButton.addEventListener('click', async () => {
  if (!confirm('¿Desconectar Spotify y borrar el token local guardado?')) return;
  try {
    await postJson('/api/disconnect', {});
    message(formMessage, 'Sesión local desconectada. Para revocar el permiso por completo, revisa las aplicaciones conectadas de Spotify.', 'success');
    await refreshStatus();
  } catch (error) { message(apiMessage, error.message, 'error'); }
});

$('#tiktok-connect').addEventListener('click', async () => {
  const button = $('#tiktok-connect');
  const username = $('#tiktok-username').value.trim().replace(/^@/, '');
  button.disabled = true;
  button.textContent = 'Conectando…';
  message(tiktokMessage, 'Intentando conectar con TikTok LIVE…', '');
  try {
    await postJson('/api/tiktok/connect', { username });
    message(tiktokMessage, 'Chat conectado. Si el usuario está en directo, los comentarios aparecerán aquí.', 'success');
    await refreshStatus();
  } catch (error) {
    message(tiktokMessage, error.message, 'error');
    await refreshStatus();
  } finally {
    button.disabled = false;
    button.textContent = 'Conectar chat';
  }
});

$('#tiktok-disconnect').addEventListener('click', async () => {
  try {
    await postJson('/api/tiktok/disconnect', {});
    message(tiktokMessage, 'Chat desconectado.', 'success');
    await refreshStatus();
  } catch (error) { message(tiktokMessage, error.message, 'error'); }
});

function voicePayload(extra = {}) {
  const apiKey = $('#eleven-api-key').value.trim();
  return {
    ...(apiKey ? { apiKey } : {}),
    voiceId: $('#eleven-voice-id').value,
    modelId: $('#eleven-model').value,
    template: $('#tts-template').value,
    speed: Number($('#tts-speed').value),
    maxChars: Number($('#tts-max-chars').value),
    antiSpam: $('#tts-antispam').checked,
    enabled: $('#tts-enabled').checked,
    ...extra
  };
}

$('#save-voice').addEventListener('click', async () => {
  const button = $('#save-voice');
  button.disabled = true;
  button.textContent = 'Guardando…';
  try {
    const data = await postJson('/api/voice/config', voicePayload());
    $('#eleven-api-key').value = '';
    applyVoiceStatus(data.voice || {});
    message(voiceMessage, 'Ajustes de voz guardados localmente.', 'success');
  } catch (error) { message(voiceMessage, error.message, 'error'); }
  finally { button.disabled = false; button.textContent = 'Guardar ajustes'; }
});

$('#load-voices').addEventListener('click', async () => {
  const button = $('#load-voices');
  button.disabled = true;
  button.textContent = 'Cargando…';
  try {
    // Permite guardar una clave que se acaba de introducir antes de pedir el listado.
    if ($('#eleven-api-key').value.trim()) {
      await postJson('/api/voice/config', voicePayload());
      $('#eleven-api-key').value = '';
    }
    const response = await fetch('/api/voice/voices', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las voces.');
    const selector = $('#eleven-voice-id');
    const previouslySelected = selector.value;
    selector.replaceChildren();
    if (!data.voices.length) {
      selector.add(new Option('No hay voces disponibles', ''));
    } else {
      for (const voice of data.voices) {
        const label = voice.category ? `${voice.name} · ${voice.category}` : voice.name;
        selector.add(new Option(label, voice.voice_id));
      }
      selector.value = data.voices.some(voice => voice.voice_id === previouslySelected) ? previouslySelected : data.voices[0].voice_id;
    }
    message(voiceMessage, `Se cargaron ${data.voices.length} voces. Selecciona una y pulsa «Guardar ajustes».`, 'success');
  } catch (error) { message(voiceMessage, error.message, 'error'); }
  finally { button.disabled = false; button.textContent = 'Cargar voces'; }
});

$('#test-voice').addEventListener('click', async () => {
  const button = $('#test-voice');
  button.disabled = true;
  button.textContent = 'Generando audio…';
  try {
    if ($('#eleven-api-key').value.trim() || $('#eleven-voice-id').value !== '') {
      await postJson('/api/voice/config', voicePayload());
      $('#eleven-api-key').value = '';
    }
    const response = await fetch('/api/voice/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hola, esta es una prueba del lector de chat de NoteLive Studio.' })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'No se pudo generar la prueba de voz.');
    }
    const audioUrl = URL.createObjectURL(await response.blob());
    const audio = new Audio(audioUrl);
    audio.onended = () => URL.revokeObjectURL(audioUrl);
    await audio.play();
    message(voiceMessage, 'Reproduciendo la prueba de voz en este navegador.', 'success');
  } catch (error) { message(voiceMessage, error.message, 'error'); }
  finally { button.disabled = false; button.textContent = 'Probar voz'; }
});

$('#tts-speed').addEventListener('input', () => { $('#tts-speed-value').textContent = `${Number($('#tts-speed').value).toFixed(1)}×`; });
$('#copy-tts-url').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#tts-url').textContent);
    $('#copy-tts-url').textContent = 'Copiado ✓';
    setTimeout(() => { $('#copy-tts-url').textContent = 'Copiar URL'; }, 1600);
  } catch { message(voiceMessage, 'Copia manualmente la URL http://127.0.0.1:8787/tts.', 'error'); }
});

async function refreshStatus() {
  try {
    const data = await getStatus();
    renderStatus(data);
  } catch (error) { message(apiMessage, error.message, 'error'); }
}

const params = new URLSearchParams(window.location.search);
if (params.has('connected')) {
  message(formMessage, '¡Spotify conectado! Inicia una canción y el overlay la detectará.', 'success');
  history.replaceState({}, document.title, '/');
} else if (params.has('error')) {
  const errors = {
    access_denied: 'Cancelaste la autorización de Spotify.',
    invalid_state: 'No se pudo validar la autorización. Intenta conectar de nuevo.',
    token_exchange: 'Spotify no aceptó el intercambio del código. Revisa el Client ID y el Redirect URI.',
    server_error: 'Ocurrió un error local durante la autorización. Intenta de nuevo.'
  };
  message(formMessage, errors[params.get('error')] || 'Spotify no pudo completar la autorización.', 'error');
  history.replaceState({}, document.title, '/');
}

refreshStatus();
const statusEvents = new EventSource('/api/events');
statusEvents.addEventListener('message', event => {
  try {
    const playback = JSON.parse(event.data);
    getStatus().then(data => { data.playback = playback; renderStatus(data); }).catch(() => {});
  } catch {}
});

const tiktokEvents = new EventSource('/api/tiktok/events');
tiktokEvents.addEventListener('message', event => {
  try {
    const packet = JSON.parse(event.data);
    if (packet.type === 'init') {
      renderTikTokStatus(packet.status || {});
      renderChatHistory(packet.history || []);
      applyVoiceStatus(packet.voice || {});
    } else if (packet.type === 'status') {
      renderTikTokStatus(packet.status || {});
    } else if (packet.type === 'chat') {
      appendChatMessage(packet.message);
    }
  } catch {}
});

// In-app updater status: no surprise dialogs, just one clear progress panel.
const updatePanel = $('#update-status-panel');
const updateCheckButton = $('#update-check-button');
const updateProgressWrap = $('#update-progress-wrap');
const updateProgressBar = $('#update-progress-bar');
const updateProgressPercent = $('#update-progress-percent');
const updateRestartButton = $('#update-restart-button');
const updateDismissButton = $('#update-status-dismiss');

function renderUpdateStatus(status = {}) {
  if (!updatePanel) return;
  const state = status.state || 'idle';
  if (state === 'idle') {
    updatePanel.hidden = true;
    return;
  }
  updatePanel.hidden = false;
  updatePanel.dataset.state = state;
  $('#update-status-title').textContent = status.message || 'Estado de actualización';
  $('#update-status-detail').textContent = status.detail || '';
  $('#update-status-version').textContent = status.version ? 'v' + status.version : '';
  $('#update-status-icon').textContent = state === 'ready' ? '✓' : state === 'error' ? '!' : state === 'up-to-date' ? '✓' : '↻';

  const percent = Math.max(0, Math.min(100, Math.round(Number(status.percent) || 0)));
  updateProgressWrap.hidden = state !== 'downloading';
  updateProgressBar.style.width = percent + '%';
  updateProgressPercent.textContent = percent + '%';
  updateCheckButton.disabled = ['checking', 'downloading'].includes(state);
  updateCheckButton.title = state === 'checking' ? 'Comprobando actualizaciones…' : state === 'downloading' ? 'Descargando actualización…' : 'Buscar actualizaciones';
  updateRestartButton.hidden = state !== 'ready';
  updateDismissButton.hidden = ['checking', 'downloading'].includes(state);
  updatePanel.classList.toggle('is-busy', ['checking', 'downloading'].includes(state));
}

if (!window.noteLiveDesktop?.isDesktopApp && updateCheckButton) {
  updateCheckButton.hidden = true;
}
if (window.noteLiveDesktop?.onUpdateStatus) {
  window.noteLiveDesktop.onUpdateStatus(renderUpdateStatus);
  window.noteLiveDesktop.getUpdateStatus().then(renderUpdateStatus).catch(() => {});
}
updateCheckButton?.addEventListener('click', async () => {
  if (!window.noteLiveDesktop?.checkForUpdates) return;
  renderUpdateStatus({ state: 'checking', message: 'Buscando actualizaciones…', detail: 'Comprobando la versión más reciente.' });
  try { await window.noteLiveDesktop.checkForUpdates(); }
  catch (error) { renderUpdateStatus({ state: 'error', message: 'No se pudo comprobar la actualización.', detail: error.message || String(error) }); }
});
updateRestartButton?.addEventListener('click', async () => {
  if (!window.noteLiveDesktop?.restartAndInstallUpdate) return;
  updateRestartButton.disabled = true;
  updateRestartButton.textContent = 'Reiniciando…';
  try {
    const result = await window.noteLiveDesktop.restartAndInstallUpdate();
    if (!result?.started) {
      updateRestartButton.disabled = false;
      updateRestartButton.textContent = 'Reiniciar para instalar';
    }
  } catch (error) {
    updateRestartButton.disabled = false;
    updateRestartButton.textContent = 'Reiniciar para instalar';
    renderUpdateStatus({ state: 'error', message: 'No se pudo iniciar la instalación.', detail: error.message || String(error) });
  }
});
updateDismissButton?.addEventListener('click', () => { updatePanel.hidden = true; });

// Main navigation: each service has its own workspace instead of a long page.
const viewMeta = {
  home: { eyebrow: 'STUDIO OVERVIEW', title: 'Tu centro creativo', subtitle: 'Un solo lugar para conectar, personalizar y controlar tus directos.' },
  twitch: { eyebrow: 'STREAMING PLATFORM', title: 'Twitch', subtitle: 'Conecta tu canal, personaliza alertas y muestra el chat en OBS.' },
  spotify: { eyebrow: 'MUSIC INTEGRATION', title: 'Spotify', subtitle: 'Conecta tu música y personaliza la notificación que verán tus espectadores.' },
  chat: { eyebrow: 'MULTI-PLATFORM / LIVE CHAT', title: 'Chat general', subtitle: 'Twitch y TikTok LIVE juntos, con el origen y los emotes de cada mensaje.' },
  tiktok: { eyebrow: 'COMMUNITY / LIVE CHAT', title: 'TikTok LIVE', subtitle: 'Mensajes del chat, estado del directo y conexión con el lector de voz.' },
  kick: { eyebrow: 'PLATFORM INTEGRATION / COMING SOON', title: 'Kick', subtitle: 'Integración en preparación. Todavía no conecta con Kick.' },
  voice: { eyebrow: 'TEXT TO SPEECH', title: 'Voz de IA', subtitle: 'Controla ElevenLabs, la plantilla de mensajes, la velocidad y los filtros.' },
  obs: { eyebrow: 'OUTPUT / BROADCAST', title: 'OBS Studio', subtitle: 'Configura las Browser Sources para música y audio.' },
  appearance: { eyebrow: 'YOUR SPACE / YOUR RULES', title: 'Personaliza tu universo', subtitle: 'Tu personaje favorito como fondo, con desenfoque, opacidad y colores a tu gusto.' }
};

function switchStudioView(viewName) {
  if (!viewMeta[viewName]) viewName = 'home';
  document.querySelectorAll('[data-view]').forEach(view => {
    const active = view.dataset.view === viewName;
    view.classList.toggle('active', active);
    view.setAttribute('aria-hidden', String(!active));
  });
  document.querySelectorAll('[data-view-target]').forEach(button => {
    const active = button.dataset.viewTarget === viewName;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const meta = viewMeta[viewName];
  $('#page-eyebrow').textContent = meta.eyebrow;
  $('#page-title').textContent = meta.title;
  $('#page-subtitle').textContent = meta.subtitle;
  document.querySelector('.workspace-scroll').scrollTop = 0;
  try { localStorage.setItem('notelive-studio.active-view', viewName); } catch {}
}

document.querySelectorAll('[data-view-target]').forEach(button => {
  button.addEventListener('click', () => switchStudioView(button.dataset.viewTarget));
});
document.querySelectorAll('[data-go]').forEach(button => {
  button.addEventListener('click', () => switchStudioView(button.dataset.go));
});

// A custom wallpaper and color system for the NoteLive interface.
// Images are resized before saving so a large wallpaper does not fill browser storage.
const APPEARANCE_STORAGE_KEY = 'notelive-studio.appearance.v1';
const appearanceDefaults = {
  wallpaper: '', wallpaperName: '', blurEnabled: true, blur: 10, dim: 45,
  panelOpacity: 86, position: 'center', accent: '#1ed760'
};
const appearance = { ...appearanceDefaults };
const appearanceElements = {
  file: $('#wallpaper-file'), choose: $('#choose-wallpaper'), remove: $('#remove-wallpaper'),
  blurToggle: $('#wallpaper-blur-toggle'), blur: $('#wallpaper-blur'), blurValue: $('#wallpaper-blur-value'),
  dim: $('#wallpaper-dim'), dimValue: $('#wallpaper-dim-value'),
  opacity: $('#panel-opacity'), opacityValue: $('#panel-opacity-value'),
  position: $('#wallpaper-position'), accent: $('#accent-color'), accentValue: $('#accent-color-value'),
  name: $('#wallpaper-name'), thumbnail: $('#wallpaper-thumbnail'), stage: $('#wallpaper-preview-stage'),
  saveState: $('#appearance-save-state'), reset: $('#reset-appearance')
};

function hexToRgb(hex) {
  const value = String(hex || '#1ed760').replace('#', '');
  const normalized = value.length === 3 ? value.split('').map(char => char + char).join('') : value;
  const number = Number.parseInt(normalized, 16);
  if (!Number.isFinite(number)) return '30, 215, 96';
  return `${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}`;
}

function setAppearanceSaveState(text, isError = false) {
  appearanceElements.saveState.innerHTML = '<span class="pulse-dot"></span>';
  appearanceElements.saveState.append(document.createTextNode(` ${text}`));
  appearanceElements.saveState.style.color = isError ? '#ff8c98' : '';
}

function applyAppearanceToUI() {
  const rootStyle = document.documentElement.style;
  const blurValue = appearance.blurEnabled ? Number(appearance.blur) : 0;
  rootStyle.setProperty('--accent', appearance.accent);
  rootStyle.setProperty('--accent-rgb', hexToRgb(appearance.accent));
  rootStyle.setProperty('--panel-alpha', String(Number(appearance.panelOpacity) / 100));
  rootStyle.setProperty('--wallpaper-dim', String(Number(appearance.dim) / 100));

  const wallpaperLayer = $('#wallpaper-layer');
  wallpaperLayer.style.backgroundImage = appearance.wallpaper
    ? `url("${appearance.wallpaper}")`
    : 'radial-gradient(ellipse at 15% 20%, rgba(var(--accent-rgb), .13), transparent 33%), linear-gradient(145deg, #10151a, #090b10 65%)';
  wallpaperLayer.style.backgroundPosition = appearance.position;
  wallpaperLayer.style.filter = `blur(${blurValue}px)`;
  wallpaperLayer.style.transform = appearance.wallpaper ? 'scale(1.06)' : 'scale(1.035)';

  appearanceElements.name.textContent = appearance.wallpaperName || 'Sin fondo personalizado';
  appearanceElements.thumbnail.style.setProperty('--thumb-image', appearance.wallpaper ? `url("${appearance.wallpaper}")` : 'none');
  appearanceElements.stage.style.setProperty('--preview-image', appearance.wallpaper ? `url("${appearance.wallpaper}")` : 'none');
  appearanceElements.stage.style.setProperty('--preview-blur', `${blurValue}px`);
  appearanceElements.stage.style.setProperty('--preview-dim', String(Number(appearance.dim) / 100));
  appearanceElements.stage.style.setProperty('--preview-position', appearance.position);

  appearanceElements.blurToggle.checked = Boolean(appearance.blurEnabled);
  appearanceElements.blur.disabled = !appearance.blurEnabled;
  appearanceElements.blur.value = String(appearance.blur);
  appearanceElements.blurValue.textContent = appearance.blurEnabled ? `${appearance.blur} px` : 'Desactivado';
  appearanceElements.blurValue.style.opacity = appearance.blurEnabled ? '1' : '.55';
  appearanceElements.dim.value = String(appearance.dim);
  appearanceElements.dimValue.textContent = `${appearance.dim}%`;
  appearanceElements.opacity.value = String(appearance.panelOpacity);
  appearanceElements.opacityValue.textContent = `${appearance.panelOpacity}%`;
  appearanceElements.position.value = appearance.position;
  appearanceElements.accent.value = appearance.accent;
  appearanceElements.accentValue.textContent = appearance.accent.toUpperCase();
}

function persistAppearance() {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
    setAppearanceSaveState('Se guarda automáticamente');
    return true;
  } catch (error) {
    console.error('No se pudo guardar la apariencia:', error);
    setAppearanceSaveState('No se pudo guardar. Prueba con una imagen más pequeña.', true);
    return false;
  }
}

function updateAppearanceAndSave() {
  appearance.blurEnabled = appearanceElements.blurToggle.checked;
  appearance.blur = Number(appearanceElements.blur.value);
  appearance.dim = Number(appearanceElements.dim.value);
  appearance.panelOpacity = Number(appearanceElements.opacity.value);
  appearance.position = appearanceElements.position.value;
  appearance.accent = appearanceElements.accent.value;
  applyAppearanceToUI();
  persistAppearance();
}

function loadAppearance() {
  try {
    const saved = JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) || '{}');
    Object.assign(appearance, appearanceDefaults, saved);
  } catch (error) {
    console.warn('Se usarán los valores de apariencia predeterminados:', error);
    Object.assign(appearance, appearanceDefaults);
  }
  // Clamp the values loaded from storage in case a setting was edited outside the UI.
  appearance.blur = Math.max(0, Math.min(24, Number(appearance.blur) || 0));
  appearance.dim = Math.max(0, Math.min(85, Number(appearance.dim) || 0));
  appearance.panelOpacity = Math.max(55, Math.min(98, Number(appearance.panelOpacity) || 86));
  if (!/^#[0-9a-f]{6}$/i.test(appearance.accent)) appearance.accent = appearanceDefaults.accent;
  if (!['center', 'center top', 'center bottom', 'left center', 'right center'].includes(appearance.position)) appearance.position = 'center';
  applyAppearanceToUI();
}

function optimizeImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Selecciona un archivo de imagen válido.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo abrir la imagen seleccionada.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('El formato de esa imagen no se pudo leer. Prueba con PNG, JPG o WebP.'));
      image.onload = () => {
        const maxDimension = 1920;
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) { reject(new Error('No se pudo optimizar la imagen.')); return; }
        context.fillStyle = '#080a0e';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        let result = canvas.toDataURL('image/webp', 0.8);
        if (result.length > 1_850_000) result = canvas.toDataURL('image/webp', 0.62);
        if (result.length > 2_850_000) {
          const smaller = document.createElement('canvas');
          const downScale = 1400 / Math.max(canvas.width, canvas.height);
          smaller.width = Math.max(1, Math.round(canvas.width * downScale));
          smaller.height = Math.max(1, Math.round(canvas.height * downScale));
          smaller.getContext('2d')?.drawImage(canvas, 0, 0, smaller.width, smaller.height);
          result = smaller.toDataURL('image/webp', 0.62);
        }
        resolve(result);
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

appearanceElements.choose.addEventListener('click', () => appearanceElements.file.click());
appearanceElements.file.addEventListener('change', async () => {
  const file = appearanceElements.file.files?.[0];
  if (!file) return;
  setAppearanceSaveState('Optimizando imagen…');
  try {
    appearance.wallpaper = await optimizeImageFile(file);
    appearance.wallpaperName = file.name;
    applyAppearanceToUI();
    if (!persistAppearance()) {
      appearance.wallpaper = '';
      appearance.wallpaperName = '';
      applyAppearanceToUI();
    } else {
      setAppearanceSaveState('Fondo guardado');
    }
  } catch (error) {
    setAppearanceSaveState(error.message || 'No se pudo guardar la imagen.', true);
  } finally {
    appearanceElements.file.value = '';
  }
});
appearanceElements.remove.addEventListener('click', () => {
  appearance.wallpaper = '';
  appearance.wallpaperName = '';
  applyAppearanceToUI();
  persistAppearance();
  setAppearanceSaveState('Fondo eliminado');
});
[appearanceElements.blurToggle, appearanceElements.blur, appearanceElements.dim, appearanceElements.opacity, appearanceElements.position, appearanceElements.accent].forEach(control => {
  control.addEventListener('input', updateAppearanceAndSave);
  control.addEventListener('change', updateAppearanceAndSave);
});
appearanceElements.reset.addEventListener('click', () => {
  Object.assign(appearance, appearanceDefaults);
  applyAppearanceToUI();
  persistAppearance();
  setAppearanceSaveState('Apariencia restablecida');
});
document.querySelectorAll('[data-palette]').forEach(button => {
  button.addEventListener('click', () => {
    appearanceElements.accent.value = button.dataset.palette;
    updateAppearanceAndSave();
  });
});

loadAppearance();
let lastView = 'home';
try { lastView = localStorage.getItem('notelive-studio.active-view') || 'home'; } catch {}
switchStudioView(lastView);


// Music notification designer + real local system-audio analysis.
const musicDefaultConfig = {
  notificationEnabled: true, preset: 'classic', notificationMode: 'timed', visualizerPlacement: 'separate',
  durationSeconds: 8, style: 'vinyl', position: 'top-left',
  accentColor: '#1ed760', cardOpacity: 92, showCover: true, showArtist: true, showProgress: true,
  visualizerEnabled: true, visualizerStyle: 'bars', visualizerColor: '#ff6b9a',
  visualizerSensitivity: 1.2, visualizerHeight: 34
};
const musicControlIds = {
  notificationEnabled: 'music-notification-enabled',
  preset: 'music-preset-id',
  notificationMode: 'music-notification-mode',
  visualizerPlacement: 'music-visualizer-placement',
  durationSeconds: 'music-notification-duration',
  style: 'music-notification-style',
  position: 'music-notification-position',
  accentColor: 'music-accent-color',
  cardOpacity: 'music-card-opacity',
  showCover: 'music-show-cover',
  showArtist: 'music-show-artist',
  showProgress: 'music-show-progress',
  visualizerEnabled: 'music-visualizer-enabled',
  visualizerStyle: 'music-visualizer-style',
  visualizerColor: 'music-visualizer-color',
  visualizerSensitivity: 'music-visualizer-sensitivity',
  visualizerHeight: 'music-visualizer-height'
};
let systemAudioStream = null;
let systemAudioContext = null;
let systemAudioAnalyser = null;
let systemAudioSource = null;
let systemAudioFrame = 0;
let lastAudioPostAt = 0;
let audioPostInFlight = false;
let pendingAudioFrame = null;
let activeAudioCapture = false;


const musicPresets = Object.freeze({
  classic: {
    name: 'Original', style: 'vinyl', notificationMode: 'timed', visualizerPlacement: 'separate',
    accentColor: '#1ed760', visualizerColor: '#ff6b9a', visualizerStyle: 'bars', cardOpacity: 92,
    visualizerHeight: 34, visualizerSensitivity: 1.2, showCover: true, showArtist: true, showProgress: true
  },
  aesthetic: {
    name: 'Aesthetic', style: 'glass', notificationMode: 'timed', visualizerPlacement: 'separate',
    accentColor: '#dba8ff', visualizerColor: '#a8a4ff', visualizerStyle: 'wave', cardOpacity: 78,
    visualizerHeight: 28, visualizerSensitivity: 1, showCover: true, showArtist: true, showProgress: true
  },
  spectrum: {
    name: 'Rhythm Inside', style: 'glass', notificationMode: 'timed', visualizerPlacement: 'inside',
    accentColor: '#72f4e8', visualizerColor: '#9efff5', visualizerStyle: 'bars', cardOpacity: 90,
    visualizerHeight: 24, visualizerSensitivity: 1.25, showCover: true, showArtist: true, showProgress: false
  },
  mini: {
    name: 'Mini Capsule', style: 'minimal', notificationMode: 'timed', visualizerPlacement: 'inside',
    accentColor: '#f2f2f7', visualizerColor: '#f7f7ff', visualizerStyle: 'bars', cardOpacity: 96,
    visualizerHeight: 20, visualizerSensitivity: 1, showCover: true, showArtist: true, showProgress: false
  },
  neon: {
    name: 'Neon Pulse', style: 'glass', notificationMode: 'timed', visualizerPlacement: 'separate',
    accentColor: '#ff5bba', visualizerColor: '#ff63c5', visualizerStyle: 'bars', cardOpacity: 94,
    visualizerHeight: 42, visualizerSensitivity: 1.5, showCover: true, showArtist: true, showProgress: true
  },
  retro: {
    name: 'Retro EQ', style: 'minimal', notificationMode: 'timed', visualizerPlacement: 'inside',
    accentColor: '#ffbe55', visualizerColor: '#ffcc73', visualizerStyle: 'mirror', cardOpacity: 96,
    visualizerHeight: 28, visualizerSensitivity: 1.15, showCover: true, showArtist: true, showProgress: true
  },
  orbit: {
    name: 'Orbit', style: 'vinyl', notificationMode: 'timed', visualizerPlacement: 'separate',
    accentColor: '#b89bff', visualizerColor: '#c9b7ff', visualizerStyle: 'circle', cardOpacity: 91,
    visualizerHeight: 38, visualizerSensitivity: 1.3, showCover: true, showArtist: true, showProgress: false
  },
  cyberpunk: {
    name: 'Cyberpunk', style: 'glass', notificationMode: 'timed', visualizerPlacement: 'separate',
    accentColor: '#ff38a8', visualizerColor: '#ff4eb8', visualizerStyle: 'wave', cardOpacity: 93,
    visualizerHeight: 36, visualizerSensitivity: 1.7, showCover: true, showArtist: true, showProgress: true
  },
  mono: {
    name: 'Mono Clean', style: 'minimal', notificationMode: 'timed', visualizerPlacement: 'separate',
    accentColor: '#e9edf4', visualizerColor: '#f5f7ff', visualizerStyle: 'mirror', cardOpacity: 94,
    visualizerHeight: 24, visualizerSensitivity: 1, showCover: true, showArtist: true, showProgress: false
  },
  'always-on': {
    name: 'Always On', style: 'glass', notificationMode: 'persistent', visualizerPlacement: 'inside',
    accentColor: '#bda0ff', visualizerColor: '#cbb6ff', visualizerStyle: 'mirror', cardOpacity: 90,
    visualizerHeight: 30, visualizerSensitivity: 1.35, showCover: true, showArtist: true, showProgress: true
  }
});
let applyingMusicPreset = false;

function updateMusicPresetSelection(presetId) {
  document.querySelectorAll('[data-music-preset]').forEach(button => {
    const selected = button.dataset.musicPreset === presetId;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

async function applyMusicPreset(presetId) {
  const preset = musicPresets[presetId];
  if (!preset) return;
  applyingMusicPreset = true;
  musicControl('music-preset-id').value = presetId;
  applyMusicDesignControls({ ...musicDefaultConfig, ...preset, preset: presetId });
  updateMusicPresetSelection(presetId);
  try {
    const result = await postJson('/api/overlay/config', readMusicDesignControls());
    applyMusicDesignControls(result.config || {});
    updateMusicPresetSelection(presetId);
    setMusicDesignMessage('Estilo "' + preset.name + '" aplicado y guardado.', 'success');
  } catch (error) {
    setMusicDesignMessage(error.message || 'No se pudo aplicar el estilo.', 'error');
  } finally {
    applyingMusicPreset = false;
  }
}

function musicControl(id) {
  return document.getElementById(id);
}

function updateMusicValueLabels() {
  musicControl('music-notification-duration-value').textContent = musicControl('music-notification-duration').value + ' s';
  musicControl('music-card-opacity-value').textContent = musicControl('music-card-opacity').value + '%';
  musicControl('music-visualizer-sensitivity-value').textContent = Number(musicControl('music-visualizer-sensitivity').value).toFixed(1) + '×';
  musicControl('music-visualizer-height-value').textContent = musicControl('music-visualizer-height').value + ' px';
}

function applyMusicDesignControls(config) {
  const values = { ...musicDefaultConfig, ...(config && typeof config === 'object' ? config : {}) };
  for (const [key, id] of Object.entries(musicControlIds)) {
    const control = musicControl(id);
    if (!control || document.activeElement === control) continue;
    if (control.type === 'checkbox') control.checked = values[key] !== false;
    else control.value = String(values[key]);
  }
  updateMusicValueLabels();
  updateMusicPresetSelection(values.preset || 'classic');
}

function readMusicDesignControls() {
  const result = {};
  for (const [key, id] of Object.entries(musicControlIds)) {
    const control = musicControl(id);
    if (!control) continue;
    result[key] = control.type === 'checkbox'
      ? control.checked
      : (control.type === 'range' || control.type === 'number' ? Number(control.value) : control.value);
  }
  return result;
}

function setMusicDesignMessage(text, kind) {
  const el = musicControl('music-design-message');
  el.textContent = text || '';
  el.className = 'api-message' + (kind ? ' ' + kind : '');
}

function updateAudioCaptureUI(isActive, textOverride) {
  activeAudioCapture = Boolean(isActive);
  const state = musicControl('music-audio-capture-state');
  const help = musicControl('music-audio-capture-help');
  const button = musicControl('music-audio-capture-toggle');
  if (!state || !help || !button) return;
  const desktopCapable = Boolean(window.noteLiveDesktop && window.noteLiveDesktop.isDesktopApp);
  state.textContent = textOverride || (activeAudioCapture ? 'Captura de audio activa · análisis local' : 'Captura de audio desactivada');
  state.classList.toggle('is-active', activeAudioCapture);
  help.textContent = activeAudioCapture
    ? 'Analizando el audio que sale por Windows. No se guarda ni se envía fuera de este PC.'
    : 'Actívala mientras suena Spotify. Solo se analizan niveles de audio en este PC; no se graba el sonido.';
  button.disabled = !desktopCapable && !activeAudioCapture;
  button.textContent = activeAudioCapture ? 'Detener captura de audio' : 'Activar captura de audio';
  if (!desktopCapable && !activeAudioCapture) {
    state.textContent = 'Captura del sistema disponible en la app de escritorio';
    help.textContent = 'Abre NoteLive Studio instalado para capturar el audio de Windows.';
  }
}

function sendAudioFrame(payload) {
  if (audioPostInFlight) {
    pendingAudioFrame = payload;
    return;
  }
  audioPostInFlight = true;
  fetch('/api/overlay/audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {}).finally(() => {
    audioPostInFlight = false;
    if (pendingAudioFrame) {
      const next = pendingAudioFrame;
      pendingAudioFrame = null;
      sendAudioFrame(next);
    }
  });
}

function stopSystemAudioVisualizer(showMessage) {
  if (!systemAudioStream && !systemAudioContext) return;
  activeAudioCapture = false;
  if (systemAudioFrame) cancelAnimationFrame(systemAudioFrame);
  systemAudioFrame = 0;
  const oldStream = systemAudioStream;
  systemAudioStream = null;
  if (oldStream) {
    for (const track of oldStream.getTracks()) {
      try { track.stop(); } catch {}
    }
  }
  try { if (systemAudioSource) systemAudioSource.disconnect(); } catch {}
  systemAudioSource = null;
  systemAudioAnalyser = null;
  if (systemAudioContext) systemAudioContext.close().catch(() => {});
  systemAudioContext = null;
  pendingAudioFrame = { active: false, levels: [], rms: 0 };
  if (!audioPostInFlight) {
    const finalFrame = pendingAudioFrame;
    pendingAudioFrame = null;
    sendAudioFrame(finalFrame);
  }
  updateAudioCaptureUI(false);
  if (showMessage) setMusicDesignMessage('Captura de audio detenida.', '');
}

async function startSystemAudioVisualizer() {
  const button = musicControl('music-audio-capture-toggle');
  if (!window.noteLiveDesktop || !window.noteLiveDesktop.isDesktopApp) {
    setMusicDesignMessage('La captura de audio del sistema requiere la aplicación de escritorio de NoteLive Studio.', 'error');
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    setMusicDesignMessage('Esta versión de Electron no ofrece captura de audio del sistema en este equipo.', 'error');
    return;
  }
  button.disabled = true;
  setMusicDesignMessage('Activando captura local del audio de Windows…', '');
  try {
    // The app explicitly asks for capture after the user clicks. Only FFT levels leave this renderer, to localhost.
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const audioTracks = stream.getAudioTracks();
    for (const track of stream.getVideoTracks()) {
      try { track.stop(); } catch {}
    }
    if (!audioTracks.length) {
      for (const track of stream.getTracks()) track.stop();
      throw new Error('Windows no devolvió una pista de audio. Comprueba que el audio del sistema esté disponible.');
    }
    systemAudioStream = stream;
    systemAudioContext = new AudioContext();
    await systemAudioContext.resume();
    systemAudioAnalyser = systemAudioContext.createAnalyser();
    systemAudioAnalyser.fftSize = 2048;
    systemAudioAnalyser.smoothingTimeConstant = 0.72;
    systemAudioSource = systemAudioContext.createMediaStreamSource(stream);
    systemAudioSource.connect(systemAudioAnalyser);
    activeAudioCapture = true;
    sendAudioFrame({ active: true, levels: Array(32).fill(0), rms: 0 });
    updateAudioCaptureUI(true);
    setMusicDesignMessage('Captura activa. Reproduce una canción para ver el ritmo real.', 'success');
    audioTracks[0].addEventListener('ended', () => stopSystemAudioVisualizer(false), { once: true });

    const freq = new Uint8Array(systemAudioAnalyser.frequencyBinCount);
    const time = new Uint8Array(systemAudioAnalyser.fftSize);
    const tick = () => {
      if (!activeAudioCapture || !systemAudioAnalyser) return;
      systemAudioAnalyser.getByteFrequencyData(freq);
      systemAudioAnalyser.getByteTimeDomainData(time);
      const levels = [];
      const count = 32;
      for (let i = 0; i < count; i += 1) {
        const start = Math.floor(Math.pow(i / count, 2) * freq.length);
        const end = Math.max(start + 1, Math.floor(Math.pow((i + 1) / count, 2) * freq.length));
        let total = 0;
        for (let j = start; j < Math.min(end, freq.length); j += 1) total += freq[j];
        const average = total / Math.max(1, Math.min(end, freq.length) - start);
        levels.push(Math.min(1, average / 190));
      }
      let rmsTotal = 0;
      for (let i = 0; i < time.length; i += 1) {
        const value = (time[i] - 128) / 128;
        rmsTotal += value * value;
      }
      const rms = Math.sqrt(rmsTotal / time.length);
      const now = performance.now();
      if (now - lastAudioPostAt >= 65) {
        lastAudioPostAt = now;
        sendAudioFrame({ active: true, levels, rms });
      }
      systemAudioFrame = requestAnimationFrame(tick);
    };
    systemAudioFrame = requestAnimationFrame(tick);
  } catch (error) {
    stopSystemAudioVisualizer(false);
    setMusicDesignMessage(error.message || 'No se pudo activar la captura de audio.', 'error');
  } finally {
    button.disabled = false;
    updateAudioCaptureUI(activeAudioCapture);
  }
}

document.querySelectorAll('[data-music-preset]').forEach(button => {
  button.addEventListener('click', () => applyMusicPreset(button.dataset.musicPreset));
});

Object.entries(musicControlIds).forEach(([key, id]) => {
  if (key === 'preset') return;
  const control = musicControl(id);
  if (!control) return;
  const markCustom = () => {
    if (applyingMusicPreset) return;
    musicControl('music-preset-id').value = 'custom';
    updateMusicPresetSelection('custom');
  };
  control.addEventListener('input', markCustom);
  control.addEventListener('change', markCustom);
});

musicControl('music-save-design').addEventListener('click', async () => {
  const button = musicControl('music-save-design');
  button.disabled = true;
  button.textContent = 'Guardando…';
  try {
    const result = await postJson('/api/overlay/config', readMusicDesignControls());
    applyMusicDesignControls(result.config || {});
    setMusicDesignMessage('Diseño guardado. La fuente de OBS lo recibirá automáticamente.', 'success');
  } catch (error) {
    setMusicDesignMessage(error.message || 'No se pudo guardar el diseño.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Guardar diseño';
  }
});

musicControl('music-preview-overlay').addEventListener('click', () => {
  window.open('/overlay', '_blank');
});

musicControl('music-floating-overlay').addEventListener('click', async () => {
  const button = musicControl('music-floating-overlay');
  if (!window.noteLiveDesktop || !window.noteLiveDesktop.toggleFloatingOverlay) {
    setMusicDesignMessage('La mini ventana flotante está disponible en la aplicación de escritorio.', 'error');
    return;
  }
  try {
    const result = await window.noteLiveDesktop.toggleFloatingOverlay();
    button.textContent = result && result.open ? 'Cerrar mini overlay flotante' : 'Mostrar mini overlay flotante';
  } catch (error) {
    setMusicDesignMessage(error.message || 'No se pudo abrir la mini ventana.', 'error');
  }
});

musicControl('music-audio-capture-toggle').addEventListener('click', () => {
  if (activeAudioCapture) stopSystemAudioVisualizer(true);
  else startSystemAudioVisualizer();
});

[
  'music-notification-duration',
  'music-card-opacity',
  'music-visualizer-sensitivity',
  'music-visualizer-height'
].forEach(id => musicControl(id).addEventListener('input', updateMusicValueLabels));

if (!window.noteLiveDesktop || !window.noteLiveDesktop.isDesktopApp) {
  musicControl('music-floating-overlay').disabled = true;
}


// Twitch workspace: OAuth state, follower alerts, chat browser source and optional ElevenLabs reading.
const twitchRenderedIds = new Set();
const twitchMessage = $('#twitch-message');
let latestTwitchState = {};
let latestTwitchAlertMedia = { imageUrl: '', imageMimeType: '', imageFit: 'contain', soundUrl: '', soundMimeType: '', soundDurationSeconds: 0 };

function setTwitchMessage(text, kind = '') {
  message(twitchMessage, text, kind);
}

function renderTwitchStatus(data = {}) {
  latestTwitchState = data;
  const tag = $('#twitch-status-tag');
  const title = $('#twitch-status-title');
  const desc = $('#twitch-status-desc');
  const disconnect = $('#twitch-disconnect');
  const connect = $('#twitch-connect');
  const clientIdInput = $('#twitch-client-id');
  const publicClient = data.publicClient === true;
  const hasAuthSetup = Boolean(data.hasClientId) && (publicClient || Boolean(data.hasClientSecret));
  const legacyConfig = $('#twitch-legacy-config');
  const publicNote = $('#twitch-public-client-note');
  const saveCredentials = $('#twitch-save-connection');
  const deviceFlowPanel = $('#twitch-device-flow-panel');
  if (legacyConfig) legacyConfig.hidden = publicClient;
  if (publicNote) publicNote.hidden = !publicClient;
  if (saveCredentials) saveCredentials.hidden = publicClient;
  if (data.clientId && document.activeElement !== clientIdInput) clientIdInput.value = data.clientId;
  if (data.redirectUri) $('#twitch-redirect-uri').textContent = data.redirectUri;
  if (data.alertUrl) $('#twitch-alert-url').textContent = data.alertUrl;
  if (data.chatOverlayUrl) $('#twitch-chat-url').textContent = data.chatOverlayUrl;
  tag.classList.remove('online');
  disconnect.hidden = !data.authorized;
  const authInProgress = ['authorizing', 'connecting', 'reconnecting'].includes(data.status);
  connect.disabled = Boolean(data.connected || data.authorized || authInProgress) || !data.hasClientId || (!publicClient && !data.hasClientSecret);

  if (data.connected) {
    title.textContent = 'Conectado a Twitch: ' + (data.username || 'tu canal');
    desc.textContent = 'El chat y las alertas están conectados.' + (data.error ? ' Aviso: ' + data.error : '');
    tag.textContent = 'CONNECTED';
    tag.classList.add('online');
  } else if (data.status === 'authorizing') {
    title.textContent = 'Autoriza NoteLive Studio en Twitch';
    desc.textContent = 'Confirma el código en la página de Twitch para conceder los permisos solicitados.';
    tag.textContent = 'AUTHORIZE';
  } else if (data.status === 'connecting') {
    title.textContent = 'Conectando con Twitch…';
    desc.textContent = data.error || 'Autorización recibida; activando chat y alertas.';
    tag.textContent = 'CONNECTING';
  } else if (data.status === 'reconnecting') {
    title.textContent = 'Reconectando con Twitch…';
    desc.textContent = data.error || 'Intentando restablecer el chat y los follows.';
    tag.textContent = 'RECONNECTING';
  } else if (data.status === 'error') {
    title.textContent = 'Twitch necesita atención';
    desc.textContent = data.error || 'Revisa la autorización de tu cuenta de Twitch.';
    tag.textContent = 'ERROR';
    if (deviceFlowPanel) deviceFlowPanel.hidden = true;
  } else {
    title.textContent = 'Twitch no conectado';
    desc.textContent = data.error || (hasAuthSetup
      ? (publicClient ? 'Pulsa Conectar cuenta Twitch para autorizar con un código.' : 'Las credenciales están guardadas. Autoriza la cuenta para iniciar chat y alertas.')
      : 'Guarda Client ID y Client Secret de tu aplicación de Twitch.');
    tag.textContent = hasAuthSetup ? 'READY' : 'SETUP';
  }
  if (deviceFlowPanel && (data.connected || data.status === 'connecting' || data.status === 'reconnecting' || data.status === 'disconnected')) {
    deviceFlowPanel.hidden = true;
  }
}

function applyTwitchSettings(alertConfig = {}, chatConfig = {}, readChat = true) {
  const alert = { enabled: true, style: 'card', durationSeconds: 7, accentColor: '#a970ff', title: '¡Nuevo follow!', message: '{username} ahora te sigue', soundEnabled: true, imageUrl: '', imageMimeType: '', imageFit: 'contain', soundUrl: '', soundMimeType: '', soundDurationSeconds: 0, ...(alertConfig || {}) };
  latestTwitchAlertMedia = {
    imageUrl: alert.imageUrl || '', imageMimeType: alert.imageMimeType || '',
    imageFit: alert.imageFit === 'cover' ? 'cover' : 'contain',
    soundUrl: alert.soundUrl || '', soundMimeType: alert.soundMimeType || '',
    soundDurationSeconds: Number(alert.soundDurationSeconds) || 0
  };
  const imagePreview = $('#twitch-alert-image-preview-img');
  const imageEmpty = $('#twitch-alert-image-empty');
  if (imagePreview) {
    imagePreview.hidden = !latestTwitchAlertMedia.imageUrl;
    imagePreview.style.objectFit = latestTwitchAlertMedia.imageFit;
    if (latestTwitchAlertMedia.imageUrl) imagePreview.src = latestTwitchAlertMedia.imageUrl;
    else imagePreview.removeAttribute('src');
  }
  if (imageEmpty) imageEmpty.hidden = Boolean(latestTwitchAlertMedia.imageUrl);
  const imageRemove = $('#twitch-alert-image-remove');
  if (imageRemove) imageRemove.hidden = !latestTwitchAlertMedia.imageUrl;
  const fitControl = $('#twitch-alert-image-fit');
  if (fitControl && document.activeElement !== fitControl) fitControl.value = latestTwitchAlertMedia.imageFit;
  const soundPreview = $('#twitch-alert-sound-preview');
  const soundStatus = $('#twitch-alert-sound-status');
  if (soundPreview) {
    soundPreview.hidden = !latestTwitchAlertMedia.soundUrl;
    if (latestTwitchAlertMedia.soundUrl) soundPreview.src = latestTwitchAlertMedia.soundUrl;
    else { soundPreview.pause(); soundPreview.removeAttribute('src'); soundPreview.load(); }
  }
  if (soundStatus) soundStatus.textContent = latestTwitchAlertMedia.soundUrl
    ? 'Sonido personalizado guardado · ' + latestTwitchAlertMedia.soundDurationSeconds + ' s'
    : 'Sonido integrado de NoteLive Studio';
  const soundRemove = $('#twitch-alert-sound-remove');
  if (soundRemove) soundRemove.hidden = !latestTwitchAlertMedia.soundUrl;
  const chat = { enabled: true, accentColor: '#a970ff', backgroundOpacity: 82, maxMessages: 6, fontSize: 17, showTimestamp: false, compact: false, ...(chatConfig || {}) };
  const assign = (id, value) => {
    const control = $('#' + id);
    if (control && document.activeElement !== control) {
      if (control.type === 'checkbox') control.checked = value !== false;
      else control.value = String(value);
    }
  };
  assign('twitch-alert-enabled', alert.enabled);
  assign('twitch-alert-sound', alert.soundEnabled);
  assign('twitch-alert-style', alert.style);
  assign('twitch-alert-color', alert.accentColor);
  assign('twitch-alert-duration', alert.durationSeconds);
  assign('twitch-alert-title', alert.title);
  assign('twitch-alert-message', alert.message);
  assign('twitch-chat-overlay-enabled', chat.enabled);
  assign('twitch-chat-color', chat.accentColor);
  assign('twitch-chat-opacity', chat.backgroundOpacity);
  assign('twitch-chat-max', chat.maxMessages);
  assign('twitch-chat-font-size', chat.fontSize);
  assign('twitch-chat-timestamps', chat.showTimestamp);
  assign('twitch-chat-compact', chat.compact);
  assign('twitch-read-chat', readChat);
  updateTwitchValueLabels();
}

function readTwitchAlertConfig() {
  return {
    enabled: $('#twitch-alert-enabled').checked,
    soundEnabled: $('#twitch-alert-sound').checked,
    style: $('#twitch-alert-style').value,
    accentColor: $('#twitch-alert-color').value,
    durationSeconds: Number($('#twitch-alert-duration').value),
    title: $('#twitch-alert-title').value,
    message: $('#twitch-alert-message').value,
    imageUrl: latestTwitchAlertMedia.imageUrl,
    imageMimeType: latestTwitchAlertMedia.imageMimeType,
    imageFit: $('#twitch-alert-image-fit')?.value || latestTwitchAlertMedia.imageFit,
    soundUrl: latestTwitchAlertMedia.soundUrl,
    soundMimeType: latestTwitchAlertMedia.soundMimeType,
    soundDurationSeconds: latestTwitchAlertMedia.soundDurationSeconds
  };
}

function readTwitchChatConfig() {
  return {
    enabled: $('#twitch-chat-overlay-enabled').checked,
    accentColor: $('#twitch-chat-color').value,
    backgroundOpacity: Number($('#twitch-chat-opacity').value),
    maxMessages: Number($('#twitch-chat-max').value),
    fontSize: Number($('#twitch-chat-font-size').value),
    showTimestamp: $('#twitch-chat-timestamps').checked,
    compact: $('#twitch-chat-compact').checked
  };
}

function updateTwitchValueLabels() {
  $('#twitch-alert-duration-value').textContent = $('#twitch-alert-duration').value + ' s';
  $('#twitch-chat-opacity-value').textContent = $('#twitch-chat-opacity').value + '%';
  $('#twitch-chat-font-size-value').textContent = $('#twitch-chat-font-size').value + ' px';
}

function appendTwitchChatMessage(item) {
  if (!item || !item.id || twitchRenderedIds.has(item.id)) return;
  twitchRenderedIds.add(item.id);
  if (twitchRenderedIds.size > 300) twitchRenderedIds.clear();
  const feed = $('#twitch-chat-feed');
  const empty = feed.querySelector('.empty-chat');
  if (empty) empty.remove();
  const row = document.createElement('article');
  row.className = 'chat-item twitch-chat-message-row';
  row.dataset.messageId = item.id;
  row.classList.toggle('no-avatar', !unifiedChatConfig.showAvatars);
  const avatar = makeChatAvatar(item, 'avatar-twitch');
  const content = document.createElement('div');
  content.className = 'twitch-chat-message-content';
  const header = document.createElement('div');
  header.className = 'twitch-chat-message-header';
  const user = document.createElement('strong');
  user.className = 'chat-user';
  user.textContent = item.username || 'Usuario';
  header.appendChild(user);
  appendUnifiedRoleBadges(header, item);
  if (unifiedChatConfig.showTimestamp) {
    const time = document.createElement('time');
    time.className = 'chat-time';
    time.textContent = new Date(item.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    header.appendChild(time);
  }
  const comment = document.createElement('div');
  comment.className = 'chat-comment';
  renderChatMessageContent(comment, item);
  const status = document.createElement('div');
  status.className = 'chat-state';
  if (item.shouldSpeak) status.textContent = '✓ Preparado para ElevenLabs';
  else if (item.commandUsed) status.textContent = 'Comando de voz recibido';
  else status.textContent = 'No se leerá (voz desactivada o filtro antispam)';
  content.append(header, comment, status);
  row.append(avatar, content);
  feed.appendChild(row);
  while (feed.querySelectorAll('.chat-item').length > 30) feed.querySelector('.chat-item')?.remove();
  $('#twitch-chat-count').textContent = feed.querySelectorAll('.chat-item').length + ' mensajes';
  feed.scrollTop = feed.scrollHeight;
}

function updateTwitchChatAvatar(item) {
  if (!item || !item.id || !item.avatarUrl) return;
  const row = Array.from($('#twitch-chat-feed').querySelectorAll('.twitch-chat-message-row')).find(node => node.dataset.messageId === item.id);
  if (!row) return;
  const avatar = row.querySelector('.chat-avatar');
  if (avatar) avatar.replaceWith(makeChatAvatar({ ...item, username: row.querySelector('.chat-user')?.textContent || 'Usuario' }, 'avatar-twitch'));
}

function renderTwitchChatHistory(items = []) {
  const feed = $('#twitch-chat-feed');
  feed.replaceChildren();
  twitchRenderedIds.clear();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-chat';
    empty.textContent = 'Conecta tu cuenta; los mensajes nuevos aparecerán aquí.';
    feed.appendChild(empty);
  } else {
    items.slice(0, 30).reverse().forEach(appendTwitchChatMessage);
  }
  $('#twitch-chat-count').textContent = items.length + ' mensajes';
}

function copyTwitchValue(elementId) {
  const textToCopy = $('#' + elementId).textContent.trim();
  navigator.clipboard.writeText(textToCopy).then(
    () => setTwitchMessage('URL copiada: ' + textToCopy, 'success'),
    () => setTwitchMessage('No se pudo copiar automáticamente. Selecciona y copia la URL mostrada.', 'error')
  );
}

async function saveTwitchSettings(successMessage = 'Configuración de Twitch guardada.') {
  const clientId = $('#twitch-client-id').value.trim();
  const clientSecret = $('#twitch-client-secret').value.trim();
  const payload = {
    clientId,
    clientSecret,
    readChat: $('#twitch-read-chat').checked,
    alertConfig: readTwitchAlertConfig(),
    chatConfig: readTwitchChatConfig()
  };
  const response = await postJson('/api/twitch/config', payload);
  renderTwitchStatus(response.twitch || {});
  applyTwitchSettings(response.twitch?.alertConfig, response.twitch?.chatConfig, response.twitch?.readChat);
  $('#twitch-client-secret').value = '';
  setTwitchMessage(successMessage, 'success');
  return response.twitch || {};
}

$('#twitch-save-connection').addEventListener('click', async () => {
  const button = $('#twitch-save-connection');
  button.disabled = true;
  try {
    await saveTwitchSettings('Credenciales guardadas localmente.');
  } catch (error) {
    setTwitchMessage(error.message || 'No se pudieron guardar las credenciales.', 'error');
  } finally {
    button.disabled = false;
  }
});

$('#twitch-connect').addEventListener('click', async () => {
  const button = $('#twitch-connect');
  button.disabled = true;
  try {
    const state = await saveTwitchSettings('Preparando la conexión segura con Twitch…');
    if (state.publicClient) {
      if (!state.hasClientId) {
        setTwitchMessage('Esta versión no tiene configurado el Client ID público de Twitch.', 'error');
        return;
      }
      const flow = await postJson('/api/twitch/device/start', {});
      $('#twitch-device-code').textContent = flow.userCode;
      $('#twitch-device-verification-link').href = flow.verificationUri;
      const minutes = Math.max(1, Math.ceil(Number(flow.expiresIn || 1800) / 60));
      $('#twitch-device-expiry').textContent = 'El código caduca en aproximadamente ' + minutes + ' minutos. Si vence, genera uno nuevo.';
      $('#twitch-device-flow-panel').hidden = false;
      setTwitchMessage('Código generado. Abre Twitch y confirma el código para terminar la conexión.', 'success');
      // In Electron, external links are routed to the system browser by main.cjs.
      // The visible link remains available if the browser blocks automatic opening.
      try { window.open(flow.verificationUri, '_blank', 'noopener'); } catch {}
      return;
    }

    if (!state.hasClientId || !state.hasClientSecret) {
      setTwitchMessage('Primero pega y guarda el Client ID y el Client Secret de Twitch.', 'error');
      return;
    }
    if (window.noteLiveDesktop && window.noteLiveDesktop.openTwitchLogin) {
      await window.noteLiveDesktop.openTwitchLogin();
    } else {
      window.open('/twitch/connect', '_blank', 'noopener');
    }
  } catch (error) {
    setTwitchMessage(error.message || 'No se pudo iniciar la conexión con Twitch.', 'error');
  } finally {
    const authInProgress = ['authorizing', 'connecting', 'reconnecting'].includes(latestTwitchState.status);
    button.disabled = Boolean(latestTwitchState.connected || latestTwitchState.authorized || authInProgress) || !latestTwitchState.hasClientId || (!latestTwitchState.publicClient && !latestTwitchState.hasClientSecret);
  }
});

$('#twitch-disconnect').addEventListener('click', async () => {
  const button = $('#twitch-disconnect');
  button.disabled = true;
  try {
    const response = await postJson('/api/twitch/disconnect', {});
    renderTwitchStatus(response.twitch || {});
    $('#twitch-device-flow-panel').hidden = true;
    setTwitchMessage('Twitch desconectado. Puedes volver a conectarlo cuando quieras.', 'success');
  } catch (error) {
    setTwitchMessage(error.message || 'No se pudo desconectar Twitch.', 'error');
  } finally {
    button.disabled = false;
  }
});

$('#twitch-copy-device-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#twitch-device-code').textContent.trim());
    setTwitchMessage('Código de autorización copiado.', 'success');
  } catch {
    setTwitchMessage('No se pudo copiar automáticamente. Selecciona el código y cópialo.', 'error');
  }
});

$('#twitch-device-cancel').addEventListener('click', async () => {
  const button = $('#twitch-device-cancel');
  button.disabled = true;
  try {
    const response = await postJson('/api/twitch/device/cancel', {});
    $('#twitch-device-flow-panel').hidden = true;
    renderTwitchStatus(response.twitch || {});
    setTwitchMessage('Autorización cancelada.', '');
  } catch (error) {
    setTwitchMessage(error.message || 'No se pudo cancelar la autorización.', 'error');
  } finally {
    button.disabled = false;
  }
});

async function saveTwitchWithMessage(text) {
  const button = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
  if (button) button.disabled = true;
  try {
    await saveTwitchSettings(text);
  } catch (error) {
    setTwitchMessage(error.message || 'No se pudieron guardar los ajustes.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}
$('#twitch-save-alerts').addEventListener('click', async () => {
  try { await saveTwitchSettings('Alerta de follow guardada.'); setTwitchAlertMediaMessage('Diseño de alerta guardado.', 'success'); }
  catch (error) { setTwitchAlertMediaMessage(error.message || 'No se pudo guardar la alerta.', 'error'); }
});
$('#twitch-save-chat').addEventListener('click', () => saveTwitchWithMessage('Ajustes de chat y lectura guardados.'));

$('#twitch-test-follow').addEventListener('click', async () => {
  try {
    await saveTwitchSettings('Probando la alerta…');
    await postJson('/api/twitch/test-follow', { username: 'NoukanTest' });
    setTwitchMessage('Alerta de prueba enviada. Comprueba la fuente del overlay en OBS.', 'success');
  } catch (error) {
    setTwitchMessage(error.message || 'No se pudo probar la alerta.', 'error');
  }
});



function setTwitchAlertMediaMessage(text, kind = '') { message($('#twitch-alert-media-message'), text, kind); }
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('No se pudo leer el archivo.'));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}
function readAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    const cleanup = () => { URL.revokeObjectURL(url); audio.removeAttribute('src'); audio.load(); };
    audio.onloadedmetadata = () => {
      const duration = Number(audio.duration); cleanup();
      if (!Number.isFinite(duration) || duration <= 0) reject(new Error('No se pudo comprobar la duración. Prueba con un MP3 o WAV normal.'));
      else resolve(duration);
    };
    audio.onerror = () => { cleanup(); reject(new Error('El navegador no pudo leer ese audio. Prueba con MP3, WAV u OGG.')); };
    audio.src = url;
  });
}
async function uploadTwitchAlertMedia(file, mediaType) {
  if (!file) return;
  const isImage = mediaType === 'image';
  const maxBytes = (isImage ? 10 : 5) * 1024 * 1024;
  const supportedImageTypes = ['image/png','image/jpeg','image/webp','image/gif','image/avif'];
  const supportedAudioTypes = ['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/ogg','audio/mp4','audio/aac','audio/webm','audio/flac'];
  const supported = isImage ? supportedImageTypes : supportedAudioTypes;
  if (file.size > maxBytes) throw new Error(isImage ? 'La imagen/GIF debe pesar 10 MB o menos.' : 'El sonido debe pesar 5 MB o menos.');
  if (!supported.includes(String(file.type || '').toLowerCase())) {
    throw new Error(isImage ? 'Formato no compatible. Usa PNG, JPG, WebP, AVIF o GIF.' : 'Formato no compatible. Usa MP3, WAV, OGG, M4A/MP4, AAC, WebM o FLAC.');
  }
  let durationSeconds = 0;
  if (!isImage) {
    durationSeconds = await readAudioDuration(file);
    if (durationSeconds > 10.05) throw new Error('El sonido debe durar 10 segundos o menos.');
  }
  const payload = { mediaType, mimeType: file.type.toLowerCase(), dataUrl: await readFileAsDataUrl(file) };
  if (!isImage) payload.durationSeconds = durationSeconds;
  const result = await postJson('/api/twitch/alert-media', payload);
  applyTwitchSettings(result.alertConfig || {}, latestTwitchState.chatConfig || {}, latestTwitchState.readChat !== false);
  setTwitchAlertMediaMessage(isImage ? 'Imagen/GIF guardado. El GIF conserva su animación.' : 'Sonido guardado correctamente.', 'success');
}
async function removeTwitchAlertMedia(mediaType) {
  try {
    const result = await postJson('/api/twitch/alert-media', { mediaType, remove: true });
    applyTwitchSettings(result.alertConfig || {}, latestTwitchState.chatConfig || {}, latestTwitchState.readChat !== false);
    setTwitchAlertMediaMessage(mediaType === 'image' ? 'Imagen quitada.' : 'Sonido quitado; se usará el sonido integrado.', 'success');
  } catch (error) { setTwitchAlertMediaMessage(error.message || 'No se pudo quitar el archivo.', 'error'); }
}
$('#twitch-alert-image-choose').addEventListener('click', () => $('#twitch-alert-image-file').click());
$('#twitch-alert-image-file').addEventListener('change', async event => {
  const input = event.currentTarget;
  try { if (!input.files?.[0]) return; setTwitchAlertMediaMessage('Guardando imagen/GIF…'); await uploadTwitchAlertMedia(input.files[0], 'image'); }
  catch (error) { setTwitchAlertMediaMessage(error.message || 'No se pudo guardar la imagen/GIF.', 'error'); }
  finally { input.value = ''; }
});
$('#twitch-alert-image-remove').addEventListener('click', () => removeTwitchAlertMedia('image'));
$('#twitch-alert-image-fit').addEventListener('change', () => {
  latestTwitchAlertMedia.imageFit = $('#twitch-alert-image-fit').value;
  const preview = $('#twitch-alert-image-preview-img');
  if (preview) preview.style.objectFit = latestTwitchAlertMedia.imageFit;
});
$('#twitch-alert-sound-choose').addEventListener('click', () => $('#twitch-alert-sound-file').click());
$('#twitch-alert-sound-file').addEventListener('change', async event => {
  const input = event.currentTarget;
  try { if (!input.files?.[0]) return; setTwitchAlertMediaMessage('Comprobando y guardando sonido…'); await uploadTwitchAlertMedia(input.files[0], 'audio'); }
  catch (error) { setTwitchAlertMediaMessage(error.message || 'No se pudo guardar el sonido.', 'error'); }
  finally { input.value = ''; }
});
$('#twitch-alert-sound-remove').addEventListener('click', () => removeTwitchAlertMedia('audio'));
$('#twitch-alert-sound-test').addEventListener('click', async () => {
  if (!latestTwitchAlertMedia.soundUrl) {
    try { await saveTwitchSettings('Configuración guardada.'); await postJson('/api/twitch/test-follow', { username: 'NoukanTest' }); }
    catch (error) { setTwitchAlertMediaMessage(error.message || 'No se pudo probar el sonido.', 'error'); }
    return;
  }
  const audio = $('#twitch-alert-sound-preview');
  try { audio.currentTime = 0; await audio.play(); setTwitchAlertMediaMessage('Reproduciendo el sonido personalizado.', 'success'); }
  catch { setTwitchAlertMediaMessage('El navegador bloqueó la reproducción. Prueba la alerta desde OBS.', 'error'); }
});

$('#twitch-preview-alert').addEventListener('click', async () => {
  try { await saveTwitchSettings('Configuración guardada. Abriendo vista previa…'); window.open('/twitch-overlay?preview=1', '_blank', 'noopener'); }
  catch (error) { setTwitchAlertMediaMessage(error.message || 'No se pudo abrir la vista previa.', 'error'); }
});
$('#twitch-preview-chat').addEventListener('click', () => window.open('/twitch-chat-overlay?preview=1', '_blank'));
$('#twitch-copy-redirect').addEventListener('click', () => copyTwitchValue('twitch-redirect-uri'));
$('#twitch-copy-alert-url').addEventListener('click', () => copyTwitchValue('twitch-alert-url'));
$('#twitch-copy-chat-url').addEventListener('click', () => copyTwitchValue('twitch-chat-url'));

[
  'twitch-alert-duration', 'twitch-chat-opacity', 'twitch-chat-font-size'
].forEach(id => $('#' + id).addEventListener('input', updateTwitchValueLabels));

function readUnifiedChatConfig() {
  return {
    fontFamily: $('#unified-chat-font').value,
    fontSize: Number($('#unified-chat-font-size').value),
    usernameColor: $('#unified-chat-username-color').value,
    messageColor: $('#unified-chat-message-color').value,
    twitchAccent: $('#unified-chat-twitch-color').value,
    tiktokAccent: $('#unified-chat-tiktok-color').value,
    backgroundOpacity: Number($('#unified-chat-opacity').value),
    maxMessages: Number($('#unified-chat-max').value),
    showAvatars: $('#unified-chat-avatars').checked,
    showBadges: $('#unified-chat-badges').checked,
    showPlatformBadge: $('#unified-chat-platform-badge').checked,
    showTimestamp: $('#unified-chat-timestamps').checked,
    compact: $('#unified-chat-compact').checked
  };
}

function applyUnifiedChatConfig(input = {}, updateControls = true) {
  unifiedChatConfig = { ...unifiedChatConfig, ...(input || {}) };
  const assign = (id, value) => {
    const control = $('#' + id);
    if (!control || (!updateControls && document.activeElement === control)) return;
    if (control.type === 'checkbox') control.checked = value !== false;
    else control.value = String(value);
  };
  assign('unified-chat-font', unifiedChatConfig.fontFamily);
  assign('unified-chat-font-size', unifiedChatConfig.fontSize);
  assign('unified-chat-username-color', unifiedChatConfig.usernameColor);
  assign('unified-chat-message-color', unifiedChatConfig.messageColor);
  assign('unified-chat-twitch-color', unifiedChatConfig.twitchAccent);
  assign('unified-chat-tiktok-color', unifiedChatConfig.tiktokAccent);
  assign('unified-chat-opacity', unifiedChatConfig.backgroundOpacity);
  assign('unified-chat-max', unifiedChatConfig.maxMessages);
  assign('unified-chat-avatars', unifiedChatConfig.showAvatars);
  assign('unified-chat-badges', unifiedChatConfig.showBadges);
  assign('unified-chat-platform-badge', unifiedChatConfig.showPlatformBadge);
  assign('unified-chat-timestamps', unifiedChatConfig.showTimestamp);
  assign('unified-chat-compact', unifiedChatConfig.compact);

  const root = document.documentElement;
  root.style.setProperty('--unified-chat-font', UNIFIED_CHAT_FONT_STACKS[unifiedChatConfig.fontFamily] || UNIFIED_CHAT_FONT_STACKS.modern);
  root.style.setProperty('--unified-chat-font-size', Math.max(12, Math.min(22, Number(unifiedChatConfig.fontSize) || 15)) + 'px');
  root.style.setProperty('--unified-chat-username-color', unifiedChatConfig.usernameColor || '#f3f5fa');
  root.style.setProperty('--unified-chat-message-color', unifiedChatConfig.messageColor || '#e7ebf2');
  root.style.setProperty('--unified-chat-twitch-accent', unifiedChatConfig.twitchAccent || '#b58aff');
  root.style.setProperty('--unified-chat-tiktok-accent', unifiedChatConfig.tiktokAccent || '#50e5c1');
  root.style.setProperty('--unified-chat-background-opacity', String(Math.max(0.25, Math.min(1, Number(unifiedChatConfig.backgroundOpacity || 88) / 100))));
  root.dataset.unifiedChatCompact = String(unifiedChatConfig.compact === true);
  $('#unified-chat-font-size-value').textContent = unifiedChatConfig.fontSize + ' px';
  $('#unified-chat-opacity-value').textContent = unifiedChatConfig.backgroundOpacity + '%';
  renderUnifiedChatFeed();
}

function readTwitchVoiceCommandConfig() {
  return {
    enabled: $('#unified-voice-command-enabled').checked,
    moderatorsCanUse: $('#unified-voice-command-mods').checked
  };
}

function applyTwitchVoiceCommandConfig(input = {}) {
  twitchVoiceCommandConfig = { ...twitchVoiceCommandConfig, ...(input || {}) };
  $('#unified-voice-command-enabled').checked = twitchVoiceCommandConfig.enabled !== false;
  $('#unified-voice-command-mods').checked = twitchVoiceCommandConfig.moderatorsCanUse === true;
}

async function saveUnifiedChatSettings(kind = 'all') {
  const messageBox = kind === 'command' ? $('#unified-voice-command-message') : $('#unified-chat-settings-message');
  const saveButton = kind === 'command' ? $('#unified-voice-command-save') : $('#unified-chat-save-settings');
  saveButton.disabled = true;
  message(messageBox, 'Guardando configuración…');
  try {
    const response = await postJson('/api/chat/config', {
      config: readUnifiedChatConfig(),
      voiceCommand: readTwitchVoiceCommandConfig()
    });
    applyUnifiedChatConfig(response.config || readUnifiedChatConfig());
    applyTwitchVoiceCommandConfig(response.voiceCommand || readTwitchVoiceCommandConfig());
    message(messageBox, kind === 'command' ? 'Comando guardado.' : 'Personalización guardada para el chat y OBS.', 'success');
  } catch (error) {
    message(messageBox, error.message || 'No se pudo guardar la personalización.', 'error');
  } finally {
    saveButton.disabled = false;
  }
}

const unifiedChatSettingsIds = [
  'unified-chat-font', 'unified-chat-font-size', 'unified-chat-username-color',
  'unified-chat-message-color', 'unified-chat-twitch-color', 'unified-chat-tiktok-color',
  'unified-chat-opacity', 'unified-chat-max', 'unified-chat-avatars', 'unified-chat-badges',
  'unified-chat-platform-badge', 'unified-chat-timestamps', 'unified-chat-compact'
];
for (const id of unifiedChatSettingsIds) {
  const control = $('#' + id);
  control.addEventListener('input', () => applyUnifiedChatConfig(readUnifiedChatConfig(), false));
  control.addEventListener('change', () => applyUnifiedChatConfig(readUnifiedChatConfig(), false));
}
$('#unified-chat-save-settings').addEventListener('click', () => saveUnifiedChatSettings('all'));
$('#unified-voice-command-save').addEventListener('click', () => saveUnifiedChatSettings('command'));

const unifiedChatEvents = new EventSource('/api/chat/events');
unifiedChatEvents.addEventListener('message', event => {
  try {
    const packet = JSON.parse(event.data);
    if (packet.type === 'init') {
      unifiedChatMessages = (packet.history || []).slice(0, 120).sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
      if (packet.overlayUrl) $('#unified-chat-url').textContent = packet.overlayUrl;
      applyUnifiedChatConfig(packet.config || {});
      applyTwitchVoiceCommandConfig(packet.voiceCommand || {});
      renderUnifiedPlatformStatus(packet.platforms || {});
      renderUnifiedChatFeed();
    } else if (packet.type === 'status') {
      renderUnifiedPlatformStatus(packet.platforms || {});
    } else if (packet.type === 'config') {
      applyUnifiedChatConfig(packet.config || {});
      applyTwitchVoiceCommandConfig(packet.voiceCommand || {});
    } else if (packet.type === 'chat' && packet.message) {
      if (!unifiedChatMessages.some(item => item.id === packet.message.id)) {
        unifiedChatMessages.push(packet.message);
        unifiedChatMessages.sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
        if (unifiedChatMessages.length > 120) unifiedChatMessages = unifiedChatMessages.slice(-120);
        renderUnifiedChatFeed();
      }
    } else if (packet.type === 'chat-update' && packet.message) {
      const item = unifiedChatMessages.find(entry => entry.id === packet.message.id);
      if (item) {
        Object.assign(item, packet.message);
        renderUnifiedChatFeed();
      }
    }
  } catch {}
});
unifiedChatEvents.onerror = () => {};

document.querySelectorAll('[data-chat-filter]').forEach(button => {
  button.addEventListener('click', () => {
    unifiedChatFilter = button.dataset.chatFilter || 'all';
    document.querySelectorAll('[data-chat-filter]').forEach(other => {
      const active = other === button;
      other.classList.toggle('is-active', active);
      other.setAttribute('aria-pressed', String(active));
    });
    renderUnifiedChatFeed();
  });
});

$('#unified-chat-copy-url').addEventListener('click', async () => {
  const button = $('#unified-chat-copy-url');
  try {
    await navigator.clipboard.writeText($('#unified-chat-url').textContent.trim());
    button.textContent = 'Copiada ✓';
    setTimeout(() => { button.textContent = 'Copiar URL'; }, 1600);
  } catch {
    button.textContent = 'Selecciona y copia la URL';
  }
});
$('#unified-chat-preview').addEventListener('click', () => window.open('/unified-chat-overlay?preview=1', '_blank', 'noopener'));

function renderUnifiedPlatformStatus(platforms = {}) {
  for (const [platform, label] of [['tiktok', 'TikTok LIVE'], ['twitch', 'Twitch']]) {
    const element = $('#unified-' + platform + '-status');
    if (!element) continue;
    const state = platforms[platform] || {};
    element.classList.toggle('is-connected', state.connected === true);
    const username = state.username ? ' · @' + state.username : '';
    element.textContent = state.connected ? label + ' · conectado' + username : label + ' · desconectado';
    const dot = document.createElement('i');
    element.prepend(dot);
  }
}

function makeUnifiedPlatformBadge(platform) {
  const isTwitch = platform === 'twitch';
  const badge = document.createElement('span');
  badge.className = 'unified-source-badge ' + (isTwitch ? 'source-twitch' : 'source-tiktok');
  const platformName = isTwitch ? 'Twitch' : 'TikTok LIVE';
  badge.title = 'Mensaje enviado desde ' + platformName;
  badge.setAttribute('aria-label', platformName);

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.classList.add('source-platform-icon', isTwitch ? 'source-platform-icon-twitch' : 'source-platform-icon-tiktok');
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  if (isTwitch) {
    shape.setAttribute('d', 'M4 3H21V15L16 20H12L9 23V20H4V3Z');
    shape.setAttribute('fill', 'none');
    shape.setAttribute('stroke', 'currentColor');
    shape.setAttribute('stroke-width', '2.2');
    shape.setAttribute('stroke-linejoin', 'round');
    icon.appendChild(shape);
    const lines = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    lines.setAttribute('d', 'M10 7V13M15 7V13');
    lines.setAttribute('fill', 'none');
    lines.setAttribute('stroke', 'currentColor');
    lines.setAttribute('stroke-width', '2.2');
    icon.appendChild(lines);
  } else {
    shape.setAttribute('d', 'M14 4v10.2a4.2 4.2 0 1 1-3-4V7.4c1.1 1.9 2.6 3 5 3.3V7.6C14.4 7 14 5.9 14 4Z');
    shape.setAttribute('fill', 'currentColor');
    icon.appendChild(shape);
  }
  const label = document.createElement('span');
  label.textContent = isTwitch ? 'TWITCH' : 'TIKTOK LIVE';
  badge.append(icon, label);
  return badge;
}

function renderUnifiedChatFeed() {
  const feed = $('#unified-chat-feed');
  if (!feed) return;
  const filtered = unifiedChatMessages.filter(item => unifiedChatFilter === 'all' || item.platform === unifiedChatFilter);
  feed.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-chat';
    empty.textContent = unifiedChatFilter === 'all'
      ? 'Conecta Twitch o TikTok LIVE para ver los mensajes aquí.'
      : 'Todavía no hay mensajes de ' + (unifiedChatFilter === 'twitch' ? 'Twitch' : 'TikTok LIVE') + '.';
    feed.appendChild(empty);
    $('#unified-chat-count').textContent = '0 mensajes';
    return;
  }
  const shown = filtered.slice(-80);
  shown.forEach(item => {
    const row = document.createElement('article');
    const isTwitch = item.platform === 'twitch';
    row.className = 'chat-item unified-chat-message ' + (isTwitch ? 'source-twitch' : 'source-tiktok');
    row.classList.toggle('no-avatar', !unifiedChatConfig.showAvatars);
    row.dataset.platform = item.platform || 'tiktok';
    row.dataset.messageId = item.id;

    const avatar = makeChatAvatar(item, isTwitch ? 'avatar-twitch' : 'avatar-tiktok');
    const content = document.createElement('div');
    content.className = 'unified-message-content';

    const header = document.createElement('div');
    header.className = 'unified-message-header';
    if (unifiedChatConfig.showPlatformBadge) {
      header.appendChild(makeUnifiedPlatformBadge(item.platform));
    }
    const username = document.createElement('strong');
    username.className = 'chat-user';
    username.textContent = item.username || 'Usuario';
    header.appendChild(username);
    appendUnifiedRoleBadges(header, item);
    if (unifiedChatConfig.showTimestamp) {
      const time = document.createElement('time');
      time.className = 'chat-time';
      time.textContent = new Date(item.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      header.appendChild(time);
    }

    const body = document.createElement('div');
    body.className = 'chat-comment unified-message-body';
    renderChatMessageContent(body, item);
    content.append(header, body);
    row.append(avatar, content);
    feed.appendChild(row);
  });
  $('#unified-chat-count').textContent = filtered.length + (filtered.length === 1 ? ' mensaje' : ' mensajes');
  feed.scrollTop = feed.scrollHeight;
}

const twitchEvents = new EventSource('/api/twitch/events');
twitchEvents.addEventListener('message', event => {
  try {
    const packet = JSON.parse(event.data);
    if (packet.type === 'init') {
      renderTwitchStatus(packet.status || {});
      applyTwitchSettings(packet.alertConfig || {}, packet.chatConfig || {}, packet.readChat !== false);
      renderTwitchChatHistory(packet.history || []);
    } else if (packet.type === 'status') {
      renderTwitchStatus(packet.status || {});
    } else if (packet.type === 'config') {
      if (packet.status) renderTwitchStatus(packet.status);
      applyTwitchSettings(packet.alertConfig || {}, packet.chatConfig || {}, packet.readChat !== false);
    } else if (packet.type === 'chat') {
      appendTwitchChatMessage(packet.message);
    } else if (packet.type === 'chat-update') {
      updateTwitchChatAvatar(packet.message);
    } else if (packet.type === 'follow' && packet.alert?.test) {
      setTwitchMessage('Alerta de prueba enviada correctamente.', 'success');
    } else if (packet.type === 'voice-config') {
      applyVoiceStatus(packet.voice || {});
    }
  } catch {}
});
twitchEvents.onerror = () => {};
