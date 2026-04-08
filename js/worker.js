// js/worker.js
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0-alpha.19/dist/transformers.min.js';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;

let transcriber = null;
let summarizer = null;

function sendStatus(status, data = {}) {
    self.postMessage({ status, ...data });
}

async function initTranscriber() {
    if (transcriber) return transcriber;
    sendStatus('init', { name: 'Modelo Transcripción (Whisper Base)' });
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base', {
        progress_callback: (info) => { if (info.status === 'progress') sendStatus('progress', { loaded: info.loaded, total: info.total }); }
    });
    return transcriber;
}

initTranscriber().then(() => { sendStatus('ready'); }).catch(err => { sendStatus('error', { message: err.message }); });

self.onmessage = async (event) => {
    const data = event.data;
    
    if (data.type === 'transcribe') {
        try {
            sendStatus('transcribing');
            const audioData = data.audio; 
            
            const result = await transcriber(audioData, {
                chunk_length_s: 29, 
                stride_length_s: 5,
                return_timestamps: true,
                language: 'spanish',
                task: 'transcribe',
                no_repeat_ngram_size: 2,
                temperature: [0, 0.5, 0.9],
            });
            
            let rawChunks = result.chunks || [{ text: result.text, timestamp: [0, audioData.length / 16000] }];
            
            // FILTRADO ROBUSTO DE DUPLICADOS
            let chunks = [];
            let lastEndTime = 0;
            
            for (const chunk of rawChunks) {
                const [start, end] = chunk.timestamp;
                const text = chunk.text.trim();
                
                if (!text) continue;
                
                // Si este fragmento aporta tiempo nuevo al final
                if (end > lastEndTime + 0.5) {
                    chunks.push(chunk);
                    lastEndTime = end;
                }
            }
            
            let currentSpeaker = "SPEAKER_00";
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                if (i > 0) {
                    const prevChunk = chunks[i-1];
                    const gap = chunk.timestamp[0] - prevChunk.timestamp[1];
                    if (gap > 1.2) { 
                        currentSpeaker = currentSpeaker === "SPEAKER_00" ? "SPEAKER_01" : "SPEAKER_00";
                    }
                }
                sendStatus('chunk', {
                    chunk: { text: chunk.text.trim(), timestamp: chunk.timestamp, speaker: currentSpeaker }
                });
            }
            sendStatus('complete');
        } catch (err) { sendStatus('error', { message: 'Fallo al transcribir: ' + err.message }); }
    }
    
    if (data.type === 'summarize') {
        try {
            // CORRECCIÓN BART: distilbart con una sola 'l'
            if (!summarizer) {
                sendStatus('init', { name: 'Resumidor BART (270MB)' });
                summarizer = await pipeline('summarization', 'Xenova/distilbart-cnn-12-6', {
                    progress_callback: (info) => { if (info.status === 'progress') sendStatus('progress', { loaded: info.loaded, total: info.total }); }
                });
            }
            
            sendStatus('summary_progress', { text: "Resumiendo transcripción (local)..." });
            const results = await summarizer(data.text, { max_new_tokens: 150, min_new_tokens: 30 });
            sendStatus('summary_complete', { text: results[0].summary_text });
        } catch (err) { sendStatus('error', { message: 'Fallo al resumir: ' + err.message }); }
    }
};
