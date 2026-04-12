// --- VARIABLES GLOBALES ---
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

    // EJE Y
    audioCtx.textAlign = 'right';
    const divisionesY = 4;
    for (let i = 0; i <= divisionesY; i++) {
        const y = padding.top + (i * altoUtil / divisionesY);
        const valorY = (1.0 - (i * 2 / divisionesY)).toFixed(1);
        audioCtx.beginPath();
        audioCtx.moveTo(padding.left, y);
        audioCtx.lineTo(w - padding.right, y);
        audioCtx.stroke();
        audioCtx.fillText(valorY, padding.left - 12, y + 4);
    }

    // EJE X
    audioCtx.textAlign = 'center';
    const divisionesX = 8;
    for (let i = 0; i <= divisionesX; i++) {
        const x = padding.left + (i * anchoUtil / divisionesX);
        const valorX = Math.round((i / divisionesX) * totalMuestras);
        audioCtx.beginPath();
        audioCtx.moveTo(x, padding.top);
        audioCtx.lineTo(x, h - padding.bottom);
        audioCtx.stroke();
        audioCtx.fillText(valorX, x, h - padding.bottom + 25);
    }

    audioCtx.font = 'bold 13px "Segoe UI"';
    audioCtx.fillStyle = 'rgb(0, 255, 150)';
    audioCtx.save();
    audioCtx.translate(25, padding.top + altoUtil / 2);
    audioCtx.rotate(-Math.PI / 2);
    audioCtx.fillText("AMPLITUD (Visual x" + GANANCIA_VISUAL + ")", 0, 0);
    audioCtx.restore();
    audioCtx.fillText("TIEMPO (Muestras)", padding.left + anchoUtil / 2, h - 15);

    audioCtx.strokeStyle = 'rgb(60, 60, 60)';
    audioCtx.strokeRect(padding.left, padding.top, anchoUtil, altoUtil);
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
    audioCtx.shadowBlur = 10;
    audioCtx.shadowColor = 'rgba(0, 255, 150, 0.8)';
    audioCtx.beginPath();

    for (let i = 0; i < datos.length; i++) {
        const x = padding.left + (i / datos.length) * anchoUtil;
        let amplitudNormalizada = (datos[i] / 32768.0) * GANANCIA_VISUAL;

        if (amplitudNormalizada > 1.0) amplitudNormalizada = 1.0;
        if (amplitudNormalizada < -1.0) amplitudNormalizada = -1.0;

        const y = centroY - (amplitudNormalizada * (altoUtil / 2));

        if (i === 0) audioCtx.moveTo(x, y);
        else audioCtx.lineTo(x, y);
    }

    audioCtx.stroke();
    audioCtx.restore();
    reproducirAudio(datos);
}

function reproducirAudio(datos) {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const floatData = new Float32Array(datos.length);
    for (let i = 0; i < datos.length; i++) {
        floatData[i] = datos[i] / 32768.0;
    }
    const audioBuffer = audioContext.createBuffer(1, floatData.length, 44100);
    audioBuffer.getChannelData(0).set(floatData);
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start();
}


// ==========================================
// MÓDULO: SENSOR DE GAS (CHART.JS)
// ==========================================
function inicializarGraficaGas() {
    const ctx = document.getElementById('gasChart');
    if (ctx) {
        gasChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'PPM Gas LP',
                    data: [],
                    borderColor: 'rgb(12, 1, 16)',
                    backgroundColor: 'rgb(12, 1, 16)',
                    tension: 0.1,
                    borderWidth: 2,
                    clip: false,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: { bottom: 5 }
                },
                scales: {
                    x: {
                        display: true,
                        title: { display: true, text: 'Tiempo', color: 'black', font: { size: 14, weight: 'bold' } },
                        ticks: { color: 'black', maxRotation: 45, minRotation: 45, autoSkip: true, maxTicksLimit: 10, padding: 10 },
                        grid: { color: 'rgba(26, 1, 1, 0.1)', drawBorder: true, borderColor: 'rgba(20, 2, 2, 0.89)' }
                    },
                    y: {
                        display: true,
                        title: { display: true, text: 'PPM', color: 'black', font: { size: 14, weight: 'bold' } },
                        ticks: { color: 'black', padding: 10 },
                        grid: { color: 'rgba(19, 2, 2, 0.74)', drawBorder: true, borderColor: 'rgba(18, 1, 1, 0.61)' },
                        min: 0,
                        max: 5000,
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: { display: true, labels: { color: 'white', font: { size: 12 } } }
                }
            }
        });
    }
}

function iniciarMedicionesGas() {
    medicionInterval = setInterval(() => {
        const btnGas = document.getElementById('btn-gas');
        if (socket && socket.readyState === WebSocket.OPEN && btnGas && btnGas.checked) {
            const mensaje = { "tipo": "medicion", "sensor": "gaslp" };
            socket.send(JSON.stringify(mensaje));
        }
    }, 1000);
}

function detenerMedicionesGas() {
    if (medicionInterval) {
        clearInterval(medicionInterval);
        medicionInterval = null;
    }
}

function actualizarGraficaGas(ppm) {
    if (gasChartInstance) {
        const ppmValueElement = document.getElementById('ppm-value');
        if (ppmValueElement) {
            ppmValueElement.textContent = ppm.toFixed(2);
        }
        
        if (gasChartInstance.data.labels.length >= 20) {
            gasChartInstance.data.labels.shift();
            gasChartInstance.data.datasets[0].data.shift();
        }
        
        const ahora = new Date();
        const tiempo = ahora.getHours().toString().padStart(2, '0') + ':' + 
                       ahora.getMinutes().toString().padStart(2, '0') + ':' + 
                       ahora.getSeconds().toString().padStart(2, '0');
        
        gasChartInstance.data.labels.push(tiempo);
        gasChartInstance.data.datasets[0].data.push(ppm);
        gasChartInstance.update();
    }
}


// ==========================================
// MÓDULO: RADAR LD2410B
// ==========================================
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
            elStatus.style.color = "white";
        }
        if(elDistMov) elDistMov.textContent = data.dist_mov || "0";
        if(elEneMov) elEneMov.textContent = data.ene_mov || "0";
        if(elDistEst) elDistEst.textContent = data.dist_est || "0";
        if(elEneEst) elEneEst.textContent = data.ene_est || "0";
    } else {
        if(elStatus) {
            elStatus.textContent = "ESPERA - ÁREA DESPEJADA";
            elStatus.style.background = "#2ed573";
            elStatus.style.color = "black";
        }
        if(elDistMov) elDistMov.textContent = "--";
        if(elDistEst) elDistEst.textContent = "--";
        if(elEneMov) elEneMov.textContent = data.ruido_mov || "0";
        if(elEneEst) elEneEst.textContent = data.ruido_est || "0";
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

    if (socket && socket.readyState !== WebSocket.CLOSED) {
        socket.close();
    }

    actualizarEstado('conectando', 'Conectando...');
    socket = new WebSocket(`ws://${ip}/ws`);
    socket.binaryType = "arraybuffer";

    socket.onopen = () => {
        actualizarEstado('conectado', 'Conectado');
    };

    socket.onmessage = (event) => {
        // 1. AUDIO (Binario)
        if (event.data instanceof ArrayBuffer) {
            const audioData = new Int16Array(event.data);
            graficarOndaDeAudio(audioData);
        } 
        // 2. JSON (Gas o Radar)
        else {
            try {
                const data = JSON.parse(event.data);
                if (data.tipo === "lectura_radar") {
                    actualizarInterfazRadar(data);
                } else if (data.tipo === "lectura_gas" && data.ppm !== undefined) {
                    actualizarGraficaGas(data.ppm);
                }
            } catch (e) {
                console.log("Mensaje no JSON:", event.data);
            }
        }
    };

    socket.onclose = () => {
        actualizarEstado('desconectado', 'Desconectado');
        detenerMedicionesGas();
    };
    
    socket.onerror = (error) => {
        actualizarEstado('error', 'Error en conexión');
        detenerMedicionesGas();
    };
}

function desconectarWebSocket() {
    detenerMedicionesGas();
    if (socket && socket.readyState !== WebSocket.CLOSED) {
        socket.close();
    }
    actualizarEstado('desconectado', 'Desconectado');
}

function reconectarWebSocket() {
    desconectarWebSocket();
    setTimeout(() => { conectarWebSocket(); }, 1000);
}

function actualizarEstado(estado, mensaje) {
    const el = document.getElementById('estado');
    if (el) { 
        el.className = ''; 
        el.classList.add(estado); 
        el.textContent = mensaje; 
    }
}

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', () => {
    // Dibuja los canvas vacíos al arrancar
    inicializarGraficaAudio();
    inicializarGraficaGas();

    // Botones de Conexión
    const btnConectar = document.getElementById('btn-conectar');
    const btnDesconectar = document.getElementById('btn-desconectar');
    const btnReconectar = document.getElementById('btn-reconectar');
    
    if (btnConectar) btnConectar.addEventListener('click', conectarWebSocket);
    if (btnDesconectar) btnDesconectar.addEventListener('click', desconectarWebSocket);
    if (btnReconectar) btnReconectar.addEventListener('click', reconectarWebSocket);

    // Toggle: Micrófono (Caja 3 controla Caja 4)
    const btnAudio = document.getElementById('btn-audio');
    if (btnAudio) {
        btnAudio.addEventListener('change', (e) => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(e.target.checked ? "AUDIO_ON" : "AUDIO_OFF");
            }
        });
    }

    // Toggle: Radar (Caja 9 controla Caja 5)
    const btnRadar = document.getElementById('btn-radar');
    if (btnRadar) {
        btnRadar.addEventListener('change', (e) => {
            const activo = e.target.checked;
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(activo ? "RADAR_ON" : "RADAR_OFF");
            }
            if (!activo) {
                const elStatus = document.getElementById('radar-status');
                if(elStatus) { elStatus.textContent = "OFF"; elStatus.style.background = "#333"; elStatus.style.color = "white"; }
                document.getElementById('radar-dist-mov').textContent = "--";
                document.getElementById('radar-dist-est').textContent = "--";
                document.getElementById('radar-ene-mov').textContent = "0";
                document.getElementById('radar-ene-est').textContent = "0";
            }
        });
    }

    // Toggle: Sensor de Gas (Caja 10 controla Caja 7)
    const btnGas = document.getElementById('btn-gas');
    if (btnGas) {
        btnGas.addEventListener('change', (e) => {
            if (e.target.checked) {
                if (!medicionInterval) iniciarMedicionesGas();
            } else {
                detenerMedicionesGas();
                if (gasChartInstance) {
                    gasChartInstance.data.labels = [];
                    gasChartInstance.data.datasets[0].data = [];
                    gasChartInstance.update();
                }
                const ppmEl = document.getElementById('ppm-value');
                if(ppmEl) ppmEl.textContent = "0.00";
            }
        });
    }
});