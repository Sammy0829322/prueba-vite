// --- VARIABLES GLOBALES ---

let socket = null;

let canvas = null;

let ctx = null;

let audioContext = null;



// --- CONFIGURACIÓN DE SENSIBILIDAD ---

// Aumenta este valor (ej. 5.0 o 8.0) si quieres que la gráfica se mueva mucho más

const GANANCIA_VISUAL = 8.0;



// Configuración de márgenes

const padding = { top: 40, right: 30, bottom: 60, left: 70 };



function inicializarGrafica() {

canvas = document.getElementById('gasChart');

if (canvas) {

ctx = canvas.getContext('2d');

canvas.width = 800;

canvas.height = 400;

dibujarEjesYValores(1024);

}

}



function dibujarEjesYValores(totalMuestras) {

const w = canvas.width;

const h = canvas.height;



ctx.fillStyle = 'rgb(10, 10, 10)';

ctx.fillRect(0, 0, w, h);



ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';

ctx.lineWidth = 1;

ctx.fillStyle = 'rgb(180, 180, 180)';

ctx.font = '12px "Segoe UI", Arial';



const anchoUtil = w - padding.left - padding.right;

const altoUtil = h - padding.top - padding.bottom;



// EJE Y

ctx.textAlign = 'right';

const divisionesY = 4;

for (let i = 0; i <= divisionesY; i++) {

const y = padding.top + (i * altoUtil / divisionesY);

const valorY = (1.0 - (i * 2 / divisionesY)).toFixed(1);

ctx.beginPath();

ctx.moveTo(padding.left, y);

ctx.lineTo(w - padding.right, y);

ctx.stroke();

ctx.fillText(valorY, padding.left - 12, y + 4);

}



// EJE X

ctx.textAlign = 'center';

const divisionesX = 8;

for (let i = 0; i <= divisionesX; i++) {

const x = padding.left + (i * anchoUtil / divisionesX);

const valorX = Math.round((i / divisionesX) * totalMuestras);

ctx.beginPath();

ctx.moveTo(x, padding.top);

ctx.lineTo(x, h - padding.bottom);

ctx.stroke();

ctx.fillText(valorX, x, h - padding.bottom + 25);

}



ctx.font = 'bold 13px "Segoe UI"';

ctx.fillStyle = 'rgb(0, 255, 150)';

ctx.save();

ctx.translate(25, padding.top + altoUtil / 2);

ctx.rotate(-Math.PI / 2);

ctx.fillText("AMPLITUD (Visual x" + GANANCIA_VISUAL + ")", 0, 0);

ctx.restore();

ctx.fillText("TIEMPO (Muestras)", padding.left + anchoUtil / 2, h - 15);


ctx.strokeStyle = 'rgb(60, 60, 60)';

ctx.strokeRect(padding.left, padding.top, anchoUtil, altoUtil);

}



function graficarOndaDeAudio(datos) {

if (!ctx || !canvas) return;



dibujarEjesYValores(datos.length);



const anchoUtil = canvas.width - padding.left - padding.right;

const altoUtil = canvas.height - padding.top - padding.bottom;

const centroY = padding.top + (altoUtil / 2);



ctx.save();

ctx.beginPath();

ctx.rect(padding.left, padding.top, anchoUtil, altoUtil);

ctx.clip();



ctx.lineWidth = 2.5;

ctx.strokeStyle = 'rgb(0, 255, 150)';

ctx.shadowBlur = 10;

ctx.shadowColor = 'rgba(0, 255, 150, 0.8)';

ctx.beginPath();



for (let i = 0; i < datos.length; i++) {

const x = padding.left + (i / datos.length) * anchoUtil;


// --- MODIFICACIÓN CLAVE: Multiplicamos por GANANCIA_VISUAL ---

// Esto escala la señal para que los pequeños cambios se vean grandes

let amplitudNormalizada = (datos[i] / 32768.0) * GANANCIA_VISUAL;


// Limitar para que no "rompa" el dibujo si el valor es muy alto

if (amplitudNormalizada > 1.0) amplitudNormalizada = 1.0;

if (amplitudNormalizada < -1.0) amplitudNormalizada = -1.0;



const y = centroY - (amplitudNormalizada * (altoUtil / 2));



if (i === 0) ctx.moveTo(x, y);

else ctx.lineTo(x, y);

}


ctx.stroke();

ctx.restore();


reproducirAudio(datos);

}



function reproducirAudio(datos) {

if (!audioContext) {

audioContext = new (window.AudioContext || window.webkitAudioContext)();

}

const floatData = new Float32Array(datos.length);

for (let i = 0; i < datos.length; i++) {

floatData[i] = datos[i] / 32768.0; // El audio sigue original, sin distorsión

}

const audioBuffer = audioContext.createBuffer(1, floatData.length, 44100);

audioBuffer.getChannelData(0).set(floatData);

const source = audioContext.createBufferSource();

source.buffer = audioBuffer;

source.connect(audioContext.destination);

source.start();

}


// --- FUNCIÓN UNIFICADA PARA ACTUALIZAR EL RADAR LD2410B ---
function actualizarInterfazRadar(data) {
    // 1. Verificamos si el botón de la interfaz está activo
    const btnRadar = document.getElementById('btn-radar');
    if (btnRadar && !btnRadar.checked) return; // Si el switch está OFF, no actualizamos nada

    // 2. Referencias a los elementos del DOM (Box 5)
    const elPresencia = document.getElementById('radar-presencia');
    const elDistMov = document.getElementById('radar-dist-mov');
    const elEneMov = document.getElementById('radar-ene-mov');
    const elDistEst = document.getElementById('radar-dist-est');
    const elEneEst = document.getElementById('radar-ene-est');
    const elStatus = document.getElementById('radar-status');

    // 3. Lógica de actualización basada en la detección
    if (data.presencia) {
        // --- ESTADO: HUMANO DETECTADO ---
        elPresencia.textContent = "¡HUMANO DETECTADO!";
        elPresencia.style.color = "#ff4757"; // Rojo vibrante
        
        elStatus.textContent = "ALERTA";
        elStatus.style.background = "#ff4757";
        elStatus.style.color = "white";

        // Mostramos distancias reales
        elDistMov.textContent = data.dist_mov || "0";
        elEneMov.textContent = data.ene_mov || "0";
        elDistEst.textContent = data.dist_est || "0";
        elEneEst.textContent = data.ene_est || "0";
    } else {
        // --- ESTADO: ÁREA DESPEJADA ---
        elPresencia.textContent = "ÁREA DESPEJADA";
        elPresencia.style.color = "#2ed573"; // Verde Oasis
        
        elStatus.textContent = "ESPERA";
        elStatus.style.background = "#2ed573";
        elStatus.style.color = "black";

        // En reposo, las distancias se marcan como nulas pero mostramos el ruido (energía)
        elDistMov.textContent = "--";
        elDistEst.textContent = "--";
        elEneMov.textContent = data.ruido_mov || "0";
        elEneEst.textContent = data.ruido_est || "0";
    }
}


// --- MODIFICACIÓN EN conectarWebSocket ---
function conectarWebSocket() {
    const ipInput = document.getElementById('ip-input');
    const ip = ipInput.value.trim();
    if (!ip) return;

    actualizarEstado('conectando', 'Conectando...');
    socket = new WebSocket(`ws://${ip}/ws`);
    socket.binaryType = "arraybuffer";

    socket.onopen = () => {
        actualizarEstado('conectado', 'Conectado');
        // Opcional: Activar radar al conectar
        socket.send("RADAR_ON");
    };

    socket.onmessage = (event) => {
        // 1. Si es AUDIO (Binario)
        if (event.data instanceof ArrayBuffer) {
            const audioData = new Int16Array(event.data);
            graficarOndaDeAudio(audioData);
        } 
        // 2. Si es JSON (Texto)
        else {
            try {
                const data = JSON.parse(event.data);
                
                if (data.tipo === "lectura_radar") {
                    actualizarInterfazRadar(data);
                }
                // Aquí podrías añadir: if (data.tipo === "lectura_gas") ...
            } catch (e) {
                console.log("Mensaje de texto no JSON:", event.data);
            }
        }
    };

    socket.onclose = () => actualizarEstado('desconectado', 'Desconectado');
    socket.onerror = () => actualizarEstado('error', 'Error en conexión');
}



function actualizarEstado(estado, mensaje) {

const el = document.getElementById('estado');

if (el) { el.className = estado; el.textContent = mensaje; }

}


document.addEventListener('DOMContentLoaded', () => {

const btnConectar = document.getElementById('btn-conectar');

const btnMedicion = document.getElementById('btn-medicion');


if (btnConectar) btnConectar.addEventListener('click', conectarWebSocket);

if (btnMedicion) {

btnMedicion.addEventListener('change', (e) => {

if (socket && socket.readyState === WebSocket.OPEN) {

socket.send(e.target.checked ? "AUDIO_ON" : "AUDIO_OFF");

}

});

}

inicializarGrafica();

const btnRadar = document.getElementById('btn-radar');

if (btnRadar) {
    btnRadar.addEventListener('change', (e) => {
        const activo = e.target.checked;
        
        // 1. Enviamos el comando al ESP32
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(activo ? "RADAR_ON" : "RADAR_OFF");
        }

        // 2. Si se apaga, limpiamos visualmente el box del radar
        if (!activo) {
            document.getElementById('radar-presencia').textContent = "SENSOR DESACTIVADO";
            document.getElementById('radar-presencia').style.color = "#555";
            document.getElementById('radar-status').textContent = "OFF";
            document.getElementById('radar-status').style.background = "#333";
            
            // Ponemos las distancias en guiones
            document.getElementById('radar-dist-mov').textContent = "--";
            document.getElementById('radar-dist-est').textContent = "--";
            document.getElementById('radar-ene-mov').textContent = "0";
            document.getElementById('radar-ene-est').textContent = "0";
        }
    });
}

}); 