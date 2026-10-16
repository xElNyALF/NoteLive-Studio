'use strict';

// Fuente de audio para OBS. La API key jamás sale del servidor local.
const stateNode = document.getElementById('state');
const queue = [];
let busy = false;
let enabled = true;
let configured = false;
let currentAudioUrl = null;

function updateStatus(text) {
  if (stateNode) stateNode.textContent = text;
}

async function playNext() {
  if (busy || !queue.length) return;
  busy = true;
  const message = queue.shift();
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message.speakText })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `No se pudo generar la voz (HTTP ${response.status}).`);
    }
    const blob = await response.blob();
    if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = URL.createObjectURL(blob);
    const audio = new Audio(currentAudioUrl);
    audio.preload = 'auto';
    await new Promise((resolve, reject) => {
      audio.addEventListener('ended', resolve, { once: true });
      audio.addEventListener('error', () => reject(new Error('No se pudo reproducir el audio.')), { once: true });
      audio.play().catch(reject);
    });
    updateStatus('Leyendo mensajes del chat.');
  } catch (error) {
    updateStatus(error.message || 'Error en el lector de voz.');
  } finally {
    busy = false;
    if (currentAudioUrl) {
      URL.revokeObjectURL(currentAudioUrl);
      currentAudioUrl = null;
    }
    setTimeout(playNext, 250);
  }
}

function handleChat(message) {
  if (!enabled || !configured || !message?.shouldSpeak || !message?.speakText) return;
  // Limita la cola para que no se acumulen minutos de voz en un chat rápido.
  if (queue.length >= 8) queue.shift();
  queue.push(message);
  playNext();
}

const events = new EventSource('/api/tiktok/events');
events.onmessage = event => {
  try {
    const packet = JSON.parse(event.data);
    if (packet.type === 'init') {
      enabled = packet.voice?.enabled !== false;
      configured = Boolean(packet.voice?.configured);
      updateStatus(configured ? 'Lector de chat listo.' : 'Configura ElevenLabs en el panel principal.');
    } else if (packet.type === 'status') {
      // El estado de conexión no modifica por sí solo los ajustes del lector.
    } else if (packet.type === 'voice-config') {
      enabled = packet.voice?.enabled !== false;
      configured = Boolean(packet.voice?.configured);
      if (!configured) queue.length = 0;
      updateStatus(configured ? 'Lector de chat listo.' : 'Configura ElevenLabs en el panel principal.');
    } else if (packet.type === 'chat') {
      handleChat(packet.message);
    }
  } catch {}
};

events.onerror = () => updateStatus('Reconectando con el servidor local…');


// Twitch usa el mismo lector de voz, pero mantiene su propio flujo de eventos.
const twitchVoiceEvents = new EventSource('/api/twitch/events');
twitchVoiceEvents.onmessage = event => {
  try {
    const packet = JSON.parse(event.data);
    if (packet.type === 'init') {
      enabled = packet.voice?.enabled !== false;
      configured = Boolean(packet.voice?.configured);
      updateStatus(configured ? 'Lector de chat listo para Twitch y TikTok.' : 'Configura ElevenLabs en el panel principal.');
    } else if (packet.type === 'voice-config') {
      enabled = packet.voice?.enabled !== false;
      configured = Boolean(packet.voice?.configured);
      if (!configured) queue.length = 0;
      updateStatus(configured ? 'Lector de chat listo para Twitch y TikTok.' : 'Configura ElevenLabs en el panel principal.');
    } else if (packet.type === 'chat') {
      handleChat(packet.message);
    }
  } catch {}
};
twitchVoiceEvents.onerror = () => {};
