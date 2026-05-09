
// Esp32 3.0.5 | Arduino 1.8.19
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <AsyncWebSocket.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <time.h>

// --- LIBRERÍAS AUDIO, MAX30102 Y RADAR ---
#include <driver/i2s.h>
#include <Wire.h>
#include "MAX30105.h" 
#include <ld2410.h>

// Credenciales WiFi
//const char* ssid = "INFINITUM7865";
//const char* password = "xg2UyXeNEr";

const char* ssid = "HUAWEI-10679Z";
const char* password = "TACOSDEBIRRIA1@";


// --- PINES I2C, I2S, RADAR Y LED (NUEVO) ---
#define I2C_SDA 8
#define I2C_SCL 9
#define I2S_PORT I2S_NUM_0
#define I2S_WS 42   
#define I2S_SD 41   
#define I2S_SCK 40  

#define RADAR_RX_PIN 18 
#define RADAR_TX_PIN 17 
#define RADAR_SERIAL Serial1

const int ledPin = 5; // GPIO5 primer LED
const int ledPin2 = 11; //GPIO11 segundo LED

// Objetos
Servo miServo;
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");
MAX30105 particleSensor;
ld2410 radar; 

// Pines y Variables del Servo y LED Interno
const int pinServo = 19;
const int blinkPin = 13;
volatile long tiempoBlink = 1000;
int anguloActual = 90;

// --- VARIABLES DE ESTADO ---
bool sensorOnline = false;
bool audioActivo = false;
bool sensorActivo = false;
bool radarActivo = false; 
const int UMBRAL_HUMANO = 95;

// --- FUNCIONES SENSOR, I2S Y TIEMPO ---
void intentarConectarSensor() {
    Serial.println("Intentando detectar MAX30102...");
    Wire.end(); 
    Wire.begin(I2C_SDA, I2C_SCL, 400000); 

    if (particleSensor.begin(Wire, I2C_SPEED_FAST)) {
        particleSensor.setup(0x1F, 4, 2, 400, 411, 4096); 
        sensorOnline = true;
        Serial.println("MAX30102 CONFIGURADO.");
    } else {
        sensorOnline = false;
        Serial.println("ERROR: No se pudo encontrar el sensor.");
    }
}

void setupI2S() {
    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate = 44100,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 8,
        .dma_buf_len = 1024,
        .use_apll = false
    };
    i2s_pin_config_t pin_config = {
        .bck_io_num = I2S_SCK, .ws_io_num = I2S_WS,
        .data_out_num = I2S_PIN_NO_CHANGE, .data_in_num = I2S_SD
    };
    i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
    i2s_set_pin(I2S_PORT, &pin_config);
}

void updateEsp32Time(unsigned long timestamp) {
    timeval tv;
    tv.tv_sec = timestamp;
    tv.tv_usec = 0;
    settimeofday(&tv, nullptr);
}

// --- MANEJO DE MENSAJES WEBSOCKET ---
void onWebSocketMessage(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
    if (type == WS_EVT_DATA) {
        data[len] = '\0'; 
        String message = String((char*)data);
        
        DynamicJsonDocument doc(1024);
        DeserializationError error = deserializeJson(doc, message);

        if (!error) {
            String tipo = doc["tipo"].as<String>();

             if (tipo == "medicion") {
                String sensor = doc["sensor"].as<String>();
                if (sensor == "gaslp") {
                    float valorPPM = obtenerPPM_Gas();

                    StaticJsonDocument<200> response;
                    response["tipo"] = "lectura_gas";
                    response["ppm"] = valorPPM;

                    String output;
                    serializeJson(response, output);
                    client->text(output); 
                    Serial.printf("PPM de Gas enviado: %.2f\n", valorPPM);
                }
            }

            if (tipo == "servo") {
                int anguloRecibido = doc["angulo"] | 90;
                anguloActual = constrain(anguloRecibido, 0, 180);
                miServo.write(anguloActual);
            }
            // NUEVO: Control de Brillo LED desde el segundo código adaptado a WebSocket
            else if (tipo == "led_brillo") {
                int brillo = doc["valor"] | 0;
                analogWrite(ledPin, constrain(brillo, 0, 255));
                Serial.printf("Brillo Panel LED: %d\n", brillo);
            }
            // NUEVO: Control de Brillo para el SEGUNDO LED
            else if (tipo == "led_brillo2") {
                int brillo = doc["valor"] | 0;
                analogWrite(ledPin2, constrain(brillo, 0, 255));
                Serial.printf("Brillo Panel LED 2: %d\n", brillo);
            }
            else if (tipo == "heartbeat") {
                unsigned long timestamp = doc["timestamp"];
                updateEsp32Time(timestamp);
            }
        } 
        else {
            if (message == "AUDIO_ON") audioActivo = true;
            else if (message == "AUDIO_OFF") audioActivo = false;
            else if (message == "SENSOR_ON") {
                if (!sensorOnline) intentarConectarSensor();
                if (sensorOnline) sensorActivo = true;
            }
            else if (message == "SENSOR_OFF") sensorActivo = false;
            else if (message == "RADAR_ON") radarActivo = true;  
            else if (message == "RADAR_OFF") radarActivo = false; 
        }
    }
    else if (type == WS_EVT_CONNECT) Serial.println("Cliente conectado");
    else if (type == WS_EVT_DISCONNECT) Serial.println("Cliente desconectado");
}

void blinkTask(void *param) {
    pinMode(blinkPin, OUTPUT);
    while (1) {
        digitalWrite(blinkPin, !digitalRead(blinkPin));
        vTaskDelay(tiempoBlink / portTICK_PERIOD_MS);
    }
}

// --- SETUP ---
void setup() {
    Serial.begin(115200);
    
    // Inicialización de Hardware (Incluyendo LED del segundo código)
    pinMode(ledPin, OUTPUT); 
    analogWrite(ledPin, 0); // Inicia apagado

    pinMode(ledPin2, OUTPUT); // INICIALIZAR LED 2
    analogWrite(ledPin2, 0);  // Inicia apagado

    intentarConectarSensor();
    setupI2S();

    RADAR_SERIAL.begin(256000, SERIAL_8N1, RADAR_RX_PIN, RADAR_TX_PIN);
    radar.begin(RADAR_SERIAL);

    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }

    Serial.println("\n¡WiFi Conectado!");
    Serial.print("Dirección IP: ");
    Serial.println(WiFi.localIP());
    
    ws.onEvent(onWebSocketMessage);
    server.addHandler(&ws);
    server.begin();

    miServo.setPeriodHertz(50);
    miServo.attach(pinServo, 500, 2400);
    miServo.write(anguloActual);
    
    xTaskCreatePinnedToCore(blinkTask, "BlinkTask", 2048, NULL, 1, NULL, 1);
}

// --- LOOP ---
void loop() {
    ws.cleanupClients();

    // 1. Audio I2S
    if (audioActivo && ws.count() > 0) {
        int16_t i2s_data[1024];
        size_t bytes_read;
        esp_err_t res = i2s_read(I2S_PORT, &i2s_data, sizeof(i2s_data), &bytes_read, 0);
        if (res == ESP_OK && bytes_read > 0) {
            if (ws.availableForWriteAll()) ws.binaryAll((uint8_t*)i2s_data, bytes_read);
        }
    }

    // 2. Sensor MAX30102
    if (sensorActivo && sensorOnline && ws.count() > 0) {
        long irValue = particleSensor.getIR();
        long redValue = particleSensor.getRed();
        if (irValue > 50000) {
            float ratio = (float)redValue / (float)irValue;
            int spo2 = 110 - (15 * ratio);
            spo2 = constrain(spo2, 70, 100);
            String json = "{\"tipo\":\"heart\", \"val\":" + String(irValue) + ", \"oxigeno\":" + String(spo2) + "}";
            if (ws.availableForWriteAll()) ws.textAll(json);
        }
    }

    // 3. Procesamiento RADAR
    radar.read();
    if (radarActivo && radar.isConnected() && ws.count() > 0) {
        static uint32_t lastRadarPrint = 0;
        if (millis() - lastRadarPrint > 800) {
            lastRadarPrint = millis();
            int eneMov = radar.movingTargetEnergy();
            int eneEst = radar.stationaryTargetEnergy();
            bool presenciaReal = (eneMov > UMBRAL_HUMANO) || (eneEst > UMBRAL_HUMANO);

            StaticJsonDocument<300> radarDoc;
            radarDoc["tipo"] = "lectura_radar";
            radarDoc["presencia"] = presenciaReal;
            

            // Enviamos siempre los 4 valores para que no queden vacíos en el JS
        radarDoc["dist_mov"] = radar.movingTargetDistance();
        radarDoc["ene_mov"] = eneMov;
        radarDoc["dist_est"] = radar.stationaryTargetDistance();
        radarDoc["ene_est"] = eneEst;

            String radarOutput;
            serializeJson(radarDoc, radarOutput);
            if (ws.availableForWriteAll()) ws.textAll(radarOutput);
        }
    }
}
