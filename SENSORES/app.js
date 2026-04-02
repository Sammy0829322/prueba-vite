// Variable global para el WebSocket
let socket = null;
let medicionInterval = null;
let gasChart = null;

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

// Función para inicializar la gráfica
// Función para inicializar la gráfica corregida
function inicializarGrafica() {
  const ctx = document.getElementById('gasChart');
  if (ctx) {
    gasChart = new Chart(ctx, {
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
          // --- SOLUCIÓN PARA NO CORTAR EL CÍRCULO EN EL CERO ---
          clip: false, // Permite que el punto se dibuje completo fuera del área del eje
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            // Añadimos un pequeño margen interno en el canvas para que 
            // el punto que "sobresale" del eje 0 no se corte con el borde del div
            bottom: 5 
          }
        },
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Tiempo',
              color: 'black',
              font: { size: 14, weight: 'bold' }
            },
            ticks: {
              color: 'black',
              maxRotation: 45,
              minRotation: 45,
              autoSkip: true,
              maxTicksLimit: 10,
              padding: 10
            },
            grid: {
              color: 'rgba(26, 1, 1, 0.1)',
              drawBorder: true,
              borderColor: 'rgba(20, 2, 2, 0.89)'
            }
          },
          y: {
            display: true,
            title: {
              display: true,
              text: 'PPM',
              color: 'black',
              font: { size: 14, weight: 'bold' }
            },
            ticks: {
              color: 'black',
              padding: 10
            },
            grid: {
              color: 'rgba(19, 2, 2, 0.74)',
              drawBorder: true,
              borderColor: 'rgba(18, 1, 1, 0.61)'
            },
            // --- RANGO SOLICITADO ---
            min: 0,
            max: 5000,
            beginAtZero: true
          }
        },
        plugins: {
          legend: {
            display: true,
            labels: {
              color: 'white',
              font: { size: 12 }
            }
          }
        }
      }
    });
  }
}

// Función para enviar solicitud de medición cada segundo
function iniciarMediciones() {
  medicionInterval = setInterval(() => {
    const btnMedicion = document.getElementById('btn-medicion');
    if (socket && socket.readyState === WebSocket.OPEN && btnMedicion && btnMedicion.checked) {
      const mensaje = {
        "tipo": "medicion",
        "sensor": "gaslp"
      };
      socket.send(JSON.stringify(mensaje));
      console.log("Enviando solicitud de medición:", mensaje);
    }
  }, 1000);
}

// Función para detener mediciones
function detenerMediciones() {
  if (medicionInterval) {
    clearInterval(medicionInterval);
    medicionInterval = null;
  }
}

// Función para actualizar la gráfica con nuevos datos
function actualizarGrafica(ppm) {
  if (gasChart) {
    // Actualizar display de PPM
    const ppmValueElement = document.getElementById('ppm-value');
    if (ppmValueElement) {
      ppmValueElement.textContent = ppm.toFixed(2);
    }
    
    // Mantener máximo 20 puntos en la gráfica
    if (gasChart.data.labels.length >= 20) {
      gasChart.data.labels.shift();
      gasChart.data.datasets[0].data.shift();
    }
    
    const ahora = new Date();
    const tiempo = ahora.getHours().toString().padStart(2, '0') + ':' + 
                   ahora.getMinutes().toString().padStart(2, '0') + ':' + 
                   ahora.getSeconds().toString().padStart(2, '0');
    
    gasChart.data.labels.push(tiempo);
    gasChart.data.datasets[0].data.push(ppm);
    gasChart.update();
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
    // No iniciar mediciones automáticamente, esperar a que el usuario active el switch
  };
  
  socket.onmessage = (event) => {
    console.log("Mensaje recibido del ESP32:", event.data);
    try {
      const datos = JSON.parse(event.data);
      
      // Procesar respuesta del sensor de gas
      if (datos.tipo === 'lectura_gas' && datos.ppm !== undefined) {
        console.log("PPM recibido:", datos.ppm);
        actualizarGrafica(datos.ppm);
      }
    } catch (error) {
      console.error("Error al procesar mensaje JSON:", error);
    }
  };
  
  socket.onclose = () => {
    console.log("WebSocket cerrado");
    actualizarEstado('desconectado', 'Desconectado');
    detenerMediciones();
  };
  
  socket.onerror = (error) => {
    console.error("Error en WebSocket:", error);
    actualizarEstado('error', 'Error de conexión');
    alert('Error de conexión. Verifique la IP y que el robot esté encendido.');
    detenerMediciones();
  };
}

// Función para desconectar
function desconectarWebSocket() {
  detenerMediciones();
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
  const btnMedicion = document.getElementById('btn-medicion');
  
  if (btnConectar) {
    btnConectar.addEventListener('click', conectarWebSocket);
  }
  if (btnDesconectar) {
    btnDesconectar.addEventListener('click', desconectarWebSocket);
  }
  if (btnReconectar) {
    btnReconectar.addEventListener('click', reconectarWebSocket);
  }
  if (btnMedicion) {
    btnMedicion.addEventListener('change', (event) => {
      if (event.target.checked) {
        // Iniciar mediciones si el switch está activado
        if (!medicionInterval) {
          iniciarMediciones();
        }
      } else {
        // Detener mediciones si el switch está desactivado
        detenerMediciones();
        // Limpiar la gráfica
        if (gasChart) {
          gasChart.data.labels = [];
          gasChart.data.datasets[0].data = [];
          gasChart.update();
        }
      }
    });
  }
  
  // Inicializar la gráfica al cargar la página
  inicializarGrafica();
});
