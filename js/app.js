// js/app.js

// Referencias a UI
const statusText = document.getElementById('system-status');
const progressBar = document.getElementById('progress-bar');
const progressContainer = document.getElementById('progress-container');
const recordBtn = document.getElementById('record-btn');
const summarizeBtn = document.getElementById('summarize-btn');
const transcriptionContainer = document.getElementById('transcription-container');
const summaryPanel = document.getElementById('summary-panel');
const summaryContent = document.getElementById('summary-content');

let worker = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let audioContext = null;
let fullTranscriptionText = ""; // Guardamos el texto final para el resumen

// Inicializar AudioContext (requerido para remuestrear a 16kHz para Whisper)
function initAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  }
}

// Iniciar Web Worker con Buster para forzar actualización
function initWorker() {
  worker = new Worker('js/worker.js?v=3.2', { type: 'module' });
  
  worker.onmessage = (event) => {
    const data = event.data;
    
    switch (data.status) {
      case 'init':
        statusText.textContent = `Cargando IA: ${data.name}...`;
        progressContainer.style.display = 'block';
        break;
      case 'progress':
        const percent = Math.round((data.loaded / data.total) * 100);
        progressBar.style.width = `${percent}%`;
        statusText.textContent = `Descargando IA local (${percent}%)... Esto solo pasa la primera vez.`;
        break;
      case 'ready':
        progressContainer.style.display = 'none';
        statusText.textContent = 'IA Lista. Sistemas operativos.';
        recordBtn.disabled = false;
        break;
      case 'transcribing':
        statusText.textContent = 'Transcribiendo audio y detectando voces... (Puede tardar)';
        // Añadir spinner si no hay
        if (!statusText.innerHTML.includes('spinner')) {
          statusText.innerHTML = '<span class="spinner"></span> Procesando audio (offline)...';
        }
        break;
      case 'chunk':
        // Recibimos un fragmento transcrito con su locutor identificado
        addTranscriptionChunk(data.chunk);
        fullTranscriptionText += `\n[${data.chunk.speaker}] ${data.chunk.text}`;
        break;
      case 'complete':
        statusText.textContent = 'Procesamiento completado.';
        summarizeBtn.disabled = false; // Permitir resumir
        break;
      case 'summary_progress':
        summaryPanel.style.display = 'block';
        summaryContent.innerHTML = '<span class="spinner"></span> ' + data.text;
        break;
      case 'summary_complete':
        statusText.textContent = 'Resumen completado.';
        summaryContent.innerHTML = data.text.replace(/\n/g, '<br>');
        break;
      case 'error':
        statusText.textContent = `Error: ${data.message}`;
        recordBtn.disabled = false;
        console.error(data.message);
        break;
    }
  };
}

// Función para actualizar la UI con los chunks
function addTranscriptionChunk(chunk) {
  // Limpiar estado vacío si existe
  const emptyState = document.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const msgDiv = document.createElement('div');
  // Asignar clase de locutor (Speaker A, B, C...)
  // chunk.speaker vendrá como "A", "B", o "C" (ej. "Speaker A" -> sacamos la última letra o usamos la cadena exacta)
  let speakerCode = "A";
  if (chunk.speaker.includes('1')) speakerCode = "A";
  else if (chunk.speaker.includes('2')) speakerCode = "B";
  else if (chunk.speaker.includes('3')) speakerCode = "C";
  // O simplemente mapear el ID del speaker a una letra
  const sID = chunk.speaker; 
  let sClass = "A";
  if (sID === "SPEAKER_00") sClass = "A";
  if (sID === "SPEAKER_01") sClass = "B";
  if (sID === "SPEAKER_02") sClass = "C";

  msgDiv.className = `message speaker-${sClass}`;
  
  // Format time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const timeStr = `${formatTime(chunk.timestamp[0])} - ${formatTime(chunk.timestamp[1])}`;

  msgDiv.innerHTML = `
    <span class="speaker-label">Interlocutor ${sClass}</span>
    <p class="message-text">${chunk.text}</p>
    <span class="message-time">${timeStr}</span>
  `;
  
  transcriptionContainer.appendChild(msgDiv);
  // Auto scroll
  window.scrollTo(0, document.body.scrollHeight);
}

// Convertir Blob de Audio a Float32Array (16kHz, mono) que requiere Whisper
async function decodeAudioFile(blob) {
  initAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  let offlineCtx = new OfflineAudioContext(1, audioBuffer.duration * 16000, 16000);
  let source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start();
  
  let renderedBuffer = await offlineCtx.startRendering();
  return renderedBuffer.getChannelData(0); // Float32Array
}

// Controlar Grabación
async function toggleRecording() {
  if (!isRecording) {
    // Iniciar Grabación
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      
      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      
      mediaRecorder.onstop = async () => {
        statusText.innerHTML = '<span class="spinner"></span> Preparando audio...';
        recordBtn.disabled = true;
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        
        try {
          const audioData = await decodeAudioFile(audioBlob);
          // Enviar a worker
          worker.postMessage({ type: 'transcribe', audio: audioData });
        } catch (err) {
          statusText.textContent = "Error al procesar audio.";
          console.error(err);
          recordBtn.disabled = false;
        }
      };
      
      mediaRecorder.start();
      isRecording = true;
      
      recordBtn.classList.add('recording');
      recordBtn.querySelector('#record-text').textContent = 'Detener';
      statusText.textContent = 'Grabando reunión...';
      
    } catch (err) {
      statusText.textContent = 'Error: No hay acceso al micrófono.';
      console.error(err);
    }
  } else {
    // Detener grabación
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    isRecording = false;
    recordBtn.classList.remove('recording');
    recordBtn.querySelector('#record-text').textContent = 'Grabar';
  }
}

// Listeners
recordBtn.addEventListener('click', toggleRecording);

summarizeBtn.addEventListener('click', () => {
  if (fullTranscriptionText.trim().length === 0) return;
  summarizeBtn.disabled = true;
  worker.postMessage({ type: 'summarize', text: fullTranscriptionText });
});

// Arrancar App
window.addEventListener('DOMContentLoaded', () => {
  if (!window.Worker) {
    statusText.textContent = "Tu navegador no soporta Web Workers.";
    return;
  }
  initWorker();
});
