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

static Preferences prefs;

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
    activeConfig.enableUsbBinary = prefs.getUChar("bin_usb", 0); // 0 par défaut (désactivé)
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
            radio.setCRC(activeConfig.crcEnable, activeConfig.crcMode);
            radio.setCurrentLimit(120); // 120 mA limit
            
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
