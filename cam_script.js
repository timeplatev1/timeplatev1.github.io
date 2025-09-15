// --- Lógica original de cámara y detección ---
const video = document.getElementById('camera-video');
const cameraText = document.getElementById('camera-text');
const startBtn = document.getElementById('start-camera');
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement.getContext('2d');
const fingerCountElement = document.getElementById('finger-count');
const copySound = document.getElementById('copy-sound');

let streamActivo = null;
let camera = null;
let hands = null;

let keyData = {}; // Guardará título y descripción por número de key

// Cooldown para evitar copias repetidas
let lastCopiedKey = null;
let lastCopyTime = 0;
const COPY_COOLDOWN = 2000; // ms
const COPY_DELAY = 500; // ms de delay antes de copiar

function distancia(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function contarDedosMano(landmarks, handLabel) {
    let dedos = 0;
    const thumbTip = landmarks[4];
    const thumbIP = landmarks[3];

    if (handLabel) {
        if (handLabel === 'Right') {
            if (thumbTip.x < thumbIP.x) dedos++;
        } else if (handLabel === 'Left') {
            if (thumbTip.x > thumbIP.x) dedos++;
        }
    } else {
        const wristX = landmarks[0].x;
        if (thumbTip.x < wristX && thumbTip.x < thumbIP.x) {
            dedos++;
        } else if (thumbTip.x > wristX && thumbTip.x > thumbIP.x) {
            dedos++;
        }
    }

    if (landmarks[8].y < landmarks[6].y) dedos++;
    if (landmarks[12].y < landmarks[10].y) dedos++;
    if (landmarks[16].y < landmarks[14].y) dedos++;
    if (landmarks[20].y < landmarks[18].y) dedos++;

    return dedos;
}

// 🔒 Guardar configuración en localStorage
function guardarConfiguracion() {
    localStorage.setItem("timeplateKeyData", JSON.stringify(keyData));
}

// 📂 Cargar configuración desde localStorage
function cargarConfiguracion() {
    const data = localStorage.getItem("timeplateKeyData");
    if (data) {
        keyData = JSON.parse(data);

        // Restaurar títulos en la UI
        Object.keys(keyData).forEach(num => {
            const keyElem = document.querySelector(`.key[data-key="${num}"] .key-title`);
            if (keyElem) keyElem.textContent = keyData[num].title || `Name ${num}`;
        });
    }
}

// Copiar descripción con delay y reproducir sonido
function copiarDescripcionKey(numeroKey) {
    const now = Date.now();
    if (numeroKey === lastCopiedKey && (now - lastCopyTime) < COPY_COOLDOWN) {
        return; // evitar copias continuas
    }

    const keyElem = document.querySelector(`.key[data-key="${numeroKey}"]`);
    if (!keyElem) return;

    const descripcion = keyData[numeroKey]?.description || "";

    // ⏳ Delay antes de resaltar y copiar
    setTimeout(() => {
        document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
        keyElem.classList.add('active');

        if (descripcion.trim() !== "") {
            navigator.clipboard.writeText(descripcion)
                .then(() => {
                    console.log(`Descripción del key ${numeroKey} copiada:`, descripcion);
                    lastCopiedKey = numeroKey;
                    lastCopyTime = Date.now();

                    // 🔊 reproducir sonido
                    if (copySound) {
                        copySound.currentTime = 0;
                        copySound.play().catch(err => console.warn("No se pudo reproducir el sonido:", err));
                    }
                })
                .catch(err => console.error("Error al copiar:", err));
        } else {
            console.log(`Key ${numeroKey} no tiene descripción para copiar.`);
            lastCopiedKey = numeroKey;
            lastCopyTime = Date.now();
        }

        setTimeout(() => keyElem.classList.remove('active'), 2000);
    }, COPY_DELAY);
}

// Encender / apagar cámara
startBtn.addEventListener('click', async () => {
    if (!streamActivo) {
        try {
            streamActivo = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = streamActivo;
            cameraText.style.display = 'none';
            video.style.display = 'block';
            iniciarDeteccion();
        } catch (error) {
            alert("No se pudo acceder a la cámara: " + error.message);
        }
    } else {
        streamActivo.getTracks().forEach(track => track.stop());
        streamActivo = null;
        video.style.display = 'none';
        cameraText.style.display = 'block';
        fingerCountElement.textContent = "NO DETECTION";
        if (camera) camera.stop();
    }
});

function iniciarDeteccion() {
    hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7
    });

    hands.onResults(onResults);

    camera = new Camera(video, {
        onFrame: async () => {
            await hands.send({ image: video });
        },
        width: 600,
        height: 250
    });
    camera.start();
}

function onResults(results) {
    if (video.videoWidth && video.videoHeight) {
        canvasElement.width = video.videoWidth;
        canvasElement.height = video.videoHeight;
    }

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (results.image) {
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    }

    const handsDetected = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;

    if (!handsDetected) {
        fingerCountElement.textContent = "NO DETECTION";
        document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
        canvasCtx.restore();
        return;
    }

    let totalDedos = 0;
    let gestoCero = false;

    results.multiHandLandmarks.forEach((landmarks, idx) => {
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: 'rgba(255, 255, 255, 1)', lineWidth: 2 });
        drawLandmarks(canvasCtx, landmarks, { color: '#000000ff', lineWidth: 1 });

        let handLabel = null;
        if (results.multiHandedness && results.multiHandedness[idx]) {
            const classification = results.multiHandedness[idx];
            handLabel = classification.label || (classification.classification && classification.classification[0] && classification.classification[0].label) || null;
        }

        const dedosEstaMano = contarDedosMano(landmarks, handLabel);
        totalDedos += dedosEstaMano;

        const dist = distancia(landmarks[4], landmarks[8]);
        if (dist < 0.05) {
            gestoCero = true;
        }
    });

    if (gestoCero) {
        fingerCountElement.textContent = "CERO ✅";
        copiarDescripcionKey(0);
    } else {
        fingerCountElement.textContent = `Number: ${totalDedos}`;
        if (totalDedos > 0 && totalDedos <= 10) {
            copiarDescripcionKey(totalDedos);
        }
    }

    canvasCtx.restore();
}

// --- Modal de edición ---
const modal = document.getElementById('modal');
const closeModalBtn = document.getElementById('close-modal');
const modalInput = document.getElementById('modal-input');
const modalDescription = document.getElementById('modal-description');
const saveBtn = document.getElementById('save-title');

let currentTitleElement = null;

// Inicializar keyData con títulos actuales
document.querySelectorAll('.key').forEach(key => {
    const number = key.getAttribute('data-key');
    const titleText = key.querySelector('.key-title')?.textContent || "";
    keyData[number] = {
        title: titleText,
        description: ""
    };
});

// Abrir modal al hacer click en el título
document.querySelectorAll('.key').forEach(key => {
    const title = key.querySelector('.key-title');
    const number = key.getAttribute('data-key');
    if (!title) return;

    title.addEventListener('click', (e) => {
        e.stopPropagation();
        currentTitleElement = title;

        modalInput.value = title.textContent;
        modalDescription.value = keyData[number]?.description || "";

        modal.style.display = 'block';
        modalInput.focus();
    });
});

closeModalBtn.addEventListener('click', () => {
    modal.style.display = 'none';
});

saveBtn.addEventListener('click', () => {
    if (currentTitleElement && modalInput.value.trim() !== '') {
        const parentKey = currentTitleElement.closest('.key');
        const keyNumber = parentKey.getAttribute('data-key');

        currentTitleElement.textContent = modalInput.value.trim();
        keyData[keyNumber] = {
            title: modalInput.value.trim(),
            description: modalDescription.value.trim()
        };

        guardarConfiguracion(); // 💾 Guardar cambios
    }
    modal.style.display = 'none';
});

window.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

// 🚀 Cargar configuración al iniciar
cargarConfiguracion();
