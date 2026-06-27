# Guide Complet des Formats de Trames — Wasp-TX & NectarMC

Ce document décrit en détail la structure binaire des paquets LoRa (Air) et des trames série (PC) utilisés par le système **Wasp-TX**.

---

## 📡 1. Format des Trames Radio LoRa (Air)

Les trames émises par le tracker Wasp-TX sur les ondes LoRa respectent la structure suivante :

```
┌───────────────────────────────────────────────────────────┬───────────────────┐
│                          HEADER                           │      PAYLOAD      │
├───────────────────────────────────────────────────────────┼───────────────────┤
│       SSID_NUM       │     APID      │     SSID_TYPE      │      N data       │
│        1 Byte        │    1 Byte     │       1 Byte       │       bytes       │
│       (0-255)        │    (0-63)     │       (0-3)        │     (N bytes)     │
└──────────────────────┴───────────────┴────────────────────┴───────────────────┘
```

* **SSID_NUM** : Identifiant unique du tracker (de 0 à 255).
* **APID** : Application Process Identifier (type de paquet, de 0 à 63).
* **SSID_TYPE** : Type de mission (`0` = FX, `1` = MF, `2` = BALLOON, `3` = OTHER).
* **Payload** : Données utiles brutes de $N$ octets. Pour Wasp-TX, $N = 29$ octets (les 3 premiers octets de l'en-tête radio correspondant aux champs `id`, `apid`, `type` de la structure `wasp_payload_t` ne sont pas transmis de manière redondante).

---

## 💻 2. Format de la Trame Série NectarMC (Série USB & Bluetooth)

Lorsque Wasp-TX transmet ses données au PC (en activant `AT+BINUSB=1`), ou lorsque la station sol réceptrice Nectar-RX relaie un paquet validé, les données sont encapsulées dans une trame binaire NectarMC.

* **Taille totale** : $13 + N$ octets (avec $N = 29$ octets de payload pure transmise, ou $N=32$ octets si le tracker transmet sa structure entière avec son en-tête local).
  Pour Wasp-TX, la trame binaire transmise directement par la carte fait exactement **45 octets** ($13 + 32$ octets).

```
┌───────────────────────────────────────────┬───────────────────┬───────────────────────────────────────┬───────────────┐
│                 HEADER                    │      PAYLOAD      │               METADATA                │     CONTROL   │
├───────────────────────────────────────────┼───────────────────┼───────────────────────────────────────┼───────────────┤
│   MAGIC     │  Id_mission  │ payload_size │      N data       │  RSSI   │   SNR   │     Timestamp     │     CRC16     │
│   1 Byte    │   2 Bytes    │   1 Byte     │      bytes        │ 1 Byte  │ 1 Byte  │      4 Bytes      │    2 Bytes    │
│    0xEB     │ (Little-End) │   (N bytes)  │                   │(int8_t) │(int8_t) │ (uint32_t Little-E)│ (Little-End)  │
└─────────────┴──────────────┴──────────────┴───────────────────┴─────────┴─────────┴───────────────────┴───────────────┘
```

### Description détaillée des octets de la trame série

| Position | Type | Nom du Champ | Description |
| :--- | :--- | :--- | :--- |
| **Octet 0** | `uint8_t` | `MAGIC` | Toujours égal à `0xEB` (Marqueur de synchronisation). |
| **Octets 1 à 2** | `uint16_t` | `Id_mission` | Identifiant regroupant `SSID_TYPE` (bits 15-14), `SSID_NUM` (bits 13-6) et `APID` (bits 5-0) en Little-Endian. |
| **Octet 3** | `uint8_t` | `payload_size` | Longueur $N$ de la charge utile (ex: 32 pour Wasp-TX optimisé). |
| **Octets 4 à 3+N** | `uint8_t[]` | `Payload` | Données brutes issues de `wasp_payload_t` ($N$ octets). |
| **Octet 4+N** | `int8_t` | `RSSI` | Force du signal LoRa reçu en dBm. |
| **Octet 5+N** | `int8_t` | `SNR` | Rapport signal/bruit (SNR) LoRa divisé par 4. |
| **Octets 6+N à 9+N** | `uint32_t` | `Timestamp` | Horodatage Epoch Unix de 4 octets en Little-Endian. *(Absent sur les versions v1.3.1 et antérieures, réduisant la trame de 4 octets).* |
| **Octets 10+N à 11+N** | `uint16_t` | `CRC16` | CRC16-CCITT (0x1021, initialisé à 0xFFFF) calculé sur les octets `0` à `9+N` inclus. |
| **Octet 12+N** | `char` | `Newline` | Caractère retour à la ligne `\n` (`0x0A`). |

---

## 📦 3. Structure Optimisée de la charge utile WASP (`wasp_payload_t` — 32 Octets)

La structure `wasp_payload_t` a été optimisée pour faire **exactement 32 octets** pour une efficacité maximale de transmission LoRa. La structure est packée sans alignement automatique (`#pragma pack(1)`) :

| Offset | Taille (octets) | Type       | Nom | Description |
| :---: | :---: | :---: | :---: | :--- |
| **0** | 1 | `uint8_t` | `id` | SSID Num (Tracker ID, 0-255). |
| **1** | 1 | `uint8_t` | `apid` | Identifiant applicatif (APID, 0-63). |
| **2** | 1 | `uint8_t` | `type` | SSID Type (Type de tracker, 0-3). |
| **3** | 4 | `uint32_t` | `utc` | Horodatage GPS (Temps universel coordonné, Unix Epoch). |
| **7** | 4 | `float` | `lat` | Latitude (binaire IEEE 754). |
| **11** | 4 | `float` | `lon` | Longitude (binaire IEEE 754). |
| **15** | 4 | `float` | `alt` | Altitude GPS en mètres. |
| **19** | 4 | `float` | `spd` | Vitesse GPS en km/h. |
| **23** | 4 | `float` | `cog` | Cap (Course Over Ground) en degrés. |
| **27** | 2 | `uint16_t` | `vbat` | Tension de l'accu d'alimentation en millivolts (mV). |
| **29** | 2 | `int16_t` | `temp` | Température mesurée en centièmes de °C (en 1/100 °C). |
| **31** | 1 | `uint8_t` | `status` | **Octet combiné d'état** : <br>- **Bit 7** : Fix GPS (1 = Valide, 0 = Non valide)<br>- **Bits 0-4** : Nombre de satellites GNSS captés (de 0 à 31). |
| **TOTAL** | **32 octets** | | | *(Structure alignée à 100%)* |
