// Variable global para el WebSocket
let socket = null;

// Función para actualizar el estado de conexión
function actualizarEstado(estado, mensaje = '') {
  const estadoElement = document.getElementById('estado');
  if (estadoElement) {
    // Eliminar todas las clases de estado
    estadoElement.classList.remove('conectado', 'desconectado', 'conectando', 'error');
    
    // Añadir la clase correspondiente y actualizar el texto
    estadoElement.textContent = mensaje;
    estadoElement.classList.add(estado);
  }
}

// Función para conectar al WebSocket
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
  
  // Actualizar estado a "Conectando..."
  actualizarEstado('conectando', 'Conectando...');
  
  // Crear nueva conexión WebSocket con la IP del input
  socket = new WebSocket(`ws://${ip}/ws`);
  
  socket.onopen = () => {
    console.log("Conectado al ESP32 vía WebSocket en IP:", ip);
    actualizarEstado('conectado', 'Conectado');
  };
  
  socket.onmessage = (event) => {
    console.log("Mensaje recibido del ESP32:", event.data);
  };
  
  socket.onclose = () => {
    console.log("WebSocket cerrado");
    actualizarEstado('desconectado', 'Desconectado');
  };
  
  socket.onerror = (error) => {
    console.error("Error en WebSocket:", error);
    actualizarEstado('error', 'Error de conexión');
    alert('Error de conexión. Verifique la IP y que el robot esté encendido.');
  };
}

// Función para desconectar
function desconectarWebSocket() {
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    socket.close();
  }
  actualizarEstado('desconectado', 'Desconectado');
}

// Función para reconectar
function reconectarWebSocket() {
  desconectarWebSocket();
  setTimeout(() => {
    conectarWebSocket();
  }, 1000);
}

// Event listeners para los botones
document.addEventListener('DOMContentLoaded', () => {
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
});

// Función para control de motores
function enviarComando(accion) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.log("WebSocket no está conectado. Estado:", socket ? socket.readyState : 'null');
    alert("No hay conexión con el robot. Por favor, conéctese primero.");
    return;
  }
  
  const mensaje = {
    tipo: "motor",
    comando: accion
  };
  const json = JSON.stringify(mensaje);
  console.log("Enviando:", json);
  socket.send(json);
}

// Función para control de servos (subir/bajar)
function enviarComandoServo(accion) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.log("WebSocket no está conectado. Estado:", socket ? socket.readyState : 'null');
    alert("No hay conexión con el robot. Por favor, conéctese primero.");
    return;
  }
  
  let accionServo;
  
  // Mapear acciones a los comandos de servo según la imagen
  switch(accion) {
    case 'izquierda':
      accionServo = 'subir'; // Presionar 'Abrir' -> subir
      break;
    case 'derecha':
      accionServo = 'bajar'; // Presionar 'Cerrar' -> bajar
      break;
    case 'stop':
      accionServo = 'stop';
      break;
    default:
      accionServo = 'stop';
  }
  
  const mensaje = {
    tipo: "servo",
    accion: accionServo
  };
  
  const json = JSON.stringify(mensaje);
  console.log("Enviando servo:", json);
  socket.send(json);
}

// Función para control de servos de pinzas individuales
function enviarComandoServoPinza(servo, accion) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.log("WebSocket no está conectado. Estado:", socket ? socket.readyState : 'null');
    alert("No hay conexión con el robot. Por favor, conéctese primero.");
    return;
  }
  
  const mensaje = {
    tipo: servo, // servo2, servo3, servo4, servo5, servo6, servo7
    accion: accion // subir, bajar, stop
  };
  
  const json = JSON.stringify(mensaje);
  console.log("Enviando pinza:", json);
  socket.send(json);
}