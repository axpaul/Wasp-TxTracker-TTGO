/**
 * @file main.cpp
 * @brief Point d'entrée principal du tracker Wasp-TX.
 * @author Paul Miailhe
 * @date 27/06/2026
 * 
 * Orchestre l'initialisation matérielle (UART GPS, PMU AXP192, Radio SX1276),
 * traite les données GPS, gère l'envoi de la télémétrie LoRa et le protocole binaire,
 * et s'occupe de la configuration dynamique via les commandes AT.
 */

#include "header.h"

// --- Définitions des Objets Globaux ---
TinyGPSPlus gps;
ESP32Time rtc;
QueueHandle_t gpsQueue = NULL;
SemaphoreHandle_t radioMutex = NULL;
hw_timer_t *timer = NULL;
volatile bool send_trigger = false;

#if ENABLE_BLUETOOTH
BluetoothSerial SerialBT;
#endif

// --- Fonctions d'Interruption et de Tâche ---

void IRAM_ATTR onTimer() {
    send_trigger = true;
}

/**
 * @brief Tâche FreeRTOS pour l'envoi asynchrone des trames LoRa.
 */
void loraTask(void *pvParameters) {
    wasp_payload_t data;
    while (true) {
        if (xQueueReceive(gpsQueue, &data, portMAX_DELAY) == pdPASS) {
            int state = RADIOLIB_ERR_UNKNOWN;
            
            // Attente du sémaphore pour utiliser le bus SPI de la radio
            if (xSemaphoreTake(radioMutex, portMAX_DELAY) == pdTRUE) {
                state = radio.transmit((uint8_t*)&data, sizeof(wasp_payload_t));
                xSemaphoreGive(radioMutex);
            }
            
            if (state == RADIOLIB_ERR_NONE) {
                // Succès de transmission silencieux
            } else {
                Serial.printf("[RADIO] Transmission FAILED, code: %d\n", state);
            }
        }
    }
}

/**
 * @brief Met à jour l'alarme du timer matériel avec la nouvelle valeur d'intervalle.
 */
void updateTimerInterval(uint16_t seconds) {
    if (timer != NULL) {
        timerAlarmWrite(timer, (uint64_t)seconds * 1000000ULL, true);
        timerWrite(timer, 0); // Réinitialiser le compteur à 0
        timerAlarmEnable(timer);
        Serial.printf("[SYSTEM] Telemetry interval updated to %d seconds.\n", seconds);
    }
}

// --- Setup et Loop principaux ---

void setup() {
    Serial.begin(115200);
    delay(100); // Laisse le temps au moniteur série de s'ouvrir
    
    // Lire l'adresse MAC
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);

    // Initialiser les préférences NVS et charger la configuration
    loadLoRaConfig();

#if ENABLE_BLUETOOTH
    // Initialiser le Bluetooth SPP
    char btName[32];
    snprintf(btName, sizeof(btName), "Wasp-TX-%02X%02X", mac[4], mac[5]);
    SerialBT.begin(btName);
    Serial.printf("[SYSTEM] Bluetooth SPP started: '%s'\n", btName);
#endif

    // Logs système de démarrage
    Serial.println("\n=========================================");
    Serial.printf("[SYSTEM] Wasp-TX Tracker Firmware v%s\n", FW_VERSION);
    Serial.printf("[SYSTEM] Straker ID (MAC): %02X:%02X:%02X:%02X:%02X:%02X\n", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    Serial.printf("[SYSTEM] Chip Model:      %s (Rev %d)\n", ESP.getChipModel(), ESP.getChipRevision());
    Serial.printf("[SYSTEM] Flash Size:      %.1f MB\n", ESP.getFlashChipSize() / (1024.0 * 1024.0));
    Serial.println("=========================================");
    
    // Initialiser le PMU (Gestion d'énergie)
    if (initPMU()) {
        Serial.println("[PMU] PMU Initialized successfully.");
    } else {
        Serial.println("[PMU] PMU Initialization FAILED! Power check required.");
    }
    
    // Initialiser la communication UART pour le module GPS
    Serial1.begin(GPS_BAUDRATE, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
    Serial.println("[GPS] UART Interface initialized.");

    // Initialiser la radio LoRa
    initRadio();

    // Initialiser l'horloge RTC interne
    rtc.setTime(0, 0, 0, 1, 1, 2026);

    // Initialiser le sémaphore de protection de la radio et la file d'attente
    radioMutex = xSemaphoreCreateMutex();
    gpsQueue = xQueueCreate(5, sizeof(wasp_payload_t));

    // Créer la tâche FreeRTOS de transmission LoRa
    xTaskCreate(loraTask, "LoRaTX", 4096, NULL, 1, NULL);

    // Configurer le timer matériel d'alarme pour l'envoi de la télémétrie
    timer = timerBegin(0, 80, true); // Timer 0, diviseur 80 (tick de 1 microseconde)
    timerAttachInterrupt(timer, &onTimer, true);
    timerAlarmWrite(timer, (uint64_t)activeConfig.txInterval * 1000000ULL, true);
    timerAlarmEnable(timer);
    
    Serial.printf("[SYSTEM] Hardware timer initialized for %ds intervals.\n", activeConfig.txInterval);
    Serial.println("[SYSTEM] Setup completed successfully. Wasp-TX running...");
    Serial.println("=========================================");
}

void loop() {
    // Lecture continue des trames GPS du port UART1
    while (Serial1.available() > 0) {
        gps.encode(Serial1.read());
    }

    // Synchronisation de l'heure RTC locale si les données GPS sont valides et mises à jour
    if (gps.time.isUpdated() && gps.location.isValid()) {
        rtc.setTime(gps.time.second(), gps.time.minute(), gps.time.hour(), 
                    gps.date.day(), gps.date.month(), gps.date.year());
    }

    // Déclencheur du timer pour envoyer la télémétrie
    if (send_trigger) {
        send_telemetry();
        send_trigger = false; 
    }

    // Vérifier et traiter les commandes AT sur le port Série et le Bluetooth
    checkSerialCommands();
    
    // Petite pause pour relâcher le CPU
    delay(1);
}

/**
 * @brief Assemble et envoie une trame de télémétrie (GPS + Système).
 */
void send_telemetry() {
    wasp_payload_t packet;
    
    // Remplissage de l'en-tête de routage
    packet.id = activeConfig.trackerId; 
    packet.apid = activeConfig.apid; 
    packet.type = activeConfig.trackerType;
    packet.utc = (uint32_t)rtc.getEpoch();
    
    // Remplissage des coordonnées GPS (conversion float en tableau d'octets)
    union FloatConverter { float f; uint8_t b[4]; };
    FloatConverter conv;
    
    conv.f = (float)gps.location.lat();    memcpy(packet.lat, conv.b, 4);
    conv.f = (float)gps.location.lng();    memcpy(packet.lon, conv.b, 4);
    conv.f = (float)gps.altitude.meters(); memcpy(packet.alt, conv.b, 4);
    conv.f = (float)gps.speed.kmph();      memcpy(packet.spd, conv.b, 4);
    conv.f = (float)gps.course.deg();      memcpy(packet.cog, conv.b, 4);

    // Mesures du PMU (tension batterie et température interne)
    packet.vbat = getPMUBatteryVoltage();
    
    float internalTemp = getPMUTemperature();
    packet.temp = (int16_t)(internalTemp * 100.0f); // Conversion en 1/100 °C
    
    packet.sats = (uint8_t)gps.satellites.value();
    
    // Construction du bitmask d'état
    packet.status = 0;
    if (gps.location.isValid()) {
        packet.status |= (1 << 0); // Bit 0: Fix GPS valide
    }
    
    // Traiter et émettre les données de télémétrie sur les ports de communication série (USB/Bluetooth)
    outputTelemetryFrame(packet);

    // Envoi de la télémétrie dans la file de transmission radio
    if (gpsQueue != NULL) {
        xQueueSend(gpsQueue, &packet, 0);
    }
}
