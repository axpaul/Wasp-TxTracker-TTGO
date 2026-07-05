/**
 * @file serial.cpp
 * @brief Gestion de la liaison série USB et Bluetooth pour l'envoi des trames NectarMC.
 * @author Paul Miailhe
 * @date 27/06/2026
 */

#include "header.h"

/**
 * @brief Calcule le CRC16-CCITT d'un tableau d'octets.
 * @param data Pointeur vers le tableau de données.
 * @param len Longueur du tableau de données.
 * @return Valeur du CRC16 calculé.
 * 
 * Utilise le polynôme standard 0x1021 avec une valeur initiale de 0xFFFF.
 */
uint16_t calculate_crc16(const uint8_t *data, size_t len) {
    if (data == nullptr || len == 0) {
        return 0xFFFF;
    }
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < len; ++i) {
        crc ^= (data[i] << 8);
        for (int j = 0; j < 8; ++j) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc <<= 1;
            }
        }
    }
    return crc;
}

/**
 * @brief Construit, valide et émet une trame conforme au protocole NectarMC.
 * @param ssid_type Type de tracker (0: FX, 1: MF, 2: BALLOON, 3: OTHER).
 * @param ssid_num Numéro unique de tracker.
 * @param apid Identifiant d'application (Application Process Identifier).
 * @param payload Pointeur vers les données utiles de la trame.
 * @param len Longueur des données utiles en octets.
 * @param rssi Valeur RSSI associée (0 pour local).
 * @param snr Valeur SNR associée (0 pour local).
 * 
 * Cette fonction assemble :
 * - Le header NectarMC (magic, mission id, longueur payload).
 * - La charge utile (payload).
 * - Les métriques LoRa et le timestamp.
 * - Le CRC16-CCITT.
 * Émet le tout sur USB (Serial) et Bluetooth (SerialBT) si configuré et connecté.
 */
void sendNectarFrame(uint16_t id_mission, const uint8_t *payload, size_t len) {
    // 1. Limiter la longueur brute à 250 octets
    if (len > 250) {
        len = 250;
    }

    // 2. Préparer le Header NectarMC Côté Bord (5 octets)
    uint8_t header[5];
    header[0] = NECTAR_MAGIC;                     // 0xEB (Magic)
    header[1] = id_mission & 0xFF;                // LE low
    header[2] = (id_mission >> 8) & 0xFF;         // LE high
    header[3] = 0x00;                             // gs_flag = 0 (Émission directe par le tracker)
    header[4] = (uint8_t)(len & 0xFF);            // payload_size

    // 3. Assembler le header et la payload
    uint8_t frame[260];
    memcpy(frame, header, 5);
    if (len > 0 && payload != nullptr) {
        memcpy(frame + 5, payload, len);
    }

    // 4. Calculer le CRC16 sur l'ensemble [Header + Payload]
    uint16_t crc = calculate_crc16(frame, 5 + len);

    // 5. Écrire le CRC16 en Little-Endian (2 octets)
    frame[5 + len] = crc & 0xFF;
    frame[5 + len + 1] = (crc >> 8) & 0xFF;

    // 6. Émettre la trame complète (Série USB) si activé dans la config
    if (activeConfig.enableUsbBinary) {
        Serial.write(frame, 5 + len + 2);
    }

#if ENABLE_BLUETOOTH
    // 7. Émettre également en Bluetooth si connecté
    if (SerialBT.connected()) {
        SerialBT.write(frame, 5 + len + 2);
    }
#endif
}

/**
 * @brief Traite et émet les données de télémétrie sur les ports de communication série (USB/Bluetooth).
 * @param packet Structure de télémétrie Wasp-TX à émettre.
 */
void outputTelemetryFrame(const wasp_payload_t& packet) {
    // Émettre la trame formatée Nectar (USB et/ou Bluetooth)
    // On passe le reste des données à partir de l'octet 3 (utc) pour éviter la duplication des en-têtes
    sendNectarFrame(packet.id_mission, (const uint8_t*)&packet + 3, sizeof(wasp_payload_t) - 3);
}

/**
 * @brief Assemble et envoie une trame de telemetrie (GPS + Systeme).
 */
void send_telemetry() {
    wasp_payload_t packet;
    
    // Remplissage de l'en-tete de routage standard Nectar
    packet.magic = NECTAR_MAGIC;
    uint16_t ssid = ((activeConfig.trackerType & 0x03) << 8) | activeConfig.trackerId;
    packet.id_mission = (ssid << 6) | (activeConfig.apid & 0x3F);
    packet.utc = (uint32_t)rtc.getEpoch();
    
    // Remplissage des coordonnees GPS (conversion float en tableau d'octets)
    union FloatConverter { float f; uint8_t b[4]; };
    FloatConverter conv;
    
    double lat = 0.0;
    double lon = 0.0;
    double alt = 0.0;
    double spd = 0.0;
    double cog = 0.0;
    uint32_t sats = 0;
    bool fix = false;
    
    if (xSemaphoreTake(gpsMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
        lat = sharedGPSData.latitude;
        lon = sharedGPSData.longitude;
        alt = sharedGPSData.altitude;
        spd = sharedGPSData.speed;
        cog = sharedGPSData.course;
        sats = sharedGPSData.satellites;
        fix = sharedGPSData.fix;
        xSemaphoreGive(gpsMutex);
    }
    
    conv.f = (float)lat;    memcpy(packet.lat, conv.b, 4);
    conv.f = (float)lon;    memcpy(packet.lon, conv.b, 4);
    conv.f = (float)alt;    memcpy(packet.alt, conv.b, 4);
    conv.f = (float)spd;    memcpy(packet.spd, conv.b, 4);
    conv.f = (float)cog;    memcpy(packet.cog, conv.b, 4);

    // Mesures du PMU (tension batterie et temperature interne)
    packet.vbat = getPMUBatteryVoltage();
    
    float internalTemp = getPMUTemperature();
    packet.temp = (int16_t)(internalTemp * 100.0f); // Conversion en 1/100 °C
    
    // Construction du bitmask d'etat
    packet.status = (uint8_t)(sats & 0x1F); // Bits 0-4: Sats
    if (fix) {
        packet.status |= (1 << 7); // Bit 7: GPS Fix valide
    }
    if (currentMode == 1) {
        packet.status |= (1 << 5); // Bit 5: Mode Eco actif
    }
    
    // Traiter et emettre les donnees de telemetrie sur les ports serie (USB/Bluetooth)
    outputTelemetryFrame(packet);

    // Envoi de la telemetrie dans la file de transmission radio LoRa
    if (gpsQueue != NULL) {
        xQueueSend(gpsQueue, &packet, 0);
    }
}