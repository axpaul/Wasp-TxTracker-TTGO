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
ESP32Time rtc;
QueueHandle_t gpsQueue = NULL;
SemaphoreHandle_t radioMutex = NULL;
hw_timer_t *timer = NULL;
volatile bool send_trigger = false;
volatile uint8_t currentMode = 0; // 0 = Vol (Normal), 1 = Eco (Lent)

#if ENABLE_BLUETOOTH
BluetoothSerial SerialBT;
#endif

// --- Fonctions d'Interruption ---

void IRAM_ATTR onTimer() {
    send_trigger = true;
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
        setupPMUInterrupts(); // Activer les interruptions pour le bouton d'alimentation PEKEY
    } else {
        Serial.println("[PMU] PMU Initialization FAILED! Power check required.");
    }
    
    // Initialiser le bouton utilisateur de la T-Beam (GPIO 38)
    pinMode(38, INPUT_PULLUP);
    
    // Initialiser la communication UART pour le module GPS
    Serial1.begin(GPS_BAUDRATE, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
    Serial.println("[GPS] UART Interface initialized.");

    // Initialiser la radio LoRa
    initRadio();

    // Initialiser l'horloge RTC interne
    rtc.setTime(0, 0, 0, 1, 1, 2026);

    // Initialiser les sémaphores de protection (Mutex) et la file d'attente
    radioMutex = xSemaphoreCreateMutex();
    gpsMutex = xSemaphoreCreateMutex();
    gpsQueue = xQueueCreate(5, sizeof(wasp_payload_t));

    // Créer la tâche FreeRTOS de décodage GPS sur le Cœur 0 (PRO_CPU_NUM)
    xTaskCreatePinnedToCore(gpsTask, "GPSTask", 3072, NULL, 2, NULL, 0);

    // Créer la tâche FreeRTOS de transmission LoRa sur le Cœur 1 (APP_CPU_NUM)
    xTaskCreatePinnedToCore(loraTask, "LoRaTX", 4096, NULL, 1, NULL, 1);

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
    // 1. Déclencheur du timer pour envoyer la télémétrie
    if (send_trigger) {
        send_telemetry();
        send_trigger = false; 
    }

    // 4. Vérifier si le bouton d'alimentation du PMU a été pressé
    if (checkPMUPowerButton()) {
        gracefulShutdown();
    }

    // 5. Vérifier si le bouton utilisateur GPIO 38 est pressé (changement de mode ou extinction)
    if (digitalRead(38) == LOW) {
        uint32_t pressStart = millis();
        delay(50); // anti-rebond simple
        if (digitalRead(38) == LOW) {
            // Attendre le relâchement ou le dépassement du seuil d'appui long (1.5 seconde)
            while (digitalRead(38) == LOW && (millis() - pressStart < 1500)) { 
                delay(10); 
            }
            
            uint32_t pressDuration = millis() - pressStart;
            if (pressDuration >= 1500) {
                // Appui long : Extinction / Veille Standby
                while (digitalRead(38) == LOW) { delay(10); } // Attendre relâchement total
                enterStandbyMode();
            } else {
                // Appui court : Changement de mode (Vol <-> Eco)
                currentMode = (currentMode == 0) ? 1 : 0;
                configureMode(currentMode);
            }
        }
    }

    // 6. Vérifier et traiter les commandes AT sur le port Série et le Bluetooth
    checkSerialCommands();
    
    // Petite pause pour relâcher le CPU
    delay(1);
}

