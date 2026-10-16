'use strict';

const list = document.querySelector('#chat-list');
const seen = new Set();
const maxMessages = 8;

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

function addMessage(item) {
  if (!item || !item.id || seen.has(item.id)) return;
  seen.add(item.id);
  if (seen.size > 400) seen.clear();
  const empty = list.querySelector('.chat-empty');
  if (empty) empty.remove();

  const row = document.createElement('article');
  row.className = 'chat-message ' + (item.platform === 'twitch' ? 'source-twitch' : 'source-tiktok');
  row.dataset.platform = item.platform || 'tiktok';

  const header = document.createElement('div');
  header.className = 'message-header';
  const source = document.createElement('span');
  source.className = 'source-badge ' + (item.platform === 'twitch' ? 'source-twitch' : 'source-tiktok');
  source.textContent = item.platform === 'twitch' ? 'TWITCH' : 'TIKTOK LIVE';
  const username = document.createElement('strong');
  username.className = 'username';
  username.textContent = item.username || 'Usuario';
  const time = document.createElement('time');
  time.className = 'message-time';
  time.textContent = new Date(item.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  header.append(source, username, time);

  if (item.isModerator || item.isVip || item.isSubscriber) {
    const role = document.createElement('span');
    role.className = 'role-badge';
    role.textContent = item.isModerator ? 'MOD' : item.isVip ? 'VIP' : 'SUB';
    header.appendChild(role);
  }

  const body = document.createElement('div');
  body.className = 'message-body';
  renderMessageBody(body, item);
  row.append(header, body);
  list.appendChild(row);

  while (list.querySelectorAll('.chat-message').length > maxMessages) {
    list.querySelector('.chat-message')?.remove();
  }
}

function renderHistory(items = []) {
  list.replaceChildren();
  seen.clear();
  items.slice(0, 120).sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0)).slice(-maxMessages).forEach(addMessage);
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

const events = new EventSource('/api/chat/events');
events.addEventListener('message', event => {
  try {
    const packet = JSON.parse(event.data);
    if (packet.type === 'init') {
      setPlatforms(packet.platforms || {});
      renderHistory(packet.history || []);
    } else if (packet.type === 'status') {
      setPlatforms(packet.platforms || {});
    } else if (packet.type === 'chat') {
      addMessage(packet.message);
    }
  } catch {}
});
events.onerror = () => {};

if (new URLSearchParams(window.location.search).get('preview') === '1') {
  window.addEventListener('DOMContentLoaded', () => {
    if (!list.querySelector('.chat-message')) {
      addMessage({
        id: 'preview-twitch', platform: 'twitch', username: 'Moonlight', timestamp: Date.now() - 5000,
        comment: '¡Qué buena partida! Kappa',
        segments: [
          { type: 'text', text: '¡Qué buena partida! ' },
          { type: 'emote', text: 'Kappa', alt: 'Kappa', url: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0' }
        ],
        isSubscriber: true
      });
      addMessage({
        id: 'preview-tiktok', platform: 'tiktok', username: 'Mika', timestamp: Date.now(),
        comment: 'Vamos con todo 🔥💜', segments: [{ type: 'text', text: 'Vamos con todo 🔥💜' }]
      });
    }
  }, { once: true });
}
