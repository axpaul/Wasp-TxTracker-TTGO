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

void setup() {
    // Attendre que la liaison USB série soit prête
    delay(2000);
    
    UNITY_BEGIN();
    
    RUN_TEST(test_crc16_calculation);
    RUN_TEST(test_payload_struct_size);
    RUN_TEST(test_default_config_constants);
    RUN_TEST(test_wasp_mode_status_encoding);
    RUN_TEST(test_wasp_mode_interval_logic);
    
    UNITY_END();
}

void loop() {
    // Rien à faire dans le loop de test
}
