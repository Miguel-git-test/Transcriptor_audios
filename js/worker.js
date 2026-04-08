// js/worker.js
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0-alpha.19/dist/transformers.min.js';

// Optimizar para navegador
env.allowLocalModels = false;
// Usar WebAssembly backend en lugar de ONNX nativo (por defecto en navegadores)
// Si el navegador soporta WebGPU será más rápido, pero WASM es más compatible
env.backends.onnx.wasm.numThreads = 1;

let transcriber = null;
let summarizer = null;

// Enviar estado a app.js
function sendStatus(status, data = {}) {
    self.postMessage({ status, ...data });
}

// Inicializar la tubería de Transcripción
async function initTranscriber() {
    if (transcriber) return transcriber;
    
    sendStatus('init', { name: 'Modelo de Transcripción (Whisper Base)' });
    
    // Cambiamos a whisper-base que alucina menos en español, y forzamos float32 para la inferencia webgpu
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base', {
        progress_callback: (info) => {
            if (info.status === 'progress') {
                sendStatus('progress', { loaded: info.loaded, total: info.total });
            }
        }
    });
    
    return transcriber;
}

// Inicializar Resumidor
async function initSummarizer() {
    if (summarizer) return summarizer;
    
    sendStatus('init', { name: 'Modelo de Resumen (Qwen 0.5B)' });
    
    // Qwen 0.5B es un modelo LLM pequeño y eficiente
    summarizer = await pipeline('text-generation', 'Xenova/Qwen1.5-0.5B-Chat', {
        progress_callback: (info) => {
            if (info.status === 'progress') {
                sendStatus('progress', { loaded: info.loaded, total: info.total });
            }
        }
    });
    
    return summarizer;
}

// Iniciar cargado inicial
initTranscriber().then(() => {
    sendStatus('ready');
}).catch(err => {
    sendStatus('error', { message: err.message });
});

// Procesar mensajes del Main Thread
self.onmessage = async (event) => {
    const data = event.data;
    
    if (data.type === 'transcribe') {
        try {
            sendStatus('transcribing');
            const audioData = data.audio; // Float32Array a 16kHz
            
            // Ejecutar Whisper
            const result = await transcriber(audioData, {
                chunk_length_s: 29, // Cambiado de 30 a 29 para evitar problemas de timestamps
                stride_length_s: 5,
                return_timestamps: true,
                language: 'spanish',
                task: 'transcribe',
                no_repeat_ngram_size: 2,
                temperature: [0, 0.5, 0.9],
            });
            
            let rawChunks = result.chunks || [{ text: result.text, timestamp: [0, audioData.length / 16000] }];
            
            // FILTRADO DE DUPLICADOS Y SOLAPAMIENTOS
            // Whisper a veces devuelve fragmentos que se pisan entre sí. 
            // Filtramos para quedarnos solo con los que avanzan en el tiempo.
            let chunks = [];
            let lastEndTime = -1;
            
            for (const chunk of rawChunks) {
                const [start, end] = chunk.timestamp;
                // Si el fragmento empieza significativamente después del anterior o es el primero
                if (start >= lastEndTime - 0.5) { 
                    chunks.push(chunk);
                    lastEndTime = end;
                }
            }
            
            // Proceder con la diarización sobre los chunks filtrados
            let currentSpeaker = "SPEAKER_00";
            
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const text = chunk.text.trim();
                
                if (!text) continue; // Ignorar fragmentos vacíos
                
                if (i > 0) {
                    const prevChunk = chunks[i-1];
                    const gap = chunk.timestamp[0] - prevChunk.timestamp[1];
                    if (gap > 1.2) { // Un segundo de silencio suele indicar cambio de turno
                        currentSpeaker = currentSpeaker === "SPEAKER_00" ? "SPEAKER_01" : "SPEAKER_00";
                    }
                }
                
                sendStatus('chunk', {
                    chunk: {
                        text: text,
                        timestamp: chunk.timestamp,
                        speaker: currentSpeaker
                    }
                });
            }
            
            sendStatus('complete');
            
        } catch (err) {
            sendStatus('error', { message: 'Fallo al transcribir: ' + err.message });
        }
    }
    
    if (data.type === 'summarize') {
        try {
            // Cambiamos a Bart para mayor compatibilidad de archivos ONNX en navegadores
            if (!summarizer) {
                summarizer = await pipeline('summarization', 'Xenova/distill-bart-cnn-12-6', {
                    progress_callback: (info) => {
                        if (info.status === 'progress') {
                            sendStatus('progress', { loaded: info.loaded, total: info.total });
                        }
                    }
                });
            }
            
            sendStatus('summary_progress', { text: "Resumiendo transcripción..." });
            
            const results = await summarizer(data.text, {
                max_new_tokens: 150,
                min_new_tokens: 30,
            });
            
            let generatedText = results[0].summary_text;
            
            sendStatus('summary_complete', { text: generatedText });
        } catch (err) {
            sendStatus('error', { message: 'Fallo al resumir: ' + err.message });
        }
    }
};
