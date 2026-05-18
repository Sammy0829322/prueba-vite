#include <Wire.h>
#include <SparkFun_BNO08x_Arduino_Library.h>
#include <ESP32Servo.h>
#include <MPU6050.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>

// --- CREDENCIALES WIFI ---
const char* ssid = "HUAWEI-10679Z";
const char* password = "TACOSDEBIRRIA1@";

// --- OBJETOS ---
BNO08x myIMU;
MPU6050 mpu;
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

// --- PINES (Configuración Robot Oasis) ---
const int sdaPin = 8;
const int sclPin = 9;
const int pinServoTilt = 21;
const int pinServoRoll = 18;
const int pinServoPan  = 14;   
const int pinSensorHall = 2; 
const int pinSenalReversaHw = 6; 

Servo servoTilt;
Servo servoRoll;
Servo servoPan;                

// --- VARIABLES GLOBALES ---
bool pidActivado = true; 
int direccionActual = 1; 

volatile int contadorIman = 0; 
unsigned long ultimoTiempoHall = 0;
const float distanciaPorPulso = 3.25; 
float distanciaTotal = 0.0;

// Variables BNO08x (Solo Telemetría)
float currentYaw = 0;
float currentPitch = 0;
float currentRoll = 0;

// Posiciones de Servos
float smoothedTilt = 90;          
float smoothedRoll = 90;
float smoothedPan = 0;           
float lastTiltPos = 90;           
float lastRollPos = 90;
float lastPanPos = 0;            

// --- VARIABLES MPU6050 Y PID CUSTOM ---
float accAngleX, gyroRateX, accAngleY, gyroRateY;
float tiltFiltered = 90, rollFiltered = 90;
float alpha = 0.98;

float Kp_tilt = 0.4, Ki_tilt = 0.9, Kd_tilt = 0.001;
float Kp_roll = 0.4, Ki_roll = 0.9, Kd_roll = 0.001;

float errorTilt, lastErrorTilt = 0, integralTilt = 0;
float errorRoll, lastErrorRoll = 0, integralRoll = 0;

unsigned long lastTimePID = 0;

// --- INTERRUPCIÓN SENSOR HALL ---
void IRAM_ATTR deteccionHall() {
  unsigned long tiempoActual = millis();
  
  if (tiempoActual - ultimoTiempoHall > 15) {
    if (digitalRead(pinSenalReversaHw) == HIGH) {
        contadorIman -= 1; 
    } else {
        contadorIman += 1; 
    }
    ultimoTiempoHall = tiempoActual;
  }
}

// --- TAREA FREERTOS PARA EL BNO, MPU Y SERVOS (CORE 1) ---
void tareaControlPID(void *param) {
  const TickType_t xFrequency = 20 / portTICK_PERIOD_MS;
  TickType_t xLastWakeTime = xTaskGetTickCount();
  lastTimePID = millis();

  while (1) {
    // 1. LEER BNO08x (Exclusivo para telemetría Websocket)
    if (myIMU.getSensorEvent() == true) {
      if (myIMU.getSensorEventID() == SENSOR_REPORTID_ROTATION_VECTOR) {
        currentPitch = (myIMU.getPitch()) * 180.0 / PI;
        currentRoll = (myIMU.getRoll()) * 180.0 / PI;
        currentYaw = (myIMU.getYaw()) * 180.0 / PI;
      }
    }

    // 2. LEER MPU6050 Y CONTROL PID
    unsigned long currentTime = millis();
    float dt = (currentTime - lastTimePID) / 1000.0;
    if (dt <= 0) dt = 0.02; // Evitar división por cero
    lastTimePID = currentTime;

    int16_t ax, ay, az, gx, gy, gz;
    mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);

    if (az != 0) {
      accAngleX = atan2(ay, az) * 180 / PI;
      accAngleY = atan2(-ax, az) * 180 / PI;

      gyroRateX = gx / 131.0;
      gyroRateY = gy / 131.0;

      // Filtro complementario
      tiltFiltered = alpha * (tiltFiltered + gyroRateX * dt) + (1 - alpha) * accAngleX;
      rollFiltered = alpha * (rollFiltered + gyroRateY * dt) + (1 - alpha) * accAngleY;

      // Calcular PID solo si está activado
      if (pidActivado) {
        // PID Tilt
        errorTilt = 0 - tiltFiltered;
        integralTilt += errorTilt * dt;
        integralTilt = constrain(integralTilt, -100, 100);
        float derivativeTilt = (errorTilt - lastErrorTilt) / dt;
        float outputTilt = Kp_tilt * errorTilt + Ki_tilt * integralTilt + Kd_tilt * derivativeTilt;
        lastErrorTilt = errorTilt;

        // PID Roll
        errorRoll = 0 - rollFiltered;
        integralRoll += errorRoll * dt;
        integralRoll = constrain(integralRoll, -100, 100);
        float derivativeRoll = (errorRoll - lastErrorRoll) / dt;
        float outputRoll = Kp_roll * errorRoll + Ki_roll * integralRoll + Kd_roll * derivativeRoll;
        lastErrorRoll = errorRoll;

        // Ángulos corregidos para los servos
        smoothedTilt = constrain(90 + outputTilt, 0, 180);
        smoothedRoll = constrain(90 - outputRoll, 0, 180);
      }
    }

    // 3. ESCRITURA EN LOS SERVOS
    if (fabs(smoothedTilt - lastTiltPos) > 0.5) {
        servoTilt.write(smoothedTilt);
        lastTiltPos = smoothedTilt;
    }
    
    if (fabs(smoothedRoll - lastRollPos) > 0.5) {
        servoRoll.write(smoothedRoll);
        lastRollPos = smoothedRoll;
    }

    // Movimiento del PAN (Siempre Independiente del PID)
    if (fabs(smoothedPan - lastPanPos) > 0.2) {
        servoPan.write(constrain(smoothedPan, 0, 180));
        lastPanPos = smoothedPan;
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

            // 1. PETICIÓN DE POSICIÓN (Valores BNO08x)
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
            // 2. ACTIVAR/DESACTIVAR PID MPU6050
            else if (tipo == "estado_pid") {
                pidActivado = doc["activado"].as<bool>();
                
                if (pidActivado) {
                    // Reiniciamos variables de integración para evitar saltos bruscos
                    integralTilt = 0; lastErrorTilt = 0;
                    integralRoll = 0; lastErrorRoll = 0;
                    Serial.println("PID Activado (Control MPU6050)");
                } else {
                    Serial.println("PID Desactivado - Modo Manual");
                }
            }
            // 3. MOVER SERVOS MANUALMENTE
            else if (tipo == "mover_servo") {
                String eje = doc["eje"].as<String>();
                float angulo = doc["angulo"].as<float>();
                
                if (!pidActivado) {
                    if (eje == "tilt") smoothedTilt = angulo;
                    else if (eje == "roll") smoothedRoll = angulo;
                }
                
                if (eje == "pan") {
                    smoothedPan = angulo;
                }
            }
            // 4. DIRECCIÓN DEL MOTOR PARA ODOMETRÍA
            else if (tipo == "motor") {
                String comando = doc["comando"].as<String>();
                
                if (comando == "atras") {
                    direccionActual = -1; 
                    Serial.println("Odometría: Mensaje de Reversa Recibido");
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
  
  servoTilt.attach(pinServoTilt, 500, 2400);
  servoRoll.attach(pinServoRoll, 500, 2400);
  servoPan.attach(pinServoPan, 500, 2400); 

  servoTilt.write(90);
  servoRoll.write(90);
  servoPan.write(0);          

  Wire.begin(sdaPin, sclPin);

  // Inicializar BNO08x
  if (myIMU.begin(0x4A, Wire) == false && myIMU.begin(0x4B, Wire) == false) {
    Serial.println("Error: Sensor BNO08x no detectado.");
  } else {
    myIMU.enableRotationVector(20000); 
  }

  // Inicializar MPU6050
  mpu.initialize();
  if (!mpu.testConnection()) {
    Serial.println("Error: MPU6050 no detectado.");
  }

  Serial.println("Gimbal: Modo Cinemático Activado (BNO Telemetría, MPU PID).");

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
    Serial.print("Yaw BNO: "); Serial.print(currentYaw, 1);
    Serial.print(" | Tilt MPU: "); Serial.print(tiltFiltered, 1);
    Serial.print(" | Roll MPU: "); Serial.print(rollFiltered, 1);
    Serial.print(" | Distancia: "); Serial.print(contadorIman * distanciaPorPulso); Serial.println(" cm");
    lastMsg = millis();
  }

  vTaskDelay(10 / portTICK_PERIOD_MS); 
}