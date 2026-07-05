# **NectarMC** — Guide des Formats de Trames (Wasp-TX)
> Référence des trames binaires émises par le tracker embarqué **Wasp-TX**.  
> Destinée à tout logiciel de vol, simulateur ou parseur traitant des trames NectarMC.

---

Ce document décrit le format des trames côté **bord** (liaison radio LoRa dans les airs) et côté **tracker local** (liaison série USB / Bluetooth vers le PC) afin que celles-ci puissent être ingérées par **[NectarMC](https://github.com/mlavardin/NectarMC)** ou relayées par la station sol **[Nectar-RX](https://github.com/axpaul/Nectar-RxStation-LoRa32)**.

---

## 📡 1. Trame Radio LoRa (Tracker bord → Station sol)

Le tracker Wasp-TX transmet la structure `wasp_payload_t` **intégralement** sur les ondes LoRa. La charge utile radio fait exactement **32 octets** et contient son propre en-tête de routage (`id`, `apid`, `type`), suivi des données de télémétrie.

### Option A : CRC matériel (Recommandé & Par défaut)

Le contrôle d'intégrité est pris en charge directement par le silicium de la puce SX1276. Le paquet LoRa ne contient que la structure `wasp_payload_t` brute.
* **Taille totale** : `32` octets (taille fixe).
* **Commande AT** : `AT+CRC=1` (activé par défaut).

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                        wasp_payload_t  (32 octets)                           │
├──────────┬──────────┬──────────┬────────────────────────────────────────────┐│
│  id      │  apid    │  type    │            Données Télémétrie              ││
│ 1 Byte   │ 1 Byte   │ 1 Byte  │              29 Bytes                      ││
│(SSID Num)│ (0-63)   │(SSID Typ)│   (UTC, GPS, Vbat, Temp, Status)          ││
└──────────┴──────────┴──────────┴───────────────────────────────────────────┘│
│                          [CRC16 SX1276 Silicium]                            │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Option B : CRC logiciel (Si le CRC matériel est désactivé)

Si le CRC matériel est désactivé (`AT+CRC=0`), l'émetteur calcule un CRC16 logiciel et l'ajoute en queue de payload. La station sol Nectar-RX le vérifie avant de valider le paquet.
* **Taille totale** : `34` octets (32 + 2 octets de CRC logiciel).

```
┌───────────────────────────────────────────────────────────────┬──────────────┐
│                  wasp_payload_t  (32 octets)                  │ PACKET CTRL  │
├───────────────────────────────────────────────────────────────┼──────────────┤
│  id  │  apid  │  type  │     Données Télémétrie (29 B)       │    CRC16     │
│  1B  │   1B   │   1B   │                                     │   2 Bytes    │
│      │        │        │                                     │  (Software)  │
└──────┴────────┴────────┴─────────────────────────────────────┴──────────────┘
```

> [!NOTE]
> **Compatibilité et Fallback** : La station sol Nectar-RX détecte automatiquement les trames historiques sans Magic byte `0xEB` (commençant directement par le `SSID_NUM` brut) et les convertit à la volée au format NectarMC standard.

---

## 📦 2. Structure de la charge utile WASP (`wasp_payload_t` — 32 Octets)

La structure `wasp_payload_t` est optimisée pour faire **exactement 32 octets** afin de maximiser l'efficacité de la transmission LoRa. Elle est packée sans alignement (`#pragma pack(1)`) et transmise **telle quelle** comme paquet radio.

```c
#pragma pack(push, 1)
struct wasp_payload_t {
    uint8_t  id;       // SSID Num (Tracker ID)
    uint8_t  apid;     // Application Process Identifier
    uint8_t  type;     // SSID Type (Tracker Type)
    uint32_t utc;      // Unix Epoch time
    uint8_t  lat[4];   // Latitude  (float IEEE 754)
    uint8_t  lon[4];   // Longitude (float IEEE 754)
    uint8_t  alt[4];   // Altitude  (float IEEE 754)
    uint8_t  spd[4];   // Vitesse   (float IEEE 754)
    uint8_t  cog[4];   // Cap       (float IEEE 754)
    uint16_t vbat;     // Tension batterie (mV)
    int16_t  temp;     // Température (1/100 °C)
    uint8_t  status;   // Bitmask d'état
};                     // TOTAL = 32 octets
#pragma pack(pop)
```

### Table des champs

| Offset | Taille | Type | Nom | Description |
| :---: | :---: | :---: | :--- | :--- |
| **0** | 1 | `uint8_t` | `id` | SSID Num — Identifiant unique du tracker (0–255). |
| **1** | 1 | `uint8_t` | `apid` | Application Process Identifier (0–63). |
| **2** | 1 | `uint8_t` | `type` | SSID Type — Type de mission (voir table ci-dessous). |
| **3** | 4 | `uint32_t` | `utc` | Horodatage GPS UTC (Unix Epoch, secondes depuis le 1er janv. 1970). |
| **7** | 4 | `float` | `lat` | Latitude en degrés décimaux (IEEE 754). |
| **11** | 4 | `float` | `lon` | Longitude en degrés décimaux (IEEE 754). |
| **15** | 4 | `float` | `alt` | Altitude GPS en mètres. |
| **19** | 4 | `float` | `spd` | Vitesse sol GPS en km/h. |
| **23** | 4 | `float` | `cog` | Cap (Course Over Ground) en degrés (0–360). |
| **27** | 2 | `uint16_t` | `vbat` | Tension de la batterie en millivolts (mV). |
| **29** | 2 | `int16_t` | `temp` | Température PMU interne en centièmes de °C (ex: `2350` = 23.50 °C). |
| **31** | 1 | `uint8_t` | `status` | Bitmask d'état combiné (voir détail ci-dessous). |
| | **32** | | | **Total** |

### Encodage du SSID Type (`type`)

Conformément au protocole NectarMC, le champ `type` correspond aux 2 bits de poids fort du SSID :

| Valeur | Label | Description | Commande AT |
| :---: | :--- | :--- | :--- |
| `0` | **FX** | Fusée expérimentale | `AT+TYPE=0` |
| `1` | **MF** | Mini-fusée | `AT+TYPE=1` |
| `2` | **BALLOON** | Ballon-sonde *(défaut)* | `AT+TYPE=2` |
| `3` | **OTHER** | Autre | `AT+TYPE=3` |

### Décodage du bitmask `status` (Octet 31)

```
  Bit :   7       6       5       4       3       2       1       0
       ┌───────┬───────┬───────┬───────┬───────┬───────┬───────┬───────┐
       │GPS Fix│Reservé│ Mode  │              Satellites (0-31)        │
       │ 1=OK  │       │Eco=1  │                                      │
       └───────┴───────┴───────┴───────┴───────┴───────┴───────┴───────┘
```

| Bit(s) | Nom | Description |
| :---: | :--- | :--- |
| **7** | GPS Fix | `1` = Fix GPS valide, `0` = Pas de fix. |
| **6** | Réservé | Non utilisé (toujours `0`). |
| **5** | Mode | `0` = Mode Vol 🚀 (performance), `1` = Mode Éco 🔋 (économie). |
| **4–0** | Satellites | Nombre de satellites GNSS captés (0–31). |

**Exemple de décodage** : `status = 0xA5` → binaire `1010 0101`
*   Bit 7 = `1` → Fix GPS valide ✅
*   Bit 5 = `1` → Mode Éco actif 🔋
*   Bits 4-0 = `00101` = 5 satellites

---

## 💻 3. Trame Série NectarMC (Tracker / Station → PC)

Lorsque le tracker émet ses données vers le PC (via `AT+BINUSB=1` sur USB ou via Bluetooth SPP), les données sont encapsulées dans une trame binaire NectarMC simplifiée.

> [!IMPORTANT]
> **Différence avec la trame de la station sol Nectar-RX** : La trame série émise directement par Wasp-TX **n'inclut pas** le champ `gs_flag` (Ground Station Flag) du protocole NectarMC complet. Le header Wasp-TX fait donc **4 octets** (MAGIC + Id_mission + payload_size) au lieu des 5 octets du format station sol (qui ajoute un `gs_flag` entre `Id_mission` et `payload_size`). Lorsqu'un paquet Wasp-TX est reçu par la station sol Nectar-RX, celle-ci le réencapsule dans le format complet à 5 octets de header avec le `gs_flag` approprié.

### Format de trame série Wasp-TX (émission directe USB/BT)

```
┌──────────────────────────────────┬───────────────┬──────────────────────────────┬──────────────┬──────┐
│             HEADER               │    PAYLOAD    │          METADATA            │   CONTROL    │ TERM │
├────────┬───────────┬─────────────┼───────────────┼────────┬────────┬────────────┼──────────────┼──────┤
│ MAGIC  │ Id_mission│  pay_len    │    N data     │  RSSI  │  SNR   │ Timestamp  │    CRC16     │  LF  │
│ 1 Byte │  2 Bytes  │  1 Byte     │   N Bytes     │ 1 Byte │ 1 Byte │  4 Bytes   │   2 Bytes    │ 1 B  │
│  0xEB  │  (LE 16b) │             │               │(int8_t)│(int8_t)│ (LE 32b)   │  (LE 16b)    │ 0x0A │
└────────┴───────────┴─────────────┴───────────────┴────────┴────────┴────────────┴──────────────┴──────┘
```

**Taille totale** : `4 + N + 2 + 4 + 2 + 1` = **13 + N** octets.

Pour Wasp-TX, la payload série est de **29 octets** (la structure `wasp_payload_t` **moins** les 3 premiers octets `id`/`apid`/`type` qui sont réencodés dans le champ `Id_mission` du header NectarMC). La trame série fait donc **42 octets** au total.

### Format de trame série Nectar-RX (station sol → PC)

Lorsque la station sol Nectar-RX relaie un paquet validé vers NectarMC, elle utilise le format complet avec `gs_flag` :

```
┌──────────────────────────────────────────┬──────────┬──────────────────────────────┬──────────────┬──────┐
│               HEADER                     │ PAYLOAD  │          FOOTER              │   CONTROL    │ TERM │
├────────┬───────────┬──────────┬──────────┼──────────┼────────┬────────┬────────────┼──────────────┼──────┤
│ MAGIC  │ Id_mission│ gs_flag  │ pay_len  │  N data  │  RSSI  │  SNR   │ Timestamp  │    CRC16     │  LF  │
│ 1 Byte │  2 Bytes  │ 1 Byte   │ 1 Byte   │ N Bytes  │ 1 Byte │ 1 Byte │  4 Bytes   │   2 Bytes    │ 1 B  │
│  0xEB  │  (LE 16b) │          │          │          │(int8_t)│(int8_t)│ (LE 32b)   │  (LE 16b)    │ 0x0A │
└────────┴───────────┴──────────┴──────────┴──────────┴────────┴────────┴────────────┴──────────────┴──────┘
```

Le `gs_flag` est un bitmask indiquant les champs de métadonnées présents dans le footer :

```
  bit7    bit6    bit5    bit4    bit3    bit2    bit1    bit0
                                                  |       |       
                                                  |       └──────── RSSI présent
                                                  └──────────────── SNR présent
  └──────────────── Réservés ─────────────────┘
```

> Pour la documentation complète du format station sol, consultez le [FRAME_GUIDE de Nectar-RX](https://github.com/axpaul/Nectar-RxStation-LoRa32/blob/main/FRAME_GUIDE.md) et le [Guide BDS de NectarMC](https://github.com/mlavardin/NectarMC/blob/master/DOCUMENTATION/FRAME_FORMAT.md).

### Dé-duplication de l'en-tête radio

Les champs `id`, `apid` et `type` de la `wasp_payload_t` ne sont **pas** retransmis dans la payload série. Ils sont compactés dans le champ `Id_mission` du header NectarMC. Cela évite la duplication d'information entre l'en-tête radio et l'en-tête série.

```c
// Extrait de serial.cpp — outputTelemetryFrame()
sendNectarFrame(packet.type, packet.id, packet.apid,
                (const uint8_t*)&packet + 3,          // Payload = octets 3 à 31
                sizeof(wasp_payload_t) - 3,            // N = 29 octets
                0, 0);                                 // RSSI=0, SNR=0 (local)
```

### Description détaillée des champs de la trame série

| Position | Type | Nom | Description |
| :--- | :--- | :--- | :--- |
| **Octet 0** | `uint8_t` | `MAGIC` | Toujours `0xEB`. Marqueur de synchronisation aérospatial (IRIG-106). |
| **Octets 1–2** | `uint16_t` | `Id_mission` | Identifiant de mission encodé en **Little-Endian**. Regroupe SSID et APID (voir encodage ci-dessous). |
| **Octet 3** | `uint8_t` | `payload_size` | Longueur N de la charge utile en octets (29 pour Wasp-TX). |
| **Octets 4 à 3+N** | `uint8_t[]` | `Payload` | Données utiles : les octets 3 à 31 de `wasp_payload_t` (UTC → Status). |
| **Octet 4+N** | `int8_t` | `RSSI` | Force du signal LoRa reçu en dBm (`0` si émis localement par le tracker). |
| **Octet 5+N** | `int8_t` | `SNR` | Rapport signal/bruit LoRa en dB (`0` si émis localement). |
| **Octets 6+N à 9+N** | `uint32_t` | `Timestamp` | Horodatage Epoch Unix (4 octets, Little-Endian). Heure RTC du dispositif émetteur. |
| **Octets 10+N à 11+N** | `uint16_t` | `CRC16` | CRC16-CCITT (polynôme `0x1021`, init `0xFFFF`), Little-Endian. Calculé sur les octets `0` à `9+N` inclus. |
| **Octet 12+N** | `char` | `LF` | Caractère de fin de ligne `\n` (`0x0A`). Permet la détection de fin de trame par les terminaux série. |

---

## 🔑 4. Encodage du Header NectarMC (3 octets)

### Magic byte (Octet 0)

Octet de synchronisation fixé à `0xEB`.

Le choix de `0xEB` repose sur deux critères :
- **Convention aérospatiale** — c'est le préfixe du mot de synchronisation IRIG-106 (`0xEB90`).
- **Propriétés binaires** — le motif `1110 1011` présente une densité de transitions élevée, le rendant statistiquement peu probable dans un flux de données aléatoire et facile à détecter par un parseur.

### Id_mission (Octets 1–2)

Ce champ de 16 bits (Little-Endian) compacte trois informations, conformément au standard NectarMC :

```
Bits:  |15  14  13  12  11  10   9   8   7   6 | 5   4   3   2   1   0|
       ├───────────── SSID (10 bits) ──────────┼───── APID (6 bits) ──┤
       │        TYPE      │      NUM (0-255)   │     Application ID   │
       │      (2 bits)    │      (8 bits)      │      (0-63)          │
```

**Formule d'encodage** (code source `serial.cpp`) :
```c
uint16_t ssid       = ((ssid_type & 0x03) << 8) | ssid_num;   // SSID = 10 bits
uint16_t id_mission = (ssid << 6) | (apid & 0x3F);            // Id_mission = 16 bits
// Stocké en Little-Endian dans la trame
header[1] = id_mission & 0xFF;        // octet bas
header[2] = (id_mission >> 8) & 0xFF; // octet haut
```

**Formule de décodage** :
```c
uint16_t id_mission = header[1] | (header[2] << 8);     // Lecture Little-Endian
uint8_t  apid       = id_mission & 0x3F;                 // Bits 5-0
uint16_t ssid       = (id_mission >> 6) & 0x03FF;        // Bits 15-6
uint8_t  ssid_num   = ssid & 0xFF;                       // Bits 7-0 du SSID
uint8_t  ssid_type  = (ssid >> 8) & 0x03;                // Bits 9-8 du SSID
```

**Exemples concrets** (conformes aux exemples NectarMC) :

| Identifiant | Type (bits) | NUM (déc.) | SSID (hex) | SSID (bin) |
| :---: | :---: | :---: | :---: | :--- |
| `FX99` | `00` | 99 | `0x063` | `00 01100011` |
| `FX7` | `00` | 7 | `0x007` | `00 00000111` |
| `MF12` | `01` | 12 | `0x10C` | `01 00001100` |
| `BALLOON3` | `10` | 3 | `0x203` | `10 00000011` |
| `OTHER200` | `11` | 200 | `0x3C8` | `11 11001000` |

**Exemple de calcul complet** : Tracker ID=1, Type=BALLOON(2), APID=1
*   `ssid = (2 << 8) | 1 = 0x0201 = 513`
*   `id_mission = (513 << 6) | 1 = 32833 = 0x8041`
*   En Little-Endian dans la trame : `[0x41, 0x80]`

### Payload Size (Octet 3)

Longueur en octets de la charge utile série. Pour Wasp-TX, cette valeur est fixée à **29** (32 octets de `wasp_payload_t` moins les 3 octets d'en-tête `id`/`apid`/`type` déjà encodés dans `Id_mission`).

---

## 🔐 5. Contrôle d'Intégrité (CRC)

Deux niveaux de CRC protègent les données de bout en bout :

```mermaid
graph LR
    Tracker["🚀 Tracker Wasp-TX"] -- "Niveau 1 : Liaison Radio LoRa<br>(CRC Matériel SX1276)" --> Station["📡 Station Sol Nectar-RX"]
    Station -- "Niveau 2 : Liaison Série/BT<br>(CRC16-CCITT Logiciel)" --> PC["💻 NectarMC"]
```

### Niveau 1 — CRC Radio LoRa (Matériel)

| Propriété | Valeur |
| :--- | :--- |
| **Polynôme** | CRC16-CCITT : $X^{16} + X^{12} + X^5 + 1$ (`0x1021`) |
| **Calcul** | Effectué en silicium par la puce SX1276 |
| **Validation** | Automatique à la réception (paquet rejeté si CRC invalide) |
| **Commande AT** | `AT+CRC=1` (activé) / `AT+CRC=0` (désactivé) |

### Niveau 2 — CRC Série NectarMC (Logiciel)

| Propriété | Valeur |
| :--- | :--- |
| **Polynôme** | CRC16-CCITT (`0x1021`) |
| **Valeur initiale** | `0xFFFF` |
| **Périmètre** | Octets `0` (MAGIC) à `9+N` (dernier octet du Timestamp) inclus |
| **Encodage** | Little-Endian (octet bas en premier) |
| **Implémentation** | Fonction `calculate_crc16()` dans `serial.cpp` |

> [!NOTE]
> Il est **obligatoire d'avoir un CRC16 en sortie du récepteur** pour que la trame puisse être ingérée par NectarMC. Le CRC côté bord (radio) est optionnel, mais le CRC série est toujours ajouté automatiquement par Wasp-TX et Nectar-RX.

```c
// Implémentation de référence — serial.cpp
uint16_t calculate_crc16(const uint8_t *data, size_t len) {
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < len; ++i) {
        crc ^= (data[i] << 8);
        for (int j = 0; j < 8; ++j) {
            if (crc & 0x8000)
                crc = (crc << 1) ^ 0x1021;
            else
                crc <<= 1;
        }
    }
    return crc;
}
```

---

## 📐 6. Exemple Complet d'une Trame Série Wasp-TX (42 octets)

Voici un exemple de trame série émise par un Wasp-TX avec les paramètres :
- Tracker ID = 1, Type = BALLOON (2), APID = 1
- GPS : 48.8566° N, 2.3522° E, Alt = 150.0 m, Vitesse = 0.0 km/h, Cap = 0.0°
- Batterie = 3850 mV, Température = 25.00 °C, Fix GPS valide, 8 satellites, Mode Vol

```
Offset :  00  01  02  03  04  05  06  07  08  09  10  11  12  13 ...
Données : EB  41  80  1D  [UTC 4B]  [LAT 4B]  [LON 4B]  [ALT 4B] ...
          │    │   │   │
          │    └───┘   └── payload_size = 29 (0x1D)
          │    Id_mission = 0x8041 (LE)
          └── MAGIC = 0xEB

... 14  15  16  17  18  19  20  21  22  23  24  25  26  27 ...
    [SPD 4B]  [COG 4B]  [VBAT 2B]  [TEMP 2B]  [STATUS]  [RSSI] ...

... 28  29  30  31  32  33  34  35  36  37  38  39  40  41
    [SNR]  [TIMESTAMP 4B (LE)]  [CRC16 2B (LE)]  0x0A
                                                    └── LF (fin de trame)
```

> [!TIP]
> **Parsing d'un flux série** : Scannez le buffer jusqu'à trouver l'octet `0xEB`, lisez les 3 octets suivants du header pour obtenir l'`Id_mission` et la taille de la payload, puis validez le CRC16 avant de décoder les données. En cas d'erreur de CRC, passez au prochain octet `0xEB` pour tenter une resynchronisation.

---

## 📚 7. Références Croisées

| Document | Lien |
| :--- | :--- |
| Guide des trames Nectar-RX (station sol) | [FRAME_GUIDE.md](https://github.com/axpaul/Nectar-RxStation-LoRa32/blob/main/FRAME_GUIDE.md) |
| Guide des trames BDS NectarMC | [FRAME_FORMAT.md](https://github.com/mlavardin/NectarMC/blob/master/DOCUMENTATION/FRAME_FORMAT.md) |
| Manuel utilisateur NectarMC | [manual.md](https://github.com/mlavardin/NectarMC/blob/master/DOCUMENTATION/manual.md) |
| Guide CRC Wasp-TX | [CRC_GUIDE.md](./CRC_GUIDE.md) |
| Guide des commandes AT Wasp-TX | [AT_GUIDE.md](./AT_GUIDE.md) |
