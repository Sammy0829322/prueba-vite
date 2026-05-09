#include <Wire.h>
#include <SparkFun_BNO08x_Arduino_Library.h>
#include <ESP32Servo.h>
#include <PID_v1.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>

// --- CREDENCIALES WIFI ---
const char* ssid = "HUAWEI-10679Z";
const char* password = "TACOSDEBIRRIA1@";

// --- OBJETOS ---
BNO08x myIMU;
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

// Pines para ESP32-S3 (Configuración Robot Oasis)
const int sdaPin = 8;
const int sclPin = 9;
const int pinServoTilt = 18;
const int pinServoRoll = 21;
const int pinServoPan = 14;   
const int pinSensorHall = 2; 

// <--- NUEVO PIN PARA LEER LA SEÑAL FÍSICA DE REVERSA --->
const int pinSenalReversaHw = 6; 

Servo servoTilt;
Servo servoRoll;
Servo servoPan;               

// --- VARIABLES GLOBALES NUEVAS ---
bool pidActivado = true; 
int direccionActual = 1; 

// --- VARIABLES GLOBALES ORIGINALES ---
volatile int contadorIman = 0; 
unsigned long ultimoTiempoHall = 0;
const float distanciaPorPulso = 3.25; 
float distanciaTotal = 0.0;

float currentYaw = 0;
float currentPitch = 0;
float currentRoll = 0;

double setpoint = 0; 
double inputTilt, outputTilt;
double inputRoll, outputRoll;

double Kp = 2.2, Ki = 0.01, Kd = 0.5; 

PID pidTilt(&inputTilt, &outputTilt, &setpoint, Kp, Ki, Kd, DIRECT);
PID pidRoll(&inputRoll, &outputRoll, &setpoint, Kp, Ki, Kd, DIRECT);

const float deadzone = 1.0;        
float smoothedTilt = 90;          
float smoothedRoll = 90;
float smoothedPan = 90;           
float lastTiltPos = 90;           
float lastRollPos = 90;
float lastPanPos = 90;            

const float smoothingFactor = 0.12; 

// --- INTERRUPCIÓN SENSOR HALL ---
void IRAM_ATTR deteccionHall() {
  unsigned long tiempoActual = millis();
  
  // Nota: Dejé el 50 para no alterar tu código original, pero recuerda que si 
  // en altas velocidades pierde pulsos, debes bajar este valor a 20.
  if (tiempoActual - ultimoTiempoHall > 15) {
    
    // NUEVA LÓGICA DE HARDWARE: Leemos el voltaje del Pin 4 al instante
    if (digitalRead(pinSenalReversaHw) == HIGH) {
        contadorIman -= 1; // Si recibe 3.3V de la otra tarjeta, resta
    } else {
        contadorIman += 1; // Si recibe 0V, suma
    }
    
    ultimoTiempoHall = tiempoActual;
  }
}

// --- TAREA FREERTOS PARA EL PID Y SERVOS (CORE 1) ---
void tareaControlPID(void *param) {
  const TickType_t xFrequency = 20 / portTICK_PERIOD_MS;
  TickType_t xLastWakeTime = xTaskGetTickCount();

  while (1) {
    if (myIMU.getSensorEvent() == true) {
      if (myIMU.getSensorEventID() == SENSOR_REPORTID_ROTATION_VECTOR) {
        
        double rawInputTilt = (myIMU.getPitch()) * 180.0 / PI;
        double rawInputRoll = (myIMU.getRoll()) * 180.0 / PI;
        
        currentPitch = rawInputTilt;
        currentRoll = rawInputRoll;
        currentYaw = (myIMU.getYaw()) * 180.0 / PI;

        // SOLO calcula el PID si está activado
        if (pidActivado) {
            inputTilt = (fabs(rawInputTilt) < deadzone) ? 0 : rawInputTilt;
            inputRoll = (fabs(rawInputRoll) < deadzone) ? 0 : rawInputRoll;

            pidTilt.Compute();
            pidRoll.Compute();

            float targetTilt = 90 + outputTilt;
            float targetRoll = 90 + outputRoll;

            smoothedTilt = smoothedTilt + (targetTilt - smoothedTilt) * smoothingFactor;
            smoothedRoll = smoothedRoll + (targetRoll - smoothedRoll) * smoothingFactor;
        }

        // ESCRITURA EN LOS SERVOS
        if (fabs(smoothedTilt - lastTiltPos) > 0.2) {
            servoTilt.write(constrain(smoothedTilt, 0, 180));
            lastTiltPos = smoothedTilt;
        }
        
        if (fabs(smoothedRoll - lastRollPos) > 0.2) {
            servoRoll.write(constrain(smoothedRoll, 0, 180));
            lastRollPos = smoothedRoll;
        }

        // NUEVO: Movimiento del PAN (Independiente del PID)
        if (fabs(smoothedPan - lastPanPos) > 0.2) {
            servoPan.write(constrain(smoothedPan, 0, 180));
            lastPanPos = smoothedPan;
        }
      }
    }
    vTaskDelayUntil(&xLastWakeTime, xFrequency);
  }
}

// --- FUNCIÓN WEBSOCKET ---
void onWebSocketMessage(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
    if (type == WS_EVT_DATA) {
        String message = String((char*)data);
        DynamicJsonDocument doc(1024);
        DeserializationError error = deserializeJson(doc, message);

        if (!error) {
            String tipo = doc["tipo"].as<String>();

            // 1. PETICIÓN DE POSICIÓN
            if (tipo == "posicion") {
                StaticJsonDocument<256> response; 
                response["tipo"] = "datos_sensor";
                
                distanciaTotal = contadorIman * distanciaPorPulso;

                response["yaw"] = currentYaw;
                response["pitch"] = currentPitch;
                response["roll"] = currentRoll;
                response["distancia"] = distanciaTotal; 

                String output;
                serializeJson(response, output);
                client->text(output);
            }
            // 2. ACTIVAR/DESACTIVAR PID
            else if (tipo == "estado_pid") {
                pidActivado = doc["activado"].as<bool>();
                
                if (pidActivado) {
                    pidTilt.SetMode(MANUAL); pidTilt.SetMode(AUTOMATIC);
                    pidRoll.SetMode(MANUAL); pidRoll.SetMode(AUTOMATIC);
                    Serial.println("PID Activado");
                } else {
                    Serial.println("PID Desactivado - Modo Manual");
                }
            }
            // 3. MOVER SERVOS MANUALMENTE
            else if (tipo == "mover_servo") {
                String eje = doc["eje"].as<String>();
                float angulo = doc["angulo"].as<float>();
                
                // Tilt y Roll solo se mueven manualmente si el PID está apagado
                if (!pidActivado) {
                    if (eje == "tilt") smoothedTilt = angulo;
                    else if (eje == "roll") smoothedRoll = angulo;
                }
                
                // El PAN siempre se puede mover manualmente, sin importar el PID
                if (eje == "pan") {
                    smoothedPan = angulo;
                }
            }
            // 4. DIRECCIÓN DEL MOTOR PARA ODOMETRÍA
            else if (tipo == "motor") {
                String comando = doc["comando"].as<String>();
                
                if (comando == "atras") {
                    direccionActual = -1; // Esto ya no afecta la interrupción, pero lo dejo para no alterar nada más.
                    Serial.println("Odometría: Mensaje de Reversa Recibido (La medición real depende del Pin 4)");
                } else {
                    direccionActual = 1; 
                    Serial.println("Odometría: Mensaje de Adelante/Stop Recibido");
                }
            }
        }
    }
}

void setup() {
  Serial.begin(115200);
  
  // <--- NUEVO: CONFIGURACIÓN DEL PIN DE REVERSA --->
  // Usamos INPUT_PULLDOWN por seguridad: si el cable se desconecta, leerá LOW (hacia adelante)
  pinMode(pinSenalReversaHw, INPUT_PULLDOWN); 

  pinMode(pinSensorHall, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(pinSensorHall), deteccionHall, FALLING); 

  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);
  
  servoTilt.setPeriodHertz(50);
  servoRoll.setPeriodHertz(50);
  servoPan.setPeriodHertz(50); 
  
  servoTilt.write(90);
  servoRoll.write(90);
  servoPan.write(90);          
  
  servoTilt.attach(pinServoTilt, 500, 2400);
  servoRoll.attach(pinServoRoll, 500, 2400);
  servoPan.attach(pinServoPan, 500, 2400); 

  Wire.begin(sdaPin, sclPin);

  if (myIMU.begin(0x4A, Wire) == false && myIMU.begin(0x4B, Wire) == false) {
    Serial.println("Error: Sensor BNO08x no detectado.");
    while (1);
  }

  myIMU.enableRotationVector(20000); 

  pidTilt.SetMode(AUTOMATIC);
  pidTilt.SetOutputLimits(-70, 70); 
  pidRoll.SetMode(AUTOMATIC);
  pidRoll.SetOutputLimits(-70, 70);
  
  pidTilt.SetSampleTime(20);
  pidRoll.SetSampleTime(20);

  Serial.println("Gimbal: Modo Cinemático Activado.");

  WiFi.begin(ssid, password);
  Serial.print("Conectando a WiFi");

  while (WiFi.status() != WL_CONNECTED) {
      delay(500);
      Serial.print(".");
  }

  Serial.println("\nWiFi Conectado!");
  Serial.print("Dirección IP: ");
  Serial.println(WiFi.localIP());
  
  ws.onEvent(onWebSocketMessage);
  server.addHandler(&ws);
  server.begin();

  xTaskCreatePinnedToCore(tareaControlPID, "Task_PID", 4096, NULL, 2, NULL, 1);
}

void loop() {
  ws.cleanupClients();

  static unsigned long lastMsg = 0;
  if (millis() - lastMsg > 500) { 
    Serial.print("Yaw: "); Serial.print(currentYaw, 1);
    Serial.print(" | Distancia: "); Serial.print(contadorIman * distanciaPorPulso); Serial.println(" cm");
    lastMsg = millis();
  }

  vTaskDelay(10 / portTICK_PERIOD_MS); 
}
