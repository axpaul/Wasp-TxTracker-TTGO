/**
 * @file test_main.cpp
 * @brief Tests unitaires avec le framework Unity de PlatformIO pour Wasp-TX.
 * @author Paul Miailhe
 * @date 27/06/2026
 */

#include <Arduino.h>
#include <unity.h>
#include "header.h"

// Variables requises pour la compilation (déclarées extern dans header.h)
// On fournit des instances fictives pour le test unitaire hors exécution globale
#include <Wire.h>
#include <ESP32Time.h>
#include <BluetoothSerial.h>

// Définitions de variables pour éviter les erreurs d'édition de liens (link)
ESP32Time rtc;
BluetoothSerial SerialBT;
QueueHandle_t gpsQueue = NULL;
SemaphoreHandle_t radioMutex = NULL;
SemaphoreHandle_t gpsMutex = NULL;
SemaphoreHandle_t loraTxSemaphore = NULL;
WaspGPSData sharedGPSData = {0};
TinyGPSPlus gps;
volatile uint8_t currentMode = 0;
volatile bool send_trigger = false;
hw_timer_t *timer = NULL;

void setUp(void) {
    // Code d'initialisation exécuté avant chaque test
}

void tearDown(void) {
    // Code de nettoyage exécuté après chaque test
}

/**
 * @brief Test du calcul de CRC16-CCITT
 */
void test_crc16_calculation(void) {
    // Cas de test nominal
    uint8_t test_data[] = {0x01, 0x02, 0x03, 0x04};
    uint16_t crc = calculate_crc16(test_data, sizeof(test_data));
    TEST_ASSERT_EQUAL_UINT16(0x89C3, crc);

    // Cas limites
    TEST_ASSERT_EQUAL_UINT16(0xFFFF, calculate_crc16(nullptr, 10));
    TEST_ASSERT_EQUAL_UINT16(0xFFFF, calculate_crc16(test_data, 0));
}

/**
 * @brief Test de la taille de la structure de charge utile Wasp-TX
 */
void test_payload_struct_size(void) {
    // La structure wasp_payload_t doit faire précisément 32 octets pour la radio.
    // L'alignement est forcé par #pragma pack(push, 1).
    TEST_ASSERT_EQUAL_INT(32, sizeof(wasp_payload_t));
}

/**
 * @brief Test des constantes et des valeurs par défaut actuelles
 */
void test_default_config_constants(void) {
    TEST_ASSERT_EQUAL_INT(1, DEFAULT_TX_INTERVAL);
#ifdef FREQ_433
    TEST_ASSERT_EQUAL_FLOAT(433.0f, DEFAULT_FREQUENCY);
#else
    TEST_ASSERT_EQUAL_FLOAT(869.525f, DEFAULT_FREQUENCY);
#endif
    TEST_ASSERT_EQUAL_INT(8, DEFAULT_SF);
    TEST_ASSERT_EQUAL_FLOAT(250.0f, DEFAULT_BW);
}

/**
 * @brief Test de l'encodage du bit de mode dans l'octet de statut
 */
void test_wasp_mode_status_encoding(void) {
    uint8_t sats = 7;
    bool gpsFix = true;
    
    // Cas 1 : Mode Vol (0) et Fix Valide
    currentMode = 0;
    uint8_t statusVol = (uint8_t)(sats & 0x1F);
    if (gpsFix) statusVol |= (1 << 7);
    if (currentMode == 1) statusVol |= (1 << 5);
    
    TEST_ASSERT_EQUAL_UINT8(0x87, statusVol); // Bit 7 = 1, Bit 5 = 0, Sats = 7

    // Cas 2 : Mode Eco (1) et Fix Valide
    currentMode = 1;
    uint8_t statusEco = (uint8_t)(sats & 0x1F);
    if (gpsFix) statusEco |= (1 << 7);
    if (currentMode == 1) statusEco |= (1 << 5);
    
    TEST_ASSERT_EQUAL_UINT8(0xA7, statusEco); // Bit 7 = 1, Bit 5 = 1, Sats = 7
}

/**
 * @brief Test de la logique de calcul de l'intervalle d'émission
 */
void test_wasp_mode_interval_logic(void) {
    // Mode Vol : L'intervalle est égal à la valeur de configuration d'origine
    activeConfig.txInterval = 5;
    uint16_t volInterval = activeConfig.txInterval;
    TEST_ASSERT_EQUAL_UINT16(5, volInterval);

    // Mode Eco : L'intervalle est étiré à 15 secondes au minimum
    uint16_t ecoInterval = activeConfig.txInterval;
    if (ecoInterval < 15) {
        ecoInterval = 15;
    }
    TEST_ASSERT_EQUAL_UINT16(15, ecoInterval);

    // Mode Eco avec configuration d'origine déjà supérieure à 15
    activeConfig.txInterval = 30;
    ecoInterval = activeConfig.txInterval;
    if (ecoInterval < 15) {
        ecoInterval = 15;
    }
    TEST_ASSERT_EQUAL_UINT16(30, ecoInterval);
}

/**
 * @brief Test de l'encodage du champ Id_mission NectarMC (SSID + APID)
 */
void test_nectarmc_id_mission_encoding(void) {
    uint8_t ssid_type = 2; // BALLOON
    uint8_t ssid_num = 1;  // Tracker ID = 1
    uint8_t apid = 1;      // APID = 1

    uint16_t ssid = ((ssid_type & 0x03) << 8) | ssid_num;
    uint16_t id_mission = (ssid << 6) | (apid & 0x3F);

    // ssid = (2 << 8) | 1 = 513
    // id_mission = (513 << 6) | 1 = 32833 = 0x8041
    TEST_ASSERT_EQUAL_UINT16(0x8041, id_mission);
}

/**
 * @brief Test du format de trame série NectarMC côté bord
 */
void test_nectarmc_serial_frame_validation(void) {
    uint16_t id_mission = 0x8041;
    uint8_t payload[29] = {0};
    payload[0] = 0xAA; // Fausse donnée pour test
    
    // Simuler la construction de la trame série côté bord (5 Header + 29 Payload + 2 CRC = 36 octets)
    uint8_t frame[36];
    frame[0] = 0xEB; // MAGIC
    frame[1] = id_mission & 0xFF;
    frame[2] = (id_mission >> 8) & 0xFF;
    frame[3] = 0x00; // gs_flag
    frame[4] = 29;   // payload_size
    memcpy(frame + 5, payload, 29);
    
    uint16_t crc = calculate_crc16(frame, 34);
    frame[34] = crc & 0xFF;
    frame[35] = (crc >> 8) & 0xFF;
    
    // Validation des champs clés de la trame
    TEST_ASSERT_EQUAL_UINT8(0xEB, frame[0]);
    TEST_ASSERT_EQUAL_UINT8(0x41, frame[1]);
    TEST_ASSERT_EQUAL_UINT8(0x80, frame[2]);
    TEST_ASSERT_EQUAL_UINT8(0x00, frame[3]);
    TEST_ASSERT_EQUAL_UINT8(29, frame[4]);
    TEST_ASSERT_EQUAL_UINT8(0xAA, frame[5]); // Premier octet de la payload
    
    // Recalculer le CRC pour tester la validité du footer
    uint16_t decoded_crc = frame[34] | (frame[35] << 8);
    TEST_ASSERT_EQUAL_UINT16(crc, decoded_crc);
}

void setup() {
    // Attendre que la liaison USB série soit prête
    delay(2000);
    
    UNITY_BEGIN();
    
    RUN_TEST(test_crc16_calculation);
    RUN_TEST(test_payload_struct_size);
    RUN_TEST(test_default_config_constants);
    RUN_TEST(test_wasp_mode_status_encoding);
    RUN_TEST(test_wasp_mode_interval_logic);
    RUN_TEST(test_nectarmc_id_mission_encoding);
    RUN_TEST(test_nectarmc_serial_frame_validation);
    
    UNITY_END();
}

void loop() {
    // Rien à faire dans le loop de test
}
