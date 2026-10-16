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
  applyVoiceStatus(data.voice || {});
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
