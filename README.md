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

## Gestion de l'Alimentation, Boutons et LEDs

Wasp-TX intègre une gestion logique de l'alimentation, des boutons physiques et des indicateurs lumineux de la carte TTGO T-Beam :

### Fonctions des Boutons

*   **Bouton d'Alimentation (PEKEY)** :
    *   **Allumage** : Un appui simple de ~1 seconde démarre proprement la carte.
    *   **Extinction complète (Software Power Off)** : Un clic ou double-clic (selon la version de T-Beam) envoie un signal d'extinction logicielle complète. Le PMU coupe alors l'alimentation électrique de la radio et du GPS, puis ordonne l'extinction matérielle globale (`PMU.shutdown()`).
    *   *Note : Si le câble USB reste branché, la tension VBUS maintient l'alimentation de l'ESP32 ; la carte bascule alors automatiquement en veille profonde (Deep Sleep).*

*   **Bouton Utilisateur (GPIO 38)** :
    *   **Appui Court** : Alterne entre le **Mode Vol 🚀** (performance, fréquence d'envoi nominale, puissance radio max) et le **Mode Éco 🔋** (économie d'énergie, émission ralentie à 15s min, puissance réduite à 10 dBm).
    *   **Appui Long ($\ge 1.5$ seconde)** : Éteint le GPS et la radio et bascule immédiatement l'ESP32 en **veille Standby** (Deep Sleep, consommation < 15 µA).
    *   **Réveil (Wakeup)** : Si la carte est en veille Standby, un simple appui sur ce bouton (GPIO 38) réveille instantanément le tracker.

### Rôle des LEDs (Rouge vs Bleue)

*   **<span style="color:red">LED Rouge Utilisateur</span> (GPIO 4)** : C'est la seule LED pilotée par le programme. Elle est active à l'état bas (`LOW`).
    *   **Envoi Télémétrie** : Clignote **1 fois** court à chaque transmission en Mode Vol, et **2 fois** court en Mode Éco.
    *   **Changement de Mode** : Clignote **1 fois long** (400ms) pour confirmer le passage en Mode Vol, et **2 fois long** (350ms) pour le passage en Mode Éco.
    *   **Extinction/Veille** : Clignote rapidement 4 fois pour confirmer l'extinction logicielle, ou 1 fois long (400ms) pour confirmer la mise en veille Standby.
*   **<span style="color:blue">LED Bleue de Charge (CHG)</span>** : Cette LED n'est **pas pilotable logiquement**. Elle est câblée physiquement sur le circuit d'alimentation et s'allume automatiquement en bleu uniquement lorsqu'un accu est en cours de chargement via le port USB. Elle reste éteinte si la batterie est chargée ou absente.

---

## Structure du Code et Architecture

Wasp-TX est conçu de manière modulaire pour séparer les responsabilités et garder le point d'entrée du programme propre et lisible.

### 📁 Organisation des Fichiers
```mermaid
graph TD
    hdr["include/header.h<br><i>(Déclarations globales & brochage)</i>"] --> main["src/main.cpp<br><i>(Callbacks, Setup & Loop)</i>"]
    hdr --> gps["src/gps.cpp<br><i>(Tâche & variables GPS)</i>"]
    hdr --> pmu["src/pmu.cpp<br><i>(Alimentation & Veille PMU)</i>"]
    hdr --> radio["src/radio.cpp<br><i>(LoRa, Task & Modes)</i>"]
    hdr --> serial["src/serial.cpp<br><i>(Télémétrie & Trames Nectar)</i>"]
    hdr --> at["src/at_commands.cpp<br><i>(Traitement commandes AT)</i>"]

    main --> gps
    main --> pmu
    main --> radio
    main --> serial
    main --> at
```

### 📡 Contextes d'Exécution et Multicoeur (FreeRTOS)
Le firmware tire parti de l'architecture **double cœur de l'ESP32** pour séparer les tâches critiques (GPS) des tâches applicatives (Commandes AT, Bluetooth, boucle d'envoi).

*   **Le Cœur 1 (APP_CPU)** exécute la boucle principale `loop()` (qui gère les boutons et parse les commandes AT reçues via USB et Bluetooth) ainsi que l'envoi LoRa.
*   **Le Cœur 0 (PRO_CPU)** gère la pile Bluetooth système et la tâche prioritaire GPS en tâche de fond.

```mermaid
graph TD
    subgraph Coeur 0 [Cœur 0 : Système & GPS]
        GPS_Task["🛰️ gpsTask (Prio 2)<br>Lit & décode le GPS UART"]
        BT_Stack["🔵 Pile Bluetooth (Système)<br>Gère la liaison radio BT"]
    end

    subgraph Coeur 1 [Cœur 1 : Application, LoRa & AT]
        Loop["🔄 loop() (Prio 1)<br>- Lit les boutons physiques<br>- Parse les commandes AT (USB & BT)<br>- Déclenche la télémétrie"]
        Lora_Task["📡 loraTask (Prio 1)<br>Transmet les paquets LoRa"]
    end

    %% Communications inter-cœurs
    GPS_Task -->|🔒 gpsMutex| Loop
    BT_Stack <-->|Données Série Virtuelles| Loop
    Loop -->|📨 gpsQueue| Lora_Task
```

### 🛡️ Gestion des Interruptions LoRa & Watchdog Failsafe

Les firmwares de l'écosystème exploitent les interruptions matérielles sur la broche **DIO0** du SX1276 (signalant la fin d'une réception RX ou d'une émission TX) à l'aide de sémaphores FreeRTOS configurés avec un timeout de **2 secondes**. Leurs comportements de secours (*failsafe*) sont optimisés pour leurs rôles respectifs :

1. **Watchdog Thermique & Énergétique (Wasp-TX - Émetteur)** : Sur l'émetteur embarqué, la priorité est de protéger le matériel et l'autonomie. En émission LoRa, l'amplificateur RF consomme beaucoup de courant (~120 mA). Si le signal de fin d'émission sur DIO0 est manqué (glitch de registre, erreur SPI ou broche coupée), le module risquerait de rester bloqué en émission continue et de surchauffer. Après 2 secondes sans interruption, le watchdog de Wasp-TX force la radio en mode veille (`radio.standby()`) pour couper l'étage de puissance RF et préserver l'accu.
2. **Failsafe par Polling SPI (RocketStation Nectar - Récepteur)** : L'objectif de la station au sol est de ne perdre aucune trame de télémétrie en vol. Si la broche physique DIO0 subit une défaillance (soudure défectueuse, bruit parasite), la tâche RX bascule automatiquement après 2 secondes sur une scrutation active du registre radio par bus SPI (`radio.checkIrq(RADIOLIB_IRQ_RX_DONE)`). Si un paquet a été reçu, il est décodé et récupéré de force.

### Rôle et contenu de chaque fichier :
*   **[include/header.h](file:///c:/Users/paulm/OneDrive/Documents/PlatformIO/Projects/Wasp-TX/include/header.h)** : Déclarations globales. Définit le brochage (pinout) des cartes T-Beam v1.1 et v1.2, la structure binaire de la charge utile WASP (32 octets), la structure thread-safe `WaspGPSData`, et exporte les variables d'état partagées (comme le mode actif `currentMode`).
*   **[src/main.cpp](file:///c:/Users/paulm/OneDrive/Documents/PlatformIO/Projects/Wasp-TX/src/main.cpp)** : Séquenceur principal. Contient `setup()`, `loop()`, l'interruption du timer (`onTimer()`), et la boucle de contrôle avec anti-rebond pour le bouton utilisateur. Il se concentre sur l'initialisation matérielle et la gestion logique globale.
*   **[src/gps.cpp](file:///c:/Users/paulm/OneDrive/Documents/PlatformIO/Projects/Wasp-TX/src/gps.cpp)** : Télémétrie GPS. Contient l'instance de `TinyGPSPlus`, les variables et verrous d'échange (`gpsMutex`, `sharedGPSData`), ainsi que la tâche d'arrière-plan autonome `gpsTask()` s'exécutant sur le Cœur 0 pour le décodage NMEA.
*   **[src/pmu.cpp](file:///c:/Users/paulm/OneDrive/Documents/PlatformIO/Projects/Wasp-TX/src/pmu.cpp)** : Gestion d'énergie (PMU AXP192/AXP2101). Initialise le circuit d'alimentation, gère l'extinction logicielle complète (`gracefulShutdown()`) et la veille profonde (`enterStandbyMode()`).
*   **[src/radio.cpp](file:///c:/Users/paulm/OneDrive/Documents/PlatformIO/Projects/Wasp-TX/src/radio.cpp)** : Émission radio. Gère l'initialisation de la radio SX1276, la tâche FreeRTOS `loraTask()` de transmission (avec modulation du clignotement de la LED rouge) et applique la configuration de puissance/débit via `configureMode()`.
*   **[src/serial.cpp](file:///c:/Users/paulm/OneDrive/Documents/PlatformIO/Projects/Wasp-TX/src/serial.cpp)** : Communication série et télémétrie. Assemble de manière thread-safe le paquet WASP (avec encodage du mode actif sur le bit 5 du statut) et émet la trame NectarMC cryptée/CRC sur USB et Bluetooth.
*   **[src/at_commands.cpp](file:///c:/Users/paulm/OneDrive/Documents/PlatformIO/Projects/Wasp-TX/src/at_commands.cpp)** : Interpréteur de commandes. Parse et exécute les commandes AT de configuration dynamique reçues sur l'USB ou le Bluetooth.

## External Libraries

Les dépendances du projet sont gérées via `platformio.ini`. Les bibliothèques suivantes sont requises pour le fonctionnement du firmware :

| Library | Version | Purpose |
| :--- | :--- | :--- |
| **RadioLib** | `^6.0.0` | Gestion de la communication radio LoRa |
| **ESP32Time** | `^2.0.0` | Gestion de l'horloge interne (RTC) |
| **XPowersLib** | `^0.2.6` | Gestion de l'alimentation (PMU AXP192/AXP2101) |
| **TinyGPSPlus** | `^1.0.3` | Décodage des trames de données GPS |

---

## Installation et Programmation du Firmware

Deux méthodes s'offrent à vous pour programmer votre carte TTGO T-Beam : utiliser les fichiers binaires précompilés (rapide), ou compiler le code source à l'aide de PlatformIO.

### Méthode 1 : Utilisation des Binaires Précompilés (Recommandé)

Si vous ne souhaitez pas compiler le projet, des fichiers `.bin` déjà compilés pour chaque variante matérielle sont disponibles dans le dossier **[binaries/](./binaries)**.

| Binaire à Flasher | Modèle de T-Beam | Fréquence LoRa | Puce PMU |
| :--- | :--- | :--- | :--- |
| **[Wasp-TX_v1.1_868MHz.bin](./binaries/Wasp-TX_v1.1_868MHz.bin)** | T-Beam v1.1 | **868 MHz** | AXP192 |
| **[Wasp-TX_v1.2_868MHz.bin](./binaries/Wasp-TX_v1.2_868MHz.bin)** | T-Beam v1.2 | **868 MHz** | AXP2101 |
| **[Wasp-TX_v1.1_433MHz.bin](./binaries/Wasp-TX_v1.1_433MHz.bin)** | T-Beam v1.1 | **433 MHz** | AXP192 |
| **[Wasp-TX_v1.2_433MHz.bin](./binaries/Wasp-TX_v1.2_433MHz.bin)** | T-Beam v1.2 | **433 MHz** | AXP2101 |

**Procédure de flash rapide :**
1. Connectez votre T-Beam en USB à votre ordinateur.
2. Ouvrez l'outil de flash en ligne **[ESP Web Flasher](https://esp.github.io/esptool-js/)** ou utilisez l'outil local **Esptool** en ligne de commande :
   ```bash
   esptool.py --chip esp32 --port COM_PORT write_flash 0x10000 binaries/Wasp-TX_v1.X_XXXMHz.bin
   ```
   *(Remplacez `COM_PORT` par le port de votre carte et spécifiez le bon fichier `.bin`)*.

---

### Méthode 2 : Compilation et Téléversement depuis les Sources (PlatformIO)

Si vous souhaitez modifier le code ou compiler vous-même le projet, vous devez utiliser **PlatformIO** (intégré à VS Code).

1. Ouvrez le dossier du projet `Wasp-TX` dans VS Code.
2. PlatformIO va charger le fichier de configuration `platformio.ini` et installer automatiquement les bibliothèques requises.
3. Utilisez les boutons de la barre d'état de PlatformIO ou lancez l'une des commandes suivantes dans le terminal intégré pour compiler et envoyer le programme :

#### 🛰️ Pour les versions 868 MHz (Standard)
*   **Pour T-Beam v1.1 (AXP192)** :
    ```bash
    pio run -e tbeam_v1_1_868 -t upload -t monitor
    ```
*   **Pour T-Beam v1.2 (AXP2101)** :
    ```bash
    pio run -e tbeam_v1_2_868 -t upload -t monitor
    ```

#### 🛰️ Pour les versions 433 MHz
*   **Pour T-Beam v1.1 (AXP192)** :
    ```bash
    pio run -e tbeam_v1_1_433 -t upload -t monitor
    ```
*   **Pour T-Beam v1.2 (AXP2101)** :
    ```bash
    pio run -e tbeam_v1_2_433 -t upload -t monitor
    ```

---

## Configuration Dynamique via les Commandes AT

Wasp-TX propose une interface interactive de commandes AT permettant de configurer la radio LoRa (fréquence, puissance, SF, bande passante), les identifiants NectarMC (ID, APID, Type) ou d'activer la sortie binaire USB en temps réel.

Les commandes peuvent être saisies sur la liaison USB-Série ou via Bluetooth SPP (nom : `Wasp-TX-<ID>`) avec une vitesse de `115200` bauds.

Pour obtenir la liste complète des commandes, leurs syntaxes et des exemples d'exécution :
👉 **[Consulter le Guide des Commandes AT](./AT_GUIDE.md)**

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

## Format des Trames (Radio & Série NectarMC)

Les données transitent sous le format standard **NectarMC** selon le canal de communication :

*   **Trames Radio LoRa (Bord → Station sol)** :
    Le tracker émet la structure `wasp_payload_t` de **32 octets** directement sur les ondes LoRa. Cette structure compacte contient son propre en-tête de routage (`id`, `apid`, `type`), l'horodatage UTC, les coordonnées GPS (latitude, longitude, altitude, vitesse, cap), la tension batterie, la température et un bitmask d'état (fix GPS, nombre de satellites, mode de fonctionnement).

*   **Trames Série NectarMC (Tracker → PC ou Station sol → PC)** :
    Trames binaires encapsulées avec Magic byte `0xEB`, `Id_mission` encodé sur 16 bits en Little-Endian (compactant SSID et APID), horodatage Epoch et CRC16-CCITT. La trame série Wasp-TX directe fait **42 octets** (4 octets de header + 29 octets de payload + 9 octets de métadonnées/CRC/LF).

> [!NOTE]
> La trame série émise directement par Wasp-TX **n'inclut pas** le champ `gs_flag` du protocole NectarMC complet. Lorsque la station sol [Nectar-RX](https://github.com/axpaul/Nectar-RxStation-LoRa32) relaie un paquet vers [NectarMC](https://github.com/mlavardin/NectarMC), elle le réencapsule dans le format complet à 5 octets de header avec le `gs_flag` approprié.

Pour consulter les schémas binaires complets, les descriptions détaillées de chaque octet, les tables d'encodage SSID/APID et les exemples :
👉 **[Consulter le Guide des Formats de Trames](./FRAME_GUIDE.md)**

---

## Contrôle d'Intégrité (CRC) et de Liaison

Pour garantir la fiabilité de la transmission des données de la fusée jusqu'à votre écran, deux niveaux de contrôle d'intégrité (CRC) sont appliqués :
1. **Liaison Radio LoRa (Tracker ➔ Station Sol)** : CRC matériel géré en silicium par le SX1276 (Option A, par défaut), ou CRC logiciel inséré dans la payload LoRa et validé en C++ par la station sol (Option B).
2. **Liaison Série & Bluetooth (Station Sol ➔ PC)** : CRC logiciel calculé par l'ESP32 et vérifié à la réception par le PC (NectarMC).

Pour une explication détaillée de ces deux niveaux de sécurité :
👉 **[Consulter le Guide de Contrôle d'Intégrité (CRC)](./CRC_GUIDE.md)**

---

## Documentation Complète de l'Écosystème NectarMC

| Document | Description |
| :--- | :--- |
| 👉 **[Guide des Formats de Trames](./FRAME_GUIDE.md)** | Structure des paquets LoRa (Air), des trames série NectarMC, et de la payload WASP de 32 octets. |
| 👉 **[Guide de Contrôle d'Intégrité (CRC)](./CRC_GUIDE.md)** | Description des deux niveaux de CRC (Radio LoRa et Liaison Série USB/Bluetooth). |
| 👉 **[Guide Complet des Commandes AT](./AT_GUIDE.md)** | Liste complète, formats et paramètres des commandes de configuration de la carte. |
| 📡 **[Station Sol Nectar-RX](https://github.com/axpaul/Nectar-RxStation-LoRa32)** | Firmware de la station de réception LoRa32 (formats de trames station sol, `gs_flag`, logs CSV). |
| 💻 **[NectarMC — Logiciel Sol](https://github.com/mlavardin/NectarMC)** | Logiciel de traitement, visualisation et enregistrement de la télémétrie (BDS, Grafana, InfluxDB). |
| 📖 **[Guide BDS NectarMC](https://github.com/mlavardin/NectarMC/blob/master/DOCUMENTATION/FRAME_FORMAT.md)** | Définition du format de description des trames (Binary Data Scheme) pour la décommutation dans NectarMC. |

