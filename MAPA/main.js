// --- IMPORTACIONES ---
import './style.css'; 
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// --- VARIABLES GLOBALES DE ESTADO ---
let moveDirection = 1; 
let pinSeleccionadoActual = null; // Guarda el pin que se hizo clic

// --- VARIABLES WEBSOCKET PARA SENSORES ---
let socketSensor = null;
let sensorData = {
    yaw: 0,
    pitch: 0,
    roll: 0,
    distancia: 0 
};
let sensorInterval = null; 

// NUEVAS VARIABLES PARA MOVIMIENTO Y TARA
let yawOffset = 0; 
let lastDistancia = 0; 

// --- PARTE 1: LÓGICA DE THREE.JS (Declaración) ---
let camera, renderer, scene, contenedor3D, robot, pathLine; 
let textoCoordsSpan; 

// 1. Busca el contenedor
contenedor3D = document.getElementById('contenedor-3d');

// 2. Configuración básica (Escena, Cámara, Renderizador)
scene = new THREE.Scene(); 
scene.background = new THREE.Color(0x222222);

// Cámara posicionada para mirar hacia el Norte (-Z)
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

// 6. Suelo, Cuadrícula y Ejes
const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ 
        color: 0x444444,
        transparent: true,        // NUEVO: Activa la transparencia
        opacity: 0.1,             // NUEVO: Nivel de transparencia (0.0 a 1.0)
        side: THREE.DoubleSide    // NUEVO: Permite ver el piso desde arriba y desde abajo
     })
);
plane.rotation.x = -Math.PI / 2;
scene.add(plane);

const gridHelper = new THREE.GridHelper(100, 100);
scene.add(gridHelper);

// Ejes visuales (Rojo = X, Verde = Y, Azul = Z)
const axesHelper = new THREE.AxesHelper(15);
scene.add(axesHelper);

// Función para crear etiquetas de texto 3D
function crearEtiqueta3D(texto, x, y, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    ctx.font = 'Bold 28px Arial';
    ctx.fillStyle = '#00ff00'; 
    ctx.textAlign = 'center';
    ctx.fillText(texto, 128, 40);

    const textura = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: textura });
    const sprite = new THREE.Sprite(material);
    
    sprite.position.set(x, y, z);
    sprite.scale.set(3, 0.75, 1); 
    scene.add(sprite);
}

// Colocar los valores en el mapa (1 unidad 3D = 10 cm reales)
crearEtiqueta3D("Frente 50 cm", 0, 0.2, -5);
crearEtiqueta3D("Frente 100 cm", 0, 0.2, -10);
crearEtiqueta3D("Der 50 cm", 5, 0.2, 0);
crearEtiqueta3D("Der 100 cm", 10, 0.2, 0);
crearEtiqueta3D("Izq -50 cm", -5, 0.2, 0);
crearEtiqueta3D("Izq -100 cm", -10, 0.2, 0);
crearEtiqueta3D("Altura +50 cm", 0, 5, 0);

// 7. El Robot (AHORA ES UN MODELO 3D REAL)
robot = new THREE.Group(); 
scene.add(robot); // Añadimos el "contenedor" vacío a la escena desde el principio

// Creamos el cargador
const loader = new GLTFLoader();

// Cargamos el archivo (asegúrate de tener tu archivo .glb en tu carpeta de proyecto)
loader.load(
    './assets/vehicle.glb', // <-- CAMBIA ESTO POR LA RUTA DE TU ARCHIVO
    function (gltf) {
        const modeloVehiculo = gltf.scene;

        // --- AJUSTES COMUNES (descomenta si los necesitas) ---
        // 1. Si el modelo es gigante o minúsculo:
        // modeloVehiculo.scale.set(0.5, 0.5, 0.5); 
        
        // 2. Si el modelo aparece enterrado en el piso o volando:
        // modeloVehiculo.position.y = 0; 

        // 3. Si el modelo está mirando hacia atrás o de lado (rotar 90 o 180 grados):
        // modeloVehiculo.rotation.y = Math.PI; // Gira 180 grados

        // Añadimos el modelo real al grupo 'robot'
        robot.add(modeloVehiculo);
        console.log("¡Vehículo 3D cargado exitosamente!");
    },
    // Función que se ejecuta mientras se descarga (útil para modelos pesados)
    function (xhr) {
        console.log((xhr.loaded / xhr.total * 100) + '% cargado');
    },
    // Función en caso de error
    function (error) {
        console.error('Error al cargar el modelo 3D:', error);
    }
);

// 8. El Rastro (Se inicializa con la posición 0,0,0)
const pathPoints = [];
pathPoints.push(robot.position.clone()); 

const pathMaterial = new THREE.LineBasicMaterial({ 
    color: 0x0088ff,
    linewidth: 2  
});
let pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
pathLine = new THREE.Line(pathGeometry, pathMaterial);
scene.add(pathLine);

// Función para crear un Pin 3D (Icono de Ubicación)
// Función para crear un Pin 3D (Icono de Ubicación)
function crearPinUbicacion3D(posicion, colorHex) { 
    const coneGeometry = new THREE.ConeGeometry(0.15, 0.6, 16); 
    const sphereGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    
    // Convertimos el texto (ej. "0xff0000") a un número que Three.js pueda leer
    const colorPin = Number(colorHex);

    const pinMaterial = new THREE.MeshStandardMaterial({ color: colorPin });
    const pinMaterialHover = new THREE.MeshStandardMaterial({ 
        color: colorPin,
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

    // 4. Conectar los elementos para guardar notas y fotos
    const btnGuardarNota = document.getElementById('btn-guardar-nota');
    const inputNota = document.getElementById('input-nota');
    const inputFoto = document.getElementById('input-foto'); // NUEVO
    const listaNotas = document.getElementById('lista-notas');

    // MODIFICACIÓN: Permitir múltiples imágenes
    inputFoto.multiple = true;

    if (btnGuardarNota && inputNota && listaNotas) {
       if (btnGuardarNota && inputNota && listaNotas) {
        btnGuardarNota.addEventListener('click', () => {
            const textoNota = inputNota.value;
            if (textoNota.trim() === "") {
                alert("Por favor, escribe una nota antes de guardar.");
                return;
            }

            // NUEVO: Capturar el color y el nombre de la categoría del Select
            const selectPin = document.getElementById('select-tipo-pin');
            const colorSeleccionado = selectPin.value; // ej: "0xff0000"
            const textoCategoria = selectPin.options[selectPin.selectedIndex].text; // ej: "🔴 Zona de Riesgo"

            const pos = robot.position.clone(); 
            
            // Coordenadas escaladas a valores reales
            const realX = pos.x * 10;
            const realY = pos.y * 10;
            const realZ = pos.z * 10;
            const textoPosicion = `X: ${realX.toFixed(1)}, Y: ${realY.toFixed(1)}, Z: ${realZ.toFixed(1)} | Distancia: ${sensorData.distancia.toFixed(1)} cm`;

            // --- LÓGICA PARA MÚLTIPLES IMÁGENES ---
            let etiquetaImagen = "";
            let imagenesUrls = [];
            if (inputFoto && inputFoto.files.length > 0) {
                etiquetaImagen = '<div class="imagenes-container" style="margin-top: 8px;">';
                for (let i = 0; i < inputFoto.files.length; i++) {
                    const archivo = inputFoto.files[i];
                    const urlImagen = URL.createObjectURL(archivo);
                    imagenesUrls.push(urlImagen);
                    etiquetaImagen += `<img src="${urlImagen}" style="max-width: 100px; height: 80px; border-radius: 4px; margin: 2px; border: 1px solid #ccc; cursor: pointer; object-fit: cover;" onclick="verImagenGrande('${urlImagen}')" title="Click para ver más grande">`;
                }
                etiquetaImagen += '</div>';
            }
            // -----------------------------

            // PASAMOS EL COLOR AL PIN 3D
            const pin3D = crearPinUbicacion3D(pos, colorSeleccionado); 

            const nuevoItemLista = document.createElement('li');
            nuevoItemLista.style.marginBottom = "15px";
            nuevoItemLista.style.padding = "10px";
            nuevoItemLista.style.background = "rgb(6, 6, 102)";
            nuevoItemLista.style.border = "2px solid #e2e4ea";
            nuevoItemLista.style.borderRadius = "7px";
            
            // Convertimos "0xff0000" a "#ff0000" para usarlo en CSS
            const cssColor = colorSeleccionado.replace('0x', '#');

            // Insertamos texto, coordenadas, etiqueta de categoría e imagen
            nuevoItemLista.innerHTML = `
                <div style="margin-bottom: 5px; font-size: 0.85em; background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 4px; display: inline-block;">
                    <span style="color: ${cssColor}; font-weight: bold;">${textoCategoria}</span>
                </div><br>
                <strong style="font-size: 1.1em;">${textoNota}</strong><br>
                <span class="coord-guardada" style="color: #f4f0f0; font-size: 0.9em;">(${textoPosicion})</span>
                ${etiquetaImagen}
            `;
// --- EVENTOS DEL ITEM DE LA LISTA ---

            // 1. CLICK: Alterna la selección (Seleccionar / Deseleccionar)
            nuevoItemLista.addEventListener('click', () => {
                
                // CASO A: Hicimos clic en la nota que YA estaba seleccionada
                if (pinSeleccionadoActual === pin3D) {
                    // Limpiamos la variable global
                    pinSeleccionadoActual = null;
                    
                    // Como el mouse sigue encima de la nota al hacer clic, 
                    // lo dejamos en tamaño "Hover" (1.5) en lugar de "Seleccionado" (1.8)
                    pin3D.scale.set(1.5, 1.5, 1.5); 
                    
                } 
                // CASO B: Seleccionamos una nota nueva
                else {
                    // Si había un pin seleccionado ANTES, lo devolvemos a la normalidad (1.0)
                    if (pinSeleccionadoActual) {
                        pinSeleccionadoActual.scale.set(1, 1, 1);
                        pinSeleccionadoActual.children.forEach(child => {
                            child.material = pinSeleccionadoActual.userData.materialNormal;
                        });
                    }

                    // Marcamos este pin como el nuevo seleccionado
                    pinSeleccionadoActual = pin3D;

                    // Aplicamos el tamaño máximo de "Seleccionado" (1.8)
                    pin3D.scale.set(1.8, 1.8, 1.8); 
                    pin3D.children.forEach(child => {
                        child.material = pin3D.userData.materialHover;
                    });
                }
            });

            // 2. MOUSEOVER: Resalta temporalmente
            nuevoItemLista.addEventListener('mouseover', () => {
                nuevoItemLista.style.cursor = "pointer"; // Cambia el cursor a una manito
                
                // Solo lo agrandamos a 1.5 si NO está seleccionado actualmente (que estaría en 1.8)
                if (pinSeleccionadoActual !== pin3D) {
                    pin3D.scale.set(1.5, 1.5, 1.5);
                    pin3D.children.forEach(child => {
                        child.material = pin3D.userData.materialHover;
                    });
                }
            });
            
            // 3. MOUSEOUT: Quita el resaltado al quitar el cursor
            nuevoItemLista.addEventListener('mouseout', () => {
                // Solo lo achicamos si NO es el pin seleccionado
                if (pinSeleccionadoActual !== pin3D) {
                    pin3D.scale.set(1, 1, 1);
                    pin3D.children.forEach(child => {
                        child.material = pin3D.userData.materialNormal;
                    });
                }
            });

            listaNotas.prepend(nuevoItemLista); 
            
            // Limpiamos los campos para la siguiente entrada
            inputNota.value = "";
            if(inputFoto) inputFoto.value = ""; 
        });
    }
    }

    // --- NUEVO: FUNCIÓN PARA EXPORTAR LA RUTA A CSV ---
    const btnExportar = document.getElementById('btn-exportar');
    if (btnExportar) {
        btnExportar.addEventListener('click', () => {
            if (pathPoints.length === 0) {
                alert("No hay ruta para exportar");
                return;
            }

            let contenidoCSV = "X(cm),Y(cm),Z(cm)\n";

            pathPoints.forEach(punto => {
                const rX = (punto.x * 10).toFixed(2);
                const rY = (punto.z * 10).toFixed(2); 
                const rZ = (punto.y * 10).toFixed(2); 
                contenidoCSV += `${rX},${rY},${rZ}\n`;
            });

            const blob = new Blob([contenidoCSV], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", "ruta_oasis.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    handleResize();
});

// --- FUNCIÓN PARA VER IMÁGENES EN TAMAÑO GRANDE ---
window.verImagenGrande = function(urlImagen) {
    // Crear modal para ver imagen grande
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        cursor: pointer;
        animation: fadeIn 0.3s ease-out;
    `;
    
    const img = document.createElement('img');
    img.src = urlImagen;
    img.style.cssText = `
        max-width: 90%;
        max-height: 90%;
        border-radius: 8px;
        box-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
        animation: zoomIn 0.3s ease-out;
    `;
    
    // Agregar animaciones CSS al head si no existen
    if (!document.getElementById('image-modal-animations')) {
        const style = document.createElement('style');
        style.id = 'image-modal-animations';
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
            @keyframes zoomIn {
                from { transform: scale(0.8); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    modal.appendChild(img);
    
    // Cerrar modal al hacer click
    modal.addEventListener('click', () => {
        modal.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => {
            document.body.removeChild(modal);
        }, 290);
    });
    
    document.body.appendChild(modal);
    
    // Cerrar con tecla ESC
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            modal.click();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
};

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
                    yaw: datos.yaw || 0,
                    pitch: datos.pitch || 0,
                    roll: datos.roll || 0,
                    distancia: datos.distancia || 0
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

    if (elAccel) elAccel.textContent = `Yaw: ${sensorData.yaw.toFixed(2)}°`;
    if (elGyro) elGyro.textContent = `Pitch: ${sensorData.pitch.toFixed(2)}°`;
    if (elTemp) elTemp.textContent = `Roll: ${sensorData.roll.toFixed(2)}°`;
}

function moverRobotConSensores() {
    if (!robot) return;
    
    const gradosARadianes = Math.PI / 180;
    let yawCorregido = sensorData.yaw - yawOffset;

    // 1. APLICAR ROTACIÓN 
    robot.rotation.y = -yawCorregido * gradosARadianes;  
    robot.rotation.x = sensorData.pitch * gradosARadianes; 
    robot.rotation.z = sensorData.roll * gradosARadianes;  

    // 2. APLICAR MOVIMIENTO FÍSICO
    let deltaDistancia = sensorData.distancia - lastDistancia;

    // Validamos que haya un cambio en la distancia (positivo o negativo)
    // Usamos un pequeño margen (0.1) para evitar que el "ruido" del sensor cree miles de puntos estáticos
    if (Math.abs(deltaDistancia) > 0.1) {
        const escalaMovimiento = 0.1; 
        
        // Si deltaDistancia es positivo, (-deltaDistancia) es negativo -> avanza.
        // Si deltaDistancia es negativo, (-deltaDistancia) es positivo -> retrocede.
        robot.translateZ(-deltaDistancia * escalaMovimiento);

        // 3. DIBUJAR EL RASTRO 
        pathPoints.push(robot.position.clone());
        pathGeometry.dispose();
        pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
        pathLine.geometry = pathGeometry;

        // Actualizamos la última distancia registrada
        lastDistancia = sensorData.distancia;
    }

    if (textoCoordsSpan) {
        textoCoordsSpan.textContent = `Dirección: ${yawCorregido.toFixed(1)}° | Distancia actual: ${sensorData.distancia.toFixed(2)} cm`;
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

// --- EVENTO PARA CENTRAR LA FLECHA (TARA) ---
window.addEventListener('keydown', (evento) => {
    if (evento.key === 'c' || evento.key === 'C') {
        yawOffset = sensorData.yaw;
        console.log("Norte re-calibrado. Nuevo punto cero:", yawOffset);
        
        if (textoCoordsSpan) {
            textoCoordsSpan.style.color = "#00ff00"; 
            setTimeout(() => { textoCoordsSpan.style.color = ""; }, 500);
        }
        
        moverRobotConSensores();
    }
});