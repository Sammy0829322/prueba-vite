// Esp32 3.0.5
// Arduino 1.8.19

#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <AsyncWebSocket.h>
#include <ArduinoJson.h>
#include <time.h>
#include <ESP32Servo.h>
#include <Preferences.h>

// Credenciales WiFi
const char* ssid = "HUAWEI-10679Z";
const char* password = "TACOSDEBIRRIA1@";

// Instancia de memoria no volátil
Preferences memoriaServos;

// Configuración de Servos y Microsegundos
const int MIN_US = 500;
const int MAX_US = 2400;

// MODIFICACIÓN DE VELOCIDAD
const int pasoUsNormal = 2;       
const int pasoUsRapido = 12;      
const int velocidadServoMs = 20;  

// Servomotores, Pines y Ángulos
Servo miServo;  const int pinServo  = 4;  int anguloS1 = 0; int usS1; 
Servo miServo2; const int pinServo2 = 18; int anguloS2 = 0; int usS2;
Servo miServo3; const int pinServo3 = 17; int anguloS3 = 0; int usS3;
Servo miServo4; const int pinServo4 = 16; int anguloS4 = 0; int usS4;
Servo miServo5; const int pinServo5 = 15; int anguloS5 = 0; int usS5;
Servo miServo6; const int pinServo6 = 5;  int anguloS6 = 0; int usS6;
Servo miServo7; const int pinServo7 = 21; int anguloS7 = 0; int usS7; 
Servo miServo8; const int pinServo8 = 14; int anguloS8 = 0; int usS8; 

// --- NUEVO: PIN DE COMUNICACIÓN CON LA TARJETA DE ODOMETRÍA ---
const int pinSalidaReversa = 2; // Pin que enviará 3.3V a la otra tarjeta cuando vaya hacia atrás

// Estados para el movimiento continuo
enum EstadoServo { STOP, SUBIENDO, BAJANDO };

EstadoServo estadoS1 = STOP;
EstadoServo estadoS2 = STOP;
EstadoServo estadoS3 = STOP;
EstadoServo estadoS4 = STOP;
EstadoServo estadoS5 = STOP;
EstadoServo estadoS6 = STOP;
EstadoServo estadoS7 = STOP;
EstadoServo estadoS8 = STOP;

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

const int blinkPin = 13;
volatile long tiempoBlink = 1000;

int comandoNumerico = 0;
bool heartbeatReceived = false;

// Declaración de funciones de motores
void setupMotores();
void frenarMotores();
void moverAdelante();
void moverAtras();
void girarDerecha();
void girarIzquierda();

void updateEsp32Time(unsigned long timestamp) {
    timeval tv;
    tv.tv_sec = timestamp;
    tv.tv_usec = 0;
    settimeofday(&tv, nullptr);
}

void onWebSocketMessage(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {

    if (type == WS_EVT_DATA) {
        if (len > 0) {

            String message = String((char*)data);
            DynamicJsonDocument doc(1024);
            DeserializationError error = deserializeJson(doc, message);

            if (!error) {
                String tipo = doc["tipo"].as<String>();

                if (tipo == "heartbeat") {
                    unsigned long timestamp = doc["timestamp"];
                    updateEsp32Time(timestamp);
                    heartbeatReceived = true;
                }

               else if (tipo == "motor") {
                    String comando = doc["comando"].as<String>();

                    if (comando == "adelante") { 
                        digitalWrite(pinSalidaReversa, LOW); // Dirección: Adelante
                        moverAdelante(); 
                        comandoNumerico = 1; 
                    }
                    else if (comando == "atras") { 
                        digitalWrite(pinSalidaReversa, HIGH); // Dirección: Reversa
                        moverAtras(); 
                        comandoNumerico = 2; 
                    }
                    else if (comando == "derecha") { 
                        digitalWrite(pinSalidaReversa, LOW); // Dirección: Adelante (al girar suma)
                        girarDerecha(); 
                        comandoNumerico = 3; 
                    }
                    else if (comando == "izquierda") { 
                        digitalWrite(pinSalidaReversa, LOW); // Dirección: Adelante (al girar suma)
                        girarIzquierda(); 
                        comandoNumerico = 4; 
                    }
                    else if (comando == "paro") { 
                        // ¡MAGIA AQUÍ! ELIMINAMOS EL digitalWrite.
                        // El pin se queda en su último estado (HIGH o LOW).
                        // Así la inercia física se cuenta en la dirección correcta.
                        frenarMotores(); 
                        comandoNumerico = 0; 
                    }
                }

                else if (tipo == "servo") {
                    String accion = doc["accion"].as<String>();

                    if (accion == "subir") estadoS1 = SUBIENDO;
                    else if (accion == "bajar") estadoS1 = BAJANDO;
                    else if (accion == "stop") {
                        estadoS1 = STOP;
                        anguloS1 = map(usS1, MIN_US, MAX_US, 0, 180);
                        memoriaServos.putInt("s1", anguloS1);
                    }
                }

                else if (tipo == "servo2") {
                    String accion = doc["accion"].as<String>();

                    if (accion == "subir") estadoS2 = SUBIENDO;
                    else if (accion == "bajar") estadoS2 = BAJANDO;
                    else if (accion == "stop") {
                        estadoS2 = STOP;
                        anguloS2 = map(usS2, MIN_US, MAX_US, 0, 180);
                        memoriaServos.putInt("s2", anguloS2);
                    }
                }

                else if (tipo == "servo3") {
                    String accion = doc["accion"].as<String>();

                    if (accion == "subir") estadoS3 = SUBIENDO;
                    else if (accion == "bajar") estadoS3 = BAJANDO;
                    else if (accion == "stop") {
                        estadoS3 = STOP;
                        anguloS3 = map(usS3, MIN_US, MAX_US, 0, 180);
                        memoriaServos.putInt("s3", anguloS3);
                    }
                }

                else if (tipo == "servo4") {
                    String accion = doc["accion"].as<String>();

                    if (accion == "subir") estadoS4 = SUBIENDO;
                    else if (accion == "bajar") estadoS4 = BAJANDO;
                    else if (accion == "stop") {
                        estadoS4 = STOP;
                        anguloS4 = map(usS4, MIN_US, MAX_US, 0, 180);
                        memoriaServos.putInt("s4", anguloS4);
                    }
                }

                else if (tipo == "servo5") {
                    String accion = doc["accion"].as<String>();

                    if (accion == "subir") estadoS5 = SUBIENDO;
                    else if (accion == "bajar") estadoS5 = BAJANDO;
                    else if (accion == "stop") {
                        estadoS5 = STOP;
                        anguloS5 = map(usS5, MIN_US, MAX_US, 0, 180);
                        memoriaServos.putInt("s5", anguloS5);
                    }
                }

                else if (tipo == "servo6") {
                    String accion = doc["accion"].as<String>();

                    if (accion == "subir") estadoS6 = SUBIENDO;
                    else if (accion == "bajar") estadoS6 = BAJANDO;
                    else if (accion == "stop") {
                        estadoS6 = STOP;
                        anguloS6 = map(usS6, MIN_US, MAX_US, 0, 180);
                        memoriaServos.putInt("s6", anguloS6);
                    }
                }

                else if (tipo == "servo7") {
                    String accion = doc["accion"].as<String>();

                    if (accion == "subir") estadoS7 = SUBIENDO;
                    else if (accion == "bajar") estadoS7 = BAJANDO;
                    else if (accion == "stop") {
                        estadoS7 = STOP;
                        anguloS7 = map(usS7, MIN_US, MAX_US, 0, 180);
                        memoriaServos.putInt("s7", anguloS7);
                    }
                }

                else if (tipo == "servo8") {
                    String accion = doc["accion"].as<String>();

                    if (accion == "subir") estadoS8 = SUBIENDO;
                    else if (accion == "bajar") estadoS8 = BAJANDO;
                    else if (accion == "stop") {
                        estadoS8 = STOP;
                        anguloS8 = map(usS8, MIN_US, MAX_US, 0, 180);
                        memoriaServos.putInt("s8", anguloS8);
                    }
                }
            }
        }
    }
}

// ================= TAREA SERVOS =================
void servoUpdateTask(void *param) {

    while (1) {
        
        // --- SERVOS RÁPIDOS (1, 7 y 8) usando pasoUsRapido ---
        if (estadoS1 == SUBIENDO && usS1 < MAX_US) { usS1 += pasoUsRapido; if(usS1 > MAX_US) usS1 = MAX_US; miServo.writeMicroseconds(usS1); }
        else if (estadoS1 == BAJANDO && usS1 > MIN_US) { usS1 -= pasoUsRapido; if(usS1 < MIN_US) usS1 = MIN_US; miServo.writeMicroseconds(usS1); }

        if (estadoS7 == SUBIENDO && usS7 < MAX_US) { usS7 += pasoUsRapido; if(usS7 > MAX_US) usS7 = MAX_US; miServo7.writeMicroseconds(usS7); }
        else if (estadoS7 == BAJANDO && usS7 > MIN_US) { usS7 -= pasoUsRapido; if(usS7 < MIN_US) usS7 = MIN_US; miServo7.writeMicroseconds(usS7); }

        if (estadoS8 == SUBIENDO && usS8 < MAX_US) { usS8 += pasoUsRapido; if(usS8 > MAX_US) usS8 = MAX_US; miServo8.writeMicroseconds(usS8); }
        else if (estadoS8 == BAJANDO && usS8 > MIN_US) { usS8 -= pasoUsRapido; if(usS8 < MIN_US) usS8 = MIN_US; miServo8.writeMicroseconds(usS8); }


        // --- SERVOS NORMALES (2, 3, 4, 5, 6) usando pasoUsNormal ---
        if (estadoS2 == SUBIENDO && usS2 < MAX_US) { usS2 += pasoUsRapido; if(usS2 > MAX_US) usS2 = MAX_US; miServo2.writeMicroseconds(usS2); }
        else if (estadoS2 == BAJANDO && usS2 > MIN_US) { usS2 -= pasoUsRapido; if(usS2 < MIN_US) usS2 = MIN_US; miServo2.writeMicroseconds(usS2); }

        if (estadoS3 == SUBIENDO && usS3 < MAX_US) { usS3 += pasoUsNormal; if(usS3 > MAX_US) usS3 = MAX_US; miServo3.writeMicroseconds(usS3); }
        else if (estadoS3 == BAJANDO && usS3 > MIN_US) { usS3 -= pasoUsNormal; if(usS3 < MIN_US) usS3 = MIN_US; miServo3.writeMicroseconds(usS3); }

        if (estadoS4 == SUBIENDO && usS4 < MAX_US) { usS4 += pasoUsNormal; if(usS4 > MAX_US) usS4 = MAX_US; miServo4.writeMicroseconds(usS4); }
        else if (estadoS4 == BAJANDO && usS4 > MIN_US) { usS4 -= pasoUsNormal; if(usS4 < MIN_US) usS4 = MIN_US; miServo4.writeMicroseconds(usS4); }

        if (estadoS5 == SUBIENDO && usS5 < MAX_US) { usS5 += pasoUsNormal; if(usS5 > MAX_US) usS5 = MAX_US; miServo5.writeMicroseconds(usS5); }
        else if (estadoS5 == BAJANDO && usS5 > MIN_US) { usS5 -= pasoUsNormal; if(usS5 < MIN_US) usS5 = MIN_US; miServo5.writeMicroseconds(usS5); }

        if (estadoS6 == SUBIENDO && usS6 < MAX_US) { usS6 += pasoUsNormal; if(usS6 > MAX_US) usS6 = MAX_US; miServo6.writeMicroseconds(usS6); }
        else if (estadoS6 == BAJANDO && usS6 > MIN_US) { usS6 -= pasoUsNormal; if(usS6 < MIN_US) usS6 = MIN_US; miServo6.writeMicroseconds(usS6); }

        vTaskDelay(velocidadServoMs / portTICK_PERIOD_MS);
    }
}

// ================= BLINK =================
void blinkTask(void *param) {

    long ta = millis();
    long tb = 0;
    bool estadoLed = false;

    pinMode(blinkPin, OUTPUT);

    while (1) {
        tb = millis();

        if ((tb - ta) > tiempoBlink) {
            ta = millis();
            digitalWrite(blinkPin, estadoLed);
            estadoLed = !estadoLed;
        }

        vTaskDelay(10 / portTICK_PERIOD_MS);
    }
}

// ================= SETUP =================
void setup() {

    Serial.begin(115200);

    // INICIALIZAMOS EL PIN DE REVERSA
    pinMode(pinSalidaReversa, OUTPUT);
    digitalWrite(pinSalidaReversa, LOW); // Por defecto, apagado

    memoriaServos.begin("posiciones", false);

    anguloS1 = memoriaServos.getInt("s1", 0); usS1 = map(anguloS1, 0, 180, MIN_US, MAX_US);
    anguloS2 = memoriaServos.getInt("s2", 0); usS2 = map(anguloS2, 0, 180, MIN_US, MAX_US);
    anguloS3 = memoriaServos.getInt("s3", 0); usS3 = map(anguloS3, 0, 180, MIN_US, MAX_US);
    anguloS4 = memoriaServos.getInt("s4", 0); usS4 = map(anguloS4, 0, 180, MIN_US, MAX_US);
    anguloS5 = memoriaServos.getInt("s5", 0); usS5 = map(anguloS5, 0, 180, MIN_US, MAX_US);
    anguloS6 = memoriaServos.getInt("s6", 0); usS6 = map(anguloS6, 0, 180, MIN_US, MAX_US);
    anguloS7 = memoriaServos.getInt("s7", 0); usS7 = map(anguloS7, 0, 180, MIN_US, MAX_US);
    anguloS8 = memoriaServos.getInt("s8", 0); usS8 = map(anguloS8, 0, 180, MIN_US, MAX_US);

    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) {
        delay(1000);
        Serial.println("Conectando a WiFi...");
    }

    Serial.println("Conectado a WiFi");
    Serial.print("Dirección IP del ESP32: ");
    Serial.println(WiFi.localIP());

    ws.onEvent(onWebSocketMessage);
    server.addHandler(&ws);
    server.begin();
    Serial.println("Servidor WebSocket iniciado");

    setupMotores();
    frenarMotores();

    miServo.setPeriodHertz(50);  miServo.attach(pinServo, MIN_US, MAX_US);  miServo.writeMicroseconds(usS1);
    miServo2.setPeriodHertz(50); miServo2.attach(pinServo2, MIN_US, MAX_US); miServo2.writeMicroseconds(usS2);
    miServo3.setPeriodHertz(50); miServo3.attach(pinServo3, MIN_US, MAX_US); miServo3.writeMicroseconds(usS3);
    miServo4.setPeriodHertz(50); miServo4.attach(pinServo4, MIN_US, MAX_US); miServo4.writeMicroseconds(usS4);
    miServo5.setPeriodHertz(50); miServo5.attach(pinServo5, MIN_US, MAX_US); miServo5.writeMicroseconds(usS5);
    miServo6.setPeriodHertz(50); miServo6.attach(pinServo6, MIN_US, MAX_US); miServo6.writeMicroseconds(usS6);
    miServo7.setPeriodHertz(50); miServo7.attach(pinServo7, MIN_US, MAX_US); miServo7.writeMicroseconds(usS7);
    miServo8.setPeriodHertz(50); miServo8.attach(pinServo8, MIN_US, MAX_US); miServo8.writeMicroseconds(usS8);

    xTaskCreatePinnedToCore(servoUpdateTask, "Servo Task", 4096, NULL, 1, NULL, 0);
    xTaskCreatePinnedToCore(blinkTask, "Blink Task", 2048, NULL, 1, NULL, 1);
}

void loop() {
    // El loop queda vacío, todo el control de motores está en el evento del WebSocket
}
