/**
 * @file pmu.cpp
 * @brief Gestion de l'unité de gestion d'énergie (PMU AXP192 / AXP2101).
 * @author Paul Miailhe
 * @date 27/06/2026
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
        
        Serial.println("[PMU] AXP2101 PMU Initialized: Enabled GPS (ALDO3), LoRa (ALDO2), and DCDC1.");
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
        
        Serial.println("[PMU] AXP192 PMU Initialized: Enabled GPS (LDO3), LoRa (LDO2), and DC1.");
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
