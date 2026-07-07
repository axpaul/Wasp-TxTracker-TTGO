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
    // La payload série fait 29 octets et commence à packet.utc (offset 4)
    sendNectarFrame(packet.id_mission, (const uint8_t*)&packet + 4, sizeof(wasp_payload_t) - 4);
}
