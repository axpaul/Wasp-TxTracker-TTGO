# Guide des Formats de Trames — Wasp-TX & NectarMC

> Reference des trames binaires emises par le tracker embarque **Wasp-TX**.  
> Destinee a tout logiciel de vol, simulateur ou parseur traitant des trames NectarMC.

---

Ce document decrit le format des trames cote **bord** (liaison radio LoRa dans les airs) et cote **tracker local** (liaison serie USB / Bluetooth vers le PC) afin que celles-ci puissent etre ingerees par **[NectarMC](https://github.com/mlavardin/NectarMC)** ou relayees par la station sol **[Nectar-RX](https://github.com/axpaul/Nectar-RxStation-LoRa32)**.

Pour le controle d'integrite (CRC), consultez le guide dedie :
> **[Consulter le Guide de Controle d'Integrite (CRC)](./CRC_GUIDE.md)**

---

## 1. Structure de la charge utile WASP (`wasp_payload_t` — 32 octets)

La structure `wasp_payload_t` est optimisee pour faire **exactement 32 octets** afin de maximiser l'efficacite de la transmission LoRa. Elle est packee sans alignement (`#pragma pack(1)`) et transmise **telle quelle** comme paquet radio.

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
    int16_t  temp;     // Temperature (1/100 C)
    uint8_t  status;   // Bitmask d'etat
};                     // TOTAL = 32 octets
#pragma pack(pop)
```

### Table des champs

| Offset | Taille | Type | Nom | Description |
| :---: | :---: | :---: | :--- | :--- |
| 0 | 1 | `uint8_t` | `id` | SSID Num — Identifiant unique du tracker (0–255). |
| 1 | 1 | `uint8_t` | `apid` | Application Process Identifier (0–63). |
| 2 | 1 | `uint8_t` | `type` | SSID Type — Type de mission (voir table ci-dessous). |
| 3 | 4 | `uint32_t` | `utc` | Horodatage GPS UTC (Unix Epoch, secondes depuis le 1er janv. 1970). |
| 7 | 4 | `float` | `lat` | Latitude en degres decimaux (IEEE 754). |
| 11 | 4 | `float` | `lon` | Longitude en degres decimaux (IEEE 754). |
| 15 | 4 | `float` | `alt` | Altitude GPS en metres. |
| 19 | 4 | `float` | `spd` | Vitesse sol GPS en km/h. |
| 23 | 4 | `float` | `cog` | Cap (Course Over Ground) en degres (0–360). |
| 27 | 2 | `uint16_t` | `vbat` | Tension de la batterie en millivolts (mV). |
| 29 | 2 | `int16_t` | `temp` | Temperature PMU interne en centiemes de C (ex: `2350` = 23.50 C). |
| 31 | 1 | `uint8_t` | `status` | Bitmask d'etat combine (voir detail ci-dessous). |
| | **32** | | | **Total** |

### Encodage du SSID Type (`type`)

Conformement au protocole NectarMC, le champ `type` correspond aux 2 bits de poids fort du SSID :

| Valeur | Label | Description | Commande AT |
| :---: | :--- | :--- | :--- |
| `0` | **FX** | Fusee experimentale | `AT+TYPE=0` |
| `1` | **MF** | Mini-fusee | `AT+TYPE=1` |
| `2` | **BALLOON** | Ballon-sonde *(defaut)* | `AT+TYPE=2` |
| `3` | **OTHER** | Autre | `AT+TYPE=3` |

### Decodage du bitmask `status` (Octet 31)

```
  Bit :    7        6        5        4        3        2        1        0
        +--------+--------+--------+--------+--------+--------+--------+--------+
        |GPS Fix |Reserve | Mode   |                Satellites (0-31)            |
        | 1=OK   |        | Eco=1  |                                            |
        +--------+--------+--------+--------+--------+--------+--------+--------+
```

| Bit(s) | Nom | Description |
| :---: | :--- | :--- |
| 7 | GPS Fix | `1` = Fix GPS valide, `0` = Pas de fix. |
| 6 | Reserve | Non utilise (toujours `0`). |
| 5 | Mode | `0` = Mode Vol (performance), `1` = Mode Eco (economie). |
| 4–0 | Satellites | Nombre de satellites GNSS captes (0–31). |

**Exemple** : `status = 0xA5` = binaire `1010 0101`
*   Bit 7 = `1` → Fix GPS valide
*   Bit 5 = `1` → Mode Eco actif
*   Bits 4-0 = `00101` = 5 satellites

---

## 2. Trame Radio LoRa (Tracker bord → Station sol)

Le tracker Wasp-TX transmet la structure `wasp_payload_t` **integralement** sur les ondes LoRa. La charge utile radio fait exactement **32 octets** et contient son propre en-tete de routage (`id`, `apid`, `type`), suivi des donnees de telemetrie.

### Option A : CRC materiel (Recommande & Par defaut)

Le controle d'integrite est pris en charge directement par le silicium de la puce SX1276. Le paquet LoRa ne contient que la structure `wasp_payload_t` brute.
* **Taille totale** : `32` octets (taille fixe).
* **Commande AT** : `AT+CRC=1` (active par defaut).

```
+------+------+------+------+------+------+------+------+------+------+------+------+
| Byte |  0   |  1   |  2   | 3..6 | 7..10|11..14|15..18|19..22|23..26|27..28|29..30| 31  |
+------+------+------+------+------+------+------+------+------+------+------+------+
| Champ|  id  | apid | type |  utc |  lat |  lon |  alt |  spd |  cog | vbat | temp |stat.|
| Taille| 1B  |  1B  |  1B  |  4B  |  4B  |  4B  |  4B  |  4B  |  4B  |  2B  |  2B  | 1B  |
+------+------+------+------+------+------+------+------+------+------+------+------+------+
|                              wasp_payload_t (32 octets)                                   |
+-------------------------------------------------------------------------------------------+
|                         [CRC16 calcule en silicium par le SX1276]                         |
+-------------------------------------------------------------------------------------------+
```

### Option B : CRC logiciel (Si le CRC materiel est desactive)

Si le CRC materiel est desactive (`AT+CRC=0`), l'emetteur calcule un CRC16 logiciel et l'ajoute en queue de payload. La station sol Nectar-RX le verifie avant de valider le paquet.
* **Taille totale** : `34` octets (32 + 2 octets de CRC logiciel).

```
+-------------------------------------------------------------------------------------------+-----------+
|                              wasp_payload_t (32 octets)                                   |  CRC16    |
+------+------+------+------+------+------+------+------+------+------+------+------+-------+-----------+
| Byte |  0   |  1   |  2   | 3..6 | 7..10|11..14|15..18|19..22|23..26|27..28|29..30|  31   | 32..33    |
+------+------+------+------+------+------+------+------+------+------+------+------+-------+-----------+
| Champ|  id  | apid | type |  utc |  lat |  lon |  alt |  spd |  cog | vbat | temp | stat. | CRC16 SW  |
| Taille| 1B  |  1B  |  1B  |  4B  |  4B  |  4B  |  4B  |  4B  |  4B  |  2B  |  2B  |  1B  |    2B     |
+------+------+------+------+------+------+------+------+------+------+------+------+-------+-----------+
```

> [!NOTE]
> **Compatibilite et Fallback** : La station sol Nectar-RX detecte automatiquement les trames historiques sans Magic byte `0xEB` (commencant directement par le `SSID_NUM` brut) et les convertit a la volee au format NectarMC standard.

---

## 3. Trame Serie NectarMC (Tracker / Station → PC)

Lorsque le tracker emet ses donnees vers le PC (via `AT+BINUSB=1` sur USB ou via Bluetooth SPP), les donnees sont encapsulees dans une trame binaire NectarMC.

> [!IMPORTANT]
> **Difference avec la station sol Nectar-RX** : La trame serie emise directement par Wasp-TX **n'inclut pas** le champ `gs_flag` (Ground Station Flag) du protocole NectarMC complet. Le header Wasp-TX fait **4 octets** (MAGIC + Id_mission + payload_size). Lorsque la station sol Nectar-RX relaie un paquet vers NectarMC, elle le reencapsule dans le format complet a **5 octets** de header (avec `gs_flag`).

### Format de trame serie Wasp-TX (emission directe USB/BT)

**Taille totale** : `4 + N + 2 + 4 + 2 + 1` = **13 + N** octets.
Pour Wasp-TX, N = **29** octets, soit une trame de **42 octets** au total.

```
+-------+------------+---------+------ ... ------+------+------+------------+-----------+------+
| Byte  |   0        |  1..2   |    3  |  4      ...   3+N    | 4+N  | 5+N  | 6+N..9+N  |10+N..11+N|12+N |
+-------+------------+---------+-------+------ ... ------+------+------+------------+-----------+------+
| Champ | MAGIC      |Id_missi.| pay_  |      PAYLOAD         | RSSI | SNR  | Timestamp  |  CRC16   |  LF  |
|       |            |         | len   |      (N octets)      |      |      |            |          |      |
+-------+------------+---------+-------+----------------------+------+------+------------+----------+------+
| Type  | uint8      |uint16 LE| uint8 |     uint8[]          | int8 | int8 | uint32 LE  |uint16 LE | char |
| Valeur|   0xEB     |         |  29   |                      |   0  |   0  |            |          | 0x0A |
+-------+------------+---------+-------+----------------------+------+------+------------+----------+------+
  HEADER (4 octets)                                              METADATA (6 octets)     CTRL (2B)  TERM
```

### De-duplication de l'en-tete radio

Les champs `id`, `apid` et `type` de la `wasp_payload_t` ne sont **pas** retransmis dans la payload serie. Ils sont compactes dans le champ `Id_mission` du header NectarMC. La payload serie commence donc a l'offset 3 de `wasp_payload_t` (le champ `utc`).

```c
// Extrait de serial.cpp — outputTelemetryFrame()
sendNectarFrame(packet.type, packet.id, packet.apid,
                (const uint8_t*)&packet + 3,       // Payload = octets 3 a 31 de wasp_payload_t
                sizeof(wasp_payload_t) - 3,         // N = 29 octets
                0, 0);                              // RSSI=0, SNR=0 (emission locale)
```

### Description detaillee des champs serie

| Position | Type | Nom | Description |
| :--- | :--- | :--- | :--- |
| Octet 0 | `uint8_t` | `MAGIC` | Toujours `0xEB`. Marqueur de synchronisation aerospatial (IRIG-106). |
| Octets 1–2 | `uint16_t` | `Id_mission` | Identifiant de mission encode en **Little-Endian**. Regroupe SSID et APID (voir section 4). |
| Octet 3 | `uint8_t` | `payload_size` | Longueur N de la charge utile en octets (29 pour Wasp-TX). |
| Octets 4 a 3+N | `uint8_t[]` | `Payload` | Donnees utiles : octets 3 a 31 de `wasp_payload_t` (UTC → Status). |
| Octet 4+N | `int8_t` | `RSSI` | Force du signal LoRa recu en dBm (`0` si emis localement par le tracker). |
| Octet 5+N | `int8_t` | `SNR` | Rapport signal/bruit LoRa en dB (`0` si emis localement). |
| Octets 6+N a 9+N | `uint32_t` | `Timestamp` | Horodatage Epoch Unix (4 octets, Little-Endian). Heure RTC du dispositif emetteur. |
| Octets 10+N a 11+N | `uint16_t` | `CRC16` | CRC16-CCITT, Little-Endian. Calcule sur les octets `0` a `9+N` inclus. |
| Octet 12+N | `char` | `LF` | Caractere de fin de ligne `\n` (`0x0A`). |

### Format de trame serie Nectar-RX (station sol → PC)

Lorsque la station sol Nectar-RX relaie un paquet valide vers NectarMC, elle utilise le format complet avec `gs_flag`. Le header fait alors **5 octets** au lieu de 4. Le `gs_flag` est un bitmask indiquant les champs de metadonnees presents dans le footer (RSSI, SNR, Timestamp).

> Pour la documentation complete du format station sol, consultez le [FRAME_GUIDE de Nectar-RX](https://github.com/axpaul/Nectar-RxStation-LoRa32/blob/main/FRAME_GUIDE.md) et le [Guide BDS de NectarMC](https://github.com/mlavardin/NectarMC/blob/master/DOCUMENTATION/FRAME_FORMAT.md).

---

## 4. Encodage du Header NectarMC

### Magic byte (Octet 0)

Octet de synchronisation fixe a `0xEB`.

Le choix de `0xEB` repose sur deux criteres :
- **Convention aerospatiale** — c'est le prefixe du mot de synchronisation IRIG-106 (`0xEB90`).
- **Proprietes binaires** — le motif `1110 1011` presente une densite de transitions elevee, le rendant statistiquement peu probable dans un flux de donnees aleatoire et facile a detecter par un parseur.

### Id_mission (Octets 1–2)

Ce champ de 16 bits (Little-Endian) compacte trois informations, conformement au standard NectarMC :

```
Bits:  |15  14  13  12  11  10   9   8   7   6 | 5   4   3   2   1   0|
       +------------- SSID (10 bits) ----------+------ APID (6 bits) -+
       |        TYPE      |      NUM (0-255)   |     Application ID   |
       |      (2 bits)    |      (8 bits)      |      (0-63)          |
```

**Formule d'encodage** (code source `serial.cpp`) :
```c
uint16_t ssid       = ((ssid_type & 0x03) << 8) | ssid_num;   // SSID = 10 bits
uint16_t id_mission = (ssid << 6) | (apid & 0x3F);            // Id_mission = 16 bits
// Stocke en Little-Endian dans la trame
header[1] = id_mission & 0xFF;        // octet bas
header[2] = (id_mission >> 8) & 0xFF; // octet haut
```

**Formule de decodage** :
```c
uint16_t id_mission = header[1] | (header[2] << 8);     // Lecture Little-Endian
uint8_t  apid       = id_mission & 0x3F;                 // Bits 5-0
uint16_t ssid       = (id_mission >> 6) & 0x03FF;        // Bits 15-6
uint8_t  ssid_num   = ssid & 0xFF;                       // Bits 7-0 du SSID
uint8_t  ssid_type  = (ssid >> 8) & 0x03;                // Bits 9-8 du SSID
```

**Exemples concrets** (conformes aux exemples NectarMC) :

| Identifiant | Type (bits) | NUM (dec.) | SSID (hex) | SSID (bin) |
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

Longueur en octets de la charge utile serie. Pour Wasp-TX, cette valeur est fixee a **29** (32 octets de `wasp_payload_t` moins les 3 octets d'en-tete `id`/`apid`/`type` deja encodes dans `Id_mission`).

---

## 5. References Croisees

| Document | Description |
| :--- | :--- |
| [Guide CRC Wasp-TX](./CRC_GUIDE.md) | Deux niveaux de CRC (Radio LoRa materiel et Liaison Serie logiciel). |
| [Guide des commandes AT](./AT_GUIDE.md) | Liste complete des commandes de configuration du tracker. |
| [FRAME_GUIDE Nectar-RX](https://github.com/axpaul/Nectar-RxStation-LoRa32/blob/main/FRAME_GUIDE.md) | Formats de trames de la station sol (avec `gs_flag`). |
| [Guide BDS NectarMC](https://github.com/mlavardin/NectarMC/blob/master/DOCUMENTATION/FRAME_FORMAT.md) | Format de description des trames (Binary Data Scheme). |
| [Manuel NectarMC](https://github.com/mlavardin/NectarMC/blob/master/DOCUMENTATION/manual.md) | Installation et prise en main du logiciel sol. |
