// js/worker.js
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0-alpha.19/dist/transformers.min.js';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;

let transcriber = null;
let chatbot = null;
let currentTier = null;

const MODELS = {
  transcription: {
    basic: 'Xenova/whisper-tiny',
    medium: 'Xenova/whisper-base',
    heavy: 'Xenova/whisper-small'
  },
  chat: {
    basic: 'Xenova/LaMini-Flan-T5-248M',
    medium: 'Xenova/Qwen1.5-0.5B-Chat',
    heavy: 'Xenova/Phi-3-mini-4k-instruct'
  }
};

function sendStatus(status, data = {}) {
    self.postMessage({ status, ...data });
}

async function getTranscriber(tier = 'medium') {
  if (transcriber && currentTier === tier) return transcriber;
  
  currentTier = tier;
  const modelId = MODELS.transcription[tier] || MODELS.transcription.medium;
  
  sendStatus('init', { name: `Motor de texto (${tier.toUpperCase()})` });
  
  transcriber = await pipeline('automatic-speech-recognition', modelId, {
    progress_callback: (info) => { 
      if (info.status === 'progress') sendStatus('progress', { loaded: info.loaded, total: info.total }); 
    }
  });
  
  return transcriber;
}

async function getChatbot(tier = 'medium') {
  if (chatbot && currentTier === tier) return chatbot;
  
  const modelId = MODELS.chat[tier] || MODELS.chat.medium;
  
  sendStatus('init', { name: `Análisis de datos (${tier.toUpperCase()})` });
  
  chatbot = await pipeline('text-generation', modelId, {
    progress_callback: (info) => { 
      if (info.status === 'progress') sendStatus('progress', { loaded: info.loaded, total: info.total }); 
    }
  });
  
  return chatbot;
}

// Iniciar cargado inicial (por defecto medium)
getTranscriber('medium').then(() => { sendStatus('ready'); });

self.onmessage = async (event) => {
    const data = event.data;
    
    if (data.type === 'transcribe') {
        try {
            const pipe = await getTranscriber(data.modelTier);
            const audioData = data.audio;
            
            const result = await pipe(audioData, {
                chunk_length_s: 29,
                stride_length_s: 5,
                return_timestamps: true,
                language: 'spanish',
                task: 'transcribe',
                no_repeat_ngram_size: 2
            });
            
            // Filtro de Chunks (Net Progress)
            let rawChunks = result.chunks || [{ text: result.text, timestamp: [0, audioData.length / 16000] }];
            let filteredChunks = rawChunks.filter(c => c.text.trim().length > 0);
            
            for (const chunk of filteredChunks) {
                sendStatus('chunk', {
                    chunk: { 
                      text: chunk.text.trim(), 
                      timestamp: chunk.timestamp, 
                      speaker: "Locutor A" // Diarización heurística WIP
                    }
                });
            }
        } catch (err) {
            sendStatus('error', { message: err.message });
        }
    }
    
    // Lógica de Chat IA (Fase 3)
    if (data.type === 'chat') {
        try {
            const pipe = await getChatbot(data.modelTier);
            sendStatus('summary_progress', { text: "IA analizando la reunión..." });
            
            // Construir prompt con contexto de la reunión
            const context = data.context ? `CONTEXTO DE LA REUNIÓN: ${data.context}\n\n` : "";
            const prompt = `${context}Usuario pregunta: ${data.query}\nRespuesta concisa en español:`;
            
            const results = await pipe(prompt, {
                max_new_tokens: 150,
                temperature: 0.5
            });
            
            let responseText = results[0].generated_text;
            // Limpiar el prompt de la respuesta si el modelo lo repite
            responseText = responseText.replace(prompt, "").trim();
            
            sendStatus('chat_response', { 
                role: 'ia', 
                text: responseText || "No he podido analizar ese punto específico." 
            });
        } catch (err) {
            sendStatus('error', { message: 'Fallo al chatear: ' + err.message });
        }
    }
};
