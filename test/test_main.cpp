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
 * @brief Test des constantes et des valeurs par défaut
 */
void test_default_config_constants(void) {
    TEST_ASSERT_EQUAL_INT(1, DEFAULT_TX_INTERVAL);
    TEST_ASSERT_EQUAL_FLOAT(868.0f, DEFAULT_FREQUENCY);
    TEST_ASSERT_EQUAL_INT(9, DEFAULT_SF);
    TEST_ASSERT_EQUAL_FLOAT(125.0f, DEFAULT_BW);
}

void setup() {
    // Attendre que la liaison USB série soit prête
    delay(2000);
    
    UNITY_BEGIN();
    
    RUN_TEST(test_crc16_calculation);
    RUN_TEST(test_payload_struct_size);
    RUN_TEST(test_default_config_constants);
    
    UNITY_END();
}

void loop() {
    // Rien à faire dans le loop de test
}
