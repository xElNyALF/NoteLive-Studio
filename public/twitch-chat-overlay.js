'use strict';

const root = document.querySelector('#chat-root');
const list = document.querySelector('#chat-list');
let chatConfig = {
  enabled: true, accentColor: '#a970ff', backgroundOpacity: 82,
  maxMessages: 6, fontSize: 17, showTimestamp: false, compact: false
};
const seen = new Set();

function applyConfig(config) {
  chatConfig = { ...chatConfig, ...(config || {}) };
  root.hidden = chatConfig.enabled === false;
  root.dataset.compact = String(chatConfig.compact === true);
  root.style.setProperty('--twitch-accent', chatConfig.accentColor || '#a970ff');
  root.style.setProperty('--chat-background', String(Math.max(0.2, Math.min(1, Number(chatConfig.backgroundOpacity || 82) / 100))));
  root.style.setProperty('--chat-font-size', String(Math.max(12, Math.min(24, Number(chatConfig.fontSize) || 17))) + 'px');
  trimMessages();
}

function trustedImageUrl(value) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (host === 'jtvnw.net' || host.endsWith('.jtvnw.net')) ? url.href : '';
  } catch {
    return '';
  }
}

function makeAvatar(item) {
  const avatar = document.createElement('span');
  avatar.className = 'twitch-message-avatar';
  avatar.title = item.username || 'Usuario';
  const url = trustedImageUrl(item.avatarUrl);
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      img.remove();
      avatar.textContent = (item.username || '?').trim().charAt(0).toLocaleUpperCase() || '?';
    }, { once: true });
    avatar.appendChild(img);
  } else {
    avatar.textContent = (item.username || '?').trim().charAt(0).toLocaleUpperCase() || '?';
  }
  return avatar;
}

function renderMessageContent(target, item) {
  const segments = Array.isArray(item.segments) && item.segments.length
    ? item.segments
    : [{ type: 'text', text: item.comment || '' }];
  for (const segment of segments.slice(0, 120)) {
    if (segment?.type === 'emote' && segment.url) {
      const url = trustedImageUrl(segment.url);
      if (url) {
        const image = document.createElement('img');
        image.className = 'twitch-chat-emote';
        image.src = url;
        image.alt = String(segment.alt || segment.text || 'Twitch emote').slice(0, 80);
        image.title = image.alt;
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        target.appendChild(image);
      } else if (segment.text) target.appendChild(document.createTextNode(String(segment.text)));
    } else {
      target.appendChild(document.createTextNode(String(segment && segment.text || '')));
    }
  }
}

function appendRoleBadges(meta, item) {
  const roles = [];
  if (item.isSelf) roles.push(['you', 'YOU', 'Tu propia cuenta']);
  if (item.isBroadcaster) roles.push(['broadcaster', '👑', 'Streamer']);
  if (item.isModerator) roles.push(['moderator', '🛡', 'Moderador']);
  if (item.isVip) roles.push(['vip', '💎', 'VIP']);
  if (item.isSubscriber) roles.push(['subscriber', '⭐', 'Suscriptor']);
  if (item.isFounder) roles.push(['founder', '🏆', 'Fundador']);
  if (item.isPartner) roles.push(['partner', '✓', 'Partner']);
  for (const [kind, icon, label] of roles) {
    const badge = document.createElement('span');
    badge.className = 'twitch-badge role-' + kind;
    badge.title = label;
    badge.setAttribute('aria-label', label);
    badge.textContent = icon;
    meta.appendChild(badge);
  }
}

function addMessage(item) {
  if (!item || !item.id || seen.has(item.id)) return;
  seen.add(item.id);
  if (seen.size > 400) seen.clear();
  const empty = list.querySelector('.twitch-chat-empty');
  if (empty) empty.remove();

  const card = document.createElement('article');
  card.className = 'twitch-message';
  card.dataset.messageId = item.id;
  if (item.isModerator) card.classList.add('is-moderator');
  if (item.isVip) card.classList.add('is-vip');
  if (item.isSubscriber) card.classList.add('is-subscriber');

  const avatar = makeAvatar(item);
  const content = document.createElement('div');
  content.className = 'twitch-message-content';
  const meta = document.createElement('div');
  meta.className = 'twitch-message-meta';
  const username = document.createElement('strong');
  username.className = 'twitch-message-user';
  username.textContent = item.username || 'Usuario';
  meta.appendChild(username);
  appendRoleBadges(meta, item);
  if (chatConfig.showTimestamp) {
    const time = document.createElement('time');
    time.className = 'twitch-message-time';
    time.textContent = new Date(item.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    meta.appendChild(time);
  }
  const message = document.createElement('p');
  message.className = 'twitch-message-text';
  renderMessageContent(message, item);
  content.append(meta, message);
  card.append(avatar, content);
  list.appendChild(card);
  trimMessages();
}

function trimMessages() {
  const max = Math.max(2, Math.min(12, Number(chatConfig.maxMessages) || 6));
  while (list.querySelectorAll('.twitch-message').length > max) list.querySelector('.twitch-message')?.remove();
}

function renderHistory(items) {
  list.replaceChildren();
  seen.clear();
  (items || []).slice(0, 30).reverse().forEach(addMessage);
}

function updateMessage(item) {
  if (!item || !item.id || !item.avatarUrl) return;
  const row = Array.from(list.querySelectorAll('.twitch-message')).find(node => node.dataset.messageId === item.id);
  if (!row) return;
  const avatar = row.querySelector('.twitch-message-avatar');
  if (avatar) avatar.replaceWith(makeAvatar({ ...item, username: row.querySelector('.twitch-message-user')?.textContent || 'Usuario' }));
}

const events = new EventSource('/api/twitch/events');
events.addEventListener('message', event => {
  try {
    const packet = JSON.parse(event.data);
    if (packet.type === 'init') {
      applyConfig(packet.chatConfig || {});
      renderHistory(packet.history || []);
    } else if (packet.type === 'config' && packet.chatConfig) {
      applyConfig(packet.chatConfig);
    } else if (packet.type === 'chat') {
      addMessage(packet.message);
    } else if (packet.type === 'chat-update') {
      updateMessage(packet.message);
    }
  } catch {}
});
events.onerror = () => {};

if (new URLSearchParams(window.location.search).get('preview') === '1') {
  window.addEventListener('DOMContentLoaded', () => {
    if (!list.children.length) {
      addMessage({ id: 'preview-1', username: 'NoukanViewer', comment: '¡Ese overlay se ve increíble!', timestamp: Date.now(), isModerator: true });
      addMessage({ id: 'preview-2', username: 'Moonlight', comment: 'Saludos desde el chat 💜', timestamp: Date.now(), isSubscriber: true });
      addMessage({ id: 'preview-3', username: 'Mika', comment: '¿Qué juego toca hoy? Kappa', timestamp: Date.now(), segments: [{type:'text',text:'¿Qué juego toca hoy? '},{type:'emote',text:'Kappa',alt:'Kappa',url:'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0'}] });
    }
  }, { once: true });
}
