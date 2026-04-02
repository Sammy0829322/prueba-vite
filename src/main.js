// --- IMPORTACIONES ---
import './style.css'; 
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- VARIABLES GLOBALES DE ESTADO ---
let moveDirection = 1; // Mantenido por si lo usas en otro lado

// --- VARIABLES WEBSOCKET PARA SENSORES ---
let socketSensor = null;
let sensorData = {
    accel_x: 0,
    accel_y: 0,
    accel_z: 0,
    gyro_x: 0,
    gyro_y: 0,
    gyro_z: 0,
    temp: 0
};
let sensorInterval = null; 

// --- PARTE 1: LÓGICA DE THREE.JS (Declaración) ---
let camera, renderer, scene, contenedor3D, robot, pathLine; 
let textoCoordsSpan; 

// 1. Busca el contenedor
contenedor3D = document.getElementById('contenedor-3d');

// 2. Configuración básica (Escena, Cámara, Renderizador)
scene = new THREE.Scene(); 
scene.background = new THREE.Color(0x222222);

const initialWidth = contenedor3D.clientWidth > 0 ? contenedor3D.clientWidth : window.innerWidth * 0.5;
const initialHeight = 300;

camera = new THREE.PerspectiveCamera(75, initialWidth / initialHeight, 0.1, 500);
camera.position.set(0, 10, 15);

renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(initialWidth, initialHeight); 

// 3. Añade el lienzo 3D al contenedor del HTML
contenedor3D.appendChild(renderer.domElement);

// 4. Controles de Cámara
const controls = new OrbitControls(camera, renderer.domElement);

// 5. Luces
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 5);
scene.add(directionalLight);

// 6. Suelo y Cuadrícula
const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({ color: 0x444444 })
);
plane.rotation.x = -Math.PI / 2;
scene.add(plane);

const gridHelper = new THREE.GridHelper(30, 30);
scene.add(gridHelper);

// 7. El Robot 
robot = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.5, 2),
    new THREE.MeshStandardMaterial({ color: 0xff0000 })
);
robot.position.y = 0.25;
scene.add(robot);

// 8. El Rastro (Se mantiene la declaración por si se usa después con el sensor Hall)
const pathPoints = [];
const pathMaterial = new THREE.LineBasicMaterial({ 
    color: 0x00ff00,
    linewidth: 1  
});
let pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
pathLine = new THREE.Line(pathGeometry, pathMaterial);
scene.add(pathLine);

// Función para crear un Pin 3D (Icono de Ubicación)
function crearPinUbicacion3D(posicion) {
    const coneGeometry = new THREE.ConeGeometry(0.15, 0.6, 16); 
    const sphereGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    
    const pinMaterial = new THREE.MeshStandardMaterial({ color: 0xe74c3c });
    const pinMaterialHover = new THREE.MeshStandardMaterial({ 
        color: 0xe74c3c,
        emissive: 0xffffff, 
        emissiveIntensity: 0.3 
    });

    const cone = new THREE.Mesh(coneGeometry, pinMaterial);
    const sphere = new THREE.Mesh(sphereGeometry, pinMaterial);

    cone.position.y = 0.3; 
    sphere.position.y = 0.6 + 0.1; 
    
    const pinGroup = new THREE.Group();
    pinGroup.add(cone);
    pinGroup.add(sphere);

    pinGroup.position.copy(posicion);
    pinGroup.position.y = 0; 
    
    pinGroup.userData.materialNormal = pinMaterial;
    pinGroup.userData.materialHover = pinMaterialHover;

    scene.add(pinGroup);
    return pinGroup;
}

// 9. Función de Reajuste
function handleResize() {
    const newWidth = contenedor3D.clientWidth;
    const newHeight = 600; 
    if (newWidth > 0) {
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight);
    }
}

// 10. Función de Animación 
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// 11. Arrancar la animación
animate();

// 12. Ajustar el 3D si cambia el tamaño de la VENTANA
window.addEventListener("resize", handleResize);


// --- PARTE 2: LÓGICA DE LA INTERFAZ ---
document.addEventListener("DOMContentLoaded", () => {
    
    // 1. Lógica de las pestañas
    const botones = document.querySelectorAll(".tab-link");
    const contenidos = document.querySelectorAll(".tab-content");

    botones.forEach(boton => {
        boton.addEventListener("click", () => {
            const targetTab = boton.dataset.tab;
            
            botones.forEach(b => b.classList.remove("activo"));
            boton.classList.add("activo");

            contenidos.forEach(c => c.classList.remove("activa"));
            document.getElementById(targetTab).classList.add("activa");
            
            handleResize(); 
        });
    });

    // 2. Conectar el botón de dirección
    const botonDireccion = document.getElementById('boton-direccion');
    if (botonDireccion) {
        botonDireccion.addEventListener('click', () => {
            moveDirection *= -1;
        });
    }

    // 3. Conectar el botón de coordenadas
    const botonCoords = document.getElementById('btn-actualizar-coords');
    textoCoordsSpan = document.getElementById('texto-coords'); 

    if(botonCoords) {
        botonCoords.style.display = 'none';
    }

    // 4. Conectar los elementos para guardar notas
    const btnGuardarNota = document.getElementById('btn-guardar-nota');
    const inputNota = document.getElementById('input-nota');
    const listaNotas = document.getElementById('lista-notas');

    if (btnGuardarNota && inputNota && listaNotas) {
        btnGuardarNota.addEventListener('click', () => {
            const textoNota = inputNota.value;
            if (textoNota.trim() === "") {
                alert("Por favor, escribe una nota antes de guardar.");
                return;
            }

            const pos = robot.position.clone(); 
            const textoPosicion = `X: ${pos.x.toFixed(2)}, Y: ${pos.y.toFixed(2)}, Z: ${pos.z.toFixed(2)}`;

            const pin3D = crearPinUbicacion3D(pos); 

            const nuevoItemLista = document.createElement('li');
            nuevoItemLista.innerHTML = `
                ${textoNota}
                <span class="coord-guardada">(${textoPosicion})</span>
            `;

            nuevoItemLista.addEventListener('mouseover', () => {
                pin3D.scale.set(1.5, 1.5, 1.5);
                pin3D.children.forEach(child => {
                    child.material = pin3D.userData.materialHover;
                });
            });
            
            nuevoItemLista.addEventListener('mouseout', () => {
                pin3D.scale.set(1, 1, 1);
                pin3D.children.forEach(child => {
                    child.material = pin3D.userData.materialNormal;
                });
            });

            listaNotas.prepend(nuevoItemLista); 
            inputNota.value = "";
        });
    }

    handleResize();
});

// --- FUNCIONES WEBSOCKET PARA SENSORES ---

function actualizarEstadoSensor(estado, mensaje = '') {
    const estadoElement = document.getElementById('estado-sensor');
    if (estadoElement) {
        estadoElement.classList.remove('conectado', 'desconectado');
        estadoElement.textContent = mensaje;
        estadoElement.classList.add(estado);
    }
}

function conectarWebSocketSensor() {
    const ipInput = document.getElementById('ip-input-sensor');
    const ip = ipInput.value.trim();
    
    if (!ip) {
        alert('Por favor, ingrese una dirección IP');
        return;
    }
    
    if (socketSensor && socketSensor.readyState !== WebSocket.CLOSED) {
        socketSensor.close();
    }
    
    actualizarEstadoSensor('desconectado', 'Conectando...');
    
    socketSensor = new WebSocket(`ws://${ip}/ws`);
    
    socketSensor.onopen = () => {
        console.log("Conectado a sensores del robot via WebSocket en IP:", ip);
        actualizarEstadoSensor('conectado', 'Conectado');
        
        enviarSolicitudPosicion();
        iniciarSolicitudesAutomaticas();
    };
    
    socketSensor.onmessage = (event) => {
        try {
            const datos = JSON.parse(event.data);
            
            if (datos.tipo === "datos_sensor") {
                sensorData = {
                    accel_x: datos.accel_x || 0,
                    accel_y: datos.accel_y || 0,
                    accel_z: datos.accel_z || 0,
                    gyro_x: datos.gyro_x || 0,
                    gyro_y: datos.gyro_y || 0,
                    gyro_z: datos.gyro_z || 0,
                    temp: datos.temp || 0
                };
                
                actualizarDatosSensorUI();
                moverRobotConSensores();
            }
        } catch (error) {
            console.error("Error al procesar mensaje del sensor:", error);
        }
    };
    
    socketSensor.onclose = () => {
        console.log("WebSocket de sensores cerrado");
        actualizarEstadoSensor('desconectado', 'Desconectado');
        detenerSolicitudesAutomaticas();
    };
    
    socketSensor.onerror = (error) => {
        console.error("Error en WebSocket de sensores:", error);
        actualizarEstadoSensor('desconectado', 'Error de conexión');
    };
}

function enviarSolicitudPosicion() {
    if (socketSensor && socketSensor.readyState === WebSocket.OPEN) {
        const mensaje = { tipo: "posicion" };
        socketSensor.send(JSON.stringify(mensaje));
    }
}

function iniciarSolicitudesAutomaticas() {
    detenerSolicitudesAutomaticas();
    
    // Intervalo a 100ms para movimiento fluido
    sensorInterval = setInterval(() => {
        enviarSolicitudPosicion();
    }, 100);
}

function detenerSolicitudesAutomaticas() {
    if (sensorInterval) {
        clearInterval(sensorInterval);
        sensorInterval = null;
    }
}

function actualizarDatosSensorUI() {
    const elAccel = document.getElementById('datos-accel');
    const elGyro = document.getElementById('datos-gyro');
    const elTemp = document.getElementById('datos-temp');

    if (elAccel) elAccel.textContent = `X: ${sensorData.accel_x.toFixed(2)}, Y: ${sensorData.accel_y.toFixed(2)}, Z: ${sensorData.accel_z.toFixed(2)}`;
    if (elGyro) elGyro.textContent = `X: ${sensorData.gyro_x.toFixed(2)}, Y: ${sensorData.gyro_y.toFixed(2)}, Z: ${sensorData.gyro_z.toFixed(2)}`;
    if (elTemp) elTemp.textContent = `${sensorData.temp.toFixed(1)}°C`;
}

// CORRECCIÓN: Función modificada para rotar únicamente, omitiendo la traslación
function moverRobotConSensores() {
    if (!robot) return;
    
    const deadzoneGyro = 0.05; // Evita rotación si el giro es muy bajo (ruido)

    // 1. Rotación usando el giroscopio (eje Z del MPU)
    if (Math.abs(sensorData.gyro_z) > deadzoneGyro) {
        robot.rotation.y -= sensorData.gyro_z * 0.1; 
    }

    // --- ACELERÓMETRO OMITIDO ---
    // Toda la lógica de movimiento X/Z y guardado del rastro (pathPoints)
    // fue eliminada de esta sección para evitar que la caja se deslice.
    
    // Opcional: Mostrar los grados de rotación en lugar de las coordenadas X/Z
    if (textoCoordsSpan) {
        // Convierte radianes a grados para que sea más fácil de leer
        const grados = (robot.rotation.y * (180 / Math.PI)) % 360;
        textoCoordsSpan.textContent = `Rotación: ${grados.toFixed(1)}°`;
    }
}

function desconectarWebSocketSensor() {
    detenerSolicitudesAutomaticas();
    if (socketSensor && socketSensor.readyState !== WebSocket.CLOSED) {
        socketSensor.close();
    }
    actualizarEstadoSensor('desconectado', 'Desconectado');
}

function reconectarWebSocketSensor() {
    desconectarWebSocketSensor();
    setTimeout(() => {
        conectarWebSocketSensor();
    }, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
    const btnConectarSensor = document.getElementById('btn-conectar-sensor');
    const btnDesconectarSensor = document.getElementById('btn-desconectar-sensor');
    const btnReconectarSensor = document.getElementById('btn-reconectar-sensor');
    
    if (btnConectarSensor) btnConectarSensor.addEventListener('click', conectarWebSocketSensor);
    if (btnDesconectarSensor) btnDesconectarSensor.addEventListener('click', desconectarWebSocketSensor);
    if (btnReconectarSensor) btnReconectarSensor.addEventListener('click', reconectarWebSocketSensor);
});