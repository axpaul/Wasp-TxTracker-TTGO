/**
 * @file pmu.cpp
 * @brief Gestion de l'unité de gestion d'énergie (PMU AXP192 / AXP2101).
 * @author Paul Miailhe
 * @date 27/06/2026
 * @version 1.2.0
 */

#include "header.h"

// --- Instanciation conditionnelle de l'objet PMU ---
#if defined(WASP_BOARD_V1_2)
XPowersAXP2101 PMU;
#else
XPowersAXP192 PMU;
#endif

/**
 * @brief Initialise le bus I2C et configure les tensions/canaux d'alimentation du PMU.
 * @return true si le PMU s'initialise correctement, false sinon.
 */
bool initPMU() {
    Wire.begin(PMU_I2C_SDA_PIN, PMU_I2C_SCL_PIN);
    Wire.setClock(PMU_I2C_FREQ_HZ);
    
#if defined(WASP_BOARD_V1_2)
    // Initialisation AXP2101 pour LILYGO T-Beam V1.2
    if (PMU.begin(Wire, AXP2101_SLAVE_ADDRESS, PMU_I2C_SDA_PIN, PMU_I2C_SCL_PIN)) {
        XPowersLibInterface *pPMU = &PMU;
        // ALDO3 alimente le GPS (3.3V requis)
        pPMU->setPowerChannelVoltage(XPOWERS_ALDO3, 3300);
        pPMU->enablePowerOutput(XPOWERS_ALDO3);
        
        // ALDO2 alimente le module LoRa SX1276 (3.3V requis)
        pPMU->setPowerChannelVoltage(XPOWERS_ALDO2, 3300);
        pPMU->enablePowerOutput(XPOWERS_ALDO2);
        
        // Activer DCDC1 pour l'alimentation de l'ESP32 et de la carte générale
        pPMU->enablePowerOutput(XPOWERS_DCDC1);
        
        // Activer l'ADC général, la mesure de température, la mesure de tension de batterie et la détection de batterie
        pPMU->enableBattVoltageMeasure();
        pPMU->enableBattDetection();
        PMU.enableGeneralAdcChannel();
        PMU.enableTemperatureMeasure();
        
        Serial.println("[PMU] AXP2101 PMU Initialized: Enabled GPS (ALDO3), LoRa (ALDO2), DCDC1, and ADCs.");
        return true;
    }
#else
    // Initialisation AXP192 pour LILYGO T-Beam V1.1
    if (PMU.begin(Wire, AXP192_SLAVE_ADDRESS, PMU_I2C_SDA_PIN, PMU_I2C_SCL_PIN)) {
        // LDO3 alimente le GPS (3.3V requis)
        PMU.enableLDO3();
        PMU.setLDO3Voltage(3300);
        
        // LDO2 alimente le module LoRa SX1276 (3.3V requis)
        PMU.enableLDO2();
        PMU.setLDO2Voltage(3300);
        
        // Activer DC1 pour l'alimentation générale de l'ESP32
        PMU.enableDC1();
        
        // Activer la mesure de tension de la batterie (ADC) et la détection de batterie
        PMU.enableBattVoltageMeasure();
        PMU.enableBattDetection();
        
        Serial.println("[PMU] AXP192 PMU Initialized: Enabled GPS (LDO3), LoRa (LDO2), DC1, and Battery ADC.");
        return true;
    }
#endif
    return false;
}

/**
 * @brief Lit et retourne la tension de la batterie.
 * @return Tension de la batterie en millivolts.
 */
uint16_t getPMUBatteryVoltage() {
    return PMU.getBattVoltage();
}

/**
 * @brief Lit et retourne la température interne de la puce PMU.
 * @return Température en degrés Celsius.
 */
float getPMUTemperature() {
    return PMU.getTemperature();
}

/**
 * @brief Configure les interruptions du bouton d'alimentation (PEKEY) du PMU.
 */
void setupPMUInterrupts() {
    // Activer la détection des clics courts (et clics longs éventuels) sur le bouton d'alimentation
    PMU.enableInterrupt(XPOWERS_PWR_BTN_CLICK_INT | XPOWERS_PWR_BTN_LONGPRESSED_INT);
    PMU.clearIrqStatus();
}

/**
 * @brief Vérifie si une action sur le bouton d'alimentation a eu lieu.
 * @return true si une demande d'extinction a été détectée, false sinon.
 */
bool checkPMUPowerButton() {
    if (PMU.getIrqStatus() != 0) {
        bool clicked = PMU.isPekeyShortPressIrq() || PMU.isPekeyLongPressIrq();
        PMU.clearIrqStatus(); // Toujours acquitter l'interruption
        return clicked;
    }
    return false;
}

/**
 * @brief Éteint proprement les périphériques LoRa/GPS et éteint le tracker via le PMU.
 */
void gracefulShutdown() {
    Serial.println("\n[SYSTEM] Séquence d'extinction propre initiée par bouton...");
    
    // 1. Notification Bluetooth client (si actif et connecté)
#if ENABLE_BLUETOOTH
    if (SerialBT.hasClient()) {
        SerialBT.println("[SYSTEM] Séquence d'extinction propre initiée...");
        delay(100);
    }
#endif

    // 2. Mettre la puce radio en sommeil profond pour économiser de l'énergie
    Serial.println("[RADIO] Commande radio.sleep() envoyée.");
    radio.sleep();

    // 3. Extinction des canaux d'alimentation (GPS + LoRa) via le PMU
    Serial.println("[PMU] Extinction des alimentations GPS et LoRa.");
#if defined(WASP_BOARD_V1_2)
    XPowersLibInterface *pPMU = &PMU;
    pPMU->disablePowerOutput(XPOWERS_ALDO3); // GPS
    pPMU->disablePowerOutput(XPOWERS_ALDO2); // LoRa
#else
    PMU.disableLDO3(); // GPS
    PMU.disableLDO2(); // LoRa
#endif

    // 4. Feedback visuel de confirmation (Clignotement rapide LED utilisateur GPIO 4)
    pinMode(4, OUTPUT);
    for (int i = 0; i < 4; i++) {
        digitalWrite(4, LOW);  // LED allumée (actif bas sur T-Beam)
        delay(70);
        digitalWrite(4, HIGH); // LED éteinte
        delay(70);
    }

    Serial.println("[SYSTEM] PMU shutdown command. Goodbye!");
    Serial.flush();
    delay(50);
    
    // 5. Demande au PMU de couper l'alimentation globale
    PMU.shutdown();

    // Sûreté : Si connecté en USB, PMU.shutdown() ne coupera pas physiquement le circuit
    // car le rail VBUS USB maintient la tension. On bascule l'ESP32 en sommeil profond à la place.
    Serial.println("[SYSTEM] Alimentation USB detectee (shutdown indisponible). Entree en Deep Sleep...");
    Serial.flush();
    
    // Configurer le réveil par pression sur PEKEY ou User Button si nécessaire, ou dormir indéfiniment
    esp_deep_sleep_start();
}

/**
 * @brief Coupe proprement les peripheriques LoRa/GPS et bascule l'ESP32 en Deep Sleep (reveil par bouton utilisateur).
 */
void enterStandbyMode() {
    Serial.println("\n[SYSTEM] Bouton utilisateur presse. Entree en veille Standby (Deep Sleep)...");
    Serial.flush();
    
    // Clignotement lent pour notifier la mise en veille
    pinMode(4, OUTPUT);
    digitalWrite(4, LOW);  // LED allumee (actif bas)
    delay(400);
    digitalWrite(4, HIGH); // LED eteinte
    
    // 1. Mettre la puce radio en sommeil profond
    radio.sleep();

    // 2. Couper le GPS et la radio via le PMU pour maximiser l'economie d'energie
#if defined(WASP_BOARD_V1_2)
    XPowersLibInterface *pPMU = &PMU;
    pPMU->disablePowerOutput(XPOWERS_ALDO3); // GPS
    pPMU->disablePowerOutput(XPOWERS_ALDO2); // LoRa
#else
    PMU.disableLDO3(); // GPS
    PMU.disableLDO2(); // LoRa
#endif

    // 3. Configurer le reveil de l'ESP32 par appui sur le bouton utilisateur (GPIO 38)
    esp_sleep_enable_ext0_wakeup(GPIO_NUM_38, 0); // Reveil sur niveau bas (0 = presse)

    // 4. Passer en sommeil profond
    esp_deep_sleep_start();
}

