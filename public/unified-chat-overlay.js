'use strict';

const list = document.querySelector('#chat-list');
const seen = new Set();
let latestItems = [];
let chatConfig = {
  fontFamily: 'modern', fontSize: 15, usernameColor: '#f3f5fa', messageColor: '#e7ebf2',
  twitchAccent: '#b58aff', tiktokAccent: '#50e5c1', backgroundOpacity: 88, maxMessages: 8,
  showAvatars: true, showBadges: true, showPlatformBadge: true, showTimestamp: true, compact: false
};
const fontStacks = {
  modern: 'Inter, "Segoe UI", system-ui, sans-serif',
  windows: '"Segoe UI", Tahoma, sans-serif',
  rounded: '"Trebuchet MS", "Segoe UI", sans-serif',
  gaming: '"Arial Black", "Segoe UI", sans-serif',
  retro: '"Courier New", Consolas, monospace',
  serif: 'Georgia, "Times New Roman", serif',
  playful: '"Comic Sans MS", "Trebuchet MS", sans-serif',
  elegant: '"Palatino Linotype", Palatino, serif'
};

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

function applyConfig(input = {}) {
  chatConfig = { ...chatConfig, ...(input || {}) };
  const root = document.documentElement;
  root.style.setProperty('--chat-font', fontStacks[chatConfig.fontFamily] || fontStacks.modern);
  root.style.setProperty('--chat-font-size', Math.max(12, Math.min(22, Number(chatConfig.fontSize) || 15)) + 'px');
  root.style.setProperty('--chat-username-color', chatConfig.usernameColor || '#f3f5fa');
  root.style.setProperty('--chat-message-color', chatConfig.messageColor || '#e7ebf2');
  root.style.setProperty('--twitch', chatConfig.twitchAccent || '#b58aff');
  root.style.setProperty('--tiktok', chatConfig.tiktokAccent || '#50e5c1');
  root.style.setProperty('--chat-background-opacity', String(Math.max(0.25, Math.min(1, Number(chatConfig.backgroundOpacity || 88) / 100))));
  document.body.dataset.compact = String(chatConfig.compact === true);
  if (latestItems.length) renderHistory(latestItems);
  else trimMessages();
}

function makeAvatar(item) {
  const wrap = document.createElement('span');
  wrap.className = 'chat-avatar ' + (item.platform === 'twitch' ? 'avatar-twitch' : 'avatar-tiktok');
  wrap.title = item.username || 'Usuario';
  const url = trustedChatImageUrl(item.avatarUrl, item.platform);
  if (url) {
    const image = document.createElement('img');
    image.src = url;
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

function renderMessageBody(target, item) {
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

function appendRoleBadges(target, item) {
  if (chatConfig.showBadges === false) return;
  const roles = [];
  if (item.isSelf) roles.push(['you', 'TÚ', 'Tu propia cuenta']);
  if (item.isBroadcaster) roles.push(['broadcaster', '👑', 'Streamer']);
  if (item.isModerator) roles.push(['moderator', '🛡', 'Moderador']);
  if (item.isVip) roles.push(['vip', '💎', 'VIP']);
  if (item.isSubscriber) roles.push(['subscriber', '⭐', 'Suscriptor']);
  if (item.isFounder) roles.push(['founder', '🏆', 'Fundador']);
  if (item.isPartner) roles.push(['partner', '✓', 'Partner']);
  for (const [kind, icon, label] of roles) {
    const badge = document.createElement('span');
    badge.className = 'role-badge role-' + kind;
    badge.title = label;
    badge.setAttribute('aria-label', label);
    badge.textContent = icon;
    target.appendChild(badge);
  }
}

function makeSourceBadge(platform) {
  const isTwitch = platform === 'twitch';
  const badge = document.createElement('span');
  badge.className = 'source-badge ' + (isTwitch ? 'source-twitch' : 'source-tiktok');
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

function addMessage(item) {
  if (!item || !item.id || seen.has(item.id)) return;
  seen.add(item.id);
  latestItems.push(item);
  if (latestItems.length > 120) latestItems = latestItems.slice(-120);
  if (seen.size > 400) seen.clear();
  const empty = list.querySelector('.chat-empty');
  if (empty) empty.remove();

  const row = document.createElement('article');
  const isTwitch = item.platform === 'twitch';
  row.className = 'chat-message ' + (isTwitch ? 'source-twitch' : 'source-tiktok');
  if (!chatConfig.showAvatars) row.classList.add('no-avatar');
  row.dataset.platform = item.platform || 'tiktok';
  row.dataset.messageId = item.id;

  const avatar = makeAvatar(item);
  const content = document.createElement('div');
  content.className = 'message-content';
  const header = document.createElement('div');
  header.className = 'message-header';

  if (chatConfig.showPlatformBadge !== false) {
    header.appendChild(makeSourceBadge(item.platform));
  }

  const username = document.createElement('strong');
  username.className = 'username';
  username.textContent = item.username || 'Usuario';
  header.appendChild(username);
  appendRoleBadges(header, item);

  if (chatConfig.showTimestamp !== false) {
    const time = document.createElement('time');
    time.className = 'message-time';
    time.textContent = new Date(item.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    header.appendChild(time);
  }

  const body = document.createElement('div');
  body.className = 'message-body';
  renderMessageBody(body, item);
  content.append(header, body);
  row.append(avatar, content);
  list.appendChild(row);
  trimMessages();
}

function trimMessages() {
  const max = Math.max(3, Math.min(12, Number(chatConfig.maxMessages) || 8));
  while (list.querySelectorAll('.chat-message').length > max) {
    const oldest = list.querySelector('.chat-message');
    if (oldest) seen.delete(oldest.dataset.messageId || '');
    oldest?.remove();
  }
}

function renderHistory(items = []) {
  const ordered = items.slice(0, 120).sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0)).slice(-Math.max(3, Math.min(12, Number(chatConfig.maxMessages) || 8)));
  list.replaceChildren();
  seen.clear();
  latestItems = [];
  ordered.forEach(addMessage);
}

function updateMessage(packet) {
  if (!packet || !packet.id) return;
  const cached = latestItems.find(item => item.id === packet.id);
  if (cached) Object.assign(cached, packet);
  const row = Array.from(list.querySelectorAll('.chat-message')).find(node => node.dataset.messageId === packet.id);
  if (!row) return;
  if (packet.avatarUrl) {
    const current = row.querySelector('.chat-avatar');
    const model = { id: packet.id, username: row.querySelector('.username')?.textContent || 'Usuario', platform: row.dataset.platform, avatarUrl: packet.avatarUrl };
    const next = makeAvatar(model);
    if (current) current.replaceWith(next);
    else row.prepend(next);
  }
}

function setPlatforms(platforms = {}) {
  for (const [key, id] of [['tiktok', 'tiktok-state'], ['twitch', 'twitch-state']]) {
    const element = document.getElementById(id);
    const state = platforms[key] || {};
    element.classList.toggle('is-connected', state.connected === true);
    element.classList.toggle('is-offline', state.connected !== true);
    const label = key === 'tiktok' ? 'TikTok LIVE' : 'Twitch';
    element.textContent = state.connected ? label + ' · conectado' : label;
    const dot = document.createElement('i');
    element.prepend(dot);
  }
}

const previewMode = new URLSearchParams(window.location.search).get('preview') === '1';
if (!previewMode) {
  const events = new EventSource('/api/chat/events');
  events.addEventListener('message', event => {
    try {
      const packet = JSON.parse(event.data);
      if (packet.type === 'init') {
        applyConfig(packet.config || {});
        setPlatforms(packet.platforms || {});
        renderHistory(packet.history || []);
      } else if (packet.type === 'config') {
        applyConfig(packet.config || {});
      } else if (packet.type === 'status') {
        setPlatforms(packet.platforms || {});
      } else if (packet.type === 'chat') {
        addMessage(packet.message);
      } else if (packet.type === 'chat-update') {
        updateMessage(packet.message);
      }
    } catch {}
  });
  events.onerror = () => {};
}

if (previewMode) {
  window.addEventListener('DOMContentLoaded', () => {
    applyConfig(chatConfig);
    if (!list.querySelector('.chat-message')) {
      addMessage({
        id: 'preview-twitch', platform: 'twitch', username: 'Moonlight', timestamp: Date.now() - 5000,
        comment: '¡Qué buena partida! Kappa',
        segments: [
          { type: 'text', text: '¡Qué buena partida! ' },
          { type: 'emote', text: 'Kappa', alt: 'Kappa', url: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0' }
        ],
        avatarUrl: '', isSubscriber: true
      });
      addMessage({
        id: 'preview-tiktok', platform: 'tiktok', username: 'Mika', timestamp: Date.now(),
        comment: 'Vamos con todo 🔥💜', segments: [{ type: 'text', text: 'Vamos con todo 🔥💜' }], avatarUrl: ''
      });
    }
  }, { once: true });
}
