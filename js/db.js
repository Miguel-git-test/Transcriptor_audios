// js/db.js
import Dexie from 'https://unpkg.com/dexie/dist/dexie.mjs';

export const db = new Dexie('PrivateMeetDB');

// Esquema de la base de datos
db.version(1).stores({
  sessions: '++id, title, date, duration, modelTier, isFavorite',
  chunks: '++id, sessionId, speaker, text, start, end, isHighlight',
  audios: '++id, sessionId, blob'
});

export async function saveSession(session) {
  return await db.sessions.add({
    title: session.title || 'Nueva Nota',
    date: new Date(),
    duration: session.duration || 0,
    modelTier: session.modelTier || 'medium',
    isFavorite: false
  });
}

export async function saveChunk(chunk) {
  return await db.chunks.add(chunk);
}

export async function saveAudio(sessionId, blob) {
  return await db.audios.add({ sessionId, blob });
}

export async function getSessions() {
  return await db.sessions.orderBy('date').reverse().toArray();
}

export async function getSessionContent(sessionId) {
  const session = await db.sessions.get(sessionId);
  const chunks = await db.chunks.where('sessionId').equals(sessionId).toArray();
  const audio = await db.audios.where('sessionId').equals(sessionId).first();
  return { session, chunks, audio };
}
