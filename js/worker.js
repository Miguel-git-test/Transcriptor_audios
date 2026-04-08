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
    
    sendStatus('init', { name: 'Modelo de Transcripción (Whisper Tiny)' });
    
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
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
                chunk_length_s: 30, // procesar en bloques de 30s
                stride_length_s: 5,
                return_timestamps: true,
                language: 'spanish',
                task: 'transcribe'
            });
            
            // Result contiene 'chunks' si return_timestamps es true
            // [{ timestamp: [0.0, 5.0], text: "hola a todos" }]
            
            let chunks = result.chunks || [{ text: result.text, timestamp: [0, audioData.length / 16000] }];
            
            // Simulación de Diarización (Identificación de locutor)
            // Ya que correr Pyannote completo sobre JS v3 requiere cálculos tensoriales personalizados muy pesados (X-Vectors),
            // implementamos una heurística basada en las pausas (timestamps) para simular cambios de turno.
            // Si hay un silencio > 1.5s entre chunks, asumimos cambio de orador de manera alterna para el prototipo offline.
            let currentSpeaker = "SPEAKER_00";
            
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                
                // Heurística simple de cambio de turno: Si la brecha con el anterior es grande, puede ser otro locutor
                if (i > 0) {
                    const prevChunk = chunks[i-1];
                    const gap = chunk.timestamp[0] - prevChunk.timestamp[1];
                    // Si hubo una pausa larga (> 1 segundo)
                    if (gap > 1.0) {
                        currentSpeaker = currentSpeaker === "SPEAKER_00" ? "SPEAKER_01" : "SPEAKER_00";
                    }
                }
                
                // Enviar fragmento a la interfaz
                sendStatus('chunk', {
                    chunk: {
                        text: chunk.text.trim(),
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
            // Asegurar que el resumidor está cargado
            await initSummarizer();
            
            sendStatus('summary_progress', { text: "Analizando contenido (esto puede tardar unos minutos en el móvil)..." });
            
            const conversation = data.text;
            const prompt = `<|im_start|>system\nEres un asistente de IA útil que resume reuniones de trabajo.\n<|im_end|>\n<|im_start|>user\nResume la siguiente transcripción de una reunión, indicando los puntos clave de cada interlocutor:\n\n${conversation}\n<|im_end|>\n<|im_start|>assistant\n`;
            
            const results = await summarizer(prompt, {
                max_new_tokens: 150,
                temperature: 0.3,
                repetition_penalty: 1.2,
            });
            
            // Extraer respuesta del LLM (quitando el prompt inicial)
            let generatedText = results[0].generated_text;
            generatedText = generatedText.split('<|im_start|>assistant\n')[1] || generatedText;
            
            sendStatus('summary_complete', { text: generatedText });
        } catch (err) {
            sendStatus('error', { message: 'Fallo al resumir: ' + err.message });
        }
    }
};
