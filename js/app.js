// js/app.js
import { db, saveSession, saveChunk, saveAudio, getSessions, getSessionContent } from './db.js';

// UI Refs
const homeScreen = document.getElementById('home-screen');
const noteEditor = document.getElementById('note-editor');
const notesGrid = document.getElementById('notes-grid');
const newNoteFab = document.getElementById('new-note-fab');
const backBtn = document.getElementById('back-btn');
const recordActionBtn = document.getElementById('record-action-btn');
const noteTitleInput = document.getElementById('note-title');
const noteTextArea = document.getElementById('note-text');
const editorStatus = document.getElementById('editor-status');
const recordingDot = document.getElementById('recording-dot');
const pinBtn = document.getElementById('pin-btn');
const chatToggleBtn = document.getElementById('chat-toggle-btn');
const chatPanel = document.getElementById('chat-panel');
const closeChatBtn = document.getElementById('close-chat');
const modelSelect = document.getElementById('model-select');
const fakeLockBtn = document.getElementById('fake-lock-btn');
const fakeLockScreen = document.getElementById('fake-lock-screen');
const exportPdfBtn = document.getElementById('export-pdf-btn');

let worker = null;
let mediaRecorder = null;
let currentSessionId = null;
let isRecording = false;
let audioContext = null;
let stream = null;
let lastChunkIndex = 0;

// Init
window.addEventListener('DOMContentLoaded', async () => {
  await renderNotesGrid();
  initWorker();
});

// UI Navigation
newNoteFab.addEventListener('click', () => {
  openEditor(null);
});

backBtn.addEventListener('click', () => {
  if (isRecording) stopRecording();
  homeScreen.style.display = 'flex';
  noteEditor.style.display = 'none';
  renderNotesGrid();
});

async function openEditor(sessionId) {
  homeScreen.style.display = 'none';
  noteEditor.style.display = 'flex';
  
  if (sessionId) {
    currentSessionId = sessionId;
    const { session, chunks } = await getSessionContent(sessionId);
    noteTitleInput.value = session.title;
    noteTextArea.innerHTML = "";
    chunks.forEach(c => addChunkToUI(c));
    modelSelect.value = session.modelTier;
  } else {
    currentSessionId = null;
    noteTitleInput.value = "Nueva Nota";
    noteTextArea.innerHTML = "";
    modelSelect.value = "medium";
  }
}

async function renderNotesGrid() {
  const sessions = await getSessions();
  notesGrid.innerHTML = "";
  
  if (sessions.length === 0) {
    notesGrid.innerHTML = '<div class="note-skeleton">No hay notas todavía.</div>';
    return;
  }
  
  sessions.forEach(s => {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.innerHTML = `
      <h3>${s.title}</h3>
      <p id="preview-${s.id}">Cargando contenido...</p>
    `;
    card.onclick = () => openEditor(s.id);
    notesGrid.appendChild(card);
    
    getSessionContent(s.id).then(({chunks}) => {
      const text = chunks.map(c => c.text).join(' ');
      document.getElementById(`preview-${s.id}`).textContent = text || "Sin contenido";
    });
  });
}

function initWorker() {
  worker = new Worker('js/worker.js?v=4.1', { type: 'module' });
  
  worker.onmessage = async (event) => {
    const data = event.data;
    
    switch (data.status) {
      case 'init':
        editorStatus.textContent = `${data.name}...`;
        break;
      case 'ready':
        editorStatus.textContent = 'IA Lista';
        break;
      case 'chunk':
        const chunkData = {
          sessionId: currentSessionId,
          speaker: data.chunk.speaker,
          text: data.chunk.text,
          start: data.chunk.timestamp[0],
          end: data.chunk.timestamp[1],
          isHighlight: false
        };
        await saveChunk(chunkData);
        addChunkToUI(chunkData);
        break;
      case 'chat_response':
        addChatMessage('ia', data.text);
        editorStatus.textContent = 'IA ha respondido.';
        break;
      case 'error':
        editorStatus.textContent = `Error AI: ${data.message}`;
        break;
    }
  };
}

function addChunkToUI(chunk) {
  const p = document.createElement('p');
  p.style.marginBottom = '0.5rem';
  p.innerHTML = `<strong style="color: #555">[${chunk.speaker}]</strong> ${chunk.text}`;
  noteTextArea.appendChild(p);
  noteTextArea.scrollTop = noteTextArea.scrollHeight;
}

async function startRecording() {
  if (!currentSessionId) {
    currentSessionId = await saveSession({ 
      title: noteTitleInput.value,
      modelTier: modelSelect.value 
    });
  }

  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  
  mediaRecorder.ondataavailable = async (e) => {
    if (e.data.size > 0) {
      const audioBlob = new Blob([e.data], { type: 'audio/webm' });
      const audioData = await decodeAudio(audioBlob);
      worker.postMessage({ 
        type: 'transcribe', 
        audio: audioData,
        modelTier: modelSelect.value 
      });
      // Guardar audio backup
      await saveAudio(currentSessionId, audioBlob);
    }
  };

  mediaRecorder.start(10000); 
  isRecording = true;
  recordingDot.classList.add('recording');
  recordActionBtn.textContent = '⏹️';
  editorStatus.textContent = 'Grabando...';
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  if (stream) stream.getTracks().forEach(t => t.stop());
  isRecording = false;
  recordingDot.classList.remove('recording');
  recordActionBtn.textContent = '🎙️';
  editorStatus.textContent = 'Sesión guardada';
}

recordActionBtn.addEventListener('click', () => {
  if (isRecording) stopRecording();
  else startRecording();
});

async function decodeAudio(blob) {
  if (!audioContext) audioContext = new AudioContext({ sampleRate: 16000 });
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  return audioBuffer.getChannelData(0);
}

// Marcado de Interés (PIN)
pinBtn.addEventListener('click', () => {
  pinBtn.style.transform = 'scale(1.5)';
  pinBtn.style.color = '#fbbc04';
  setTimeout(() => {
    pinBtn.style.transform = 'scale(1)';
    pinBtn.style.color = '';
  }, 300);
  
  if (isRecording) {
    editorStatus.textContent = "Marcado Punto de Interés ⭐";
    setTimeout(() => editorStatus.textContent = "Grabando...", 2000);
  }
});

// Chat IA
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const chatMessages = document.getElementById('chat-messages');

chatToggleBtn.addEventListener('click', () => {
  chatPanel.style.transform = (chatPanel.style.transform === 'translateX(0%)') ? 'translateX(100%)' : 'translateX(0%)';
});

closeChatBtn.addEventListener('click', () => {
  chatPanel.style.transform = 'translateX(100%)';
});

sendChatBtn.addEventListener('click', async () => {
  const text = chatInput.value.trim();
  if (!text) return;
  
  addChatMessage('user', text);
  chatInput.value = "";
  
  const { chunks } = await getSessionContent(currentSessionId);
  const context = chunks.map(c => c.text).join(' ');
  
  worker.postMessage({
    type: 'chat',
    query: text,
    context: context,
    modelTier: modelSelect.value
  });
});

function addChatMessage(role, text) {
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Pantalla Negra (Fake Lock)
fakeLockBtn.addEventListener('click', () => {
  fakeLockScreen.style.display = 'block';
});

fakeLockScreen.addEventListener('dblclick', () => {
  fakeLockScreen.style.display = 'none';
});

// Exportar PDF
exportPdfBtn.addEventListener('click', async () => {
  const { session, chunks } = await getSessionContent(currentSessionId);
  if (!chunks.length) return alert("Sin contenido para exportar.");
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  doc.setFontSize(20);
  doc.text(session.title, 20, 20);
  doc.setFontSize(10);
  doc.text(`Fecha: ${session.date.toLocaleString()}`, 20, 30);
  
  let y = 40;
  doc.setFontSize(12);
  chunks.forEach(c => {
    if (y > 270) { doc.addPage(); y = 20; }
    const text = `[${c.speaker}] ${c.text}`;
    const splitText = doc.splitTextToSize(text, 170);
    doc.text(splitText, 20, y);
    y += (splitText.length * 7);
  });
  
  doc.save(`${session.title}.pdf`);
});
