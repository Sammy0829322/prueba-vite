// ============================================================================
// VARIABLES GLOBALES (3 WEBSOCKETS INDEPENDIENTES)
// ============================================================================
let socket = null;       // ESP32 Principal (Motores, Servos de dirección y Pinza)
let socketLuces = null;  // ESP32 Secundaria (Panel LED Frontal y Lateral)
let socketCamara = null; // ESP32 Tercera (Cámara, PID y Sensores Odometría)

// --- FUNCIÓN UTILITARIA PARA ACTUALIZAR TEXTOS Y COLORES EN LA UI ---
function actualizarEstado(idElemento, estado, mensaje = '') {
  const estadoElement = document.getElementById(idElemento);
  if (estadoElement) {
    estadoElement.classList.remove('conectado', 'desconectado', 'conectando', 'error');
    estadoElement.textContent = mensaje;
    estadoElement.classList.add(estado);
  }
}

// ============================================================================
// 1. CONTROL DEL ROBOT PRINCIPAL (LLANTAS Y PINZA)
// ============================================================================
function conectarWebSocket() {
  const ipInput = document.getElementById('ip-input');
  const ip = ipInput.value.trim();
  
  if (!ip) return alert('Por favor, ingrese la IP del Robot');
  if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
  
  actualizarEstado('estado', 'conectando', 'Conectando Robot...');
  socket = new WebSocket(`ws://${ip}/ws`);
  
  socket.onopen = () => actualizarEstado('estado', 'conectado', 'Robot: Conectado');
  socket.onclose = () => actualizarEstado('estado', 'desconectado', 'Robot: Desconectado');
  socket.onerror = () => actualizarEstado('estado', 'error', 'Error Robot');
}

// *** IMPORTANTE: Esta función manda la orden a las llantas y a la odometría al mismo tiempo ***
function enviarComando(accion) {
  const mensaje = { tipo: "motor", comando: accion };

  // 1. Mandar orden física a las llantas
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(mensaje));
  } else {
    console.warn("No hay conexión con el robot principal.");
  }

  // 2. Mandar aviso a la ESP32 de Sensores para que sepa si debe restar distancia (Reversa)
  if (socketCamara && socketCamara.readyState === WebSocket.OPEN) {
    socketCamara.send(JSON.stringify(mensaje));
  }
}

// Control Servos Dirección
function enviarComandoServo(accion) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  let accionServo;
  switch(accion) {
    case 'izquierda': accionServo = 'subir'; break;
    case 'derecha': accionServo = 'bajar'; break;
    default: accionServo = 'stop';
  }
  socket.send(JSON.stringify({ tipo: "servo", accion: accionServo }));
}

// Control Servos Pinza
function enviarComandoServoPinza(servo, accion) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ tipo: servo, accion: accion }));
}


// ============================================================================
// 2. CONTROL DE LUCES
// ============================================================================
function conectarLuces() {
  const ipInputLuces = document.getElementById('ip-luces-input');
  const ip = ipInputLuces.value.trim();
  
  if (!ip) return alert('Por favor, ingrese la IP de las Luces');
  if (socketLuces && socketLuces.readyState !== WebSocket.CLOSED) socketLuces.close();
  
  actualizarEstado('estado-luces', 'conectando', 'Conectando Luces...');
  socketLuces = new WebSocket(`ws://${ip}/ws`);
  
  socketLuces.onopen = () => actualizarEstado('estado-luces', 'conectado', 'Luces: Conectadas');
  socketLuces.onclose = () => actualizarEstado('estado-luces', 'desconectado', 'Luces: Desconectadas');
  socketLuces.onerror = () => actualizarEstado('estado-luces', 'error', 'Error Luces');
}

function desconectarLuces() {
  if (socketLuces) socketLuces.close();
  actualizarEstado('estado-luces', 'desconectado', 'Luces: Desconectadas');
}

function reconectarLuces() { 
  desconectarLuces(); 
  setTimeout(conectarLuces, 1000); 
}

function enviarBrilloLED(valor) {
  if (!socketLuces || socketLuces.readyState !== WebSocket.OPEN) return;
  document.getElementById("textSliderValue").innerHTML = Math.round((valor / 255) * 100);
  socketLuces.send(JSON.stringify({ tipo: "led_brillo", valor: parseInt(valor) }));
}

function enviarBrilloLED2(valor) {
  if (!socketLuces || socketLuces.readyState !== WebSocket.OPEN) return;
  document.getElementById("textSliderValue2").innerHTML = Math.round((valor / 255) * 100);
  socketLuces.send(JSON.stringify({ tipo: "led_brillo2", valor: parseInt(valor) }));
}

function apagarLED1() { 
  document.getElementById("pwmSlider").value = 0; 
  enviarBrilloLED(0); 
}

function apagarLED2() { 
  document.getElementById("pwmSlider2").value = 0; 
  enviarBrilloLED2(0); 
}


// ============================================================================
// 3. CONTROL DE CÁMARA (PID, SERVOS MANUALES Y SENSORES)
// ============================================================================
function conectarCamara() {
    const ipInputCamara = document.getElementById('ip-camara-input');
    const ip = ipInputCamara.value.trim();
    
    if (!ip) return alert('Por favor, ingrese la IP de la Cámara');
    if (socketCamara && socketCamara.readyState !== WebSocket.CLOSED) socketCamara.close();
    
    actualizarEstado('estado-camara', 'conectando', 'Conectando Cámara...');
    socketCamara = new WebSocket(`ws://${ip}/ws`);
    
    socketCamara.onopen = () => actualizarEstado('estado-camara', 'conectado', 'Cámara: Conectada');
    socketCamara.onclose = () => actualizarEstado('estado-camara', 'desconectado', 'Cámara: Desconectada');
    socketCamara.onerror = () => actualizarEstado('estado-camara', 'error', 'Error Cámara');

    // Aquí recibiremos los datos de odometría (distancia) y del IMU más adelante
    socketCamara.onmessage = (event) => {
        // console.log("Datos Sensores:", event.data);
    };
}

function desconectarCamara() {
    if (socketCamara) socketCamara.close();
    actualizarEstado('estado-camara', 'desconectado', 'Cámara: Desconectada');
}

function reconectarCamara() { 
  desconectarCamara(); 
  setTimeout(conectarCamara, 1000); 
}

// Activar o desactivar el PID (Estabilización automática)
function configurarPID(estado) {
    if (socketCamara && socketCamara.readyState === WebSocket.OPEN) {
        const mensaje = { tipo: "estado_pid", activado: estado };
        socketCamara.send(JSON.stringify(mensaje));
        console.log(estado ? "PID Activado" : "PID Desactivado (Modo Manual)");
    } else {
        alert("Primero conecta la cámara al WiFi.");
    }
}

// Enviar comandos manuales a los servos de la cámara
function enviarServoCamara(eje, angulo) {
    if (socketCamara && socketCamara.readyState === WebSocket.OPEN) {
        const mensaje = { tipo: "mover_servo", eje: eje, angulo: parseInt(angulo) };
        socketCamara.send(JSON.stringify(mensaje));
    }
}

// Detectar cuando se mueven los sliders de la cámara
function actualizarSlidersDireccion() {
    const sliderX = document.getElementById('slider-x'); // PAN
    const sliderY = document.getElementById('slider-y'); // TILT
    const sliderZ = document.getElementById('slider-z'); // ROLL
    
    if (sliderX) sliderX.addEventListener('input', function() {
        document.getElementById('valor-x').textContent = this.value;
        enviarServoCamara('pan', this.value);
    });

    if (sliderY) sliderY.addEventListener('input', function() {
        document.getElementById('valor-y').textContent = this.value;
        enviarServoCamara('tilt', this.value);
    });

    if (sliderZ) sliderZ.addEventListener('input', function() {
        document.getElementById('valor-z').textContent = this.value;
        enviarServoCamara('roll', this.value);
    });
}


// ============================================================================
// EVENT LISTENERS AL CARGAR LA PÁGINA
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Inicializar listeners de los sliders de la cámara
  actualizarSlidersDireccion();
  
  // Botones Robot
  document.getElementById('btn-conectar')?.addEventListener('click', conectarWebSocket);
  document.getElementById('btn-desconectar')?.addEventListener('click', () => socket?.close());
  document.getElementById('btn-reconectar')?.addEventListener('click', () => { socket?.close(); setTimeout(conectarWebSocket, 1000); });

  // Botones Luces
  document.getElementById('btn-conectar-luces')?.addEventListener('click', conectarLuces);
  document.getElementById('btn-desconectar-luces')?.addEventListener('click', desconectarLuces);
  document.getElementById('btn-reconectar-luces')?.addEventListener('click', reconectarLuces);

  // Botones Cámara
  document.getElementById('btn-conectar-camara')?.addEventListener('click', conectarCamara);
  document.getElementById('btn-desconectar-camara')?.addEventListener('click', desconectarCamara);
  document.getElementById('btn-reconectar-camara')?.addEventListener('click', reconectarCamara);

  // Botones PID Cámara
  document.getElementById('btn-activar-pid')?.addEventListener('click', () => configurarPID(true));
  document.getElementById('btn-desactivar-pid')?.addEventListener('click', () => configurarPID(false));

  // Sliders de Luces
  document.getElementById("pwmSlider")?.addEventListener('input', (e) => enviarBrilloLED(e.target.value));
  document.getElementById("pwmSlider2")?.addEventListener('input', (e) => enviarBrilloLED2(e.target.value));
});