// remote_script.js — Remote-plate (Socket.IO version)
// Este script conecta un ordenador (host) con un smartphone mediante un código de 4 dígitos
// y permite enviar selecciones en tiempo real sin usar Firebase.

// ===============================
// CONFIGURACIÓN DEL SERVIDOR
// ===============================
const SIGNALING_SERVER = 'https://timeplate-v1.onrender.com'; // <--- reemplaza por tu URL en Render

// ===============================
// VARIABLES Y ELEMENTOS UI
// ===============================
let socket = null;
let currentPairCode = null;
let isHost = false;
let connected = false;
let lastCopiedKey = null;
let lastCopyTime = 0;

const COPY_COOLDOWN = 2000;
const COPY_DELAY = 200;

const startBtn = document.getElementById('start-btn');
const connectBtn = document.getElementById('connect-btn');
const stopBtn = document.getElementById('stop-btn');
const pairCodeEl = document.getElementById('pair-code');
const connStatusEl = document.getElementById('connection-status');
const keys = Array.from(document.querySelectorAll('.key'));
const soundToggle = document.getElementById('sound-toggle');
const speakerIcon = document.getElementById('speaker-icon');

const connectModal = document.getElementById('connect-modal');
const connectClose = document.getElementById('connect-close');
const connectCodeInput = document.getElementById('connect-code');
const connectConfirm = document.getElementById('connect-confirm');
const phoneKeypad = document.getElementById('phone-keypad');
const phoneKeyButtons = Array.from(document.querySelectorAll('.pk'));
const pkStopBtn = document.getElementById('pk-stop');

const copySound = document.getElementById('copy-sound');

// ===============================
// FUNCIONES UTILITARIAS
// ===============================
function genCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}
function now() {
    return Date.now();
}

// ===============================
// CONFIG LOCALSTORAGE
// ===============================
let keyData = {};
const STORAGE_KEY = 'remoteplateKeyData';
function guardarConfiguracion() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keyData));
}
function cargarConfiguracion() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try {
            keyData = JSON.parse(raw);
            Object.keys(keyData).forEach(num => {
                const el = document.querySelector(`.key[data-key="${num}"] .key-title`);
                if (el) el.textContent = keyData[num].title || el.textContent;
            });
        } catch (e) {
            console.warn('Error parsing config', e);
        }
    } else {
        document.querySelectorAll('.key').forEach(k => {
            const n = k.getAttribute('data-key');
            const title = k.querySelector('.key-title')?.textContent || `Name ${n}`;
            keyData[n] = { title, description: "" };
        });
        guardarConfiguracion();
    }
}

// ===============================
// TEXT TO SPEECH
// ===============================
let synth = window.speechSynthesis;
let voicesList = [];
let preferredVoice = null;
function loadVoices() {
    voicesList = synth.getVoices();
    preferredVoice =
        voicesList.find(v => /en(-|_)?/i.test(v.lang) && /female|woman/i.test(v.name + v.voiceURI)) ||
        voicesList.find(v => /en(-|_)?/i.test(v.lang)) ||
        voicesList[0] ||
        null;
}
if (synth) {
    loadVoices();
    if (typeof speechSynthesis !== 'undefined') {
        speechSynthesis.onvoiceschanged = loadVoices;
    }
}

let soundEnabled = (localStorage.getItem('remoteplate_sound') !== 'false');
function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('remoteplate_sound', soundEnabled);
    speakerIcon.style.filter = soundEnabled ? '' : 'grayscale(1) brightness(0.8)';
}
if (soundToggle) soundToggle.addEventListener('click', toggleSound);
if (!soundEnabled) speakerIcon.style.filter = 'grayscale(1) brightness(0.8)';

function speakText(text) {
    if (!soundEnabled || !synth) return;
    const utt = new SpeechSynthesisUtterance(text);
    if (preferredVoice) utt.voice = preferredVoice;
    utt.lang = 'en-US';
    synth.cancel();
    synth.speak(utt);
}

// ===============================
// COPIAR DESCRIPCIÓN + ANIMACIÓN
// ===============================
function copiarDescripcionKey(numeroKey) {
    const nowTime = now();
    if (numeroKey === lastCopiedKey && (nowTime - lastCopyTime) < COPY_COOLDOWN) return;

    const keyElem = document.querySelector(`.key[data-key="${numeroKey}"]`);
    if (!keyElem) return;
    const descripcion = keyData[numeroKey]?.description || "";

    setTimeout(() => {
        document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
        keyElem.classList.add('active');

        if (descripcion.trim() !== "") {
            navigator.clipboard.writeText(descripcion).then(() => {
                lastCopiedKey = numeroKey;
                lastCopyTime = now();
                speakText(`${numeroKey}`);
                if (copySound && copySound.src) {
                    try { copySound.currentTime = 0; copySound.play().catch(() => { }); } catch (e) { }
                }
            }).catch(err => console.warn('Clipboard error', err));
        }

        setTimeout(() => keyElem.classList.remove('active'), 1200);
    }, COPY_DELAY);
}

// ===============================
// SOCKET.IO CONEXIÓN
// ===============================
function setupSocket() {
    if (socket) return socket;
    socket = io(SIGNALING_SERVER, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
        console.log('✅ Conectado al servidor Socket.IO');
    });

    socket.on('disconnect', () => {
        console.log('⚠️ Desconectado del servidor');
        connStatusEl.textContent = 'Disconnected';
    });

    socket.on('select', data => {
        if (isHost) {
            console.log('Evento recibido:', data);
            copiarDescripcionKey(data.key);
        }
    });

    socket.on('peer-joined', data => {
        if (isHost) connStatusEl.textContent = 'Device connected';
    });

    socket.on('session-ended', () => {
        console.log('Sesión finalizada');
        stopSession();
    });

    return socket;
}

// ===============================
// SESIONES (HOST Y CLIENTE)
// ===============================
async function startSession() {
    await stopSession();
    currentPairCode = genCode();
    isHost = true;
    pairCodeEl.textContent = currentPairCode;
    connStatusEl.textContent = 'Starting...';
    setupSocket();
    socket.emit('join', { code: currentPairCode, role: 'host' });
    connStatusEl.textContent = 'Waiting for device...';
    connected = true;
}

function connectDevice() {
    connectModal.style.display = 'flex';
    connectModal.setAttribute('aria-hidden', 'false');
    connectCodeInput.value = '';
    connectCodeInput.focus();
}

connectConfirm.addEventListener('click', () => {
    const code = (connectCodeInput.value || '').trim();
    if (!/^\d{4}$/.test(code)) {
        alert('Please enter a 4-digit code');
        return;
    }
    currentPairCode = code;
    isHost = false;
    setupSocket();
    socket.emit('join', { code: currentPairCode, role: 'client' });
    connStatusEl.textContent = 'Connected (client)';
    connectModal.style.display = 'none';
    phoneKeypad.style.display = 'block';
});

connectClose.addEventListener('click', () => {
    connectModal.style.display = 'none';
});

async function stopSession() {
    if (socket) {
        socket.emit('end-session', { code: currentPairCode });
        socket.disconnect();
        socket = null;
    }
    currentPairCode = null;
    isHost = false;
    connected = false;
    pairCodeEl.textContent = '—';
    connStatusEl.textContent = 'Not connected';
}

// ===============================
// ENVÍO DE SELECCIÓN DESDE CLIENTE
// ===============================
async function enviarSeleccion(keyNumber) {
    if (!currentPairCode) return;
    setupSocket();
    socket.emit('select', { code: currentPairCode, key: keyNumber });
}

// ===============================
// EVENTOS UI
// ===============================
keys.forEach(k => {
    k.addEventListener('click', () => {
        const num = k.getAttribute('data-key');
        if (isHost && connected) {
            copiarDescripcionKey(num);
        }
    });
});

phoneKeyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        if (key === 'stop') {
            stopSession();
            phoneKeypad.style.display = 'none';
            return;
        }
        enviarSeleccion(key);
        btn.classList.add('pressed');
        setTimeout(() => btn.classList.remove('pressed'), 150);
        try { navigator.vibrate(50); } catch (_) { }
    });
});

startBtn.addEventListener('click', () => startSession());
connectBtn.addEventListener('click', () => connectDevice());
stopBtn.addEventListener('click', () => stopSession());

// ===============================
// INICIALIZACIÓN
// ===============================
cargarConfiguracion();
setTimeout(() => { if (speechSynthesis) speechSynthesis.getVoices(); }, 200);
