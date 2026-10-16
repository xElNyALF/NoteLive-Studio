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
  comment.textContent = item.comment || '';
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

// Main navigation: each service has its own workspace instead of a long page.
const viewMeta = {
  home: { eyebrow: 'STUDIO OVERVIEW', title: 'Tu centro creativo', subtitle: 'Un solo lugar para conectar, personalizar y controlar tus directos.' },
  twitch: { eyebrow: 'STREAMING PLATFORM', title: 'Twitch', subtitle: 'Un espacio preparado para futuras integraciones de chat y alertas.' },
  spotify: { eyebrow: 'MUSIC INTEGRATION', title: 'Spotify', subtitle: 'Conecta tu música y personaliza la notificación que verán tus espectadores.' },
  tiktok: { eyebrow: 'COMMUNITY / LIVE CHAT', title: 'TikTok LIVE', subtitle: 'Mensajes del chat, estado del directo y conexión con el lector de voz.' },
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
  if (data.clientId && document.activeElement !== clientIdInput) clientIdInput.value = data.clientId;
  if (data.redirectUri) $('#twitch-redirect-uri').textContent = data.redirectUri;
  if (data.alertUrl) $('#twitch-alert-url').textContent = data.alertUrl;
  if (data.chatOverlayUrl) $('#twitch-chat-url').textContent = data.chatOverlayUrl;
  tag.classList.remove('online');
  disconnect.hidden = !data.authorized;
  connect.disabled = Boolean(data.connected) || !data.hasClientId || !data.hasClientSecret;

  if (data.connected) {
    title.textContent = 'Conectado a Twitch: ' + (data.username || 'tu canal');
    desc.textContent = 'El chat y las alertas están conectados.' + (data.error ? ' Aviso: ' + data.error : '');
    tag.textContent = 'CONNECTED';
    tag.classList.add('online');
  } else if (data.status === 'connecting') {
    title.textContent = 'Conectando con Twitch…';
    desc.textContent = data.error || 'Autorización iniciada; esperando EventSub.';
    tag.textContent = 'CONNECTING';
  } else if (data.status === 'reconnecting') {
    title.textContent = 'Reconectando con Twitch…';
    desc.textContent = data.error || 'Intentando restablecer el chat y los follows.';
    tag.textContent = 'RECONNECTING';
  } else if (data.status === 'error') {
    title.textContent = 'Twitch necesita atención';
    desc.textContent = data.error || 'Revisa los permisos de tu aplicación de Twitch.';
    tag.textContent = 'ERROR';
  } else {
    title.textContent = 'Twitch no conectado';
    desc.textContent = data.error || (data.hasClientId && data.hasClientSecret
      ? 'Las credenciales están guardadas. Autoriza la cuenta para iniciar chat y alertas.'
      : 'Guarda Client ID y Client Secret de tu aplicación de Twitch.');
    tag.textContent = data.hasClientId && data.hasClientSecret ? 'READY' : 'SETUP';
  }
}

function applyTwitchSettings(alertConfig = {}, chatConfig = {}, readChat = true) {
  const alert = { enabled: true, style: 'card', durationSeconds: 7, accentColor: '#a970ff', title: '¡Nuevo follow!', message: '{username} ahora te sigue', soundEnabled: true, ...(alertConfig || {}) };
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
    message: $('#twitch-alert-message').value
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
  row.className = 'chat-item';
  const user = document.createElement('div');
  user.className = 'chat-user';
  user.textContent = item.username || 'Usuario';
  const time = document.createElement('div');
  time.className = 'chat-time';
  time.textContent = new Date(item.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const comment = document.createElement('div');
  comment.className = 'chat-comment';
  comment.textContent = item.comment || '';
  const status = document.createElement('div');
  status.className = 'chat-state';
  if (item.isModerator) status.textContent = 'MOD';
  else if (item.isVip) status.textContent = 'VIP';
  else if (item.isSubscriber) status.textContent = 'SUB';
  else status.textContent = item.shouldSpeak ? '✓ Preparado para ElevenLabs' : 'No se leerá (voz desactivada o filtro antispam)';
  row.append(user, time, comment, status);
  feed.appendChild(row);
  while (feed.querySelectorAll('.chat-item').length > 30) feed.querySelector('.chat-item')?.remove();
  $('#twitch-chat-count').textContent = feed.querySelectorAll('.chat-item').length + ' mensajes';
  feed.scrollTop = feed.scrollHeight;
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
    const state = await saveTwitchSettings('Configuración guardada. Abriendo Twitch para autorizar…');
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
    button.disabled = false;
  }
});

$('#twitch-disconnect').addEventListener('click', async () => {
  const button = $('#twitch-disconnect');
  button.disabled = true;
  try {
    const response = await postJson('/api/twitch/disconnect', {});
    renderTwitchStatus(response.twitch || {});
    setTwitchMessage('Twitch desconectado. Las credenciales de desarrollador se conservaron.', 'success');
  } catch (error) {
    setTwitchMessage(error.message || 'No se pudo desconectar Twitch.', 'error');
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
$('#twitch-save-alerts').addEventListener('click', () => saveTwitchWithMessage('Alerta de follow guardada.'));
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

$('#twitch-preview-alert').addEventListener('click', () => window.open('/twitch-overlay', '_blank'));
$('#twitch-preview-chat').addEventListener('click', () => window.open('/twitch-chat-overlay', '_blank'));
$('#twitch-copy-redirect').addEventListener('click', () => copyTwitchValue('twitch-redirect-uri'));
$('#twitch-copy-alert-url').addEventListener('click', () => copyTwitchValue('twitch-alert-url'));
$('#twitch-copy-chat-url').addEventListener('click', () => copyTwitchValue('twitch-chat-url'));

[
  'twitch-alert-duration', 'twitch-chat-opacity', 'twitch-chat-font-size'
].forEach(id => $('#' + id).addEventListener('input', updateTwitchValueLabels));

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
    } else if (packet.type === 'follow' && packet.alert?.test) {
      setTwitchMessage('Alerta de prueba enviada correctamente.', 'success');
    } else if (packet.type === 'voice-config') {
      applyVoiceStatus(packet.voice || {});
    }
  } catch {}
});
twitchEvents.onerror = () => {};
