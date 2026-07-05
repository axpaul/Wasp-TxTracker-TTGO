# Guide Complet des Commandes AT — Wasp-TX v1.1.0

Ce document détaille toutes les commandes AT disponibles sur le tracker **Wasp-TX**.

Les commandes peuvent être envoyées via la **liaison série USB** (115200 baud) ou en sans-fil via la **liaison Bluetooth SPP** (nommé `Wasp-TX-<ID>`).

---

## 🔒 Sécurité et Format

> [!IMPORTANT]
> **Sécurité Anti-Conflit :**
> Toutes les commandes doivent obligatoirement commencer par le préfixe **`AT`**. Tout flux série ou Bluetooth ne débutant pas par ces deux lettres est silencieusement ignoré. Cela évite tout conflit avec des trames de données binaires de télémétrie.

* Les commandes sont insensibles à la casse (ex: `at+freq?` et `AT+FREQ?` sont identiques).
* Chaque commande se termine par un retour chariot (`\r\n` ou `\n`).

---

## 💾 Sauvegarde en Mémoire Non-Volatile (NVS)

Pour éviter de devoir reconfigurer la carte après chaque redémarrage, les paramètres peuvent être stockés dans la mémoire flash de l'ESP32 (NVS) :
*   **Sauvegarde automatique** : Certaines commandes de fonctionnement sauvegardent immédiatement leur valeur en NVS dès qu'elles sont appelées (ex: `AT+INTERVAL`, `AT+BINUSB`).
*   **Sauvegarde manuelle** : Les configurations d'identifiants et de paramètres physiques radio (ex: `AT+FREQ`, `AT+SF`, `AT+BW`, `AT+POWER`, `AT+CRC`, `AT+ID`, `AT+TYPE`, `AT+APID`) s'appliquent immédiatement en mémoire vive (RAM) mais **nécessitent l'appel de la commande `AT+SAVE`** pour être stockées définitivement en NVS.

---

## 📋 Liste des Commandes AT

### 1. Système et Diagnostic

#### `AT`
*   **Rôle** : Vérifie la communication avec le tracker.
*   **Format de réponse** : `OK`

#### `AT+HELP` ou `AT?`
*   **Rôle** : Renvoie la liste complète de toutes les commandes supportées.
*   **Format de réponse** : Une liste textuelle des commandes, terminée par `OK`.

#### `AT+INFO` ou `AT+VER`
*   **Rôle** : Interroge l'identification du tracker et sa version de firmware.
*   **Format de réponse** : `+INFO: WASP-TX TRACKER,FW=1.0.0`

#### `AT+CFG` ou `AT+STATUS`
*   **Rôle** : Affiche un rapport de configuration et de diagnostic de la station.
*   **Format de réponse** : Un récapitulatif multiligne, terminé par `OK`.

---

### 2. Configuration Physique de la Radio

*Note : Ces commandes modifient les réglages en RAM. Utilisez la commande `AT+SAVE` pour les persister.*

#### `AT+FREQ?`
*   **Rôle** : Interroge la fréquence active (en MHz).
*   **Format de réponse** : `+FREQ: <frequence>` (ex: `+FREQ: 868.000`) suivi de `OK`.

#### `AT+FREQ=<mhz>`
*   **Rôle** : Modifie la fréquence active (ex: `AT+FREQ=868.500`).

#### `AT+SF?`
*   **Rôle** : Interroge le Spreading Factor LoRa.
*   **Format de réponse** : `+SF: <sf>` (ex: `+SF: 9`).

#### `AT+SF=<6-12>`
*   **Rôle** : Modifie le Spreading Factor LoRa.

#### `AT+BW?`
*   **Rôle** : Interroge la bande passante active (en kHz).
*   **Format de réponse** : `+BW: <bw>`.

#### `AT+BW=<khz>`
*   **Rôle** : Modifie la bande passante active.

#### `AT+POWER?`
*   **Rôle** : Interroge la puissance de transmission active (en dBm).
*   **Format de réponse** : `+POWER: <dbm>`.

#### `AT+POWER=<dbm>`
*   **Rôle** : Modifie la puissance de transmission (de 2 à 20 dBm).

#### `AT+CRC?`
*   **Rôle** : Interroge le statut du CRC matériel LoRa.
*   **Format de réponse** : `+CRC: <status>`.

#### `AT+CRC=<0|1>`
*   **Rôle** : Active (1) ou désactive (0) le CRC matériel LoRa.

---

### 3. Identifiants et Télémétrie

*Note : Ces commandes modifient les réglages en RAM. Utilisez la commande `AT+SAVE` pour les persister (sauf AT+INTERVAL qui est auto-sauvegardée).*

#### `AT+ID?`
*   **Rôle** : Interroge l'identifiant du tracker (SSID Num).
*   **Format de réponse** : `+ID: <id>`.

#### `AT+ID=<0-255>`
*   **Rôle** : Modifie l'identifiant du tracker.

#### `AT+TYPE?`
*   **Rôle** : Interroge le type de tracker (SSID Type).
*   **Format de réponse** : `+TYPE: <type>` (0=FX, 1=MF, 2=BALLOON, 3=OTHER).

#### `AT+TYPE=<0-3>`
*   **Rôle** : Modifie le type de mission.

#### `AT+APID?`
*   **Rôle** : Interroge l'identifiant du processus applicatif.
*   **Format de réponse** : `+APID: <apid>`.

#### `AT+APID=<0-255>`
*   **Rôle** : Modifie l'APID.

#### `AT+INTERVAL?`
*   **Rôle** : Interroge l'intervalle d'envoi en secondes.
*   **Format de réponse** : `+INTERVAL: <secondes>`.

#### `AT+INTERVAL=<sec>`
*   **Rôle** : Modifie l'intervalle d'envoi (de 1 à 3600 secondes).
*   **Sauvegarde NVS** : **Automatique** (sauvegardé immédiatement sans nécessiter `AT+SAVE`).

---

### 4. Paramètres de Sortie et Stockage

#### `AT+DEBUG?`
*   **Rôle** : Interroge l'activation des logs de débogage clairs sur le port USB.
*   **Format de réponse** : `+DEBUG: <0|1>` suivi de `OK`.

#### `AT+DEBUG=<0|1>`
*   **Rôle** : Active (1) ou désactive (0) les logs de débogage texte explicites sur le port USB.
*   **Sauvegarde NVS** : **Automatique** (sauvegardé immédiatement).
*   **Format de réponse** : `OK`.

#### `AT+BINUSB?`
*   **Rôle** : Interroge l'activation de la sortie binaire.

#### `AT+BINUSB=<0|1>`
*   **Rôle** : Active (1) ou désactive (0) l'émission des trames binaires NectarMC brutes sur le port USB.
*   **Sauvegarde NVS** : **Automatique** (sauvegardé immédiatement sans nécessiter `AT+SAVE`).

#### `AT+SAVE`
*   **Rôle** : Sauvegarde manuellement tous les réglages actifs modifiés (Radio, ID, APID) dans la mémoire Flash non-volatile (NVS).
*   **Format de réponse** : `OK`

#### `AT+RESET`
*   **Rôle** : Restaure les paramètres par défaut d'usine (y compris la NVS) et redémarre la carte.

