export const translations = {
  fr: {
    header_subtitle: "Centre de Contrôle Web WASP v1.0.6",
    conn_title: "🔌 Liaison Série USB",
    conn_baudrate: "Vitesse de transmission (Baud) :",
    conn_connect: "Connexion",
    conn_disconnect: "Déconnexion",
    conn_status_label: "Statut :",
    conn_no_device: "Aucun appareil connecté",
    conn_connected: "Série Connectée",
    conn_disconnected: "Série Déconnectée",
    radio_title: "⚙️ Configuration Radio",
    radio_freq: "FRÉQUENCE (MHZ) :",
    radio_sf: "SPREADING FACTOR (SF) :",
    radio_bw: "BANDE PASSANTE (BW) :",
    radio_power: "PUISSANCE D'ÉMISSION :",
    radio_crc: "CRC MATÉRIEL :",
    btn_refresh: "RAFRAÎCHIR",
    btn_write: "APPLIQUER",
    btn_save: "SAUVEGARDER FLASH",
    btn_reset: "RÉINITIALISER",
    tracker_title: "🛸 Réglages Tracker",
    tracker_id: "TRACKER ID (SSID NUM) :",
    tracker_type: "TRACKER TYPE (SSID TYPE) :",
    tracker_apid: "APPLICATION ID (APID) :",
    tracker_interval: "INTERVALLE D'ENVOI (SEC) :",
    flasher_title: "⚡ Web Flasher Wasp-TX",
    flasher_desc: "Flashez directement le firmware sur la carte ESP32 depuis le navigateur.",
    flasher_board: "Sélection de la carte :",
    flasher_btn: "Flasher la carte",
    decrypted_title: "🛰️ Télémétrie Wasp Décryptée",
    lbl_altitude: "ALTITUDE (M)",
    lbl_speed: "VITESSE (KM/H)",
    lbl_satellites: "SATELLITES",
    lbl_temperature: "TEMPÉRATURE (°C)",
    lbl_battery: "BATTERIE (V)",
    lbl_gps_fix: "FIX GPS",
    map_title: "🗺️ Position GPS Live",
    map_auto_center: "Auto-Centrer",
    table_title: "📋 Trames reçues en direct (NectarMC)",
    th_index: "Index",
    th_timestamp: "Horodatage",
    th_tracker: "Tracker (SSID)",
    th_apid: "APID",
    th_size: "Taille",
    th_altitude: "Altitude",
    th_battery: "Batterie",
    th_crc: "CRC",
    th_payload: "Charge Utile (Hex)",
    table_empty: "Aucune trame reçue pour l'instant. Connectez le port série et allumez vos émetteurs.",
    terminal_title: "📟 Console & Terminal",
    terminal_placeholder: "Tapez une commande AT (ex: AT, AT+FREQ?, AT+CFG)...",
    btn_send: "Envoyer",
    at_helper: "📋 Aide-Mémoire AT",
    btn_export: "Exporter CSV",
    btn_clear: "Effacer"
  },
  en: {
    header_subtitle: "WASP Web Control Center v1.0.6",
    conn_title: "🔌 USB Serial Link",
    conn_baudrate: "Baud rate:",
    conn_connect: "Connect",
    conn_disconnect: "Disconnect",
    conn_status_label: "Status:",
    conn_no_device: "No device connected",
    conn_connected: "Serial Connected",
    conn_disconnected: "Serial Disconnected",
    radio_title: "⚙️ Radio Settings",
    radio_freq: "FREQUENCY (MHZ):",
    radio_sf: "SPREADING FACTOR (SF):",
    radio_bw: "BANDWIDTH (BW):",
    radio_power: "TRANSMIT POWER:",
    radio_crc: "HARDWARE CRC:",
    btn_refresh: "REFRESH",
    btn_write: "WRITE CONFIG",
    btn_save: "SAVE TO FLASH",
    btn_reset: "RESET",
    tracker_title: "🛸 Tracker Settings",
    tracker_id: "TRACKER ID (SSID NUM):",
    tracker_type: "TRACKER TYPE (SSID TYPE):",
    tracker_apid: "APPLICATION ID (APID):",
    tracker_interval: "TRANSMIT INTERVAL (SEC):",
    flasher_title: "⚡ Web Flasher Wasp-TX",
    flasher_desc: "Flash the firmware directly to your ESP32 board from your browser.",
    flasher_board: "Select board:",
    flasher_btn: "Flash Board",
    decrypted_title: "🛰️ Decrypted Wasp Telemetry",
    lbl_altitude: "ALTITUDE (M)",
    lbl_speed: "SPEED (KM/H)",
    lbl_satellites: "SATELLITES",
    lbl_temperature: "TEMPERATURE (°C)",
    lbl_battery: "BATTERY (V)",
    lbl_gps_fix: "GPS FIX",
    map_title: "🗺️ Live GPS Position",
    map_auto_center: "Auto-Center",
    table_title: "📋 Live received frames (NectarMC)",
    th_index: "Index",
    th_timestamp: "Timestamp",
    th_tracker: "Tracker (SSID)",
    th_apid: "APID",
    th_size: "Size",
    th_altitude: "Altitude",
    th_battery: "Battery",
    th_crc: "CRC",
    th_payload: "Payload (Hex)",
    table_empty: "No frames received yet. Connect the serial port and power on your trackers.",
    terminal_title: "📟 Console & Terminal",
    terminal_placeholder: "Type an AT command (e.g. AT, AT+FREQ?, AT+CFG)...",
    btn_send: "Send",
    at_helper: "📋 AT Quick Reference",
    btn_export: "Export CSV",
    btn_clear: "Clear"
  }
};

export function updateLanguage(lang) {
  localStorage.setItem('wasp_lang', lang);
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[lang][key]) {
      el.textContent = translations[lang][key];
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (translations[lang][key]) {
      el.setAttribute('placeholder', translations[lang][key]);
    }
  });
  
  // Custom: Update map attribution dynamically if required
  document.documentElement.setAttribute('lang', lang);
}

document.addEventListener('DOMContentLoaded', () => {
  const btnFr = document.getElementById('btn-lang-fr');
  const btnEn = document.getElementById('btn-lang-en');
  
  const savedLang = localStorage.getItem('wasp_lang') || 'fr';
  updateLanguage(savedLang);
  
  if (savedLang === 'en') {
    btnFr?.classList.remove('active');
    btnEn?.classList.add('active');
  } else {
    btnFr?.classList.add('active');
    btnEn?.classList.remove('active');
  }
  
  btnFr?.addEventListener('click', () => {
    btnFr.classList.add('active');
    btnEn?.classList.remove('active');
    updateLanguage('fr');
    window.dispatchEvent(new CustomEvent('lang-changed', { detail: 'fr' }));
  });
  
  btnEn?.addEventListener('click', () => {
    btnEn.classList.add('active');
    btnFr?.classList.remove('active');
    updateLanguage('en');
    window.dispatchEvent(new CustomEvent('lang-changed', { detail: 'en' }));
  });
});
