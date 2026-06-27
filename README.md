# Wasp-TX : Wireless Altitude & Status Positioning 

**Wasp-TX** est un firmware open-source destiné au suivi télémétrique par radiofréquence (LoRa) et GNSS, conçu pour les applications de **rocketry amateur**. Il permet l'acquisition de données de positionnement et leur transmission vers une station sol.
Ce firmware est développé pour les plateformes [LilyGO TTGO T-Beam](https://lilygo.cc/en-us/products/t-beam-meshtastic?variant=51708927312053)
Wasp-TX est intégré à l'écosystème **NectarMC** pour le traitement et la visualisation des données :

* **Réception (Liaison descendante) :** Compatible avec la station **[Nectar-RX](https://github.com/axpaul/Nectar-RxStation-LoRa32)**, configurée pour la capture des trames LoRa.
* **Traitement et visualisation :** Intégration avec la plateforme **[NectarMC](https://github.com/mlavardin/NectarMC)** pour le suivi en temps réel de la trajectoire et l'analyse post-vol.

---

## Fonctionnalités principales

* **Géolocalisation** : Lecture en temps réel des coordonnées GPS, de l'altitude, de la vitesse, du cap et du temps UTC (U-blox NEO-M8N / NEO-6M).
* **Télémétrie LoRa (Format Nectar)** : Envoi périodique des trames télémétriques compressées et sécurisées par CRC.
* **Interface de configuration AT** :
  * Accessible via la liaison USB Série et via **Bluetooth Classique (SPP)**.
  * Commandes AT riches pour paramétrer la radio, l'identifiant du tracker, le type, la fréquence d'envoi, etc.
  * Sauvegarde automatique et persistante des réglages dans la mémoire flash non volatile (NVS).

---

## Aperçu du Matériel

Voici les vues de la carte de développement ainsi que son brochage (Pinout) et ses dimensions :

<p align="center">
  <img src="Image/pin-diagram_1024x1024.jpg" alt="Pinout Diagram" width="500" />
  <br>
  <em>Brochage de la carte TTGO T-BEAM</em>
</p>
<p align="center">
  <img src="Image/product-size_1024x1024.webp" alt="Board Dimensions" width="500" />
  <br>
  <em>Format de la carte TTGO T-BEAM</em>
</p>

- **[Télécharger le Schéma PDF de la TTGO TBEAM V1.1](LilyGo_TBeam_V1.1.pdf)**
- **[Télécharger le Schéma PDF de la TTGO TBEAM V1.2](LilyGo_TBeam_V1.2.pdf)**

---

## Configuration Matérielle (LilyGO T-Beam)

Le code s'adapte automatiquement selon l'environnement de compilation choisi :
* **T-Beam v1.1** : Utilise la puce d'alimentation AXP192. Active automatiquement l'alimentation du GPS (LDO3 @ 3.3V) et du module LoRa (LDO2 @ 3.3V), ainsi que l'ADC de mesure de batterie et la détection d'accu.
* **T-Beam v1.2** : Utilise la puce d'alimentation AXP2101. Active l'alimentation du GPS (ALDO3 @ 3.3V) et du LoRa (ALDO2 @ 3.3V).

---

## External Libraries

Les dépendances du projet sont gérées via `platformio.ini`. Les bibliothèques suivantes sont requises pour le fonctionnement du firmware :

| Library | Version | Purpose |
| :--- | :--- | :--- |
| **RadioLib** | `^6.0.0` | Gestion de la communication radio LoRa |
| **ESP32Time** | `^2.0.0` | Gestion de l'horloge interne (RTC) |
| **XPowersLib** | `^0.2.6` | Gestion de l'alimentation (PMU AXP192/AXP2101) |
| **TinyGPSPlus** | `^1.0.3` | Décodage des trames de données GPS |

---

## Compilation et Téléversement (PlatformIO)

Ouvrez le projet dans VS Code avec l'extension PlatformIO, puis sélectionnez l'environnement approprié :

### 1. Pour la T-Beam v1.1 (AXP192)
```bash
# Compilation
pio run -e tbeam_v1_1

# Téléversement et moniteur série
pio run -e tbeam_v1_1 -t upload -t monitor
```

### 2. Pour la T-Beam v1.2 (AXP2101)
```bash
# Compilation
pio run -e tbeam_v1_2

# Téléversement et moniteur série
pio run -e tbeam_v1_2 -t upload -t monitor
```

---

## Commandes AT Disponibles

Les commandes AT peuvent être envoyées via USB Série (`115200` bauds) ou via le Bluetooth (nom Bluetooth par défaut : `Wasp-TX-<ID>`). Elles se terminent par un retour à la ligne `\r\n`.

| Commande | Action | Exemple de réponse / Comportement |
| --- | --- | --- |
| `AT` | Test de communication | `OK` |
| `AT+HELP` ou `AT?` | Affiche l'aide et les commandes | *(Liste des commandes)* |
| `AT+VER` ou `AT+INFO` | Affiche la version du firmware | `+INFO: WASP-TX TRACKER,FW=1.0.0` |
| `AT+CFG` ou `AT+STATUS` | Affiche la configuration détaillée | *(Tableau de configuration)* |
| `AT+ID=<0-255>` | Règle l'identifiant du tracker (SSID Num) | `OK` |
| `AT+ID?` | Récupère l'identifiant du tracker | `+ID: 1` |
| `AT+TYPE=<0-3>` | Règle le type (0=FX, 1=MF, 2=BALLOON, 3=OTHER) | `OK` |
| `AT+TYPE?` | Récupère le type de tracker | `+TYPE: 2` |
| `AT+INTERVAL=<sec>` | Règle l'intervalle d'envoi en secondes (1-3600) | `OK` *(Sauvegarde automatique)* |
| `AT+INTERVAL?` | Récupère l'intervalle d'envoi | `+INTERVAL: 1` |
| `AT+FREQ=<mhz>` | Règle la fréquence active (ex: `868.500`) | `OK` |
| `AT+FREQ?` | Récupère la fréquence active | `+FREQ: 868.000` |
| `AT+SF=<6-12>` | Règle le Spreading Factor LoRa | `OK` |
| `AT+SF?` | Récupère le Spreading Factor LoRa | `+SF: 9` |
| `AT+BW=<khz>` | Règle la bande passante LoRa | `OK` |
| `AT+BW?` | Récupère la bande passante LoRa | `+BW: 125.0` |
| `AT+POWER=<dbm>` | Règle la puissance d'émission LoRa (2-20) | `OK` |
| `AT+POWER?` | Récupère la puissance d'émission LoRa | `+POWER: 14` |
| `AT+CRC=<0\|1>` | Active (1) ou désactive (0) le CRC LoRa | `OK` |
| `AT+CRC?` | Récupère le statut du CRC | `+CRC: 1,0` (CRC On, Mode CCITT) |
| `AT+DEBUG=<0\|1>` | Active (1) ou désactive (0) les logs texte `[TX]` / `[HEX]` | `OK` *(Sauvegarde automatique)* |
| `AT+DEBUG?` | Récupère le statut des logs texte | `+DEBUG: 0` |
| `AT+BINUSB=<0\|1>` | Active (1) ou désactive (0) la trame binaire brute USB | `OK` *(Sauvegarde automatique)* |
| `AT+BINUSB?` | Récupère le statut de la trame brute USB | `+BINUSB: 0` |
| `AT+SAVE` | Sauvegarde manuellement les réglages en NVS | `OK` |
| `AT+RESET` | Réinitialise les réglages d'usine et redémarre | `OK` |

---

## Tests Unitaires (Framework Unity)

Le firmware inclut une suite de tests unitaires écrits avec le framework **Unity** de PlatformIO. Ces tests permettent de vérifier la cohérence des structures de données, la validité des constantes par défaut et le calcul du CRC16.

Pour compiler et exécuter les tests unitaires directement sur votre carte TTGO T-Beam connectée :

```bash
# Pour tester la version T-Beam v1.1 (AXP192)
pio test -e tbeam_v1_1

# Pour tester la version T-Beam v1.2 (AXP2101)
pio test -e tbeam_v1_2
```

---

# 📡 Guide des Formats de Trames (Radio LoRa & Série NectarMC)

Ce guide décrit en détail les formats et la structure binaire des trames utilisées par la station **Wasp-TX** pour la communication radio et la transmission série.

---

## 📡 1. Format des Trames Radio LoRa (Air)

Les trames émise par le tracker respectent le format suivant :

### Option A : Format avec CRC matériel (Recommandé & Par défaut)
Le contrôle d'intégrité est pris en charge directement par le silicium de la puce LoRa. Le paquet LoRa physique se compose uniquement du Header Applicatif et des Données Utiles.
* **Taille totale** : $3 + N$ octets (où $N$ est la taille des données utiles, $N = 33$ pour Wasp-TX).

```
┌───────────────────────────────────────────────────────────┬───────────────────┐
│                          HEADER                           │      PAYLOAD      │
├───────────────────────────────────────────────────────────┼───────────────────┤
│       SSID_NUM       │     APID      │     SSID_TYPE      │      N data       │
│        1 Byte        │    1 Byte     │       1 Byte       │       bytes       │
│       (0-255)        │    (0-63)     │       (0-3)        │     (N bytes)     │
└──────────────────────┴───────────────┴────────────────────┴───────────────────┘
```

### Option B : Format avec CRC logiciel (Si le CRC matériel est désactivé)
Si le CRC matériel est désactivé (`AT+CRC=0`), le tracker calcule un CRC16 logiciel et l'ajoute à la fin de la charge utile LoRa.
* **Taille totale** : $5 + N$ octets.

```
┌───────────────────────────────────────────────────────────┬───────────────────┬───────────────┐
│                          HEADER                           │      PAYLOAD      │    CONTROL    │
├───────────────────────────────────────────────────────────┼───────────────────┼───────────────┤
│       SSID_NUM       │     APID      │     SSID_TYPE      │      N data       │     CRC16     │
│        1 Byte        │    1 Byte     │       1 Byte       │       bytes       │    2 Bytes    │
│       (0-255)        │    (0-63)     │       (0-3)        │     (N bytes)     │  (Software)   │
└──────────────────────┴───────────────┴────────────────────┴───────────────────┴───────────────┘
```

### Description des octets de la trame radio

| Position | Type | Nom du Champ | Description |
| :--- | :--- | :--- | :--- |
| **Octet 0** | `uint8_t` | `SSID_NUM` | ID ou numéro unique du tracker (de 0 à 255). |
| **Octet 1** | `uint8_t` | `APID` | Identifiant du processus applicatif / type de paquet (de 0 à 63). |
| **Octet 2** | `uint8_t` | `SSID_TYPE` | Type de mission (`0` = FX, `1` = MF, `2` = BALLOON, `3` = OTHER). |
| **Octets 3 à 2+N** | `uint8_t[]` | `Payload` | Charge utile contenant les données brutes des capteurs ($N$ octets). Pour Wasp-TX, cela correspond à la structure `wasp_payload_t` de 33 octets. |
| **Octets 3+N à 4+N** | `uint16_t` | `CRC16` | *(Option B uniquement)* Somme de contrôle logicielle de 2 octets en Little-Endian calculée sur les octets 0 à `2+N` inclus. |

---

## 💻 2. Format de la Trame Série NectarMC (Série USB & Bluetooth)

Lorsque Wasp-TX transmet la trame au PC sur le port série USB (en mode `AT+BINUSB=1`), il l'encapsule dans le format de trame binaire conforme au protocole NectarMC.
* **Taille totale** : $13 + N$ octets (avec $N = 33$, totalisant 46 octets).

> [!WARNING]
> **Évolution importante du format en fonction des versions :**
> La structure de la trame série transmise au PC (USB/Bluetooth) a évolué.
> * À partir de la version **v1.4.0**, la trame série fait **$13 + N$ octets** car elle inclut un horodatage absolu de 4 octets (`Timestamp` Epoch Unix) inséré juste après le bit de `SNR` et avant le `CRC16`.
> * Sur les versions antérieures (**v1.3.1 et inférieures**), la trame faisait **$9 + N$ octets** et ne comportait aucun horodatage (les octets après le `SNR` étaient directement les 2 octets du `CRC16`).

```
┌───────────────────────────────────────────┬───────────────────┬───────────────────────────────────────┬───────────────┐
│                 HEADER                    │      PAYLOAD      │               METADATA                │     CONTROL   │
├───────────────────────────────────────────┼───────────────────┼───────────────────────────────────────┼───────────────┤
│   MAGIC     │  Id_mission  │ payload_size │      N data       │  RSSI   │   SNR   │     Timestamp     │     CRC16     │
│   1 Byte    │   2 Bytes    │   1 Byte     │      bytes        │ 1 Byte  │ 1 Byte  │      4 Bytes      │    2 Bytes    │
│    0xEB     │ (Little-End) │   (N bytes)  │                   │(int8_t) │(int8_t) │ (uint32_t Little-E)│ (Little-End)  │
└─────────────┴──────────────┴──────────────┴───────────────────┴─────────┴─────────┴───────────────────┴───────────────┘
```

### Description des octets de la trame série

| Position | Type | Nom du Champ | Description |
| :--- | :--- | :--- | :--- |
| **Octet 0** | `uint8_t` | `MAGIC` | Marqueur de synchronisation de début de trame. Toujours égal à `0xEB`. |
| **Octets 1 à 2** | `uint16_t` | `Id_mission` | Identifiant de mission codé en Little-Endian. Regroupe :<br>- Le type de tracker (`SSID_TYPE`, bits 15-14)<br>- Le numéro du tracker (`SSID_NUM`, bits 13-6)<br>- L'identifiant de paquet (`APID`, bits 5-0) |
| **Octet 3** | `uint8_t` | `payload_size` | Longueur $N$ de la charge utile LoRa brute en octets (33 octets). |
| **Octets 4 à 3+N** | `uint8_t[]` | `Payload` | Données utiles brutes provenant de `wasp_payload_t` ($N$ octets). |
| **Octet 4+N** | `int8_t` | `RSSI` | Niveau de puissance du signal reçu en dBm. Entier signé (ex: `-85` dBm). |
| **Octet 5+N** | `int8_t` | `SNR` | Rapport signal/bruit multiplié par 4 pour conserver une résolution de 0.25 dB (ex: `38` pour 9.5 dB). |
| **Octets 6+N à 9+N** | `uint32_t` | `Timestamp` | Horodatage Unix Epoch (secondes) codé en Little-Endian. Récupéré depuis l'horloge RTC de la station. |
| **Octets 10+N à 11+N** | `uint16_t` | `CRC16` | Somme de contrôle logicielle de validation (CCITT 0x1021, initialisé à 0xFFFF, Little-Endian) calculée sur l'ensemble de la trame série (du Magic `0xEB` jusqu'au Timestamp inclus). |
| **Octet 12+N** | `char` | `Newline` | Caractère retour à la ligne `\n` (`0x0A`) facilitant la détection de fin et la journalisation. |

---

## 📈 Historique et Évolution des Versions

Pour s'assurer que vos parseurs et décodeurs côté PC (sur NectarMC ou votre propre Dashboard) fonctionnent correctement, voici le récapitulatif des versions de la station et l'impact sur le format des trames :

| Version | Taille Trame Série | Format de Trame Série | Nouveautés Majeures |
| :---: | :---: | :--- | :--- |
| **v1.4.0** <br>*(Courante)* | **$13 + N$ octets** | `MAGIC` (1B) + `Id_mission` (2B) + `Size` (1B) + `Payload` (NB) + `RSSI` (1B) + `SNR` (1B) + **`Timestamp` (4B)** + `CRC16` (2B) + `\n` (1B) | - Intégration du **Timestamp RTC** (Epoch Unix) de 4 octets.<br>- Ajout des commandes `AT+TIME` et `AT+TIME?` pour synchroniser l'horloge RTC.<br>- Commande `AT+CRC=<enable>[,mode]` pour configurer le type de CRC (CCITT/IBM).<br>- Vérification automatique du CRC logiciel par l'ESP32 en mode `AT+CRC=0`. |
| **v1.3.1** | **$9 + N$ octets** | `MAGIC` (1B) + `Id_mission` (2B) + `Size` (1B) + `Payload` (NB) + `RSSI` (1B) + `SNR` (1B) + `CRC16` (2B) + `\n` (1B) | - Version originale compatible NectarMC.<br>- CRC matériel obligatoire par défaut sur la liaison radio LoRa.<br>- Pas de timestamp de réception (l'heure était extrapolée sur le PC). |

---

## 📦 Structure binaire de la charge utile WASP (`wasp_payload_t` - 33 Octets)

La payload LoRa brute de Wasp-TX (`N = 33` octets) est packée à l'octet près (`#pragma pack(1)`) :

| Offset | Taille (octets) | Type       | Nom        | Description |
|--------|-----------------|------------|------------|-------------|
| 0      | 1               | `uint8_t`  | `id`       | Numéro de l'ID du Tracker (SSID Num) |
| 1      | 1               | `uint8_t`  | `apid`     | Application Process Identifier |
| 2      | 1               | `uint8_t`  | `type`     | Type de Tracker (SSID Type) |
| 3      | 4               | `uint32_t` | `utc`      | Horodatage Unix Epoch (Timestamp GPS) |
| 7      | 4               | `float`    | `lat`      | Latitude (encodage binaire IEEE 754) |
| 11     | 4               | `float`    | `lon`      | Longitude (encodage binaire IEEE 754) |
| 15     | 4               | `float`    | `alt`      | Altitude en mètres |
| 19     | 4               | `float`    | `spd`      | Vitesse en km/h |
| 23     | 4               | `float`    | `cog`      | Cap (Course Over Ground) en degrés |
| 27     | 2               | `uint16_t` | `vbat`     | Tension de la batterie en millivolts (mV) |
| 29     | 2               | `int16_t`  | `temp`     | Température interne (en 1/100 °C) |
| 31     | 1               | `uint8_t`  | `status`   | Bitmask d'états (ex: Bit 0 = Fix GPS Valide) |
| 32     | 1               | `uint8_t`  | `sats`     | Nombre de satellites GPS accrochés |
| **TOTAL**| **33 octets**   |            |            | |
