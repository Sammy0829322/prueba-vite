// Variables globales para los WebSockets (Dos conexiones independientes)
let socket = null;       // Conexión para ESP32 Principal (Motores, Servos, Sensores)
let socketLuces = null;  // Conexión para ESP32 Secundaria (Panel LED)

// --- FUNCIÓN PARA ACTUALIZAR ESTADOS EN LA UI ---
function actualizarEstado(idElemento, estado, mensaje = '') {
  const estadoElement = document.getElementById(idElemento);
  if (estadoElement) {
    estadoElement.classList.remove('conectado', 'desconectado', 'conectando', 'error');
    estadoElement.textContent = mensaje;
    estadoElement.classList.add(estado);
  }
}

// --- CONEXIÓN WEBSOCKET ROBOT PRINCIPAL ---
function conectarWebSocket() {
  const ipInput = document.getElementById('ip-input');
  const ip = ipInput.value.trim();
  
  if (!ip) {
    alert('Por favor, ingrese la IP del Robot');
    return;
  }
  
  if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
  
  actualizarEstado('estado', 'conectando', 'Conectando Robot...');
  socket = new WebSocket(`ws://${ip}/ws`);
  
  socket.onopen = () => {
    console.log("Robot Conectado en:", ip);
    actualizarEstado('estado', 'conectado', 'Robot: Conectado');
  };
  
  socket.onmessage = (event) => {
    console.log("Mensaje del Robot:", event.data);
  };
  
  socket.onclose = () => {
    actualizarEstado('estado', 'desconectado', 'Robot: Desconectado');
  };
  
  socket.onerror = (error) => {
    actualizarEstado('estado', 'error', 'Error Robot');
  };
}

// --- CONEXIÓN WEBSOCKET LUCES (NUEVA ESP32) ---
function conectarLuces() {
  const ipInputLuces = document.getElementById('ip-luces-input');
  const ip = ipInputLuces.value.trim();
  
  if (!ip) {
    alert('Por favor, ingrese la IP de las Luces');
    return;
  }
  
  if (socketLuces && socketLuces.readyState !== WebSocket.CLOSED) socketLuces.close();
  
  // Usaremos un ID de estado diferente para las luces en el HTML (ej: 'estado-luces')
  actualizarEstado('estado-luces', 'conectando', 'Conectando Luces...');
  socketLuces = new WebSocket(`ws://${ip}/ws`);
  
  socketLuces.onopen = () => {
    console.log("Luces Conectadas en:", ip);
    actualizarEstado('estado-luces', 'conectado', 'Luces: Conectadas');
  };
  
  socketLuces.onclose = () => {
    actualizarEstado('estado-luces', 'desconectado', 'Luces: Desconectadas');
  };
  
  socketLuces.onerror = () => {
    actualizarEstado('estado-luces', 'error', 'Error Luces');
  };
}

// --- DESCONEXIÓN Y RECONEXIÓN DE LUCES ---
function desconectarLuces() {
  if (socketLuces && socketLuces.readyState !== WebSocket.CLOSED) {
    socketLuces.close();
  }
  actualizarEstado('estado-luces', 'desconectado', 'Luces: Desconectadas');
}

function reconectarLuces() {
  desconectarLuces();
  setTimeout(() => {
    conectarLuces();
  }, 1000);
}

// --- CONTROL DEL PANEL LED (Basado en tu segundo código) ---
function enviarBrilloLED(valor) {
  if (!socketLuces || socketLuces.readyState !== WebSocket.OPEN) {
    console.warn("WebSocket de luces no conectado.");
    return;
  }

  // Actualizar el texto del % en la pantalla
  const textBrillo = document.getElementById("textSliderValue");
  if (textBrillo) textBrillo.innerHTML = Math.round((valor / 255) * 100);

  const mensaje = {
    tipo: "led_brillo",
    valor: parseInt(valor)
  };
  
  socketLuces.send(JSON.stringify(mensaje));
}

// --- CONTROL DEL SEGUNDO PANEL LED ---
function enviarBrilloLED2(valor) {
  if (!socketLuces || socketLuces.readyState !== WebSocket.OPEN) {
    console.warn("WebSocket de luces no conectado.");
    return;
  }

  // Actualizar el texto del % para el segundo slider
  const textBrillo2 = document.getElementById("textSliderValue2");
  if (textBrillo2) textBrillo2.innerHTML = Math.round((valor / 255) * 100);

  const mensaje = {
    tipo: "led_brillo2", // Coincide con el case en C++
    valor: parseInt(valor)
  };
  
  socketLuces.send(JSON.stringify(mensaje));
}

// --- FUNCIONES DE APAGADO INDEPENDIENTES ---

// Apaga solo el LED 1 (GPIO 5)
function apagarLED1() {
  const slider = document.getElementById("pwmSlider");
  if (slider) slider.value = 0; // Baja el slider visualmente
  enviarBrilloLED(0);           // Envía el comando de 0 brillo al ESP
}

// Apaga solo el LED 2 (GPIO 11)
function apagarLED2() {
  const slider2 = document.getElementById("pwmSlider2");
  if (slider2) slider2.value = 0; // Baja el slider visualmente
  enviarBrilloLED2(0);            // Envía el comando de 0 brillo al ESP
}

// --- EVENT LISTENERS AL CARGAR EL DOM ---
document.addEventListener('DOMContentLoaded', () => {
  // Botones Robot
  document.getElementById('btn-conectar')?.addEventListener('click', conectarWebSocket);
  document.getElementById('btn-desconectar')?.addEventListener('click', () => socket?.close());
  document.getElementById('btn-reconectar')?.addEventListener('click', () => {
    socket?.close();
    setTimeout(conectarWebSocket, 1000);
  });

  // Botones Luces
  document.getElementById('btn-conectar-luces')?.addEventListener('click', conectarLuces);
  document.getElementById('btn-desconectar-luces')?.addEventListener('click', desconectarLuces);
  document.getElementById('btn-reconectar-luces')?.addEventListener('click', reconectarLuces);

  // Slider de Brillo (evento input para que sea fluido)
  const slider = document.getElementById("pwmSlider");
  if (slider) {
    slider.addEventListener('input', (e) => {
      enviarBrilloLED(e.target.value);
    });
  }
  // Slider de Brillo para LED 2
  const slider2 = document.getElementById("pwmSlider2");
  if (slider2) {
    slider2.addEventListener('input', (e) => {
      enviarBrilloLED2(e.target.value);
    });
  }
});

// --- FUNCIONES DE CONTROL DE MOTORES (ESTRUCTURA ORIGINAL) ---
function enviarComando(accion) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    alert("No hay conexión con el robot.");
    return;
  }
  const mensaje = { tipo: "motor", comando: accion };
  socket.send(JSON.stringify(mensaje));
}

// --- FUNCIONES DE CONTROL DE SERVOS (ESTRUCTURA ORIGINAL) ---
function enviarComandoServo(accion) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  
  let accionServo;
  switch(accion) {
    case 'izquierda': accionServo = 'subir'; break;
    case 'derecha': accionServo = 'bajar'; break;
    default: accionServo = 'stop';
  }
  
  const mensaje = { tipo: "servo", accion: accionServo };
  socket.send(JSON.stringify(mensaje));
}

function enviarComandoServoPinza(servo, accion) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const mensaje = { tipo: servo, accion: accion };
  socket.send(JSON.stringify(mensaje));
}