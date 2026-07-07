# 🏗️ Architecture Front-End — Wasp-TX Web Console

Ce document décrit l'architecture modulaire ("Vision Composant") de l'interface web de configuration et de suivi du tracker émetteur Wasp-TX.

---

## 📌 1. Principes Directeurs
*   **Séparation des Responsabilités (SoC)** : Division claire entre l'acquisition série, le décodage de la télémétrie locale, la gestion de l'état (State) et le rendu cartographique.
*   **Modularité (ES6 Modules)** : Utilisation des imports/exports natifs JavaScript pour garantir une structure saine et lisible.
*   **Paradigme Orienté Composant (Classes ES6)** : Encapsulation complète de la liaison série (`WaspSerial`) et du rendu de la carte (`WaspMap`).

---

## 🗂️ 2. Structure des Fichiers

L'organisation des fichiers sous le dossier `docs/` est la suivante :

```text
docs/
├── css/
│   └── style.css            # Thème cockpit unifié (NectarMC Cockpit Theme)
├── js/
│   ├── translate.js         # Dictionnaire i18n et logique de traduction globale
│   ├── serial.js            # Liaison série (Web Serial API), Flasher (ESPTool) et décodeur (Classe WaspSerial)
│   └── app.js               # Composant de rendu de la carte Leaflet (Classe WaspMap)
├── binaries/                # Firmwares .bin précompilés pour T-Beam v1.1/v1.2 (868/433 MHz)
└── index.html               # Structure HTML de la console tracker
```

---

## 🧩 3. Description des Composants JS

### A. Traduction (`js/translate.js`)
*   **Rôle** : Gère la localisation FR/EN.
*   **Responsabilités** :
    *   Exporte l'objet de dictionnaire `translations`.
    *   Sert de référentiel unique pour tous les labels multilingues de l'interface (Radio, Tracker, Flasher, Cockpit).

### B. Liaison Série, Décodage & Flasher (`js/serial.js` -> Class `WaspSerial`)
*   **Rôle** : Gestion du port COM, décodage de la payload binaire locale et flash de la carte.
*   **Responsabilités** :
    *   Ouverture/fermeture du port COM via l'API Web Serial.
    *   Calcul du CRC16-CCITT logiciel pour valider les trames série NectarMC.
    *   Décodage de la payload binaire `wasp_payload_t` de 32 octets pour mettre à jour les widgets de l'interface (Altitude, Vitesse, Satellites, Température, Batterie, Fix).
    *   Écriture des commandes AT de configuration radio et tracker.
    *   Interfaçage avec `esptool-js` pour flasher les binaires précompilés selon la carte choisie.

### C. Carte & Trajectoire (`js/app.js` -> Class `WaspMap`)
*   **Rôle** : Rendu cartographique et suivi du déplacement du tracker.
*   **Responsabilités** :
    *   Initialisation de la carte Leaflet avec la couche visuelle sombre (CartoDB Dark Matter).
    *   Tracé en direct de la ligne de trajectoire (limitée aux 50 derniers points).
    *   Déplacement du marqueur et déclenchement de la pulsation glow (`wasp-pulse`).
    *   Affichage et mise à jour dynamique des infobulles contextuelles du marqueur.
