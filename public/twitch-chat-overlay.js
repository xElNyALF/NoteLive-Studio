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

function addMessage(item) {
  if (!item || !item.id || seen.has(item.id)) return;
  seen.add(item.id);
  if (seen.size > 400) seen.clear();
  const empty = list.querySelector('.twitch-chat-empty');
  if (empty) empty.remove();

  const card = document.createElement('article');
  card.className = 'twitch-message';
  if (item.isModerator) card.classList.add('is-moderator');
  if (item.isVip) card.classList.add('is-vip');
  if (item.isSubscriber) card.classList.add('is-subscriber');

  const meta = document.createElement('div');
  meta.className = 'twitch-message-meta';
  const username = document.createElement('strong');
  username.className = 'twitch-message-user';
  username.textContent = item.username || 'Usuario';
  meta.appendChild(username);
  if (item.isModerator) {
    const badge = document.createElement('span'); badge.className = 'twitch-badge'; badge.textContent = 'MOD'; meta.appendChild(badge);
  } else if (item.isVip) {
    const badge = document.createElement('span'); badge.className = 'twitch-badge'; badge.textContent = 'VIP'; meta.appendChild(badge);
  } else if (item.isSubscriber) {
    const badge = document.createElement('span'); badge.className = 'twitch-badge'; badge.textContent = 'SUB'; meta.appendChild(badge);
  }
  if (chatConfig.showTimestamp) {
    const time = document.createElement('time');
    time.className = 'twitch-message-time';
    time.textContent = new Date(item.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    meta.appendChild(time);
  }
  const message = document.createElement('p');
  message.className = 'twitch-message-text';
  message.textContent = item.comment || '';
  card.append(meta, message);
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
  (items || []).slice(0, 12).reverse().forEach(addMessage);
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
    }
  } catch {}
});
events.onerror = () => {};
