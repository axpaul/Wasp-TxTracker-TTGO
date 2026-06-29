/**
 * @file radio.cpp
 * @brief Gestion de la radio SX1276 et stockage NVS de la configuration.
 * @author Paul Miailhe
 * @date 27/06/2026
 */

#include "header.h"
#include <Preferences.h>

// Définition de l'objet Radio et de la configuration active
SX1276 radio = new Module(LORA_CS_PIN, LORA_DIO0_PIN, LORA_RST_PIN);
LoRaConfig activeConfig;
SemaphoreHandle_t loraTxSemaphore = NULL;

static Preferences prefs;

/**
 * @brief Routine d'interruption (ISR) appelée lors de la fin d'une transmission LoRa (front montant sur DIO0).
 */
void IRAM_ATTR loraTxISR() {
    BaseType_t xHigherPriorityTaskWoken = pdFALSE;
    xSemaphoreGiveFromISR(loraTxSemaphore, &xHigherPriorityTaskWoken);
    if (xHigherPriorityTaskWoken) {
        portYIELD_FROM_ISR();
    }
}

/**
 * @brief Charge la configuration radio depuis la mémoire NVS de l'ESP32.
 *        Si aucune configuration n'est trouvée, applique les valeurs par défaut.
 */
void loadLoRaConfig() {
    prefs.begin("wasptx", false);
    
    activeConfig.frequency = prefs.getFloat("freq", DEFAULT_FREQUENCY);
    activeConfig.bandwidth = prefs.getFloat("bw", DEFAULT_BW);
    activeConfig.spreadingFactor = prefs.getUChar("sf", DEFAULT_SF);
    activeConfig.power = prefs.getUChar("pwr", DEFAULT_POWER);
    activeConfig.crcEnable = prefs.getUChar("crc_en", 1);
    activeConfig.crcMode = prefs.getUChar("crc_md", 0);
    activeConfig.trackerId = prefs.getUChar("tr_id", 1);
    activeConfig.trackerType = prefs.getUChar("tr_typ", 2); // 2 = BALLOON par défaut
    activeConfig.apid = prefs.getUChar("apid", 1);
    activeConfig.txInterval = prefs.getUShort("interval", DEFAULT_TX_INTERVAL);
    activeConfig.enableUsbBinary = prefs.getUChar("bin_usb", 1); // 1 par défaut (activé)
    activeConfig.enableDebugLogs = prefs.getUChar("dbg_log", 0); // 0 par défaut (désactivé)
    
    prefs.end();
    
    Serial.println("[NVS] Configuration loaded successfully.");
}

/**
 * @brief Enregistre la configuration active dans la mémoire NVS de l'ESP32.
 */
void saveLoRaConfig() {
    prefs.begin("wasptx", false);
    
    prefs.putFloat("freq", activeConfig.frequency);
    prefs.putFloat("bw", activeConfig.bandwidth);
    prefs.putUChar("sf", activeConfig.spreadingFactor);
    prefs.putUChar("pwr", activeConfig.power);
    prefs.putUChar("crc_en", activeConfig.crcEnable);
    prefs.putUChar("crc_md", activeConfig.crcMode);
    prefs.putUChar("tr_id", activeConfig.trackerId);
    prefs.putUChar("tr_typ", activeConfig.trackerType);
    prefs.putUChar("apid", activeConfig.apid);
    prefs.putUShort("interval", activeConfig.txInterval);
    prefs.putUChar("bin_usb", activeConfig.enableUsbBinary);
    prefs.putUChar("dbg_log", activeConfig.enableDebugLogs);
    
    prefs.end();
    
    Serial.println("[NVS] Configuration saved successfully.");
}

/**
 * @brief Réinitialise la configuration de la NVS aux valeurs par défaut d'usine.
 */
void resetLoRaConfig() {
    Serial.println("[NVS] Resetting configuration to factory defaults...");
    prefs.begin("wasptx", false);
    prefs.clear();
    prefs.end();
    
    // Recharger avec les valeurs par défaut
    loadLoRaConfig();
}

/**
 * @brief Initialise et configure le module SX1276 à l'aide de la configuration active.
 */
void initRadio() {
    Serial.println("[RADIO] Initializing SX1276...");
    
    // Mutex de protection de la radio
    if (radioMutex == NULL) {
        radioMutex = xSemaphoreCreateMutex();
    }
    
    int state = RADIOLIB_ERR_UNKNOWN;
    
    if (xSemaphoreTake(radioMutex, portMAX_DELAY) == pdTRUE) {
        state = radio.begin(activeConfig.frequency);
        if (state == RADIOLIB_ERR_NONE) {
            radio.setOutputPower(activeConfig.power);
            radio.setBandwidth(activeConfig.bandwidth);
            radio.setSpreadingFactor(activeConfig.spreadingFactor);
            radio.setSyncWord(DEFAULT_SYNC_WORD);
            radio.setCurrentLimit(120); // 120 mA limit
            
            // Initialiser le sémaphore binaire pour les interruptions TX
            loraTxSemaphore = xSemaphoreCreateBinary();
            
            // Attacher l'action d'interruption sur la broche DIO0
            radio.setDio0Action(loraTxISR, RISING);

            // Activer ou désactiver le CRC en fonction de la configuration
            if (activeConfig.crcEnable) {
                radio.setCRC(true);
            } else {
                radio.setCRC(false);
            }
            
            Serial.printf("[RADIO] SX1276 Initialized! Freq: %.3f MHz, SF: %d, BW: %.1f kHz, Power: %d dBm, CRC: %s (%s)\n",
                          activeConfig.frequency, 
                          activeConfig.spreadingFactor, 
                          activeConfig.bandwidth, 
                          activeConfig.power,
                          activeConfig.crcEnable ? "ON" : "OFF",
                          activeConfig.crcMode ? "IBM" : "CCITT");
        } else {
            Serial.printf("[RADIO] Initialization FAILED, error code: %d\n", state);
        }
        xSemaphoreGive(radioMutex);
    }
}

/**
 * @brief Tache FreeRTOS pour l'envoi asynchrone des trames LoRa.
 */
void loraTask(void *pvParameters) {
    wasp_payload_t data;
    while (true) {
        if (xQueueReceive(gpsQueue, &data, portMAX_DELAY) == pdPASS) {
            int state = RADIOLIB_ERR_UNKNOWN;
            
            // Recupere le mode a partir du bit 5 du statut de la payload
            uint8_t mode = (data.status >> 5) & 0x01;
            
            // Clignotement de la LED rouge (GPIO 4, actif bas) sur transmission
            pinMode(4, OUTPUT);
            if (mode == 0) {
                // Mode Vol : 1 flash court
                digitalWrite(4, LOW);
                delay(70);
                digitalWrite(4, HIGH);
            } else {
                // Mode Eco : 2 flashes courts
                digitalWrite(4, LOW);
                delay(70);
                digitalWrite(4, HIGH);
                delay(70);
                digitalWrite(4, LOW);
                delay(70);
                digitalWrite(4, HIGH);
            }

            // Lancer la transmission non-bloquante (asynchrone)
            if (xSemaphoreTake(radioMutex, portMAX_DELAY) == pdTRUE) {
                state = radio.startTransmit((uint8_t*)&data, sizeof(wasp_payload_t));
                xSemaphoreGive(radioMutex);
            }
            
            if (state == RADIOLIB_ERR_NONE) {
                // Attendre la fin de la transmission via le sémaphore d'interruption
                // Timeout de sécurité réglé à 2 secondes (2000 ms)
                if (xSemaphoreTake(loraTxSemaphore, pdMS_TO_TICKS(2000)) == pdTRUE) {
                    if (xSemaphoreTake(radioMutex, portMAX_DELAY) == pdTRUE) {
                        state = radio.finishTransmit();
                        xSemaphoreGive(radioMutex);
                    }
                } else {
                    Serial.println("[RADIO] Non-blocking TX Timeout! Forcing Standby.");
                    state = RADIOLIB_ERR_TX_TIMEOUT;
                    // Forcer la radio à sortir du mode émission si bloquée
                    if (xSemaphoreTake(radioMutex, portMAX_DELAY) == pdTRUE) {
                        radio.standby();
                        xSemaphoreGive(radioMutex);
                    }
                }
            }
            
            if (state != RADIOLIB_ERR_NONE) {
                Serial.printf("[RADIO] Transmission FAILED, code: %d\n", state);
            }
        }
    }
}

/**
 * @brief Configure la puissance radio et l'alarme du timer selon le mode de fonctionnement.
 */
void configureMode(uint8_t mode) {
    pinMode(4, OUTPUT);
    if (mode == 0) {
        // Mode Vol (Normal)
        Serial.println("[SYSTEM] Mode VOL selectionne (Performance)");
        
        // Rétablir l'intervalle et la puissance de la configuration d'origine
        updateTimerInterval(activeConfig.txInterval);
        
        if (xSemaphoreTake(radioMutex, portMAX_DELAY) == pdTRUE) {
            radio.setOutputPower(activeConfig.power);
            xSemaphoreGive(radioMutex);
        }
        
        // Confirmation visuelle : 1 long flash de LED
        digitalWrite(4, LOW);
        delay(400);
        digitalWrite(4, HIGH);
    } else {
        // Mode Eco (Lent)
        Serial.println("[SYSTEM] Mode ECO selectionne (Economie d'energie)");
        
        // Emission lente : 15 secondes au minimum
        uint16_t ecoInterval = activeConfig.txInterval;
        if (ecoInterval < 15) {
            ecoInterval = 15;
        }
        updateTimerInterval(ecoInterval);
        
        // Puissance LoRa reduite : 10 dBm
        if (xSemaphoreTake(radioMutex, portMAX_DELAY) == pdTRUE) {
            radio.setOutputPower(10);
            xSemaphoreGive(radioMutex);
        }
        
        // Confirmation visuelle : 2 longs flashes de LED
        digitalWrite(4, LOW);
        delay(350);
        digitalWrite(4, HIGH);
        delay(200);
        digitalWrite(4, LOW);
        delay(350);
        digitalWrite(4, HIGH);
    }
}
