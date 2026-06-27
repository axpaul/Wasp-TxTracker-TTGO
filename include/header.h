/**
 * @file header.h
 * @brief Fichier d'en-tête global pour le projet Wasp-TX.
 * @author Paul Miailhe
 * @date 27/06/2026
 * 
 * Contient les définitions des broches, la structure de télémétrie compacte,
 * les structures de configuration, et les déclarations de fonctions pour le tracker Wasp-TX.
 */

#ifndef WASP_BOARD_H
#define WASP_BOARD_H

#include <Arduino.h>
#include <TinyGPS++.h>
#include <RadioLib.h>
#include <XPowersLib.h>
#include <ESP32Time.h>
#include <Wire.h>

#define FW_VERSION "1.0.0"

// ============================================================================
// 1. GESTION DE L'ÉNERGIE (PMU - AXP192 / AXP2101)
// ============================================================================
#define PMU_I2C_SDA_PIN         21
#define PMU_I2C_SCL_PIN         22
#define PMU_I2C_FREQ_HZ         100000

#ifndef AXP192_SLAVE_ADDRESS
#define AXP192_SLAVE_ADDRESS    0x34
#endif

#ifndef AXP2101_SLAVE_ADDRESS
#define AXP2101_SLAVE_ADDRESS   0x34
#endif

// ============================================================================
// 2. ACQUISITION SATELLITE (GPS - NEO-M8N/6M)
// ============================================================================
#define GPS_TX_PIN              12 // ESP32 TX connected to GPS RX
#define GPS_RX_PIN              34 // ESP32 RX connected to GPS TX
#define GPS_BAUDRATE            9600

// ============================================================================
// 3. COMMUNICATION RADIO (LoRa - SX1276)
// ============================================================================
#define LORA_CS_PIN             18
#define LORA_RST_PIN            14
#define LORA_DIO0_PIN           26

// ============================================================================
// 4. CONFIGURATIONS PAR DÉFAUT (Standard EU868)
// ============================================================================
#define DEFAULT_FREQUENCY       869.525f
#define DEFAULT_SF              8
#define DEFAULT_BW              250.0f
#define DEFAULT_CR              5       // Coding Rate 4/5
#define DEFAULT_SYNC_WORD       0x12
#define DEFAULT_POWER           14      // Puissance en dBm (14 dBm par défaut)
#define DEFAULT_TX_INTERVAL     1       // Intervalle de transmission (secondes)

#define FREQ_MIN                863.0f
#define FREQ_MAX                870.0f

#define NECTAR_MAGIC            0xEB

// Activer Bluetooth classique (SPP) pour les commandes AT sans fil
// Note : Consomme environ 1MB de Flash et 150KB de RAM. Désactivé par défaut.
#define ENABLE_BLUETOOTH        1

#if ENABLE_BLUETOOTH
#include "BluetoothSerial.h"
extern BluetoothSerial SerialBT;
#endif

// ============================================================================
// 5. STRUCTURES DE DONNÉES
// ============================================================================

// Configuration LoRa stockée en mémoire non-volatile (NVS)
struct LoRaConfig {
    float frequency;
    float bandwidth;
    uint8_t spreadingFactor;
    uint8_t power;
    uint8_t crcEnable;
    uint8_t crcMode;      // 0 = CCITT, 1 = IBM
    uint8_t trackerId;    // Identifiant unique du tracker (ssid_num)
    uint8_t trackerType;  // Type de tracker (ssid_type : 0=FX, 1=MF, 2=BALLOON, 3=OTHER)
    uint8_t apid;         // Application ID
    uint16_t txInterval;  // Intervalle d'envoi en secondes
};

#pragma pack(push, 1) // Force l'alignement sur 1 octet pour la transmission radio
struct wasp_payload_t {
    uint8_t id;         // SSID Num (Tracker ID)
    uint8_t apid;       // APID (Application Process Identifier)
    uint8_t type;       // SSID Type (Tracker Type)
    uint32_t utc;       // Unix Epoch time
    uint8_t lat[4];     // Latitude (float)
    uint8_t lon[4];     // Longitude (float)
    uint8_t alt[4];     // Altitude (float)
    uint8_t spd[4];     // Vitesse (float)
    uint8_t cog[4];     // Course (float)
    uint16_t vbat;      // Tension batterie (mV)
    int16_t temp;       // Température (en 1/100°C)
    uint8_t status;     // Bitmask (Bit 0: GPS Fix valide)
    uint8_t sats;       // Nombre de satellites
};                      // TOTAL = 32 octets
#pragma pack(pop)

// ============================================================================
// 6. DECLARATIONS DES VARIABLES GLOBALES (EXTERN)
// ============================================================================
extern TinyGPSPlus gps;
#if defined(WASP_BOARD_V1_2)
extern XPowersAXP2101 PMU;
#else
extern XPowersAXP192 PMU;
#endif
extern SX1276 radio;
extern ESP32Time rtc;
extern QueueHandle_t gpsQueue;
extern SemaphoreHandle_t radioMutex;
extern LoRaConfig activeConfig;
extern volatile bool send_trigger;

// ============================================================================
// 7. DECLARATIONS DE FONCTIONS
// ============================================================================
void loadLoRaConfig();
void saveLoRaConfig();
void resetLoRaConfig();
void initRadio();
void send_telemetry();
void checkSerialCommands();
void handleConfigCommand(const char* cmd, Stream& responseStream);

// Gestion de l'énergie (PMU)
bool initPMU();
uint16_t getPMUBatteryVoltage();
float getPMUTemperature();

// Fonctions utilitaires
uint16_t calculate_crc16(const uint8_t *data, size_t len);
void sendNectarFrame(uint8_t ssid_type, uint8_t ssid_num, uint8_t apid, const uint8_t *payload, size_t len, int8_t rssi, int8_t snr);

#endif // WASP_BOARD_H