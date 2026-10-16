'use strict';

const banner = document.querySelector('#follow-alert');
const titleNode = document.querySelector('#alert-title');
const messageNode = document.querySelector('#alert-message');
let alertConfig = {
  enabled: true, style: 'card', durationSeconds: 7, accentColor: '#a970ff',
  title: '¡Nuevo follow!', message: '{username} ahora te sigue', soundEnabled: true
};
let hideTimer = null;
let currentAudioContext = null;

function applyConfig(config) {
  alertConfig = { ...alertConfig, ...(config || {}) };
  banner.dataset.style = alertConfig.style || 'card';
  banner.style.setProperty('--twitch-accent', alertConfig.accentColor || '#a970ff');
}

function playAlertSound() {
  if (!alertConfig.soundEnabled) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (currentAudioContext) currentAudioContext.close().catch(() => {});
    currentAudioContext = new AudioContextClass();
    const context = currentAudioContext;
    const now = context.currentTime;
    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.11);
      gain.gain.setValueAtTime(0.0001, now + index * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.13, now + index * 0.11 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.11 + 0.19);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + index * 0.11);
      oscillator.stop(now + index * 0.11 + 0.21);
    });
    setTimeout(() => context.close().catch(() => {}), 650);
  } catch {}
}

function showAlert(alert) {
  if (!alert || (!alertConfig.enabled && !alert.test)) return;
  clearTimeout(hideTimer);
  titleNode.textContent = alert.title || alertConfig.title || '¡Nuevo follow!';
  messageNode.textContent = alert.message || (alert.username ? alert.username + ' ahora te sigue' : 'Alguien nuevo se unió a la comunidad');
  banner.classList.remove('is-visible', 'is-hiding');
  void banner.offsetWidth;
  banner.classList.add('is-visible');
  playAlertSound();
  hideTimer = setTimeout(() => {
    banner.classList.remove('is-visible');
    banner.classList.add('is-hiding');
    setTimeout(() => banner.classList.remove('is-hiding'), 420);
  }, Math.max(3, Math.min(20, Number(alert.durationSeconds || alertConfig.durationSeconds) || 7)) * 1000);
}

const events = new EventSource('/api/twitch/events');
events.addEventListener('message', event => {
  try {
    const packet = JSON.parse(event.data);
    if (packet.type === 'init') applyConfig(packet.alertConfig || {});
    else if (packet.type === 'config' && packet.alertConfig) applyConfig(packet.alertConfig);
    else if (packet.type === 'follow') showAlert(packet.alert);
  } catch {}
});
events.onerror = () => {};
