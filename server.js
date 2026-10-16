'use strict';

// NoteLive Studio — servidor local para Spotify, TikTok LIVE y ElevenLabs.
// Escucha únicamente en loopback; no expongas este servicio a Internet.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const HOST = '127.0.0.1';
const PORT = Number(process.env.NOTE_LIVE_PORT || process.env.SPOTIFY_OVERLAY_PORT || 8787);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
// Desktop build stores settings/tokens in the user's app-data directory.
// The existing web-only workflow defaults to its project folder for backwards compatibility.
const DATA_DIR = path.resolve(process.env.NOTE_LIVE_DATA_DIR || ROOT);
fs.mkdirSync(DATA_DIR, { recursive: true });
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');
const TWITCH_TOKENS_FILE = path.join(DATA_DIR, 'twitch-tokens.json');
const REDIRECT_URI = `http://${HOST}:${PORT}/callback`;
const TWITCH_REDIRECT_URI = `http://localhost:${PORT}/twitch/callback`;
const TWITCH_PUBLIC_CLIENT_ID = String(process.env.NOTE_LIVE_TWITCH_PUBLIC_CLIENT_ID || '').trim();
const USE_TWITCH_PUBLIC_CLIENT = process.env.NOTE_LIVE_TWITCH_PUBLIC_CLIENT === '1' && TWITCH_PUBLIC_CLIENT_ID.length >= 8;
const TWITCH_DEVICE_SCOPES = 'moderator:read:followers user:read:chat';
const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const CURRENTLY_PLAYING_URL = 'https://api.spotify.com/v1/me/player/currently-playing?additional_types=track,episode';
const POLL_INTERVAL_MS = 5000;

const DEFAULT_OVERLAY_CONFIG = Object.freeze({
  notificationEnabled: true,
  preset: 'classic',
  notificationMode: 'timed',
  visualizerPlacement: 'separate',
  durationSeconds: 8,
  style: 'vinyl',
  position: 'top-left',
  accentColor: '#1ed760',
  cardOpacity: 92,
  showCover: true,
  showArtist: true,
  showProgress: true,
  visualizerEnabled: true,
  visualizerStyle: 'bars',
  visualizerColor: '#ff6b9a',
  visualizerSensitivity: 1.2,
  visualizerHeight: 34
});

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function normalizeOverlayConfig(value) {
  const input = value && typeof value === 'object' ? value : {};
  const validHex = candidate => typeof candidate === 'string' && /^#[0-9a-fA-F]{6}$/.test(candidate);
  const pick = (field, options) => options.includes(input[field]) ? input[field] : DEFAULT_OVERLAY_CONFIG[field];
  return {
    notificationEnabled: input.notificationEnabled !== false,
    preset: pick('preset', ['classic', 'aesthetic', 'spectrum', 'mini', 'neon', 'retro', 'orbit', 'cyberpunk', 'mono', 'always-on', 'custom']),
    notificationMode: pick('notificationMode', ['timed', 'persistent']),
    visualizerPlacement: pick('visualizerPlacement', ['separate', 'inside']),
    durationSeconds: Math.round(clampNumber(input.durationSeconds, 3, 20, DEFAULT_OVERLAY_CONFIG.durationSeconds)),
    style: pick('style', ['vinyl', 'glass', 'minimal']),
    position: pick('position', ['top-left', 'top-right', 'bottom-left', 'bottom-right']),
    accentColor: validHex(input.accentColor) ? input.accentColor : DEFAULT_OVERLAY_CONFIG.accentColor,
    cardOpacity: Math.round(clampNumber(input.cardOpacity, 40, 100, DEFAULT_OVERLAY_CONFIG.cardOpacity)),
    showCover: input.showCover !== false,
    showArtist: input.showArtist !== false,
    showProgress: input.showProgress !== false,
    visualizerEnabled: input.visualizerEnabled !== false,
    visualizerStyle: pick('visualizerStyle', ['bars', 'wave', 'mirror', 'circle']),
    visualizerColor: validHex(input.visualizerColor) ? input.visualizerColor : DEFAULT_OVERLAY_CONFIG.visualizerColor,
    visualizerSensitivity: clampNumber(input.visualizerSensitivity, 0.5, 2, DEFAULT_OVERLAY_CONFIG.visualizerSensitivity),
    visualizerHeight: Math.round(clampNumber(input.visualizerHeight, 20, 80, DEFAULT_OVERLAY_CONFIG.visualizerHeight))
  };
}


const DEFAULT_TWITCH_ALERT_CONFIG = Object.freeze({
  enabled: true,
  style: 'card',
  durationSeconds: 7,
  accentColor: '#a970ff',
  title: '¡Nuevo follow!',
  message: '{username} ahora te sigue',
  soundEnabled: true,
  imageUrl: '',
  imageMimeType: '',
  imageFit: 'contain',
  soundUrl: '',
  soundMimeType: '',
  soundDurationSeconds: 0
});

const DEFAULT_TWITCH_CHAT_CONFIG = Object.freeze({
  enabled: true,
  accentColor: '#a970ff',
  backgroundOpacity: 82,
  maxMessages: 6,
  fontSize: 17,
  showTimestamp: false,
  compact: false
});

const DEFAULT_UNIFIED_CHAT_CONFIG = Object.freeze({
  fontFamily: 'modern',
  fontSize: 15,
  usernameColor: '#f3f5fa',
  messageColor: '#e7ebf2',
  twitchAccent: '#b58aff',
  tiktokAccent: '#50e5c1',
  backgroundOpacity: 88,
  maxMessages: 8,
  showAvatars: true,
  showBadges: true,
  showPlatformBadge: true,
  showTimestamp: true,
  compact: false
});

const UNIFIED_CHAT_FONT_FAMILIES = new Set(['modern', 'windows', 'rounded', 'gaming', 'retro', 'serif', 'playful', 'elegant']);

function normalizeUnifiedChatConfig(value) {
  const input = value && typeof value === 'object' ? value : {};
  const validHex = candidate => typeof candidate === 'string' && /^#[0-9a-fA-F]{6}$/.test(candidate);
  const pick = (key, fallback) => validHex(input[key]) ? input[key] : fallback;
  return {
    fontFamily: UNIFIED_CHAT_FONT_FAMILIES.has(input.fontFamily) ? input.fontFamily : DEFAULT_UNIFIED_CHAT_CONFIG.fontFamily,
    fontSize: Math.round(clampNumber(input.fontSize, 12, 22, DEFAULT_UNIFIED_CHAT_CONFIG.fontSize)),
    usernameColor: pick('usernameColor', DEFAULT_UNIFIED_CHAT_CONFIG.usernameColor),
    messageColor: pick('messageColor', DEFAULT_UNIFIED_CHAT_CONFIG.messageColor),
    twitchAccent: pick('twitchAccent', DEFAULT_UNIFIED_CHAT_CONFIG.twitchAccent),
    tiktokAccent: pick('tiktokAccent', DEFAULT_UNIFIED_CHAT_CONFIG.tiktokAccent),
    backgroundOpacity: Math.round(clampNumber(input.backgroundOpacity, 25, 100, DEFAULT_UNIFIED_CHAT_CONFIG.backgroundOpacity)),
    maxMessages: Math.round(clampNumber(input.maxMessages, 3, 12, DEFAULT_UNIFIED_CHAT_CONFIG.maxMessages)),
    showAvatars: input.showAvatars !== false,
    showBadges: input.showBadges !== false,
    showPlatformBadge: input.showPlatformBadge !== false,
    showTimestamp: input.showTimestamp !== false,
    compact: input.compact === true
  };
}

function normalizeTwitchVoiceCommand(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    enabled: input.enabled !== false,
    moderatorsCanUse: input.moderatorsCanUse === true
  };
}

function normalizeTwitchAlertConfig(value) {
  const input = value && typeof value === 'object' ? value : {};
  const validHex = candidate => typeof candidate === 'string' && /^#[0-9a-fA-F]{6}$/.test(candidate);
  return {
    enabled: input.enabled !== false,
    style: ['card', 'neon', 'minimal', 'pixel', 'hologram', 'sakura', 'glitch', 'arcade', 'aurora', 'comic'].includes(input.style) ? input.style : DEFAULT_TWITCH_ALERT_CONFIG.style,
    durationSeconds: Math.round(clampNumber(input.durationSeconds, 3, 20, DEFAULT_TWITCH_ALERT_CONFIG.durationSeconds)),
    accentColor: validHex(input.accentColor) ? input.accentColor : DEFAULT_TWITCH_ALERT_CONFIG.accentColor,
    title: cleanConfigText(input.title, 64, DEFAULT_TWITCH_ALERT_CONFIG.title),
    message: cleanConfigText(input.message, 120, DEFAULT_TWITCH_ALERT_CONFIG.message).includes('{username}')
      ? cleanConfigText(input.message, 120, DEFAULT_TWITCH_ALERT_CONFIG.message)
      : DEFAULT_TWITCH_ALERT_CONFIG.message,
    soundEnabled: input.soundEnabled !== false,
    imageUrl: input.imageUrl === '/twitch-alert-media/image' ? input.imageUrl : '',
    imageMimeType: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(input.imageMimeType) ? input.imageMimeType : '',
    imageFit: input.imageFit === 'cover' ? 'cover' : 'contain',
    soundUrl: input.soundUrl === '/twitch-alert-media/audio' ? input.soundUrl : '',
    soundMimeType: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/flac'].includes(input.soundMimeType) ? input.soundMimeType : '',
    soundDurationSeconds: Math.round(clampNumber(input.soundDurationSeconds, 0, 10, 0))
  };
}

function normalizeTwitchChatConfig(value) {
  const input = value && typeof value === 'object' ? value : {};
  const validHex = candidate => typeof candidate === 'string' && /^#[0-9a-fA-F]{6}$/.test(candidate);
  return {
    enabled: input.enabled !== false,
    accentColor: validHex(input.accentColor) ? input.accentColor : DEFAULT_TWITCH_CHAT_CONFIG.accentColor,
    backgroundOpacity: Math.round(clampNumber(input.backgroundOpacity, 20, 100, DEFAULT_TWITCH_CHAT_CONFIG.backgroundOpacity)),
    maxMessages: Math.round(clampNumber(input.maxMessages, 2, 12, DEFAULT_TWITCH_CHAT_CONFIG.maxMessages)),
    fontSize: Math.round(clampNumber(input.fontSize, 12, 24, DEFAULT_TWITCH_CHAT_CONFIG.fontSize)),
    showTimestamp: input.showTimestamp === true,
    compact: input.compact === true
  };
}

function cleanConfigText(value, maxLength, fallback) {
  const text = String(value ?? fallback).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, maxLength);
}

let config = loadConfig();
let tokens = loadTokens();
let twitchTokens = loadTwitchTokens();
if (USE_TWITCH_PUBLIC_CLIENT && twitchTokens && twitchTokens.clientId && twitchTokens.clientId !== config.twitchClientId) {
  // A token from a different Twitch application cannot be refreshed with this public Client ID.
  try { fs.unlinkSync(TWITCH_TOKENS_FILE); } catch {}
  twitchTokens = null;
}
let pendingAuth = new Map();
let pendingTwitchAuth = new Map();
let pendingTwitchDeviceAuth = null;
let twitchSocket = null;
let twitchReconnectTimer = null;
let twitchSocketGeneration = 0;
let twitchShouldReconnect = true;
let twitchSessionId = '';
let recentTwitchChatMessages = [];
let recentTwitchAlert = null;
let twitchStatus = { connected: false, status: 'disconnected', username: twitchTokens?.username || '', broadcasterId: twitchTokens?.userId || '', error: '' };
let pollTimer = null;
let polling = false;
let lastError = '';
const sseClients = new Set();
const tiktokSseClients = new Set();
const overlaySseClients = new Set();
const twitchSseClients = new Set();
const unifiedChatSseClients = new Set();
let audioVisualizerState = { active: false, levels: Array(32).fill(0), rms: 0, updatedAt: Date.now() };
let tiktokConnection = null;
let tiktokStatus = { connected: false, status: 'disconnected', username: config.tiktokUsername || '', error: '' };
let recentChatMessages = [];
let recentUnifiedChatMessages = [];
const duplicateChatCache = new Map();
const userSpeechHistory = new Map();
const twitchVoiceCommandLastUsed = new Map();
const twitchProfileImageCache = new Map();
const twitchProfileLookupInFlight = new Map();

let playbackState = {
  connected: Boolean(tokens && tokens.refresh_token),
  is_playing: false,
  track: null,
  progress_ms: 0,
  duration_ms: 0,
  playback_timestamp: 0,
  received_at: Date.now(),
  error: ''
};

function loadConfig() {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}
  return {
    clientId: typeof data.clientId === 'string' ? data.clientId.trim() : '',
    tiktokUsername: typeof data.tiktokUsername === 'string' ? data.tiktokUsername.trim().replace(/^@/, '') : '',
    twitchClientId: USE_TWITCH_PUBLIC_CLIENT ? TWITCH_PUBLIC_CLIENT_ID : (typeof data.twitchClientId === 'string' ? data.twitchClientId.trim() : ''),
    twitchClientSecret: USE_TWITCH_PUBLIC_CLIENT ? '' : (typeof data.twitchClientSecret === 'string' ? data.twitchClientSecret.trim() : ''),
    twitchReadChat: data.twitchReadChat !== false,
    twitchAlert: normalizeTwitchAlertConfig(data.twitchAlert),
    twitchChatOverlay: normalizeTwitchChatConfig(data.twitchChatOverlay),
    unifiedChat: normalizeUnifiedChatConfig(data.unifiedChat),
    twitchVoiceCommand: normalizeTwitchVoiceCommand(data.twitchVoiceCommand),
    elevenLabsApiKey: typeof data.elevenLabsApiKey === 'string' ? data.elevenLabsApiKey.trim() : '',
    elevenLabsVoiceId: typeof data.elevenLabsVoiceId === 'string' ? data.elevenLabsVoiceId.trim() : '',
    elevenLabsModelId: typeof data.elevenLabsModelId === 'string' ? data.elevenLabsModelId : 'eleven_multilingual_v2',
    ttsTemplate: typeof data.ttsTemplate === 'string' ? data.ttsTemplate : '{username} dice: {message}',
    ttsSpeed: Number.isFinite(Number(data.ttsSpeed)) ? Math.min(1.2, Math.max(0.7, Number(data.ttsSpeed))) : 1,
    ttsMaxChars: Number.isFinite(Number(data.ttsMaxChars)) ? Math.min(180, Math.max(30, Math.round(Number(data.ttsMaxChars)))) : 180,
    antiSpam: data.antiSpam !== false,
    ttsEnabled: data.ttsEnabled !== false,
    overlay: normalizeOverlayConfig(data.overlay)
  };
}

function loadTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function loadTwitchTokens() {
  try { return JSON.parse(fs.readFileSync(TWITCH_TOKENS_FILE, 'utf8')); }
  catch { return null; }
}

function persistJson(filePath, value) {
  // En sistemas POSIX limita el acceso al propietario; en Windows el modo puede ignorarse.
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(text);
}

const TWITCH_ALERT_MEDIA_DIR = path.join(DATA_DIR, 'twitch-alert-media');
const TWITCH_ALERT_MEDIA_MAX_BYTES = Object.freeze({ image: 10 * 1024 * 1024, audio: 5 * 1024 * 1024 });
const TWITCH_ALERT_MEDIA_TYPES = Object.freeze({
  image: Object.freeze({
    'image/png': 'alert-image.bin', 'image/jpeg': 'alert-image.bin', 'image/webp': 'alert-image.bin',
    'image/gif': 'alert-image.bin', 'image/avif': 'alert-image.bin'
  }),
  audio: Object.freeze({
    'audio/mpeg': 'alert-sound.bin', 'audio/mp3': 'alert-sound.bin', 'audio/wav': 'alert-sound.bin',
    'audio/x-wav': 'alert-sound.bin', 'audio/ogg': 'alert-sound.bin', 'audio/mp4': 'alert-sound.bin',
    'audio/aac': 'alert-sound.bin', 'audio/webm': 'alert-sound.bin', 'audio/flac': 'alert-sound.bin'
  })
});

function serveTwitchAlertMedia(res, kind) {
  const isImage = kind === 'image';
  const mediaConfig = config.twitchAlert || DEFAULT_TWITCH_ALERT_CONFIG;
  const route = isImage ? mediaConfig.imageUrl : mediaConfig.soundUrl;
  const mime = isImage ? mediaConfig.imageMimeType : mediaConfig.soundMimeType;
  const filename = isImage ? 'alert-image.bin' : 'alert-sound.bin';
  if (route !== (isImage ? '/twitch-alert-media/image' : '/twitch-alert-media/audio') || !mime) {
    return sendText(res, 404, 'No hay un archivo configurado.');
  }
  const mediaPath = path.join(TWITCH_ALERT_MEDIA_DIR, filename);
  let stat;
  try { stat = fs.statSync(mediaPath); } catch {}
  if (!stat || !stat.isFile()) return sendText(res, 404, 'No se encontró el archivo de la alerta.');
  res.writeHead(200, {
    'Content-Type': mime, 'Content-Length': stat.size, 'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox"
  });
  fs.createReadStream(mediaPath).pipe(res);
}

function broadcastTwitchAlertConfig() {
  const current = publicStatus().twitch;
  publishTwitchEvent({
    type: 'config', status: current, alertConfig: config.twitchAlert,
    chatConfig: config.twitchChatOverlay, readChat: config.twitchReadChat, voice: publicStatus().voice
  });
}

function readRequestJson(req, maxBytes = 16_384) {
  return new Promise((resolve, reject) => {
    let body = '';
    let receivedBytes = 0;
    let rejected = false;
    req.on('data', chunk => {
      if (rejected) return;
      receivedBytes += chunk.length;
      if (receivedBytes > maxBytes) {
        rejected = true;
        reject(new Error('El archivo supera el límite permitido.'));
        req.destroy();
        return;
      }
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      if (rejected) return;
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('JSON no válido.')); }
    });
    req.on('error', error => { if (!rejected) reject(error); });
  });
}

function isLocalOrigin(req) {
  const origin = req.headers.origin;
  return !origin || origin === `http://${HOST}:${PORT}`;
}

function publicStatus() {
  return {
    clientId: config.clientId,
    hasClientId: Boolean(config.clientId),
    authenticated: Boolean(tokens && tokens.refresh_token),
    redirectUri: REDIRECT_URI,
    overlayUrl: `http://${HOST}:${PORT}/overlay`,
    playback: playbackState,
    overlay: config.overlay,
    audioVisualizerActive: audioVisualizerState.active,
    twitch: { ...twitchStatus, clientId: config.twitchClientId || '', publicClient: USE_TWITCH_PUBLIC_CLIENT, authorized: Boolean(twitchTokens && twitchTokens.refresh_token), hasClientId: Boolean(config.twitchClientId), hasClientSecret: Boolean(config.twitchClientSecret), redirectUri: TWITCH_REDIRECT_URI, readChat: config.twitchReadChat !== false, alertConfig: config.twitchAlert, chatConfig: config.twitchChatOverlay, alertUrl: `http://${HOST}:${PORT}/twitch-overlay`, chatOverlayUrl: `http://${HOST}:${PORT}/twitch-chat-overlay`, history: recentTwitchChatMessages.slice(0, 30), recentAlert: recentTwitchAlert },
    tiktok: { ...tiktokStatus, username: tiktokStatus.username || config.tiktokUsername || '' },
    chatHistory: recentChatMessages.slice(0, 30),
    unifiedChat: { history: recentUnifiedChatMessages.slice(0, 80), platforms: getUnifiedChatPlatforms(), config: config.unifiedChat, voiceCommand: config.twitchVoiceCommand, overlayUrl: `http://${HOST}:${PORT}/unified-chat-overlay` },
    voice: {
      hasApiKey: Boolean(config.elevenLabsApiKey),
      voiceId: config.elevenLabsVoiceId || '',
      modelId: config.elevenLabsModelId || 'eleven_multilingual_v2',
      template: config.ttsTemplate || '{username} dice: {message}',
      speed: config.ttsSpeed ?? 1,
      maxChars: config.ttsMaxChars ?? 180,
      antiSpam: config.antiSpam !== false,
      enabled: config.ttsEnabled !== false,
      configured: Boolean(config.elevenLabsApiKey && config.elevenLabsVoiceId)
    }
  };
}

function publishPlayback(nextState) {
  playbackState = { ...nextState, received_at: Date.now() };
  const payload = `data: ${JSON.stringify(playbackState)}\n\n`;
  for (const client of sseClients) {
    try { client.write(payload); } catch { sseClients.delete(client); }
  }
}

function publishTikTokEvent(payload) {
  const packet = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of tiktokSseClients) {
    try { client.write(packet); } catch { tiktokSseClients.delete(client); }
  }
  if (payload && payload.type === 'status') {
    publishUnifiedChatEvent({ type: 'status', platforms: getUnifiedChatPlatforms() });
  }
}

function publishOverlayEvent(packet) {
  const data = 'data: ' + JSON.stringify(packet) + '\n\n';
  for (const client of overlaySseClients) {
    try { client.write(data); } catch { overlaySseClients.delete(client); }
  }
}

function publishTwitchEvent(packet) {
  const data = 'data: ' + JSON.stringify(packet) + '\n\n';
  for (const client of twitchSseClients) {
    try { client.write(data); } catch { twitchSseClients.delete(client); }
  }
  if (packet && packet.type === 'status') {
    publishUnifiedChatEvent({ type: 'status', platforms: getUnifiedChatPlatforms() });
  }
}

function getUnifiedChatPlatforms() {
  return {
    tiktok: { connected: Boolean(tiktokStatus.connected), status: tiktokStatus.status || 'disconnected', username: tiktokStatus.username || config.tiktokUsername || '' },
    twitch: { connected: Boolean(twitchStatus.connected), status: twitchStatus.status || 'disconnected', username: twitchStatus.username || '' }
  };
}

function publishUnifiedChatEvent(payload) {
  const data = 'data: ' + JSON.stringify(payload) + '\n\n';
  for (const client of unifiedChatSseClients) {
    try { client.write(data); } catch { unifiedChatSseClients.delete(client); }
  }
}

function publishUnifiedChatMessage(item) {
  if (!item || !item.id) return;
  recentUnifiedChatMessages.unshift(item);
  recentUnifiedChatMessages = recentUnifiedChatMessages.slice(0, 120);
  publishUnifiedChatEvent({ type: 'chat', message: item });
}

function makeTwitchChatSegments(event, fallbackComment) {
  const fragments = Array.isArray(event && event.message && event.message.fragments) ? event.message.fragments : [];
  if (!fragments.length) return [{ type: 'text', text: fallbackComment || '' }];
  return fragments.slice(0, 100).map(fragment => {
    const text = String(fragment && fragment.text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 500);
    const emote = fragment && fragment.emote;
    if (fragment && fragment.type === 'emote' && emote && /^[A-Za-z0-9_-]{1,80}$/.test(String(emote.id || ''))) {
      const format = Array.isArray(emote.format) && emote.format.includes('animated') ? 'animated' : 'default';
      return {
        type: 'emote',
        text,
        alt: text || 'Twitch emote',
        url: `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(emote.id)}/${format}/dark/2.0`
      };
    }
    return { type: 'text', text };
  }).filter(segment => segment.type === 'emote' || segment.text);
}

function trustedTikTokEmoteUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return '';
    const host = url.hostname.toLowerCase();
    return host === 'tiktokcdn.com' || host.endsWith('.tiktokcdn.com') ? url.href : '';
  } catch {
    return '';
  }
}

function trustedTwitchProfileImageUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return '';
    const host = url.hostname.toLowerCase();
    return host === 'jtvnw.net' || host.endsWith('.jtvnw.net') ? url.href : '';
  } catch {
    return '';
  }
}

async function lookupTwitchProfileImage(userId) {
  const id = String(userId || '');
  if (!/^\d{1,25}$/.test(id)) return '';
  const cached = twitchProfileImageCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.url || '';
  if (twitchProfileLookupInFlight.has(id)) return twitchProfileLookupInFlight.get(id);

  const request = (async () => {
    let imageUrl = '';
    let ttl = 5 * 60_000;
    try {
      const accessToken = await getValidTwitchAccessToken();
      const response = await fetch('https://api.twitch.tv/helix/users?id=' + encodeURIComponent(id), {
        headers: twitchApiHeaders(accessToken)
      });
      if (response.ok) {
        const body = await response.json().catch(() => ({}));
        imageUrl = trustedTwitchProfileImageUrl(body.data && body.data[0] && body.data[0].profile_image_url);
        if (imageUrl) ttl = 60 * 60_000;
      }
    } catch {}
    twitchProfileImageCache.set(id, { url: imageUrl, expiresAt: Date.now() + ttl });
    while (twitchProfileImageCache.size > 500) twitchProfileImageCache.delete(twitchProfileImageCache.keys().next().value);
    return imageUrl;
  })().finally(() => twitchProfileLookupInFlight.delete(id));
  twitchProfileLookupInFlight.set(id, request);
  return request;
}

function requestTwitchProfileImage(item, userId) {
  if (!item || item.avatarUrl || !userId) return;
  lookupTwitchProfileImage(userId).then(avatarUrl => {
    if (!avatarUrl) return;
    item.avatarUrl = avatarUrl;
    publishTwitchEvent({ type: 'chat-update', message: { id: item.id, avatarUrl } });
    publishUnifiedChatEvent({ type: 'chat-update', message: { id: item.id, avatarUrl } });
  }).catch(() => {});
}

function parseTwitchVoiceCommand(comment) {
  const match = String(comment || '').match(/^(?:!voice|\/voice)(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  return { text: cleanText(match[1] || '', Math.max(30, Math.min(180, Number(config.ttsMaxChars) || 180))) };
}

function allowTwitchVoiceCommand(userId) {
  const id = String(userId || '');
  const now = Date.now();
  const lastUsed = twitchVoiceCommandLastUsed.get(id) || 0;
  if (now - lastUsed < 2500) return false;
  twitchVoiceCommandLastUsed.set(id, now);
  if (twitchVoiceCommandLastUsed.size > 300) {
    for (const [key, timestamp] of twitchVoiceCommandLastUsed) {
      if (now - timestamp > 60_000) twitchVoiceCommandLastUsed.delete(key);
    }
  }
  return true;
}

function cleanText(value, maxLength = 500) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function formatVoiceText(username, comment) {
  const template = config.ttsTemplate || '{username} dice: {message}';
  return cleanText(template.replaceAll('{username}', username).replaceAll('{message}', comment), 360);
}

function allowVoiceForChat(username, comment) {
  if (config.antiSpam === false) return true;
  const now = Date.now();
  const normalizedUser = username.toLocaleLowerCase();
  const normalizedComment = comment.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  const duplicateKey = `${normalizedUser}:${normalizedComment}`;
  const lastDuplicate = duplicateChatCache.get(duplicateKey) || 0;
  if (now - lastDuplicate < 30_000) return false;
  duplicateChatCache.set(duplicateKey, now);

  const history = (userSpeechHistory.get(normalizedUser) || []).filter(timestamp => now - timestamp < 15_000);
  if (history.length >= 4) {
    userSpeechHistory.set(normalizedUser, history);
    return false;
  }
  history.push(now);
  userSpeechHistory.set(normalizedUser, history);

  if (duplicateChatCache.size > 1500) {
    for (const [key, timestamp] of duplicateChatCache) if (now - timestamp > 60_000) duplicateChatCache.delete(key);
  }
  if (userSpeechHistory.size > 500) {
    for (const [key, timestamps] of userSpeechHistory) if (!timestamps.length || now - timestamps[timestamps.length - 1] > 60_000) userSpeechHistory.delete(key);
  }
  return true;
}

async function disconnectTikTok(updateStatus = true) {
  const oldConnection = tiktokConnection;
  tiktokConnection = null;
  if (oldConnection) {
    try { await oldConnection.disconnect(); } catch {}
  }
  if (updateStatus) {
    tiktokStatus = { connected: false, status: 'disconnected', username: config.tiktokUsername || '', error: '' };
    publishTikTokEvent({ type: 'status', status: tiktokStatus });
  }
}

function handleTikTokChat(data) {
  const user = data?.user || {};
  const username = cleanText(user.nickname || user.uniqueId || data?.nickname || data?.uniqueId || 'Usuario', 64) || 'Usuario';
  const comment = cleanText(data?.comment || data?.text || '', config.ttsMaxChars || 180);
  if (!comment) return;
  const shouldSpeak = Boolean(config.ttsEnabled !== false && config.elevenLabsApiKey && config.elevenLabsVoiceId && allowVoiceForChat(username, comment));
  const uniqueId = cleanText(user.uniqueId || data?.uniqueId || username, 64).toLocaleLowerCase();
  const cachedAvatar = trustedTikTokEmoteUrl(
    user.profilePictureUrl ||
    user.userDetails?.profilePictureUrls?.[0] ||
    user.userDetails?.profilePictureUrls?.[1]
  );
  const entry = {
    id: crypto.randomUUID(),
    username,
    comment,
    platform: 'tiktok',
    messageType: 'chat',
    segments: [{ type: 'text', text: comment }],
    avatarUrl: cachedAvatar,
    isSelf: Boolean(tiktokStatus.username && uniqueId === tiktokStatus.username.toLocaleLowerCase()),
    isModerator: user.isModerator === true || data?.isModerator === true,
    isSubscriber: user.isSubscriber === true || data?.isSubscriber === true,
    speakText: shouldSpeak ? formatVoiceText(username, comment) : '',
    shouldSpeak,
    timestamp: Date.now()
  };
  recentChatMessages.unshift(entry);
  recentChatMessages = recentChatMessages.slice(0, 50);
  publishTikTokEvent({ type: 'chat', message: entry });
  publishUnifiedChatMessage(entry);
}

function handleTikTokEmote(data) {
  const user = data && data.user || {};
  const username = cleanText(user.nickname || user.uniqueId || data && (data.nickname || data.uniqueId) || 'Usuario', 64) || 'Usuario';
  const url = trustedTikTokEmoteUrl(data && (data.emoteImageUrl || data.imageUrl) || data && data.emoteList && data.emoteList[0] && (data.emoteList[0].emoteImageUrl || data.emoteList[0].imageUrl));
  const entry = {
    id: String(data && (data.msgId || data.messageId) || crypto.randomUUID()),
    username,
    comment: url ? '' : 'Envió un sticker',
    platform: 'tiktok',
    messageType: 'emote',
    segments: url ? [{ type: 'image', url, alt: 'Sticker de TikTok' }] : [{ type: 'text', text: 'Envió un sticker' }],
    avatarUrl: trustedTikTokEmoteUrl(user.profilePictureUrl || user.userDetails?.profilePictureUrls?.[0] || data?.profilePictureUrl),
    isSelf: Boolean(tiktokStatus.username && String(user.uniqueId || data?.uniqueId || '').toLocaleLowerCase() === tiktokStatus.username.toLocaleLowerCase()),
    isModerator: user.isModerator === true || data?.isModerator === true,
    isSubscriber: user.isSubscriber === true || data?.isSubscriber === true,
    speakText: '',
    shouldSpeak: false,
    timestamp: Date.now()
  };
  recentChatMessages.unshift(entry);
  recentChatMessages = recentChatMessages.slice(0, 50);
  publishTikTokEvent({ type: 'chat', message: entry });
  publishUnifiedChatMessage(entry);
}

async function createElevenLabsSpeech(text) {
  if (!config.elevenLabsApiKey) throw new Error('Guarda primero tu API key de ElevenLabs.');
  if (!config.elevenLabsVoiceId) throw new Error('Selecciona una voz de ElevenLabs y guarda la configuración.');
  const safeText = cleanText(text, 360);
  if (!safeText) throw new Error('No hay texto para convertir en voz.');

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.elevenLabsVoiceId)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'xi-api-key': config.elevenLabsApiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({
      text: safeText,
      model_id: config.elevenLabsModelId || 'eleven_multilingual_v2',
      voice_settings: { speed: config.ttsSpeed ?? 1 }
    })
  });

  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    const providerMessage = details?.detail?.message || details?.detail || details?.message;
    if (response.status === 401 || response.status === 403) throw new Error('ElevenLabs rechazó la API key o no tiene acceso a esta voz/modelo. Revisa tus credenciales y cuota.');
    if (response.status === 429) throw new Error('ElevenLabs aplicó un límite o agotaste la cuota disponible. La lectura se reanudará cuando puedas volver a generar audio.');
    throw new Error(`ElevenLabs respondió HTTP ${response.status}${providerMessage ? `: ${String(providerMessage).slice(0, 180)}` : '.'}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('El audio devuelto está vacío o supera el límite de seguridad.');
  return bytes;
}

function schedulePoll(delay = POLL_INTERVAL_MS) {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(pollSpotify, Math.max(0, delay));
}

async function refreshAccessToken() {
  if (!tokens || !tokens.refresh_token || !config.clientId) {
    throw new Error('No hay sesión de Spotify. Vuelve a conectar desde el panel.');
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 400 || response.status === 401) {
      tokens = null;
      try { fs.unlinkSync(TOKENS_FILE); } catch {}
      throw new Error('La sesión de Spotify caducó o fue revocada. Pulsa «Conectar con Spotify» otra vez.');
    }
    throw new Error(`No se pudo renovar la sesión de Spotify (HTTP ${response.status}).`);
  }

  tokens = {
    ...tokens,
    ...body,
    refresh_token: body.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + (Number(body.expires_in || 3600) * 1000)
  };
  persistJson(TOKENS_FILE, tokens);
  return tokens.access_token;
}

async function getValidAccessToken() {
  if (!tokens || !tokens.refresh_token) throw new Error('not_authenticated');
  if (!tokens.access_token || !tokens.expires_at || Date.now() >= tokens.expires_at - 60_000) {
    return refreshAccessToken();
  }
  return tokens.access_token;
}

async function fetchCurrentlyPlaying() {
  let accessToken = await getValidAccessToken();
  let response = await fetch(CURRENTLY_PLAYING_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (response.status === 401) {
    accessToken = await refreshAccessToken();
    response = await fetch(CURRENTLY_PLAYING_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
  }

  if (response.status === 204) {
    return {
      connected: true, is_playing: false, track: null,
      progress_ms: 0, duration_ms: 0, playback_timestamp: 0, error: ''
    };
  }

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after') || 0);
    const body = await response.json().catch(() => ({}));
    const reason = body?.error?.reason;
    const waitMs = reason === 'QUOTA_EXCEEDED' ? 60_000 : Math.max(POLL_INTERVAL_MS, retryAfter * 1000);
    const message = reason === 'QUOTA_EXCEEDED'
      ? 'Spotify ha agotado la cuota de desarrollo de la app. Se reintentará en 60 segundos.'
      : `Spotify limitó las consultas. Se reintentará en ${Math.ceil(waitMs / 1000)} segundos.`;
    const error = new Error(message);
    error.retryAfterMs = waitMs;
    throw error;
  }

  if (response.status === 403) {
    const body = await response.json().catch(() => ({}));
    const reason = body?.error?.reason;
    if (reason === 'QUOTA_EXCEEDED') {
      const error = new Error('Se agotó la cuota de desarrollo de Spotify. Se reintentará en 60 segundos.');
      error.retryAfterMs = 60_000;
      throw error;
    }
    throw new Error('Spotify devolvió HTTP 403. Verifica los permisos, el acceso de tu cuenta y la lista de usuarios permitidos de la app.');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`Spotify API respondió HTTP ${response.status}${body?.error?.message ? `: ${body.error.message}` : '.'}`);
  }

  const body = await response.json();
  const item = body.item || null;
  let track = null;
  if (item) {
    const album = item.album || null;
    const images = album?.images || item.images || [];
    const artists = Array.isArray(item.artists)
      ? item.artists.map(artist => artist.name).filter(Boolean).join(', ')
      : (item.show?.publisher || item.show?.name || 'Artista desconocido');

    track = {
      id: item.id || item.uri || `${item.name || 'track'}:${artists}`,
      title: item.name || 'Título desconocido',
      artists: artists || 'Artista desconocido',
      album: album?.name || item.show?.name || '',
      image: images[0]?.url || '',
      url: item.external_urls?.spotify || '',
      type: item.type || 'track'
    };
  }

  return {
    connected: true,
    is_playing: Boolean(body.is_playing),
    track,
    progress_ms: Number(body.progress_ms || 0),
    duration_ms: Number(item?.duration_ms || 0),
    playback_timestamp: Number(body.timestamp || 0),
    error: ''
  };
}

async function pollSpotify() {
  if (polling) return;
  polling = true;
  let nextDelay = POLL_INTERVAL_MS;

  try {
    if (!tokens || !tokens.refresh_token) {
      lastError = '';
      publishPlayback({
        connected: false, is_playing: false, track: null,
        progress_ms: 0, duration_ms: 0, playback_timestamp: 0, error: ''
      });
    } else {
      const nextState = await fetchCurrentlyPlaying();
      lastError = '';
      publishPlayback(nextState);
    }
  } catch (error) {
    lastError = error?.message || 'Error desconocido al consultar Spotify.';
    if (error?.retryAfterMs) nextDelay = error.retryAfterMs;
    else if (lastError.includes('caducó') || lastError.includes('revocada')) nextDelay = 15_000;

    publishPlayback({
      ...playbackState,
      connected: Boolean(tokens && tokens.refresh_token),
      ...(tokens && tokens.refresh_token ? {} : { is_playing: false, track: null, progress_ms: 0, duration_ms: 0, playback_timestamp: 0 }),
      error: lastError
    });
  } finally {
    polling = false;
    schedulePoll(nextDelay);
  }
}

function htmlEscape(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function serveAsset(res, assetName, contentType) {
  const filePath = path.join(PUBLIC_DIR, assetName);
  fs.readFile(filePath, (error, contents) => {
    if (error) return sendText(res, 404, 'Archivo no encontrado.');
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    });
    res.end(contents);
  });
}


function updateTwitchStatus(next) {
  twitchStatus = { ...twitchStatus, ...next };
  publishTwitchEvent({ type: 'status', status: publicStatus().twitch });
}

function twitchApiHeaders(accessToken) {
  return {
    'Client-Id': config.twitchClientId,
    'Authorization': 'Bearer ' + accessToken,
    'Content-Type': 'application/json'
  };
}

async function refreshTwitchAccessToken() {
  if (!config.twitchClientId || (!USE_TWITCH_PUBLIC_CLIENT && !config.twitchClientSecret) || !twitchTokens || !twitchTokens.refresh_token) {
    throw new Error('Vuelve a conectar Twitch para renovar el permiso.');
  }
  const params = new URLSearchParams({
    client_id: config.twitchClientId,
    grant_type: 'refresh_token',
    refresh_token: twitchTokens.refresh_token
  });
  // Public Twitch clients must not ship or send a Client Secret. Device-flow
  // refresh tokens rotate on every use, so persist the newly returned token.
  if (!USE_TWITCH_PUBLIC_CLIENT && config.twitchClientSecret) params.set('client_secret', config.twitchClientSecret);
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token || !body.refresh_token) {
    throw new Error('Twitch ya no acepta la sesión guardada. Vuelve a conectar la cuenta.');
  }
  twitchTokens = {
    ...twitchTokens,
    ...body,
    userId: twitchTokens.userId,
    username: twitchTokens.username,
    login: twitchTokens.login,
    clientId: config.twitchClientId,
    expires_at: Date.now() + Number(body.expires_in || 14400) * 1000
  };
  persistJson(TWITCH_TOKENS_FILE, twitchTokens);
  return twitchTokens.access_token;
}

async function getValidTwitchAccessToken() {
  if (!twitchTokens || !twitchTokens.access_token) throw new Error('Conecta tu cuenta de Twitch primero.');
  if (Number(twitchTokens.expires_at || 0) < Date.now() + 60000) return refreshTwitchAccessToken();
  const response = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: { Authorization: 'Bearer ' + twitchTokens.access_token }
  });
  const body = await response.json().catch(() => ({}));
  if (response.ok && body.client_id === config.twitchClientId) return twitchTokens.access_token;
  return refreshTwitchAccessToken();
}

async function getTwitchCurrentUser(accessToken) {
  const response = await fetch('https://api.twitch.tv/helix/users', {
    headers: twitchApiHeaders(accessToken)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.data || !body.data[0]) {
    throw new Error('No se pudo leer la cuenta de Twitch autorizada. Comprueba las credenciales de la aplicación.');
  }
  return body.data[0];
}

async function createTwitchEventSubscription(sessionId, type, version, condition, accessToken) {
  const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: twitchApiHeaders(accessToken),
    body: JSON.stringify({
      type,
      version,
      condition,
      transport: { method: 'websocket', session_id: sessionId }
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(type + ': ' + (body.message || body.error || ('HTTP ' + response.status)));
  return body.data && body.data[0] || null;
}

function makeTwitchFollowAlert(username, test) {
  const safeName = cleanText(username || 'Un nuevo seguidor', 64);
  const title = cleanConfigText(config.twitchAlert.title, 64, DEFAULT_TWITCH_ALERT_CONFIG.title);
  const template = cleanConfigText(config.twitchAlert.message, 120, DEFAULT_TWITCH_ALERT_CONFIG.message);
  return {
    id: crypto.randomUUID(),
    username: safeName,
    title,
    message: template.replaceAll('{username}', safeName),
    style: config.twitchAlert.style,
    accentColor: config.twitchAlert.accentColor,
    durationSeconds: config.twitchAlert.durationSeconds,
    soundEnabled: config.twitchAlert.soundEnabled,
    imageUrl: config.twitchAlert.imageUrl,
    imageMimeType: config.twitchAlert.imageMimeType,
    imageFit: config.twitchAlert.imageFit,
    soundUrl: config.twitchAlert.soundUrl,
    soundMimeType: config.twitchAlert.soundMimeType,
    soundDurationSeconds: config.twitchAlert.soundDurationSeconds,
    timestamp: Date.now(),
    test: Boolean(test)
  };
}

function handleTwitchFollow(event, test = false) {
  if (!config.twitchAlert.enabled && !test) return;
  const alert = makeTwitchFollowAlert(event && (event.user_name || event.user_login) || 'Nuevo seguidor', test);
  recentTwitchAlert = alert;
  publishTwitchEvent({ type: 'follow', alert });
}

function handleTwitchChat(event) {
  const username = cleanText(event && (event.chatter_user_name || event.chatter_user_login) || 'Usuario', 64) || 'Usuario';
  const login = cleanText(event && event.chatter_user_login || username, 64).toLocaleLowerCase();
  const chatterId = cleanText(event && event.chatter_user_id || '', 32);
  const comment = cleanText(event && event.message && event.message.text || '', Math.max(30, Math.min(180, Number(config.ttsMaxChars) || 180)));
  if (!comment) return;

  const badges = Array.isArray(event && event.badges) ? event.badges : [];
  const badgeHas = id => badges.some(badge => badge && badge.set_id === id);
  const isSelf = Boolean(chatterId && twitchTokens && String(chatterId) === String(twitchTokens.userId));
  const isBroadcaster = badgeHas('broadcaster') || Boolean(twitchTokens && (isSelf || login === String(twitchTokens.username || '').toLocaleLowerCase()));
  const isModerator = badgeHas('moderator');
  const voiceCommand = parseTwitchVoiceCommand(comment);
  let shouldSpeak = false;
  let speakText = '';

  if (voiceCommand) {
    const canUseCommand = config.twitchVoiceCommand.enabled !== false &&
      (isBroadcaster || (config.twitchVoiceCommand.moderatorsCanUse === true && isModerator));
    const ttsReady = config.ttsEnabled !== false && config.elevenLabsApiKey && config.elevenLabsVoiceId;
    if (canUseCommand && voiceCommand.text && ttsReady && allowTwitchVoiceCommand(chatterId || login)) {
      shouldSpeak = true;
      speakText = voiceCommand.text;
    }
  } else {
    shouldSpeak = Boolean(
      config.twitchReadChat !== false &&
      config.ttsEnabled !== false &&
      config.elevenLabsApiKey &&
      config.elevenLabsVoiceId &&
      allowVoiceForChat(username, comment)
    );
    speakText = shouldSpeak ? formatVoiceText(username, comment) : '';
  }

  const cachedProfile = chatterId ? twitchProfileImageCache.get(chatterId) : null;
  const item = {
    id: event && event.message_id || crypto.randomUUID(),
    username,
    chatterId,
    comment,
    timestamp: Date.now(),
    speakText,
    shouldSpeak,
    platform: 'twitch',
    messageType: 'chat',
    segments: makeTwitchChatSegments(event, comment),
    avatarUrl: cachedProfile && cachedProfile.expiresAt > Date.now() ? cachedProfile.url : '',
    isSelf,
    isBroadcaster,
    isModerator,
    isSubscriber: badgeHas('subscriber'),
    isVip: badgeHas('vip'),
    isFounder: badgeHas('founder'),
    isPartner: badgeHas('partner')
  };
  recentTwitchChatMessages.unshift(item);
  recentTwitchChatMessages = recentTwitchChatMessages.slice(0, 50);
  publishTwitchEvent({ type: 'chat', message: item });
  publishUnifiedChatMessage(item);
  requestTwitchProfileImage(item, chatterId);
}

async function connectTwitchWebSocket(url = 'wss://eventsub.wss.twitch.tv/ws', isReconnect = false) {
  if (typeof WebSocket !== 'function') {
    throw new Error('Este entorno no dispone de WebSocket nativo para EventSub. Actualiza NoteLive Studio.');
  }
  twitchShouldReconnect = true;
  const accessToken = await getValidTwitchAccessToken();
  const userId = twitchTokens.userId;
  if (!userId) throw new Error('No se encontró el ID de la cuenta de Twitch. Desconecta y vuelve a autorizar.');
  const previousSocket = twitchSocket;
  const generation = ++twitchSocketGeneration;
  const socket = new WebSocket(url);
  twitchSocket = socket;
  updateTwitchStatus({ connected: false, status: 'connecting', username: twitchTokens.username, broadcasterId: userId, error: '' });

  socket.addEventListener('message', async messageEvent => {
    let packet;
    try { packet = JSON.parse(String(messageEvent.data)); } catch { return; }
    const messageType = packet && packet.metadata && packet.metadata.message_type;
    const payload = packet && packet.payload || {};

    if (messageType === 'session_welcome') {
      if (generation !== twitchSocketGeneration) return;
      twitchSessionId = payload.session && payload.session.id || '';
      if (isReconnect) {
        if (previousSocket && previousSocket !== socket) {
          try { previousSocket.close(1000, 'EventSub reconnected'); } catch {}
        }
        updateTwitchStatus({ connected: true, status: 'connected', username: twitchTokens.username, broadcasterId: userId, error: '' });
        return;
      }
      const results = await Promise.allSettled([
        createTwitchEventSubscription(twitchSessionId, 'channel.follow', '2', {
          broadcaster_user_id: userId,
          moderator_user_id: userId
        }, accessToken),
        createTwitchEventSubscription(twitchSessionId, 'channel.chat.message', '1', {
          broadcaster_user_id: userId,
          user_id: userId
        }, accessToken)
      ]);
      const failures = results.filter(result => result.status === 'rejected').map(result => result.reason && result.reason.message || 'Error de suscripción');
      const successCount = results.length - failures.length;
      updateTwitchStatus({
        connected: successCount > 0,
        status: successCount > 0 ? 'connected' : 'error',
        username: twitchTokens.username,
        broadcasterId: userId,
        error: failures.length ? 'Conexión parcial: ' + failures.join(' · ') : ''
      });
      return;
    }

    if (messageType === 'session_reconnect') {
      const reconnectUrl = payload.session && payload.session.reconnect_url;
      if (reconnectUrl && generation === twitchSocketGeneration) {
        connectTwitchWebSocket(reconnectUrl, true).catch(error => {
          updateTwitchStatus({ connected: false, status: 'error', error: cleanText(error.message, 220) });
        });
      }
      return;
    }

    if (messageType === 'notification') {
      const eventType = payload.subscription && payload.subscription.type;
      const event = payload.event || {};
      if (eventType === 'channel.follow') handleTwitchFollow(event, false);
      else if (eventType === 'channel.chat.message') handleTwitchChat(event);
      return;
    }

    if (messageType === 'revocation') {
      updateTwitchStatus({
        connected: false,
        status: 'error',
        error: 'Twitch revocó una suscripción: ' + ((payload.subscription && payload.subscription.type) || 'desconocida') + '. Vuelve a conectar la cuenta.'
      });
    }
  });

  socket.addEventListener('error', () => {
    if (generation === twitchSocketGeneration) {
      updateTwitchStatus({ connected: false, status: 'connecting', error: 'No se pudo mantener la conexión con Twitch EventSub.' });
    }
  });

  socket.addEventListener('close', () => {
    if (generation !== twitchSocketGeneration) return;
    twitchSocket = null;
    twitchSessionId = '';
    if (!twitchShouldReconnect) return;
    updateTwitchStatus({ connected: false, status: 'reconnecting', error: 'Se perdió la conexión con Twitch. Reconectando…' });
    clearTimeout(twitchReconnectTimer);
    twitchReconnectTimer = setTimeout(() => {
      connectTwitchWebSocket().catch(error => {
        updateTwitchStatus({ connected: false, status: 'error', error: cleanText(error.message, 240) });
      });
    }, 4000);
  });
}

async function startTwitchEventSub() {
  if (!twitchTokens || !twitchTokens.refresh_token || !config.twitchClientId || (!USE_TWITCH_PUBLIC_CLIENT && !config.twitchClientSecret)) {
    updateTwitchStatus({ connected: false, status: 'disconnected', error: '' });
    return;
  }
  twitchShouldReconnect = true;
  if (twitchReconnectTimer) clearTimeout(twitchReconnectTimer);
  updateTwitchStatus({ connected: false, status: 'connecting', username: twitchTokens.username || '', error: '' });
  await connectTwitchWebSocket();
}

async function disconnectTwitch(clearTokens = true) {
  pendingTwitchDeviceAuth = null;
  twitchShouldReconnect = false;
  clearTimeout(twitchReconnectTimer);
  twitchReconnectTimer = null;
  twitchSocketGeneration += 1;
  const oldSocket = twitchSocket;
  twitchSocket = null;
  twitchSessionId = '';
  if (oldSocket) {
    try { oldSocket.close(1000, 'Disconnected by NoteLive Studio'); } catch {}
  }
  if (clearTokens) {
    const token = twitchTokens && twitchTokens.access_token;
    if (token && config.twitchClientId) {
      try {
        await fetch('https://id.twitch.tv/oauth2/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: config.twitchClientId, token })
        });
      } catch {}
    }
    twitchTokens = null;
    try { fs.unlinkSync(TWITCH_TOKENS_FILE); } catch {}
  }
  updateTwitchStatus({ connected: false, status: 'disconnected', username: '', broadcasterId: '', error: '' });
}

async function pollTwitchDeviceAuthorization(flow) {
  while (pendingTwitchDeviceAuth === flow && Date.now() < flow.expiresAt) {
    await new Promise(resolve => setTimeout(resolve, flow.interval * 1000));
    if (pendingTwitchDeviceAuth !== flow) return;

    let response;
    let body;
    try {
      response = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.twitchClientId,
          scopes: TWITCH_DEVICE_SCOPES,
          device_code: flow.deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        })
      });
      body = await response.json().catch(() => ({}));
    } catch (error) {
      throw new Error('No se pudo comprobar la autorización de Twitch. Comprueba tu conexión a Internet.');
    }

    // A cancellation or newer authorization flow may have replaced this request
    // while the network call was in flight.
    if (pendingTwitchDeviceAuth !== flow) return;

    if (response.ok && body.access_token && body.refresh_token) {
      const user = await getTwitchCurrentUser(body.access_token);
      if (pendingTwitchDeviceAuth !== flow) return;
      twitchTokens = {
        ...body,
        userId: user.id,
        username: user.display_name || user.login,
        login: user.login,
        clientId: config.twitchClientId,
        expires_at: Date.now() + Number(body.expires_in || 14400) * 1000
      };
      persistJson(TWITCH_TOKENS_FILE, twitchTokens);
      pendingTwitchDeviceAuth = null;
      updateTwitchStatus({
        connected: false,
        status: 'connecting',
        username: twitchTokens.username,
        broadcasterId: user.id,
        error: ''
      });
      startTwitchEventSub().catch(error => {
        updateTwitchStatus({
          connected: false,
          status: 'error',
          username: twitchTokens && twitchTokens.username || '',
          error: cleanText(error.message, 240)
        });
      });
      return;
    }

    const errorCode = String(body.error || body.message || '').toLowerCase();
    if (errorCode === 'authorization_pending') continue;
    if (errorCode === 'slow_down' || response.status === 429) {
      flow.interval += 5;
      continue;
    }
    if (errorCode === 'authorization_declined' || errorCode === 'access_denied') {
      throw new Error('La autorización fue rechazada en Twitch. Puedes intentarlo de nuevo.');
    }
    if (errorCode === 'expired_token' || errorCode === 'invalid device code') {
      throw new Error('El código de Twitch venció. Pulsa “Conectar cuenta Twitch” para generar otro.');
    }
    throw new Error(cleanText(body.message || body.error_description || body.error || 'Twitch no pudo completar la autorización.', 220));
  }

  if (pendingTwitchDeviceAuth === flow) {
    pendingTwitchDeviceAuth = null;
    updateTwitchStatus({
      connected: false,
      status: 'error',
      username: '',
      error: 'El código de autorización venció. Pulsa “Conectar cuenta Twitch” para generar uno nuevo.'
    });
  }
}

function twitchCallbackPage(title, message, success = false) {
  const color = success ? '#a970ff' : '#ff7587';
  const escapeHtml = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeTitle = escapeHtml(title || 'NoteLive Studio · Twitch');
  const safeMessage = escapeHtml(message || '');
  return '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    '<title>' + safeTitle + '</title><body style="margin:0;background:#0b0d12;color:#f7f4ff;font:16px system-ui;display:grid;min-height:100vh;place-items:center">' +
    '<main style="max-width:560px;padding:32px;border:1px solid #373143;border-radius:18px;background:#15151d">' +
    '<div style="color:' + color + ';font-size:13px;font-weight:800;letter-spacing:.14em">NOTELIVE STUDIO / TWITCH</div>' +
    '<h1 style="font-size:26px;margin-bottom:8px">' + safeTitle + '</h1><p style="color:#bbb5c8;line-height:1.65">' + safeMessage + '</p>' +
    '<p style="color:#8d8797;font-size:13px">Puedes cerrar esta ventana y volver a NoteLive Studio.</p>' +
    '<button onclick="window.close()" style="margin-top:10px;padding:10px 16px;border:0;border-radius:10px;background:' + color + ';color:#0d0915;font-weight:800;cursor:pointer">Cerrar ventana</button></main></body></html>';
}


const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);
  const pathname = requestUrl.pathname;

  // No se admiten peticiones desde otros sitios para los endpoints que modifican datos.
  if (['POST'].includes(req.method) && pathname.startsWith('/api/') && !isLocalOrigin(req)) {
    return sendText(res, 403, 'Origen no permitido.');
  }


  if (req.method === 'GET' && pathname === '/twitch-alert-media/image') return serveTwitchAlertMedia(res, 'image');
  if (req.method === 'GET' && pathname === '/twitch-alert-media/audio') return serveTwitchAlertMedia(res, 'audio');

  if (req.method === 'GET' && pathname === '/twitch-overlay') {
    return serveAsset(res, 'twitch-overlay.html', 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && pathname === '/twitch-overlay.js') {
    return serveAsset(res, 'twitch-overlay.js', 'text/javascript; charset=utf-8');
  }
  if (req.method === 'GET' && pathname === '/twitch-overlay.css') {
    return serveAsset(res, 'twitch-overlay.css', 'text/css; charset=utf-8');
  }
  if (req.method === 'GET' && pathname === '/twitch-chat-overlay') {
    return serveAsset(res, 'twitch-chat-overlay.html', 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && pathname === '/twitch-chat-overlay.js') {
    return serveAsset(res, 'twitch-chat-overlay.js', 'text/javascript; charset=utf-8');
  }
  if (req.method === 'GET' && pathname === '/twitch-chat-overlay.css') {
    return serveAsset(res, 'twitch-chat-overlay.css', 'text/css; charset=utf-8');
  }

  if (req.method === 'GET' && pathname === '/twitch/connect') {
    if (USE_TWITCH_PUBLIC_CLIENT) {
      return sendText(res, 400, 'Vuelve a NoteLive Studio y pulsa “Conectar cuenta Twitch” para autorizar mediante código.');
    }
    if (!config.twitchClientId || !config.twitchClientSecret) {
      return sendText(res, 400, 'Abre NoteLive Studio, guarda primero el Twitch Client ID y Client Secret y vuelve a pulsar Conectar Twitch.');
    }
    const state = crypto.randomBytes(24).toString('hex');
    pendingTwitchAuth.set(state, { createdAt: Date.now() });
    for (const [key, value] of pendingTwitchAuth) {
      if (Date.now() - value.createdAt > 10 * 60 * 1000) pendingTwitchAuth.delete(key);
    }
    const authorize = new URL('https://id.twitch.tv/oauth2/authorize');
    authorize.search = new URLSearchParams({
      client_id: config.twitchClientId,
      redirect_uri: TWITCH_REDIRECT_URI,
      response_type: 'code',
      scope: 'moderator:read:followers user:read:chat',
      state,
      force_verify: 'true'
    }).toString();
    res.writeHead(302, { Location: authorize.toString(), 'Cache-Control': 'no-store' });
    return res.end();
  }

  if (req.method === 'GET' && pathname === '/twitch/callback') {
    const oauthError = requestUrl.searchParams.get('error');
    const code = requestUrl.searchParams.get('code');
    const state = requestUrl.searchParams.get('state');
    const pending = pendingTwitchAuth.get(state);
    if (state) pendingTwitchAuth.delete(state);
    if (oauthError) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(twitchCallbackPage('Autorización cancelada', 'Twitch no autorizó la conexión. Regresa a NoteLive Studio y vuelve a intentarlo.'));
    }
    if (!pending || !code || Date.now() - pending.createdAt > 10 * 60 * 1000) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(twitchCallbackPage('No se pudo validar el inicio de sesión', 'El código de autorización venció o el estado no coincide. Vuelve a NoteLive Studio e intenta conectar otra vez.'));
    }
    try {
      const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.twitchClientId,
          client_secret: config.twitchClientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: TWITCH_REDIRECT_URI
        })
      });
      const tokenBody = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || !tokenBody.access_token || !tokenBody.refresh_token) {
        throw new Error(tokenBody.message || 'Twitch no aceptó el intercambio del código de autorización.');
      }
      const user = await getTwitchCurrentUser(tokenBody.access_token);
      twitchTokens = {
        ...tokenBody,
        userId: user.id,
        username: user.display_name || user.login,
        login: user.login,
        clientId: config.twitchClientId,
        expires_at: Date.now() + Number(tokenBody.expires_in || 14400) * 1000
      };
      persistJson(TWITCH_TOKENS_FILE, twitchTokens);
      updateTwitchStatus({ connected: false, status: 'connecting', username: twitchTokens.username, broadcasterId: user.id, error: '' });
      startTwitchEventSub().catch(error => {
        updateTwitchStatus({ connected: false, status: 'error', username: twitchTokens && twitchTokens.username || '', error: cleanText(error.message, 240) });
      });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      return res.end(twitchCallbackPage('¡Twitch conectado!', 'La autorización se guardó localmente para ' + (user.display_name || user.login) + '. NoteLive Studio está activando el chat y las alertas de seguimiento.', true));
    } catch (error) {
      console.error('[NoteLive Studio] Twitch OAuth:', error);
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(twitchCallbackPage('No se pudo conectar Twitch', cleanText(error.message || error, 220)));
    }
  }

  if (req.method === 'POST' && pathname === '/api/twitch/device/start') {
    try {
      if (!USE_TWITCH_PUBLIC_CLIENT || !config.twitchClientId) {
        return sendJson(res, 400, { error: 'La autorización mediante código no está configurada en esta versión.' });
      }
      if (twitchTokens && twitchTokens.refresh_token) {
        return sendJson(res, 409, { error: 'Ya hay una cuenta de Twitch autorizada. Desconéctala antes de cambiar de cuenta.' });
      }
      const response = await fetch('https://id.twitch.tv/oauth2/device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.twitchClientId,
          scopes: TWITCH_DEVICE_SCOPES
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.device_code || !body.user_code || !body.verification_uri) {
        return sendJson(res, 502, { error: cleanText(body.message || body.error_description || body.error || 'Twitch no pudo generar el código de autorización.', 220) });
      }

      const verificationUrl = new URL(body.verification_uri);
      if (verificationUrl.protocol !== 'https:' || !['www.twitch.tv', 'twitch.tv'].includes(verificationUrl.hostname)) {
        return sendJson(res, 502, { error: 'Twitch devolvió una URL de autorización no válida.' });
      }

      const flow = {
        deviceCode: String(body.device_code),
        userCode: String(body.user_code),
        verificationUri: verificationUrl.toString(),
        interval: Math.max(5, Number(body.interval) || 5),
        expiresAt: Date.now() + Math.max(60, Number(body.expires_in) || 1800) * 1000
      };
      pendingTwitchDeviceAuth = flow;
      updateTwitchStatus({ connected: false, status: 'authorizing', username: '', broadcasterId: '', error: '' });
      pollTwitchDeviceAuthorization(flow).catch(error => {
        if (pendingTwitchDeviceAuth !== flow) return;
        pendingTwitchDeviceAuth = null;
        updateTwitchStatus({
          connected: false,
          status: 'error',
          username: '',
          broadcasterId: '',
          error: cleanText(error.message || error, 240)
        });
      });
      return sendJson(res, 200, {
        ok: true,
        userCode: flow.userCode,
        verificationUri: flow.verificationUri,
        expiresIn: Math.max(60, Number(body.expires_in) || 1800),
        interval: flow.interval
      });
    } catch (error) {
      return sendJson(res, 502, { error: error.message || 'No se pudo iniciar la autorización de Twitch.' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/twitch/device/cancel') {
    pendingTwitchDeviceAuth = null;
    updateTwitchStatus({ connected: false, status: 'disconnected', username: '', broadcasterId: '', error: '' });
    return sendJson(res, 200, { ok: true, twitch: publicStatus().twitch });
  }

  if (req.method === 'POST' && pathname === '/api/twitch/config') {
    try {
      const body = await readRequestJson(req);
      const oldClientId = config.twitchClientId;
      const oldClientSecret = config.twitchClientSecret;
      const enteredClientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
      const enteredClientSecret = typeof body.clientSecret === 'string' ? body.clientSecret.trim() : '';
      if (enteredClientId && (enteredClientId.length < 8 || enteredClientId.length > 128)) {
        return sendJson(res, 400, { error: 'El Client ID de Twitch no tiene un formato válido.' });
      }
      if (enteredClientSecret && (enteredClientSecret.length < 8 || enteredClientSecret.length > 256)) {
        return sendJson(res, 400, { error: 'El Client Secret parece incompleto.' });
      }
      const nextClientId = USE_TWITCH_PUBLIC_CLIENT
        ? TWITCH_PUBLIC_CLIENT_ID
        : (body.clearCredentials === true ? '' : (enteredClientId || oldClientId));
      const nextClientSecret = USE_TWITCH_PUBLIC_CLIENT
        ? ''
        : (body.clearCredentials === true ? '' : (enteredClientSecret || oldClientSecret));
      const credentialsChanged = nextClientId !== oldClientId || nextClientSecret !== oldClientSecret;
      if (credentialsChanged && twitchTokens) await disconnectTwitch(true);
      config.twitchClientId = nextClientId;
      config.twitchClientSecret = nextClientSecret;
      if (typeof body.readChat === 'boolean') config.twitchReadChat = body.readChat;
      if (body.alertConfig && typeof body.alertConfig === 'object') config.twitchAlert = normalizeTwitchAlertConfig(body.alertConfig);
      if (body.chatConfig && typeof body.chatConfig === 'object') config.twitchChatOverlay = normalizeTwitchChatConfig(body.chatConfig);
      persistJson(CONFIG_FILE, config);
      const current = publicStatus().twitch;
      broadcastTwitchAlertConfig();
      return sendJson(res, 200, { ok: true, twitch: current });
    } catch (error) {
      return sendJson(res, 400, { error: error.message || 'No se pudo guardar la configuración de Twitch.' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/twitch/alert-media') {
    try {
      // Ten MiB images become about 13.4 MiB when encoded as base64 JSON.
      const body = await readRequestJson(req, 15 * 1024 * 1024);
      const mediaType = body.mediaType;
      if (!['image', 'audio'].includes(mediaType)) return sendJson(res, 400, { error: 'Selecciona imagen/GIF o sonido.' });
      const isImage = mediaType === 'image';
      const mime = typeof body.mimeType === 'string' ? body.mimeType.toLowerCase() : '';
      const filename = TWITCH_ALERT_MEDIA_TYPES[mediaType][mime];
      if (body.remove === true) {
        const mediaPath = path.join(TWITCH_ALERT_MEDIA_DIR, isImage ? 'alert-image.bin' : 'alert-sound.bin');
        try { fs.unlinkSync(mediaPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (isImage) { config.twitchAlert.imageUrl = ''; config.twitchAlert.imageMimeType = ''; }
        else { config.twitchAlert.soundUrl = ''; config.twitchAlert.soundMimeType = ''; config.twitchAlert.soundDurationSeconds = 0; }
        config.twitchAlert = normalizeTwitchAlertConfig(config.twitchAlert);
        persistJson(CONFIG_FILE, config);
        broadcastTwitchAlertConfig();
        return sendJson(res, 200, { ok: true, alertConfig: config.twitchAlert });
      }
      if (!filename) return sendJson(res, 400, { error: isImage
        ? 'Formato no admitido. Usa PNG, JPG, WebP, GIF o AVIF.'
        : 'Formato no admitido. Usa MP3, WAV, OGG, M4A/MP4, AAC, WebM o FLAC.' });
      const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';
      const match = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
      if (!match || match[1].toLowerCase() !== mime) return sendJson(res, 400, { error: 'El archivo no pudo leerse correctamente. Inténtalo de nuevo.' });
      const bytes = Buffer.from(match[2], 'base64');
      if (!bytes.length) return sendJson(res, 400, { error: 'El archivo está vacío.' });
      if (bytes.length > TWITCH_ALERT_MEDIA_MAX_BYTES[mediaType]) return sendJson(res, 413, { error: isImage
        ? 'La imagen o el GIF supera el límite de 10 MB.'
        : 'El sonido supera el límite de 5 MB.' });
      if (!isImage) {
        const duration = Number(body.durationSeconds);
        if (!Number.isFinite(duration) || duration <= 0 || duration > 10.05) return sendJson(res, 400, { error: 'El sonido debe durar 10 segundos o menos.' });
      }
      fs.mkdirSync(TWITCH_ALERT_MEDIA_DIR, { recursive: true });
      fs.writeFileSync(path.join(TWITCH_ALERT_MEDIA_DIR, filename), bytes, { mode: 0o600 });
      if (isImage) { config.twitchAlert.imageUrl = '/twitch-alert-media/image'; config.twitchAlert.imageMimeType = mime; }
      else {
        config.twitchAlert.soundUrl = '/twitch-alert-media/audio';
        config.twitchAlert.soundMimeType = mime;
        config.twitchAlert.soundDurationSeconds = Math.round(Number(body.durationSeconds) * 10) / 10;
      }
      config.twitchAlert = normalizeTwitchAlertConfig(config.twitchAlert);
      persistJson(CONFIG_FILE, config);
      broadcastTwitchAlertConfig();
      return sendJson(res, 200, { ok: true, alertConfig: config.twitchAlert });
    } catch (error) {
      return sendJson(res, 400, { error: error.message || 'No se pudo guardar el archivo de la alerta.' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/twitch/disconnect') {
    await disconnectTwitch(true);
    return sendJson(res, 200, { ok: true, twitch: publicStatus().twitch });
  }

  if (req.method === 'POST' && pathname === '/api/twitch/test-follow') {
    try {
      const body = await readRequestJson(req);
      handleTwitchFollow({ user_name: cleanText(body.username || 'NoukanTest', 64) || 'NoukanTest' }, true);
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 400, { error: error.message || 'No se pudo probar la alerta.' });
    }
  }

  if (req.method === 'GET' && pathname === '/api/twitch/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('data: ' + JSON.stringify({
      type: 'init',
      status: publicStatus().twitch,
      history: recentTwitchChatMessages.slice(0, 30),
      recentAlert: recentTwitchAlert,
      alertConfig: config.twitchAlert,
      chatConfig: config.twitchChatOverlay,
      readChat: config.twitchReadChat !== false,
      voice: publicStatus().voice
    }) + '\n\n');
    twitchSseClients.add(res);
    const heartbeat = setInterval(() => {
      try { res.write(': keep-alive\n\n'); } catch { clearInterval(heartbeat); }
    }, 25000);
    req.on('close', () => {
      clearInterval(heartbeat);
      twitchSseClients.delete(res);
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/chat/config') {
    try {
      const body = await readRequestJson(req);
      config.unifiedChat = normalizeUnifiedChatConfig(body.config || body);
      if (body.voiceCommand && typeof body.voiceCommand === 'object') {
        config.twitchVoiceCommand = normalizeTwitchVoiceCommand(body.voiceCommand);
      }
      persistJson(CONFIG_FILE, config);
      const result = { config: config.unifiedChat, voiceCommand: config.twitchVoiceCommand };
      publishUnifiedChatEvent({ type: 'config', ...result });
      return sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      return sendJson(res, 400, { error: error.message || 'No se pudo guardar la personalización del chat.' });
    }
  }

  if (req.method === 'GET' && pathname === '/api/chat/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    const history = recentUnifiedChatMessages.slice(0, 120);
    res.write('data: ' + JSON.stringify({
      type: 'init',
      history,
      platforms: getUnifiedChatPlatforms(),
      config: config.unifiedChat,
      voiceCommand: config.twitchVoiceCommand,
      overlayUrl: `http://${HOST}:${PORT}/unified-chat-overlay`
    }) + '\n\n');
    unifiedChatSseClients.add(res);
    const heartbeat = setInterval(() => {
      try { res.write(': keep-alive\n\n'); } catch { clearInterval(heartbeat); }
    }, 25000);
    req.on('close', () => {
      clearInterval(heartbeat);
      unifiedChatSseClients.delete(res);
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/') {
    return serveAsset(res, 'index.html', 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && (pathname === '/overlay' || pathname === '/overlay.html')) {
    return serveAsset(res, 'overlay.html', 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && pathname === '/app.js') {
    return serveAsset(res, 'app.js', 'text/javascript; charset=utf-8');
  }
  if (req.method === 'GET' && pathname === '/unified-chat-overlay') {
    return serveAsset(res, 'unified-chat-overlay.html', 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && pathname === '/unified-chat-overlay.js') {
    return serveAsset(res, 'unified-chat-overlay.js', 'text/javascript; charset=utf-8');
  }
  if (req.method === 'GET' && pathname === '/unified-chat-overlay.css') {
    return serveAsset(res, 'unified-chat-overlay.css', 'text/css; charset=utf-8');
  }
  if (req.method === 'GET' && pathname === '/overlay.js') {
    return serveAsset(res, 'overlay.js', 'text/javascript; charset=utf-8');
  }
  if (req.method === 'GET' && pathname === '/styles.css') {
    return serveAsset(res, 'styles.css', 'text/css; charset=utf-8');
  }
  if (req.method === 'GET' && pathname === '/overlay.css') {
    return serveAsset(res, 'overlay.css', 'text/css; charset=utf-8');
  }

  if (req.method === 'GET' && pathname === '/api/status') {
    return sendJson(res, 200, publicStatus());
  }

  if (req.method === 'GET' && pathname === '/api/overlay/config') {
    return sendJson(res, 200, { config: config.overlay, audioVisualizer: audioVisualizerState });
  }

  if (req.method === 'POST' && pathname === '/api/overlay/config') {
    try {
      const body = await readRequestJson(req);
      config.overlay = normalizeOverlayConfig(body);
      persistJson(CONFIG_FILE, config);
      publishOverlayEvent({ type: 'config', config: config.overlay });
      return sendJson(res, 200, { ok: true, config: config.overlay });
    } catch (error) {
      return sendJson(res, 400, { error: error.message || 'No se pudo guardar el diseño musical.' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/overlay/audio') {
    try {
      const body = await readRequestJson(req);
      const active = body.active === true;
      const rawLevels = Array.isArray(body.levels) ? body.levels.slice(0, 40) : [];
      const levels = active
        ? Array.from({ length: 32 }, (_, index) => clampNumber(rawLevels[index], 0, 1, 0))
        : Array(32).fill(0);
      audioVisualizerState = {
        active,
        levels,
        rms: active ? clampNumber(body.rms, 0, 1, 0) : 0,
        updatedAt: Date.now()
      };
      publishOverlayEvent({ type: 'audio', audio: audioVisualizerState });
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 400, { error: error.message || 'No se pudo actualizar el visualizador.' });
    }
  }

  if (req.method === 'GET' && pathname === '/api/overlay/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('data: ' + JSON.stringify({
      type: 'init',
      config: config.overlay,
      audio: audioVisualizerState
    }) + '\n\n');
    overlaySseClients.add(res);
    const heartbeat = setInterval(() => {
      try { res.write(': keep-alive\n\n'); } catch { clearInterval(heartbeat); }
    }, 25000);
    req.on('close', () => {
      clearInterval(heartbeat);
      overlaySseClients.delete(res);
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/tts') {
    return serveAsset(res, 'tts.html', 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && pathname === '/tts.js') {
    return serveAsset(res, 'tts.js', 'text/javascript; charset=utf-8');
  }

  if (req.method === 'POST' && pathname === '/api/voice/config') {
    try {
      const body = await readRequestJson(req);
      if (typeof body.apiKey === 'string' && body.apiKey.trim()) config.elevenLabsApiKey = body.apiKey.trim();
      if (body.clearApiKey === true) config.elevenLabsApiKey = '';
      const voiceId = typeof body.voiceId === 'string' ? body.voiceId.trim() : config.elevenLabsVoiceId;
      if (voiceId && !/^[A-Za-z0-9_-]{5,100}$/.test(voiceId)) return sendJson(res, 400, { error: 'El Voice ID no tiene un formato válido.' });
      config.elevenLabsVoiceId = voiceId || '';
      const modelId = typeof body.modelId === 'string' ? body.modelId : config.elevenLabsModelId;
      const allowedModels = new Set(['eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_turbo_v2_5']);
      if (!allowedModels.has(modelId)) return sendJson(res, 400, { error: 'Selecciona un modelo de voz admitido.' });
      config.elevenLabsModelId = modelId;
      const template = typeof body.template === 'string' ? body.template.slice(0, 250) : config.ttsTemplate;
      if (!template.includes('{username}') || !template.includes('{message}')) {
        return sendJson(res, 400, { error: 'La plantilla debe contener {username} y {message}.' });
      }
      config.ttsTemplate = template;
      const requestedSpeed = Number(body.speed ?? config.ttsSpeed ?? 1);
      config.ttsSpeed = Number.isFinite(requestedSpeed) ? Math.min(1.2, Math.max(0.7, requestedSpeed)) : 1;
      const requestedMaxChars = Number(body.maxChars ?? config.ttsMaxChars ?? 180);
      config.ttsMaxChars = Number.isFinite(requestedMaxChars) ? Math.min(180, Math.max(30, Math.round(requestedMaxChars))) : 180;
      config.antiSpam = body.antiSpam !== false;
      config.ttsEnabled = body.enabled !== false;
      persistJson(CONFIG_FILE, config);
      const voice = publicStatus().voice;
      publishTikTokEvent({ type: 'voice-config', voice });
      publishTwitchEvent({ type: 'voice-config', voice });
      return sendJson(res, 200, { ok: true, voice });
    } catch (error) {
      return sendJson(res, 400, { error: error.message || 'No se pudo guardar la configuración de voz.' });
    }
  }

  if (req.method === 'GET' && pathname === '/api/voice/voices') {
    if (!config.elevenLabsApiKey) return sendJson(res, 400, { error: 'Guarda primero tu API key de ElevenLabs.' });
    try {
      const response = await fetch('https://api.elevenlabs.io/v1/voices?page_size=100', {
        headers: { 'xi-api-key': config.elevenLabsApiKey, 'Accept': 'application/json' }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return sendJson(res, response.status === 401 ? 401 : 502, { error: response.status === 401 ? 'La API key de ElevenLabs no es válida.' : `No se pudieron obtener las voces (HTTP ${response.status}).` });
      const voices = (body.voices || []).map(voice => ({
        voice_id: voice.voice_id,
        name: voice.name || voice.voice_id,
        category: voice.category || '',
        labels: voice.labels || {},
        preview_url: voice.preview_url || ''
      }));
      return sendJson(res, 200, { voices });
    } catch (error) {
      return sendJson(res, 502, { error: error.message || 'No se pudo contactar con ElevenLabs.' });
    }
  }

  if (req.method === 'POST' && (pathname === '/api/tts' || pathname === '/api/voice/test')) {
    try {
      const body = await readRequestJson(req);
      const text = pathname === '/api/voice/test'
        ? (typeof body.text === 'string' && body.text.trim() ? body.text : 'Hola, esta es una prueba de voz de NoteLive Studio.')
        : body.text;
      const audio = await createElevenLabsSpeech(text);
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audio.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      return res.end(audio);
    } catch (error) {
      return sendJson(res, 400, { error: error.message || 'No se pudo generar la voz.' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/tiktok/connect') {
    try {
      const body = await readRequestJson(req);
      const username = cleanText(body.username, 64).replace(/^@/, '');
      if (!/^[A-Za-z0-9._]{2,24}$/.test(username)) return sendJson(res, 400, { error: 'Introduce un usuario de TikTok válido, sin URL. Ejemplo: Noukan.' });
      await disconnectTikTok(false);
      config.tiktokUsername = username;
      persistJson(CONFIG_FILE, config);
      tiktokStatus = { connected: false, status: 'connecting', username, error: '' };
      publishTikTokEvent({ type: 'status', status: tiktokStatus });

      const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await import('tiktok-live-connector');
      const connection = new TikTokLiveConnection(username);
      tiktokConnection = connection;
      connection.on(WebcastEvent.CHAT, data => handleTikTokChat(data));
      if (WebcastEvent?.EMOTE) connection.on(WebcastEvent.EMOTE, data => handleTikTokEmote(data));
      if (ControlEvent?.ERROR) connection.on(ControlEvent.ERROR, error => {
        if (tiktokConnection !== connection) return;
        tiktokStatus = { ...tiktokStatus, error: cleanText(error?.message || error || 'Error del conector de TikTok.', 220) };
        publishTikTokEvent({ type: 'status', status: tiktokStatus });
      });
      if (ControlEvent?.DISCONNECTED) connection.on(ControlEvent.DISCONNECTED, () => {
        if (tiktokConnection !== connection) return;
        tiktokStatus = { ...tiktokStatus, connected: false, status: 'disconnected', error: 'La conexión de TikTok se cerró.' };
        publishTikTokEvent({ type: 'status', status: tiktokStatus });
      });
      await connection.connect();
      if (tiktokConnection === connection) {
        tiktokStatus = { connected: true, status: 'connected', username, error: '' };
        publishTikTokEvent({ type: 'status', status: tiktokStatus });
      }
      return sendJson(res, 200, { ok: true, status: tiktokStatus });
    } catch (error) {
      tiktokConnection = null;
      tiktokStatus = { connected: false, status: 'error', username: config.tiktokUsername || '', error: cleanText(error?.message || error, 260) };
      publishTikTokEvent({ type: 'status', status: tiktokStatus });
      return sendJson(res, 502, { error: `No se pudo conectar con TikTok LIVE: ${tiktokStatus.error}` });
    }
  }

  if (req.method === 'POST' && pathname === '/api/tiktok/disconnect') {
    await disconnectTikTok(true);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/tiktok/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(`data: ${JSON.stringify({ type: 'init', status: tiktokStatus, history: recentChatMessages.slice(0, 30), voice: publicStatus().voice })}\n\n`);
    tiktokSseClients.add(res);
    const heartbeat = setInterval(() => {
      try { res.write(': keep-alive\n\n'); } catch { clearInterval(heartbeat); }
    }, 25_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      tiktokSseClients.delete(res);
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/config') {
    try {
      const body = await readRequestJson(req);
      const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
      if (!/^[A-Za-z0-9]{20,100}$/.test(clientId)) {
        return sendJson(res, 400, { error: 'Introduce un Client ID válido del Spotify Developer Dashboard.' });
      }
      // Preserve TikTok and ElevenLabs settings when the Spotify Client ID changes.
      config = { ...config, clientId };
      persistJson(CONFIG_FILE, config);
      return sendJson(res, 200, { ok: true, redirectUri: REDIRECT_URI });
    } catch (error) {
      return sendJson(res, 400, { error: error.message || 'No se pudo guardar la configuración.' });
    }
  }

  if (req.method === 'GET' && pathname === '/login') {
    if (!config.clientId) return sendText(res, 400, 'Primero guarda el Client ID en el panel principal.');

    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(24).toString('hex');
    pendingAuth.set(state, { verifier, createdAt: Date.now() });
    for (const [key, value] of pendingAuth) {
      if (Date.now() - value.createdAt > 10 * 60 * 1000) pendingAuth.delete(key);
    }

    const authorize = new URL(AUTHORIZE_URL);
    authorize.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: 'user-read-currently-playing',
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state
    }).toString();
    res.writeHead(302, { Location: authorize.toString(), 'Cache-Control': 'no-store' });
    return res.end();
  }

  if (req.method === 'GET' && pathname === '/callback') {
    const oauthError = requestUrl.searchParams.get('error');
    const code = requestUrl.searchParams.get('code');
    const state = requestUrl.searchParams.get('state');
    const pending = pendingAuth.get(state);
    if (state) pendingAuth.delete(state);

    if (oauthError) {
      res.writeHead(302, { Location: `/?error=${encodeURIComponent(oauthError)}`, 'Cache-Control': 'no-store' });
      return res.end();
    }
    if (!pending || !code || Date.now() - pending.createdAt > 10 * 60 * 1000) {
      res.writeHead(302, { Location: '/?error=invalid_state', 'Cache-Control': 'no-store' });
      return res.end();
    }

    try {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          code_verifier: pending.verifier
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('Error al obtener token:', response.status, body);
        res.writeHead(302, { Location: '/?error=token_exchange', 'Cache-Control': 'no-store' });
        return res.end();
      }
      tokens = {
        ...body,
        expires_at: Date.now() + (Number(body.expires_in || 3600) * 1000)
      };
      persistJson(TOKENS_FILE, tokens);
      publishPlayback({
        connected: true, is_playing: false, track: null,
        progress_ms: 0, duration_ms: 0, playback_timestamp: 0, error: ''
      });
      schedulePoll(100);
      res.writeHead(302, { Location: '/?connected=1', 'Cache-Control': 'no-store' });
      return res.end();
    } catch (error) {
      console.error('Callback OAuth:', error);
      res.writeHead(302, { Location: '/?error=server_error', 'Cache-Control': 'no-store' });
      return res.end();
    }
  }

  if (req.method === 'POST' && pathname === '/api/disconnect') {
    tokens = null;
    try { fs.unlinkSync(TOKENS_FILE); } catch {}
    lastError = '';
    publishPlayback({
      connected: false, is_playing: false, track: null,
      progress_ms: 0, duration_ms: 0, playback_timestamp: 0, error: ''
    });
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(`data: ${JSON.stringify(playbackState)}\n\n`);
    sseClients.add(res);
    const heartbeat = setInterval(() => {
      try { res.write(': keep-alive\n\n'); } catch { clearInterval(heartbeat); }
    }, 25_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
    return;
  }

  sendText(res, 404, 'Ruta no encontrada.');
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto ${PORT} ya está en uso. Cierra otra instancia de NoteLive Studio.`);
  } else {
    console.error(error);
  }
  if (require.main === module) process.exitCode = 1;
});

function startServer() {
  if (server.listening) return Promise.resolve(server);
  return new Promise((resolve, reject) => {
    const onError = error => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      console.log(`\nNoteLive Studio iniciado en http://${HOST}:${PORT}/`);
      console.log(`Overlay: ${`http://${HOST}:${PORT}/overlay`}`);
      console.log(`Redirect URI de Spotify: ${REDIRECT_URI}\n`);
      schedulePoll(0);
      if (twitchTokens && config.twitchClientId && (USE_TWITCH_PUBLIC_CLIENT || config.twitchClientSecret)) {
        startTwitchEventSub().catch(error => updateTwitchStatus({ connected: false, status: 'error', error: cleanText(error.message, 240) }));
      }
      resolve(server);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(PORT, HOST);
  });
}

async function stopServer() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  try { await disconnectTikTok(false); } catch {}
  try { await disconnectTwitch(false); } catch {}
  for (const client of sseClients) {
    try { client.end(); } catch {}
  }
  sseClients.clear();
  for (const client of tiktokSseClients) {
    try { client.end(); } catch {}
  }
  tiktokSseClients.clear();
  for (const client of twitchSseClients) {
    try { client.end(); } catch {}
  }
  twitchSseClients.clear();
  for (const client of unifiedChatSseClients) {
    try { client.end(); } catch {}
  }
  unifiedChatSseClients.clear();
  if (server.listening) {
    await new Promise(resolve => server.close(() => resolve()));
  }
}

if (require.main === module) {
  startServer().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
  process.on('SIGINT', async () => {
    await stopServer();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await stopServer();
    process.exit(0);
  });
}

module.exports = { startServer, stopServer, HOST, PORT };
