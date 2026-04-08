// js/app.js

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
let fullTranscriptionText = ""; 

function initAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  }
}

// Iniciar Web Worker con Buster v3.3 para forzar actualización
function initWorker() {
  worker = new Worker('js/worker.js?v=3.3', { type: 'module' });
  
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
        statusText.textContent = 'IA Lista. Ya puedes grabar.';
        recordBtn.disabled = false;
        break;
      case 'transcribing':
        statusText.textContent = 'Procesando audio (esto puede tardar)...';
        if (!statusText.innerHTML.includes('spinner')) {
          statusText.innerHTML = '<span class="spinner"></span> Procesando audio (offline)...';
        }
        break;
      case 'chunk':
        addTranscriptionChunk(data.chunk);
        fullTranscriptionText += `\n[${data.chunk.speaker}] ${data.chunk.text}`;
        break;
      case 'complete':
        statusText.textContent = 'Procesamiento completado.';
        summarizeBtn.disabled = false; 
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

function addTranscriptionChunk(chunk) {
  const emptyState = document.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const msgDiv = document.createElement('div');
  const sID = chunk.speaker; 
  let sClass = "A";
  if (sID === "SPEAKER_00") sClass = "A";
  if (sID === "SPEAKER_01") sClass = "B";
  if (sID === "SPEAKER_02") sClass = "C";

  msgDiv.className = `message speaker-${sClass}`;
  
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
  window.scrollTo(0, document.body.scrollHeight);
}

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
  return renderedBuffer.getChannelData(0); 
}

async function toggleRecording() {
  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        statusText.innerHTML = '<span class="spinner"></span> Preparando audio...';
        recordBtn.disabled = true;
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        try {
          const audioData = await decodeAudioFile(audioBlob);
          worker.postMessage({ type: 'transcribe', audio: audioData });
        } catch (err) {
          statusText.textContent = "Error al procesar audio.";
          recordBtn.disabled = false;
        }
      };
      mediaRecorder.start();
      isRecording = true;
      recordBtn.classList.add('recording');
      recordBtn.querySelector('#record-text').textContent = 'Detener';
      statusText.textContent = 'Grabando reunión...';
    } catch (err) {
      statusText.textContent = 'Error: Sin acceso al micrófono.';
    }
  } else {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    isRecording = false;
    recordBtn.classList.remove('recording');
    recordBtn.querySelector('#record-text').textContent = 'Grabar';
  }
}

recordBtn.addEventListener('click', toggleRecording);
summarizeBtn.addEventListener('click', () => {
  if (fullTranscriptionText.trim().length === 0) return;
  summarizeBtn.disabled = true;
  worker.postMessage({ type: 'summarize', text: fullTranscriptionText });
});

window.addEventListener('DOMContentLoaded', () => {
  if (!window.Worker) {
    statusText.textContent = "Navegador no soportado.";
    return;
  }
  initWorker();
});
