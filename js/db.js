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

// Sembrar nota de ayuda inicial
export async function seedHelpNote() {
  const sessions = await db.sessions.count();
  if (sessions === 0) {
    const id = await db.sessions.add({
      title: '📘 Guía: Cómo usar PrivateMeet',
      date: new Date(),
      duration: 0,
      modelTier: 'medium',
      isFavorite: true
    });
    
    const instructions = [
      { speaker: 'IA', text: '¡Bienvenido! Esta app parece un bloc de notas pero es un potente transcriptor privado.' },
      { speaker: 'IA', text: '1. GRABAR: Pulsa el "+" abajo a la derecha, ponle título a la nota y pulsa el icono del 🎙️ abajo.' },
      { speaker: 'IA', text: '2. SIGILO: Pulsa las 🕶️ para poner la pantalla negra mientras grabas. Doble clic para volver.' },
      { speaker: 'IA', text: '3. INTERÉS: Pulsa el 📌 para marcar momentos clave. La IA les dará prioridad en el resumen.' },
      { speaker: 'IA', text: '4. CHAT: Pulsa el 💬 para preguntar dudas sobre lo que se ha hablado (ej: "¿Qué tareas se asignaron?").' },
      { speaker: 'IA', text: '5. NIVELES: Elige Básico (rápido), Medio o Heavy (IA máxima, descarga ~1GB) según tu móvil.' },
      { speaker: 'IA', text: '6. EXPORTAR: Usa los tres puntos ⋮ arriba a la derecha para generar un PDF profesional.' }
    ];
    
    for (const inst of instructions) {
      await db.chunks.add({ ...inst, sessionId: id, start: 0, end: 0, isHighlight: false });
    }
  }
}
