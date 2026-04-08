# PrivateMeet v4.0 🎙️🕶️

**PrivateMeet** es una Aplicación Web Progresiva (PWA) de transcripción y análisis de reuniones enfocada al 100% en la privacidad y la discreción. Utiliza modelos de Inteligencia Artificial locales para asegurar que **ningún dato salga jamás de tu dispositivo**.

---

## ✨ Características Principales

### 🔒 Privacidad Radical (Local AI)
- **Zero Data Leak**: Todo el audio se procesa en tu navegador usando *Transformers.js*. No se usan APIs externas ni servicios en la nube.
- **Funciona Offline**: Una vez descargados los modelos (la primera vez), puedes usar la app en modo avión.

### 🎭 Modo Sigilo (Camuflaje Keep)
- **Interfaz Camuflada**: La aplicación imita perfectamente la interfaz de Google Keep.
- **Fake Lock Screen**: Incluye un "Modo Sigilo" que pone la pantalla totalmente en negro mientras graba, permitiendo grabar en reuniones sin que parezca que el móvil está activo.

### 🧠 Inteligencia Multinivel
- **Selector de Potencia**: Elige entre tres niveles de IA (Básico, Medio, Heavy) según la capacidad de tu dispositivo.
- **Chat IA Contextual**: Chatea con tus grabaciones para hacer preguntas sobre lo que se dijo (ej: "¿Qué presupuesto se acordó?").
- **Marcado de Interés**: Marca momentos clave con un solo clic para priorizarlos en el resumen.

### 📁 Gestión de Datos
- **Persistencia Local**: Guardado automático de audios y transcripciones en una base de datos interna (*Dexie.js*).
- **Exportación PDF**: Genera reportes profesionales con formato estructurado.

---

## 🚀 Instalación y Uso

### Como PWA (Recomendado)
1. Abre la URL en Chrome (Android) o Safari (iOS).
2. Selecciona **"Añadir a la pantalla de inicio"**.
3. La app aparecerá con un icono genérico de "Notas" para mayor discreción.

### Desarrollo Local
```bash
# Clona el repositorio
git clone https://github.com/TU_USUARIO/Transcriptor_audios.git

# Usa cualquier servidor estático (ej. con python)
python -m http.server 8000
```

---

## 🛠️ Stack Tecnológico

- **IA / ML**: [@huggingface/transformers](https://github.com/huggingface/transformers.js) (Whisper, BART, Phi-3).
- **Storage**: [Dexie.js](https://dexie.org/) (IndexedDB).
- **Format**: [jsPDF](https://github.com/parallax/jsPDF) para exportación.
- **UI**: HTML5 / CSS3 (Grid & Flexbox) / Vanilla JS.

---

## ⚠️ Notas Importantes
- **Consumo de Batería**: El procesamiento de IA local es exigente. Se recomienda usar la app con batería suficiente o conectada a la corriente en sesiones largas.
- **Primera Carga**: La primera vez que elijas un modelo, la app descargará entre 100MB y 1GB de modelos. Ten paciencia y usa WiFi.

---
*Desarrollado con enfoque en la seguridad de la información y la confidencialidad en entornos profesionales.*
