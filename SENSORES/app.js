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

function conectarWebSocket() {
  const ipInput = document.getElementById('ip-input');
  const ip = ipInput.value.trim();
  if (!ip) return;
  
  actualizarEstado('conectando', 'Conectando...');
  socket = new WebSocket(`ws://${ip}/ws`);
  socket.binaryType = "arraybuffer"; 
  
  socket.onopen = () => actualizarEstado('conectado', 'Conectado');
  socket.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      const audioData = new Int16Array(event.data);
      graficarOndaDeAudio(audioData);
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
});