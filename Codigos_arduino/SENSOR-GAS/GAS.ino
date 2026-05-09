// Definiciones para el sensor MQ6
#define PIN_MQ6 4   // ADC1 para ESP32-S3

const float RL_S = 2000.0;  // Resistencia de carga
const float VC_S = 5.0;     // Voltaje alimentación sensor
const float R0_S = 1250.0;   // Calibración previa

// Constantes de curva GLP
const float m_curva = -0.417;
const float b_curva = 1.267;

void setupGas() {
    // Resolución de 12 bits para el S3 (0-4095)
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
    pinMode(PIN_MQ6, INPUT);
    Serial.println("Sensor MQ6 configurado.");
}

float obtenerPPM_Gas() {
    int adc = analogRead(PIN_MQ6);
    // Conversión a voltaje (0-3.3V)
    float Vo_medido = adc * (3.3 / 4095.0);
    
    // Tu factor de compensación del divisor de voltaje
    float Vo = Vo_medido * 1.50;

    // Evitar errores logarítmicos si el voltaje es casi cero
    if (Vo <= 0.05) return 0.0;

    // Cálculo de resistencia del sensor (Rs)
    float Rs = RL_S * ((VC_S / Vo) - 1.0);
    float ratio = Rs / R0_S;

    // Cálculo de PPM final
    float ppm = pow(10, (log10(ratio) - b_curva) / m_curva);
    
    return ppm;
}
