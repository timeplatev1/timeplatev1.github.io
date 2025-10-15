// remote_script.js
// Remote-plate: versión mejorada — Firebase Realtime DB y teclado numérico responsive para smartphone.

// ========== CONFIG FIREBASE ==========
const firebaseConfig = {
    apiKey: "AIzaSyXXXXXXX",
    authDomain: "remote-plate.firebaseapp.com",
    projectId: "remote-plate",
    storageBucket: "remote-plate.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef123456",
    databaseURL: "https://remote-plate-default-rtdb.firebaseio.com"
};

// ========== UI ELEMENTS ==========
const startBtn = document.getElementById('start-btn');
const connectBtn = document.getElementById('connect-btn');
const stopBtn = document.getElementById('stop-btn');
const pairCodeEl = document.getElementById('pair-code');
const connStatusEl = document.getElementById('connection-status');
const keys = Array.from(document.querySelectorAll('.key'));
const soundToggle = document.getElementById('sound-toggle');
const speakerIcon = document.getElementById('speaker-icon');

const modal = document.getElementById('modal');
const closeModalBtn = document.getElementById('close-modal');
const modalInput = document.getElementById('modal-input');
const modalDescription = document.getElementById('modal-description');
const saveBtn = document.getElementById('save-title');

const connectModal = document.getElementById('connect-modal');
const connectClose = document.getElementById('connect-close');
const connectCodeInput = document.getElementById('connect-code');
const connectConfirm = document.getElementById('connect-confirm');
const phoneKeypad = document.getElementById('phone-keypad');
const phoneKeyButtons = Array.from(document.querySelectorAll('.pk'));
const pkStopBtn = document.getElementById('pk-stop');

const copySound = document.getElementById('copy-sound');

let keyData = {};
const STORAGE_KEY = 'remoteplateKeyData';

// connection state
let isHost = false;
let connected = false;
let currentPairCode = null;
let lastCopiedKey = null;
let lastCopyTime = 0;
const COPY_COOLDOWN = 2000;
const COPY_DELAY = 200;

// Firebase vars
let firebaseApp = null;
let firebaseDBRef = null;
let firebaseListener = null;

// utility
function genCode() { return Math.floor(1000 + Math.random() * 9000).toString(); }
function now() { return Date.now(); }

/* ========= LocalStorage (guardar/cargar) ========= */
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
        } catch (e) { console.warn('Error parsing config', e); }
    } else {
        document.querySelectorAll('.key').forEach(k => {
            const n = k.getAttribute('data-key');
            const title = k.querySelector('.key-title')?.textContent || `Name ${n}`;
            keyData[n] = { title, description: "" };
        });
        guardarConfiguracion();
    }
}

/* ========= Modal edición ========= */
let currentTitleElement = null;
document.querySelectorAll('.key').forEach(key => {
    const title = key.querySelector('.key-title');
    const number = key.getAttribute('data-key');
    if (!title) return;
    title.addEventListener('click', (e) => {
        e.stopPropagation();
        currentTitleElement = title;
        modalInput.value = title.textContent;
        modalDescription.value = keyData[number]?.description || "";
        modal.style.display = 'flex';
        modalInput.focus();
    });
});
closeModalBtn && closeModalBtn.addEventListener('click', () => modal.style.display = 'none');
saveBtn && saveBtn.addEventListener('click', () => {
    if (currentTitleElement && modalInput.value.trim() !== '') {
        const parentKey = currentTitleElement.closest('.key');
        const keyNumber = parentKey.getAttribute('data-key');
        currentTitleElement.textContent = modalInput.value.trim();
        keyData[keyNumber] = { title: modalInput.value.trim(), description: modalDescription.value.trim() };
        guardarConfiguracion();
    }
    modal.style.display = 'none';
});
window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

/* ========= TTS Web Speech (voz femenina en inglés) ========= */
let synth = window.speechSynthesis;
let voicesList = [];
let preferredVoice = null;
function loadVoices() {
    voicesList = synth.getVoices();
    preferredVoice = voicesList.find(v => /en(-|_)?/i.test(v.lang) && /female|woman/i.test(v.name + (v.voiceURI || '')))
        || voicesList.find(v => /en(-|_)?/i.test(v.lang))
        || voicesList[0] || null;
}
if (synth) {
    loadVoices();
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = loadVoices;
}
let soundEnabled = (localStorage.getItem('remoteplate_sound') !== 'false');
function toggleSound() { soundEnabled = !soundEnabled; localStorage.setItem('remoteplate_sound', soundEnabled); speakerIcon.style.filter = soundEnabled ? '' : 'grayscale(1) brightness(0.8)'; }
soundToggle.addEventListener('click', toggleSound);
if (!soundEnabled) speakerIcon.style.filter = 'grayscale(1) brightness(0.8)';
function speakText(text) { if (!soundEnabled || !synth) return; const utt = new SpeechSynthesisUtterance(text); if (preferredVoice) utt.voice = preferredVoice; utt.lang = 'en-US'; synth.cancel(); synth.speak(utt); }

/* ========= Copiar descripción en host y TTS ========= */
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
                if (isHost) {
                    speakText(`${numeroKey}`);
                    if (copySound && copySound.src) { try { copySound.currentTime = 0; copySound.play().catch(() => { }); } catch (e) { } }
                }
            }).catch(err => console.warn('Clipboard error', err));
        }
        setTimeout(() => keyElem.classList.remove('active'), 1200);
    }, COPY_DELAY);
}

/* ========= FIREBASE SETUP ========= */
async function loadScript(src) {
    return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
    });
}
async function setupFirebase() {
    try {
        await loadScript('https://www.gstatic.com/firebasejs/9.24.0/firebase-app-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/9.24.0/firebase-database-compat.js');
        firebaseApp = firebase.initializeApp(firebaseConfig);
        const database = firebase.database();
        firebaseDBRef = database.ref('remoteplate_sessions');
        console.log('Firebase initialized');
        return true;
    } catch (e) {
        console.warn('Firebase load error', e);
        return false;
    }
}

/* ========= SESSION CONTROL ========= */
async function startSession() {
    await stopSession(); // cleanup
    currentPairCode = genCode();
    isHost = true;
    connected = false;
    pairCodeEl.textContent = currentPairCode;
    connStatusEl.textContent = 'Waiting for device...';
    const ok = await setupFirebase();
    if (!ok) { connStatusEl.textContent = 'Firebase not available'; return; }
    await firebaseDBRef.child(currentPairCode).set({ hostOnline: true, timestamp: Date.now() });
    firebaseListener = firebaseDBRef.child(currentPairCode + '/events');
    firebaseListener.on('child_added', snap => {
        const val = snap.val();
        if (val && val.type === 'select' && val.key != null) {
            copiarDescripcionKey(val.key);
        }
    });
    connected = true;
    connStatusEl.textContent = 'Connected (via Firebase)';
}

async function connectDevice() {
    // Opens connect modal (smartphone) — user types code and confirms -> show keypad
    connectModal.style.display = 'flex';
    connectModal.setAttribute('aria-hidden', 'false');
    connectCodeInput.value = '';
    connectCodeInput.focus();
}

// confirm connection from modal (smartphone)
connectConfirm.addEventListener('click', async () => {
    const code = (connectCodeInput.value || '').trim();
    if (!/^\d{4}$/.test(code)) {
        alert('Please enter a 4-digit code');
        return;
    }
    currentPairCode = code;
    isHost = false;
    const ok = await setupFirebase();
    if (!ok) { alert('Unable to initialize connection (Firebase).'); return; }
    // mark client online
    try { await firebaseDBRef.child(currentPairCode).update({ clientOnline: true, clientTimestamp: Date.now() }); } catch (e) { }
    connected = true;
    connStatusEl.textContent = 'Connected (via Firebase)';
    // show phone keypad for sending numbers
    phoneKeypad.style.display = 'block';
    connectCodeInput.style.display = 'none';
    connectConfirm.style.display = 'none';
    document.getElementById('phone-keypad-hint').style.display = 'block';
    // ensure big stop button is visible
    pkStopBtn.style.display = 'inline-block';
});

// close connect modal
connectClose.addEventListener('click', () => {
    connectModal.style.display = 'none';
    connectModal.setAttribute('aria-hidden', 'true');
    // reset phone-keypad UI
    phoneKeypad.style.display = 'none';
    connectCodeInput.style.display = 'block';
    connectConfirm.style.display = 'inline-block';
    document.getElementById('phone-keypad-hint').style.display = 'none';
});

/* ========= SENDING SELECTIONS ========= */
async function enviarSeleccion(keyNumber) {
    if (!currentPairCode || !connected) { console.warn('No session'); return; }
    const payload = { type: 'select', key: keyNumber, ts: Date.now() };
    if (firebaseDBRef) {
        try {
            await firebaseDBRef.child(currentPairCode + '/events').push(payload);
        } catch (e) { console.warn('Error sending selection', e); }
    } else {
        console.warn('No signaling backend');
    }
}

/* phone keypad handlers (smartphone) */
phoneKeyButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const key = btn.getAttribute('data-key');
        // visual & haptic feedback
        btn.classList.add('pressed');
        setTimeout(() => btn.classList.remove('pressed'), 160);
        try { if (navigator.vibrate) navigator.vibrate(40); } catch (_) { } // vibrate short

        if (btn.id === 'pk-stop') {
            // special stop: disconnect the phone from session (the host still has session until stop)
            await stopSessionClientSide();
            connectModal.style.display = 'none';
            connectModal.setAttribute('aria-hidden', 'true');
            return;
        }
        // send key to Firebase
        await enviarSeleccion(key);
        // small confirmation UI (flash)
        btn.style.transform = 'scale(0.98)';
        setTimeout(() => btn.style.transform = '', 150);
    });
});

/* stop from modal (client side) */
async function stopSessionClientSide() {
    // only client-side: just mark disconnected in UI
    connected = false;
    currentPairCode = null;
    document.getElementById('phone-keypad-hint').style.display = 'none';
    phoneKeypad.style.display = 'none';
    connectCodeInput.style.display = 'block';
    connectConfirm.style.display = 'inline-block';
    connStatusEl.textContent = 'Not connected (client)';
    // close modal
    connectModal.style.display = 'none';
    connectModal.setAttribute('aria-hidden', 'true');
}

/* ========= Stop session (host) ========= */
async function stopSession() {
    if (firebaseListener && firebaseListener.off) firebaseListener.off();
    if (firebaseDBRef && currentPairCode) {
        try { await firebaseDBRef.child(currentPairCode).remove(); } catch (e) { }
    }
    currentPairCode = null;
    isHost = false;
    connected = false;
    pairCodeEl.textContent = '—';
    connStatusEl.textContent = 'Not connected';
}

/* ========= Desktop keypad click (host) ========= */
keys.forEach(k => {
    k.addEventListener('click', () => {
        const num = k.getAttribute('data-key');
        if (isHost && connected) {
            // when host clicks its own keys, copy directly
            copiarDescripcionKey(num);
        } else {
            // if not host, open connect modal (for phone)
            connectDevice();
        }
    });
});

/* ========= UI buttons ========= */
startBtn.addEventListener('click', async () => { await startSession(); });
connectBtn.addEventListener('click', async () => { await connectDevice(); });
stopBtn.addEventListener('click', async () => { await stopSession(); });

/* ========= init ========= */
cargarConfiguracion();
setTimeout(() => { if (speechSynthesis) speechSynthesis.getVoices(); }, 200);

/* ========= conveniences: open connect modal automatically on small screens when clicking Connect device button ========= */
(function ensureMobileBehavior() {
    // if device width small and user presses connectBtn, open modal (already wired)
    // also allow Enter key in input to confirm
    connectCodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') connectConfirm.click();
    });
})();
