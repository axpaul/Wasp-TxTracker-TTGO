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
void sendNectarFrame(uint8_t ssid_type, uint8_t ssid_num, uint8_t apid, const uint8_t *payload, size_t len, int8_t rssi, int8_t snr) {
    // 1. Limiter la longueur brute de LoRa à 250 octets max pour laisser de la place aux métriques et au timestamp
    if (len > 250) {
        len = 250;
    }

    // 2. Calculer le SSID (10 bits) et l'Id_mission (16 bits)
    uint16_t ssid = ((ssid_type & 0x03) << 8) | ssid_num;
    uint16_t id_mission = (ssid << 6) | (apid & 0x3F);

    // 3. Préparer le Header NectarMC (4 octets)
    uint8_t header[4];
    header[0] = NECTAR_MAGIC;
    header[1] = id_mission & 0xFF;              // Encodage en Little-Endian (partie basse)
    header[2] = (id_mission >> 8) & 0xFF;       // Encodage en Little-Endian (partie haute)
    header[3] = (uint8_t)(len & 0xFF);          // Taille de la payload série brute (données utiles LoRa)

    // 4. Assembler le header, le payload LoRa, les métriques RSSI/SNR et le Timestamp dans la trame
    uint8_t frame[275];
    memcpy(frame, header, 4);
    if (len > 0 && payload != nullptr) {
        memcpy(frame + 4, payload, len);
    }
    frame[4 + len] = (uint8_t)rssi;
    frame[4 + len + 1] = (uint8_t)snr;

    // Ajout du Timestamp Unix Epoch (4 octets - Little-Endian)
    uint32_t epoch = rtc.getEpoch();
    frame[4 + len + 2] = epoch & 0xFF;
    frame[4 + len + 3] = (epoch >> 8) & 0xFF;
    frame[4 + len + 4] = (epoch >> 16) & 0xFF;
    frame[4 + len + 5] = (epoch >> 24) & 0xFF;

    // 5. Calculer le CRC16 sur l'ensemble [Header + Payload LoRa + RSSI + SNR + Timestamp]
    uint16_t crc = calculate_crc16(frame, 4 + len + 2 + 4);

    // 6. Écrire le CRC16 et le saut de ligne directement dans le buffer
    frame[4 + len + 6] = crc & 0xFF;              // CRC16 Little-Endian (partie basse)
    frame[4 + len + 7] = (crc >> 8) & 0xFF;       // CRC16 Little-Endian (partie haute)
    frame[4 + len + 8] = '\n';                    // Saut de ligne

    // 7. Émettre la trame complète en un seul appel (Série USB) si activé dans la config
    if (activeConfig.enableUsbBinary) {
        Serial.write(frame, 4 + len + 9);
    }

#if ENABLE_BLUETOOTH
    // 8. Émettre également en Bluetooth si un client est connecté.
    if (SerialBT.connected()) {
        SerialBT.write(frame, 4 + len + 9);
    }
#endif
}

/**
 * @brief Traite et émet les données de télémétrie sur les ports de communication série (USB/Bluetooth).
 * @param packet Structure de télémétrie Wasp-TX à émettre.
 */
void outputTelemetryFrame(const wasp_payload_t& packet) {
    // Émettre la trame formatée Nectar (USB et/ou Bluetooth selon configuration)
    // On passe le reste des données à partir de l'octet 3 (utc) pour éviter la duplication des en-têtes
    sendNectarFrame(packet.type, packet.id, packet.apid, (const uint8_t*)&packet + 3, sizeof(wasp_payload_t) - 3, 0, 0);

    if (activeConfig.enableDebugLogs) {
        // Remplissage des coordonnées GPS (conversion float en tableau d'octets)
        union FloatConverter { float f; uint8_t b[4]; };
        FloatConverter conv;
        float lat, lon, alt, spd, cog;
        
        memcpy(conv.b, packet.lat, 4); lat = conv.f;
        memcpy(conv.b, packet.lon, 4); lon = conv.f;
        memcpy(conv.b, packet.alt, 4); alt = conv.f;
        memcpy(conv.b, packet.spd, 4); spd = conv.f;
        memcpy(conv.b, packet.cog, 4); cog = conv.f;

        uint8_t sats = packet.status & 0x1F;
        uint8_t gps_fix = (packet.status >> 7) & 0x01;

        Serial.printf("[TX] UTC:%lu | POS:%.5f, %.5f | ALT:%.1fm | SPD:%.1fkm/h | COG:%.1f° | T:%.2f°C | SAT:%d | BAT:%dmV | STATUS:0x%02X\n", 
                      packet.utc, 
                      lat, 
                      lon, 
                      alt, 
                      spd, 
                      cog,
                      (float)packet.temp / 100.0f, 
                      sats, 
                      packet.vbat,
                      gps_fix);

        Serial.print("[HEX] ");
        const uint8_t* p = (const uint8_t*)&packet;
        for (size_t i = 0; i < sizeof(wasp_payload_t); i++) {
            Serial.printf("%02X ", p[i]);
        }
        Serial.println();
    }
}