// ==========================================
// VARIABLES GLOBALES Y ESTADO
// ==========================================
let socket = null;

// Variables Audio
let audioCanvas = null;
let audioCtx = null;
let audioContext = null;
const GANANCIA_VISUAL = 8.0;
const padding = { top: 40, right: 30, bottom: 60, left: 70 };

// Variables Gas
let gasChartInstance = null;
let medicionInterval = null;

// --- NUEVAS VARIABLES: PULSO CARDIÁCO (Lógica del Código 1) ---
let heartChartInstance = null;
let heartRateActive = false;
let heartHistory = new Array(50).fill(0); // Para la gráfica y el cálculo
let lastBeat = 0;
let isPulse = false;
let bpmSamples = [];

// ==========================================
// MÓDULO: PULSO CARDIÁCO (CÁLCULO Y GRÁFICA)
// ==========================================
function inicializarGraficaPulso() {
    const ctx = document.getElementById('heartChart');
    if (ctx) {
        heartChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array(50).fill(""),
                datasets: [{
                    label: 'Señal IR',
                    data: [],
                    borderColor: 'rgb(255, 45, 85)',
                    backgroundColor: 'rgba(255, 45, 85, 0.1)',
                    tension: 0.3,
                    borderWidth: 2,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    x: { display: false },
                    y: { 
                        display: true,
                        grid: { color: 'rgba(0,0,0,0.1)' },
                        ticks: { color: 'black' }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
    }
}

function procesarDatoPulso(val) {
    if (!heartRateActive) return;

    // 1. Actualizar Historial
    heartHistory.push(val);
    heartHistory.shift();

    // 2. Actualizar Gráfica en Box 7
    if (heartChartInstance) {
        heartChartInstance.data.datasets[0].data = heartHistory;
        heartChartInstance.update();
    }

    // 3. Algoritmo de Detección de Latidos (Cálculo de BPM)
    const min = Math.min(...heartHistory);
    const max = Math.max(...heartHistory);
    const range = max - min;
    
    // Solo procesar si hay una señal mínima (dedo puesto)
    if (range > 500) { 
        const threshold = min + (range * 0.80); // Umbral al 80% del pico

        if (val > threshold && !isPulse) {
            const now = Date.now();
            if (lastBeat !== 0) {
                const rawBpm = 60000 / (now - lastBeat);
                // Filtro de rango humano lógico
                if (rawBpm > 40 && rawBpm < 200) {
                    actualizarBPMInterface(rawBpm);
                }
            }
            lastBeat = now;
            isPulse = true;
        } else if (val < threshold) {
            isPulse = false;
        }
    }
}

function actualizarBPMInterface(bpm) {
    bpmSamples.push(bpm);
    if (bpmSamples.length > 5) bpmSamples.shift(); // Promedio móvil de 5 muestras
    
    const avg = Math.round(bpmSamples.reduce((a, b) => a + b) / bpmSamples.length);
    
    // Actualizar el valor en el Box 14
    const bpmDisplay = document.getElementById('bpm-value');
    if (bpmDisplay) {
        bpmDisplay.innerText = avg;
        // Feedback visual de color (Bradicardia, Normal, Taquicardia)
        if (avg < 60) bpmDisplay.style.color = "#ffcc00"; 
        else if (avg <= 100) bpmDisplay.style.color = "#28a745";
        else bpmDisplay.style.color = "#ff3366";
    }
}

// ==========================================
// MÓDULO: AUDIO (OSCILOSCOPIO)
// ==========================================
function inicializarGraficaAudio() {
    audioCanvas = document.getElementById('audioCanvas');
    if (audioCanvas) {
        audioCtx = audioCanvas.getContext('2d');
        audioCanvas.width = 800;
        audioCanvas.height = 400;
        dibujarEjesYValores(1024);
    }
}

function dibujarEjesYValores(totalMuestras) {
    if (!audioCtx) return;
    const w = audioCanvas.width;
    const h = audioCanvas.height;
    audioCtx.fillStyle = 'rgb(10, 10, 10)';
    audioCtx.fillRect(0, 0, w, h);
    audioCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    audioCtx.lineWidth = 1;
    audioCtx.fillStyle = 'rgb(180, 180, 180)';
    audioCtx.font = '12px "Segoe UI", Arial';
    const anchoUtil = w - padding.left - padding.right;
    const altoUtil = h - padding.top - padding.bottom;

    audioCtx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (i * altoUtil / 4);
        const valorY = (1.0 - (i * 2 / 4)).toFixed(1);
        audioCtx.beginPath(); audioCtx.moveTo(padding.left, y); audioCtx.lineTo(w - padding.right, y); audioCtx.stroke();
        audioCtx.fillText(valorY, padding.left - 12, y + 4);
    }
}

function graficarOndaDeAudio(datos) {
    if (!audioCtx || !audioCanvas) return;
    dibujarEjesYValores(datos.length);
    const anchoUtil = audioCanvas.width - padding.left - padding.right;
    const altoUtil = audioCanvas.height - padding.top - padding.bottom;
    const centroY = padding.top + (altoUtil / 2);

    audioCtx.save();
    audioCtx.beginPath();
    audioCtx.rect(padding.left, padding.top, anchoUtil, altoUtil);
    audioCtx.clip();
    audioCtx.lineWidth = 2.5;
    audioCtx.strokeStyle = 'rgb(0, 255, 150)';
    audioCtx.beginPath();
    for (let i = 0; i < datos.length; i++) {
        const x = padding.left + (i / datos.length) * anchoUtil;
        let amp = (datos[i] / 32768.0) * GANANCIA_VISUAL;
        amp = Math.max(-1, Math.min(1, amp));
        const y = centroY - (amp * (altoUtil / 2));
        if (i === 0) audioCtx.moveTo(x, y); else audioCtx.lineTo(x, y);
    }
    audioCtx.stroke();
    audioCtx.restore();
    reproducirAudio(datos);
}

function reproducirAudio(datos) {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const floatData = new Float32Array(datos.length);
    for (let i = 0; i < datos.length; i++) floatData[i] = datos[i] / 32768.0;
    const audioBuffer = audioContext.createBuffer(1, floatData.length, 44100);
    audioBuffer.getChannelData(0).set(floatData);
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start();
}

// ==========================================
// MÓDULO: SENSOR DE GAS Y RADAR (RESTO IGUAL)
// ==========================================
function inicializarGraficaGas() {
    const ctx = document.getElementById('gasChart');
    if (ctx) {
        gasChartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'PPM Gas LP', data: [], borderColor: 'rgb(12, 1, 16)', borderWidth: 2 }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

function actualizarGraficaGas(ppm) {
    if (gasChartInstance) {
        document.getElementById('ppm-value').textContent = ppm.toFixed(2);
        if (gasChartInstance.data.labels.length >= 20) {
            gasChartInstance.data.labels.shift(); gasChartInstance.data.datasets[0].data.shift();
        }
        gasChartInstance.data.labels.push(new Date().toLocaleTimeString());
        gasChartInstance.data.datasets[0].data.push(ppm);
        gasChartInstance.update();
    }
}

function actualizarInterfazRadar(data) {
    const btnRadar = document.getElementById('btn-radar');
    if (btnRadar && !btnRadar.checked) return;

    const elDistMov = document.getElementById('radar-dist-mov');
    const elEneMov = document.getElementById('radar-ene-mov');
    const elDistEst = document.getElementById('radar-dist-est');
    const elEneEst = document.getElementById('radar-ene-est');
    const elStatus = document.getElementById('radar-status');

    if (data.presencia) {
        if(elStatus) {
            elStatus.textContent = "ALERTA - HUMANO DETECTADO";
            elStatus.style.background = "#ff4757";
        }
        // Mostrar valores de movimiento
        if(elDistMov) elDistMov.textContent = data.dist_mov || "0";
        if(elEneMov) elEneMov.textContent = data.ene_mov || "0";
        // Mostrar valores estáticos
        if(elDistEst) elDistEst.textContent = data.dist_est || "0";
        if(elEneEst) elEneEst.textContent = data.ene_est || "0";
    } else {
        if(elStatus) {
            elStatus.textContent = "ESPERA - ÁREA DESPEJADA";
            elStatus.style.background = "#2ed573";
        }
        // Cuando no hay nadie, mostramos el "ruido" o energía base
        if(elDistMov) elDistMov.textContent = "--";
        if(elDistEst) elDistEst.textContent = "--";
        if(elEneMov) elEneMov.textContent = data.ene_mov || "0";
        if(elEneEst) elEneEst.textContent = data.ene_est || "0";
    }
}

// ==========================================
// MÓDULO: WEBSOCKET Y CONTROL PRINCIPAL
// ==========================================
function conectarWebSocket() {
    const ipInput = document.getElementById('ip-input');
    const ip = ipInput.value.trim();
    
    if (!ip) {
        alert('Por favor, ingrese una dirección IP');
        return;
    }
    
    // Si ya hay una conexión, cerrarla primero
    if (socket && socket.readyState !== WebSocket.CLOSED) {
        socket.close();
    }
    
    actualizarEstado('conectando', 'Conectando...');
    socket = new WebSocket(`ws://${ip}/ws`);
    socket.binaryType = "arraybuffer";
    
    socket.onopen = () => {
        console.log("Conectado al ESP32 vía WebSocket en IP:", ip);
        actualizarEstado('conectado', 'Conectado');
    };
    
    socket.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
            graficarOndaDeAudio(new Int16Array(event.data));
        } else {
            try {
                const data = JSON.parse(event.data);
                if (data.tipo === "lectura_radar") actualizarInterfazRadar(data);
                else if (data.tipo === "lectura_gas") actualizarGraficaGas(data.ppm);
                else if (data.tipo === "heart") procesarDatoPulso(data.val);
            } catch (e) { console.log("Error JSON:", event.data); }
        }
    };
    
    socket.onclose = () => {
        console.log("WebSocket cerrado");
        actualizarEstado('desconectado', 'Desconectado');
        detenerMedicionesGas();
    };
    
    socket.onerror = (error) => {
        console.error("Error en WebSocket:", error);
        actualizarEstado('error', 'Error de conexión');
        alert('Error de conexión. Verifique la IP y que el dispositivo esté encendido.');
        detenerMedicionesGas();
    };
}

function desconectarWebSocket() {
    if (socket) {
        socket.close();
        console.log("WebSocket cerrado manualmente");
        actualizarEstado('desconectado', 'Desconectado');
        detenerMedicionesGas();
    }
}

function reconectarWebSocket() {
    conectarWebSocket();
}

function actualizarEstado(estado, mensaje) {
    const estadoElement = document.getElementById('estado');
    if (estadoElement) {
        // Eliminar todas las clases de estado
        estadoElement.classList.remove('conectado', 'desconectado', 'conectando', 'error');
        
        // Añadir la clase correspondiente y actualizar el texto
        estadoElement.textContent = mensaje;
        estadoElement.classList.add(estado);
    }
}

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', () => {
    inicializarGraficaAudio();
    inicializarGraficaGas();
    inicializarGraficaPulso();

    // Botones de Conexión
    const btnConectar = document.getElementById('btn-conectar');
    const btnDesconectar = document.getElementById('btn-desconectar');
    const btnReconectar = document.getElementById('btn-reconectar');
    
    if (btnConectar) {
        btnConectar.addEventListener('click', conectarWebSocket);
    }
    if (btnDesconectar) {
        btnDesconectar.addEventListener('click', desconectarWebSocket);
    }
    if (btnReconectar) {
        btnReconectar.addEventListener('click', reconectarWebSocket);
    }

    document.getElementById('btn-audio').addEventListener('change', (e) => {
        socket?.send(e.target.checked ? "AUDIO_ON" : "AUDIO_OFF");
    });

    document.getElementById('btn-radar').addEventListener('change', (e) => {
        socket?.send(e.target.checked ? "RADAR_ON" : "RADAR_OFF");
    });

    document.getElementById('btn-gas').addEventListener('change', (e) => {
        if (e.target.checked) {
            medicionInterval = setInterval(() => {
                socket?.send(JSON.stringify({ "tipo": "medicion", "sensor": "gaslp" }));
            }, 1000);
        } else clearInterval(medicionInterval);
    });

    // Toggle Pulso (Box 6)
    document.getElementById('btn-heart').addEventListener('change', (e) => {
        heartRateActive = e.target.checked;
        socket?.send(heartRateActive ? "SENSOR_ON" : "SENSOR_OFF");
        if (!heartRateActive) {
            document.getElementById('bpm-value').innerText = "--";
            bpmSamples = [];
        }
    });
});