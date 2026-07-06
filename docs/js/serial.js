import { ESPLoader, Transport } from 'https://cdn.jsdelivr.net/npm/esptool-js@0.6.0/+esm';
import { translations } from './translate.js';

/**
 * @class WaspSerial
 * @brief Composant de gestion de la liaison série USB, du décodage de trames NectarMC et du flashage de firmware.
 */
class WaspSerial {
  constructor() {
    this.port = null;
    this.reader = null;
    this.keepReading = true;
    this.frameIndex = 0;
    this.rxBuffer = [];
    
    // Éléments du DOM mis en cache
    this.dom = {
      btnConnect: document.getElementById('btn-connect'),
      btnDisconnect: document.getElementById('btn-disconnect'),
      connBadge: document.getElementById('conn-badge'),
      terminalLogs: document.getElementById('terminal-logs'),
      terminalInput: document.getElementById('terminal-input'),
      btnSend: document.getElementById('btn-send'),
      terminalForm: document.getElementById('terminal-form'),
      telemetryTbody: document.getElementById('telemetry-tbody'),
      lblEmptyTelemetry: document.getElementById('row-empty'),
      
      // Widgets de télémétrie décodée
      statAlt: document.getElementById('stat-alt'),
      statSpd: document.getElementById('stat-spd'),
      statSat: document.getElementById('stat-sat'),
      statTemp: document.getElementById('stat-temp'),
      statBat: document.getElementById('stat-bat'),
      statFix: document.getElementById('stat-fix'),
      
      // Panneau Radio
      inputFreq: document.getElementById('input-freq'),
      selectSf: document.getElementById('select-sf'),
      selectBw: document.getElementById('select-bw'),
      selectPower: document.getElementById('select-power'),
      selectCrc: document.getElementById('select-crc'),
      btnReadCfg: document.getElementById('btn-read-cfg'),
      btnWriteCfg: document.getElementById('btn-write-cfg'),
      btnSaveCfg: document.getElementById('btn-save-cfg'),
      btnResetCfg: document.getElementById('btn-reset-cfg'),
      btnPreset868: document.getElementById('btn-preset-868'),
      btnPreset433: document.getElementById('btn-preset-433'),

      // Panneau Tracker
      inputTrackerId: document.getElementById('input-tracker-id'),
      selectTrackerType: document.getElementById('select-tracker-type'),
      inputApid: document.getElementById('input-apid'),
      inputInterval: document.getElementById('input-interval'),
      btnReadTracker: document.getElementById('btn-read-tracker'),
      btnWriteTracker: document.getElementById('btn-write-tracker'),
      
      // Outils
      btnReadTerminal: document.getElementById('btn-read-terminal'),
      btnClearTelemetry: document.getElementById('btn-clear-telemetry'),
      btnFlash: document.getElementById('btn-flash'),
      flashProgressContainer: document.getElementById('flash-progress-container'),
      flashProgressBar: document.getElementById('flash-progress-bar'),
      lblFlashStatus: document.getElementById('lbl-flash-status'),
      lblFlashPercent: document.getElementById('lbl-flash-percent'),
      boardSelect: document.getElementById('board-select'),
      flashBandSelect: document.getElementById('flash-band-select')
    };

    this.checkBrowserSupport();
    this.initEvents();
    this.updateDynamicUI();
  }

  checkBrowserSupport() {
    if (!("serial" in navigator)) {
      if (this.dom.connBadge) {
        this.dom.connBadge.textContent = "Web Serial Non Supporté";
        this.dom.connBadge.style.background = "var(--color-danger)";
        this.dom.connBadge.title = "L'API Web Serial nécessite Chrome/Edge et un accès via HTTPS ou localhost.";
      }
      if (this.dom.btnConnect) this.dom.btnConnect.disabled = true;
      this.appendLog("ERREUR CRITIQUE: L'API Web Serial n'est pas disponible.", 'sys-out');
      this.appendLog("Assurez-vous d'utiliser Chrome/Edge et d'ouvrir ce site via HTTPS ou un serveur local (localhost), et non 'file:///'.", 'sys-out');
    }
  }

  initEvents() {
    // Connexion / Déconnexion série
    this.dom.btnConnect?.addEventListener('click', () => this.connect());
    this.dom.btnDisconnect?.addEventListener('click', () => this.disconnect());

    // Envoi de commande terminal
    this.dom.terminalForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.dom.terminalInput) {
        const val = this.dom.terminalInput.value.trim();
        if (val) {
          this.sendData(val);
          this.dom.terminalInput.value = '';
        }
      }
    });

    // Nettoyage logs console
    this.dom.btnReadTerminal?.addEventListener('click', () => {
      if (this.dom.terminalLogs) this.dom.terminalLogs.innerHTML = '';
    });

    // Nettoyage télémétrie
    this.dom.btnClearTelemetry?.addEventListener('click', () => this.clearTelemetryData());

    // Lecture / Écriture Configuration Radio
    this.dom.btnReadCfg?.addEventListener('click', () => this.readRadioConfig());
    this.dom.btnWriteCfg?.addEventListener('click', () => this.writeRadioConfig());
    this.dom.btnSaveCfg?.addEventListener('click', () => this.sendData('AT+SAVE'));
    this.dom.btnResetCfg?.addEventListener('click', () => this.sendData('AT+RESET'));

    // Presets Rapides Radio (868 & 433 MHz)
    this.dom.btnPreset868?.addEventListener('click', () => this.applyRadioPreset(869.525));
    this.dom.btnPreset433?.addEventListener('click', () => this.applyRadioPreset(433.000));

    // Lecture / Écriture Configuration Tracker
    this.dom.btnReadTracker?.addEventListener('click', () => this.readTrackerConfig());
    this.dom.btnWriteTracker?.addEventListener('click', () => this.writeTrackerConfig());

    // Flash firmware
    this.dom.btnFlash?.addEventListener('click', () => this.flashFirmware());

    // Écouteur de langue
    window.addEventListener('lang-changed', () => {
      this.updateDynamicUI();
      this.renderAtHelperList();
    });

    // Détection de déconnexion physique
    navigator.serial?.addEventListener('disconnect', (event) => {
      if (this.port && event.target === this.port) {
        this.appendLog("Déconnexion physique détectée.", 'sys-out');
        this.disconnect();
      }
    });
  }

  async connect() {
    try {
      this.port = await navigator.serial.requestPort();
      const baudSelect = document.getElementById('baudrate');
      const selectedBaud = baudSelect ? parseInt(baudSelect.value, 10) : 115200;
      await this.port.open({ baudRate: selectedBaud });

      if (this.dom.connBadge) {
        this.dom.connBadge.classList.remove('disconnected');
        this.dom.connBadge.classList.add('connected');
      }
      if (this.dom.btnConnect) this.dom.btnConnect.disabled = true;
      if (this.dom.btnDisconnect) this.dom.btnDisconnect.disabled = false;
      if (this.dom.terminalInput) this.dom.terminalInput.disabled = false;
      if (this.dom.btnSend) this.dom.btnSend.disabled = false;

      // Activer les contrôles
      this.toggleConfigControls(false);
      this.updateDynamicUI();

      this.keepReading = true;
      this.appendLog("--- Connexion Série Établie ---", 'sys-out');
      this.readLoop();

    } catch (err) {
      console.error('Erreur de connexion série', err);
      alert('Erreur lors de la connexion au port série : ' + err.message);
    }
  }

  async disconnect() {
    this.keepReading = false;
    if (this.reader) {
      await this.reader.cancel().catch(e => console.error("Reader cancel error:", e));
      this.reader = null;
    }
    if (this.port) {
      await this.port.close().catch(e => console.error("Port close error:", e));
      this.port = null;
    }

    if (this.dom.connBadge) {
      this.dom.connBadge.classList.remove('connected');
      this.dom.connBadge.classList.add('disconnected');
    }
    if (this.dom.btnConnect) this.dom.btnConnect.disabled = false;
    if (this.dom.btnDisconnect) this.dom.btnDisconnect.disabled = true;
    if (this.dom.terminalInput) this.dom.terminalInput.disabled = true;
    if (this.dom.btnSend) this.dom.btnSend.disabled = true;

    // Désactiver les contrôles
    this.toggleConfigControls(true);
    this.updateDynamicUI();

    this.appendLog("--- Déconnecté ---", 'sys-out');
  }

  toggleConfigControls(disabledState) {
    document.querySelectorAll('.config-panel input, .config-panel select, .config-panel button').forEach(el => {
      if (el.id !== 'board-select' && el.id !== 'flash-band-select' && el.id !== 'btn-flash') {
        el.disabled = disabledState;
      }
    });
  }

  updateDynamicUI() {
    const lang = localStorage.getItem('wasp_lang') || 'fr';
    const isConnected = this.port && this.port.readable;
    
    if (isConnected) {
      if (this.dom.connBadge) this.dom.connBadge.textContent = this.getTranslation('conn_connected');
      const portInfo = this.port.getInfo();
      const portDesc = this.getFriendlyPortName(portInfo);
      const lblPortName = document.getElementById('lbl-port-name');
      if (lblPortName) lblPortName.textContent = this.getTranslation('conn_port_prefix') + portDesc;
    } else {
      if (this.dom.connBadge) this.dom.connBadge.textContent = this.getTranslation('conn_disconnected');
      const lblPortName = document.getElementById('lbl-port-name');
      if (lblPortName) lblPortName.textContent = this.getTranslation('conn_no_device');
    }
  }

  async readLoop() {
    this.reader = this.port.readable.getReader();
    let localBuffer = new Uint8Array(0);

    try {
      while (this.keepReading) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          let newBuffer = new Uint8Array(localBuffer.length + value.length);
          newBuffer.set(localBuffer);
          newBuffer.set(value, localBuffer.length);
          localBuffer = newBuffer;
          
          localBuffer = this.processBuffer(localBuffer);
        }
      }
    } catch (error) {
      console.error('Erreur de lecture:', error);
      this.appendLog("Erreur de lecture: " + error.message, 'sys-out');
    } finally {
      if (this.reader) {
        this.reader.releaseLock();
        this.reader = null;
      }
    }
  }

  // --- PARSING ET DECODAGE ---
  calculateCRC16(data, len) {
    let crc = 0xFFFF;
    for (let i = 0; i < len; i++) {
      crc ^= (data[i] << 8);
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
        } else {
          crc = (crc << 1) & 0xFFFF;
        }
      }
    }
    return crc;
  }

  processBuffer(buf) {
    if (buf.length > 4096) {
      buf = buf.slice(buf.length - 1024); // Anti-overflow
    }
    let offset = 0;
    while (offset < buf.length) {
      // 1. Détection de trame binaire NectarMC (MAGIC = 0xEB)
      if (buf[offset] === 0xEB) {
        if (buf.length >= offset + 5) {
          // Détection automatique du format (Nouveau standard avec gs_flag vs Ancien format)
          // Si l'octet 3 (gs_flag dans le nouveau format, payloadSize dans l'ancien) est <= 4, c'est le gs_flag
          let isNewFormat = buf[offset + 3] <= 4;
          
          let payloadSize = 0;
          let gsFlag = 0;
          let frameLength = 0;
          let hasTimestamp = false;
          let hasRssi = false;
          let hasSnr = false;
          
          if (isNewFormat) {
            gsFlag = buf[offset + 3];
            payloadSize = buf[offset + 4];
            hasRssi = (gsFlag & 0x01) !== 0;
            hasSnr = (gsFlag & 0x02) !== 0;
            hasTimestamp = (gsFlag !== 0);
            
            frameLength = 5 + payloadSize + (hasRssi ? 1 : 0) + (hasSnr ? 1 : 0) + (hasTimestamp ? 4 : 0) + 2;
          } else {
            // Ancien format (v1.3.1 ou v1.4.0)
            payloadSize = buf[offset + 3];
            let frameLength140 = payloadSize + 13; // avec timestamp et \n final
            let frameLength131 = payloadSize + 9;  // sans timestamp avec \n final
            
            if (buf.length >= offset + frameLength140 && buf[offset + frameLength140 - 1] === 0x0A) {
              frameLength = frameLength140;
              hasTimestamp = true;
            } else if (buf.length >= offset + frameLength131 && buf[offset + frameLength131 - 1] === 0x0A) {
              frameLength = frameLength131;
              hasTimestamp = false;
            }
            
            hasRssi = true;
            hasSnr = true;
          }
          
          if (frameLength > 0 && buf.length >= offset + frameLength) {
            let frame = buf.slice(offset, offset + frameLength);
            this.parseNectarFrame(frame, isNewFormat, gsFlag, payloadSize, hasTimestamp, hasRssi, hasSnr);
            offset += frameLength;
            
            // Consommer le saut de ligne résiduel s'il y en a un juste après
            if (offset < buf.length && buf[offset] === 0x0A) {
              offset++;
            }
            continue;
          } else {
            break; // Attente d'octets supplémentaires
          }
        } else {
          break; // Attente d'octets supplémentaires
        }
      }
      
      // 2. Détection de ligne de texte (boot logs, réponses AT)
      let newlineIdx = buf.indexOf(10, offset);
      if (newlineIdx !== -1) {
        let lineBuf = buf.slice(offset, newlineIdx);
        let lineStr = new TextDecoder().decode(lineBuf).trim();
        if (lineStr.length > 0) {
          this.appendLog(lineStr);
          this.parseIncomingTextLine(lineStr);
        }
        offset = newlineIdx + 1;
      } else {
        break; // Attente de fin de ligne
      }
    }
    return buf.slice(offset);
  }

  parseNectarFrame(frame, isNewFormat, gsFlag, payloadSize, hasTimestamp, hasRssi, hasSnr) {
    let dv = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    
    // Décodage ID mission (SSID + APID)
    let id_mission = dv.getUint16(1, true);
    let ssid_type = (id_mission >> 14) & 0x03;
    let ssid_num = (id_mission >> 6) & 0xFF;
    let apid = id_mission & 0x3F;
    
    let offset = isNewFormat ? 5 : 4;
    let payloadBytes = frame.slice(offset, offset + payloadSize);
    offset += payloadSize;
    
    let rssi = 0;
    let snr = 0;
    
    if (hasRssi) {
      rssi = dv.getInt8(offset);
      offset += 1;
    }
    
    if (hasSnr) {
      snr = dv.getInt8(offset);
      offset += 1;
    }
    
    let tsEpoch = 0;
    if (hasTimestamp) {
      tsEpoch = dv.getUint32(offset, true);
      offset += 4;
    } else {
      tsEpoch = Math.floor(Date.now() / 1000);
    }
    
    // Le CRC16 est sur les 2 octets à la fin de la trame (avant le LF éventuel)
    let receivedCRC = dv.getUint16(offset, true);
    let computedCRC = this.calculateCRC16(frame, offset);
    let crcOK = (receivedCRC === computedCRC);
    
    let payloadHex = Array.prototype.map.call(payloadBytes, x => ('0' + x.toString(16)).toUpperCase()).join(' ');
    
    const MISSION_TYPES = ["FX", "MF", "BALLOON", "OTHER"];
    let trackerSSID = `${MISSION_TYPES[ssid_type]}-${ssid_num}`;
    
    let latVal = 'N/A';
    let lonVal = 'N/A';
    let altVal = 'N/A';
    let batVal = 'N/A';
    
    // Décryptage de la payload WASP (29 octets)
    if (payloadSize === 29 && crcOK) {
      let payloadDv = new DataView(payloadBytes.buffer, payloadBytes.byteOffset, payloadBytes.byteLength);
      let utc = payloadDv.getUint32(0, true);
      let lat = payloadDv.getFloat32(4, true);
      let lon = payloadDv.getFloat32(8, true);
      let alt = payloadDv.getFloat32(12, true);
      let spd = payloadDv.getFloat32(16, true);
      let cog = payloadDv.getFloat32(20, true);
      let vbat = payloadDv.getUint16(24, true);
      let temp = payloadDv.getInt16(26, true);
      
      let statusByte = payloadDv.getUint8(28);
      let sats = statusByte & 0x1F;
      let gpsFix = (statusByte >> 7) & 0x01;
      let mode = (statusByte >> 5) & 0x01;
      
      latVal = lat.toFixed(6);
      lonVal = lon.toFixed(6);
      altVal = `${alt.toFixed(1)} m`;
      batVal = `${(vbat / 1000).toFixed(2)} V`;
      
      // Update widgets
      if (this.dom.statAlt) this.dom.statAlt.textContent = alt.toFixed(1);
      if (this.dom.statSpd) this.dom.statSpd.textContent = spd.toFixed(1);
      if (this.dom.statSat) this.dom.statSat.textContent = sats;
      if (this.dom.statTemp) this.dom.statTemp.textContent = (temp / 100).toFixed(1);
      if (this.dom.statBat) this.dom.statBat.textContent = (vbat / 1000).toFixed(2);
      
      if (this.dom.statFix) {
        const lang = localStorage.getItem('wasp_lang') || 'fr';
        let modeText = mode === 1 ? (lang === 'en' ? 'Eco' : 'Éco') : (lang === 'en' ? 'Flight' : 'Vol');
        if (gpsFix) {
          this.dom.statFix.textContent = `${lang === 'en' ? 'Valid' : 'Valide'} (${modeText})`;
          this.dom.statFix.style.color = '#10b981';
        } else {
          this.dom.statFix.textContent = `${lang === 'en' ? 'No Fix' : 'Aucun Fix'} (${modeText})`;
          this.dom.statFix.style.color = '#ef4444';
        }
      }
      
      const activeUtc = utc || tsEpoch;
      const timeStr = new Date(activeUtc * 1000).toISOString().substring(11, 19);
      
      // Mise à jour de la carte Leaflet
      if (window.waspMapInstance) {
        window.waspMapInstance.updatePosition(lat, lon, {
          tracker: trackerSSID,
          apid: apid,
          alt: alt,
          spd: spd,
          cog: cog,
          gpsFix: gpsFix,
          sats: sats,
          time: timeStr,
          mode: mode
        });
      }
    }
    
    // Ajout à la table de télémétrie brute
    this.addNectarFrameToTable({
      ts: new Date(tsEpoch * 1000).toISOString().replace('T', ' ').substring(0, 19),
      tracker: trackerSSID,
      lat: latVal,
      lon: lonVal,
      alt: altVal,
      bat: batVal,
      crc: crcOK ? '<span style="color: var(--color-success)">OK</span>' : '<span style="color: var(--color-danger)">KO</span>',
      payload: payloadHex
    });
  }

  addNectarFrameToTable(f) {
    if (this.dom.lblEmptyTelemetry) this.dom.lblEmptyTelemetry.style.display = 'none';
    this.frameIndex++;
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${this.frameIndex}</td>
      <td style="font-family: var(--font-mono);">${f.ts}</td>
      <td style="color: var(--color-cyan); font-weight: 600;">${f.tracker}</td>
      <td style="font-family: var(--font-mono);">${f.lat}</td>
      <td style="font-family: var(--font-mono);">${f.lon}</td>
      <td>${f.alt}</td>
      <td>${f.bat}</td>
      <td>${f.crc}</td>
      <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-secondary); text-align: left; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${f.payload}">${f.payload}</td>
    `;
    this.dom.telemetryTbody?.prepend(tr);
    
    if (this.dom.telemetryTbody && this.dom.telemetryTbody.children.length > 50) {
      this.dom.telemetryTbody.removeChild(this.dom.telemetryTbody.lastChild);
    }
  }

  parseIncomingTextLine(line) {
    if (line.startsWith('[TX]')) {
      this.parseTelemetryText(line);
      return;
    }
    
    // Intercepter les valeurs de réponse AT
    try {
      if (line.startsWith('+FREQ:')) {
        if (this.dom.inputFreq) this.dom.inputFreq.value = parseFloat(line.split(':')[1].trim());
      } else if (line.startsWith('+SF:')) {
        if (this.dom.selectSf) this.dom.selectSf.value = parseInt(line.split(':')[1].trim(), 10);
      } else if (line.startsWith('+BW:')) {
        if (this.dom.selectBw) this.dom.selectBw.value = parseFloat(line.split(':')[1].trim());
      } else if (line.startsWith('+POWER:')) {
        if (this.dom.selectPower) this.dom.selectPower.value = parseInt(line.split(':')[1].trim(), 10);
      } else if (line.startsWith('+CRC:')) {
        let crcParts = line.split(':')[1].trim().split(',');
        if (this.dom.selectCrc) this.dom.selectCrc.value = crcParts[0].trim();
      } else if (line.startsWith('+ID:')) {
        if (this.dom.inputTrackerId) this.dom.inputTrackerId.value = parseInt(line.split(':')[1].trim(), 10);
      } else if (line.startsWith('+TYPE:')) {
        if (this.dom.selectTrackerType) this.dom.selectTrackerType.value = parseInt(line.split(':')[1].trim(), 10);
      } else if (line.startsWith('+INTERVAL:')) {
        if (this.dom.inputInterval) this.dom.inputInterval.value = parseInt(line.split(':')[1].trim(), 10);
      } else if (line.startsWith('+APID:')) {
        if (this.dom.inputApid) this.dom.inputApid.value = parseInt(line.split(':')[1].trim(), 10);
      }
    } catch(e) {
      console.error("Failed to parse AT response feedback:", e);
    }
  }

  parseTelemetryText(line) {
    try {
      const parts = line.split('|').map(p => p.trim());
      let d = { ts: '', pos: '', alt: '', spd: '', sat: '', temp: '', bat: '', rssi: '--', snr: '--' };
      
      parts.forEach(part => {
        if(part.startsWith('UTC:')) d.ts = part.split(':')[1];
        if(part.startsWith('POS:')) d.pos = part.split('POS:')[1];
        if(part.startsWith('ALT:')) d.alt = part.split(':')[1].replace('m','');
        if(part.startsWith('SPD:')) d.spd = part.split(':')[1].replace('km/h','');
        if(part.startsWith('T:')) d.temp = part.split(':')[1].replace('°C','');
        if(part.startsWith('SAT:')) d.sat = part.split(':')[1];
        if(part.startsWith('BAT:')) d.bat = part.split(':')[1].replace('mV','');
      });
      
      if (this.dom.statAlt && d.alt) this.dom.statAlt.textContent = parseFloat(d.alt).toFixed(1);
      if (this.dom.statSpd && d.spd) this.dom.statSpd.textContent = parseFloat(d.spd).toFixed(1);
      if (this.dom.statSat && d.sat) this.dom.statSat.textContent = d.sat;
      if (this.dom.statTemp && d.temp) this.dom.statTemp.textContent = parseFloat(d.temp).toFixed(1);
      if (this.dom.statBat && d.bat) this.dom.statBat.textContent = (parseFloat(d.bat) / 1000).toFixed(2);
      
      if (d.pos && window.waspMapInstance) {
        const coords = d.pos.split(',');
        if (coords.length === 2) {
          window.waspMapInstance.updatePosition(parseFloat(coords[0]), parseFloat(coords[1]));
        }
      }
    } catch(e) {
      console.error("Text parsing fallback failed:", e);
    }
  }

  appendLog(msg, className = '') {
    if (!this.dom.terminalLogs) return;
    const div = document.createElement('div');
    div.textContent = msg;
    if (className) div.className = className;
    this.dom.terminalLogs.appendChild(div);
    this.dom.terminalLogs.scrollTop = this.dom.terminalLogs.scrollHeight;
    
    if (this.dom.terminalLogs.children.length > 100) {
      this.dom.terminalLogs.removeChild(this.dom.terminalLogs.firstChild);
    }
  }

  async sendData(data) {
    if (!this.port || !this.port.writable) {
      this.appendLog("Erreur: Port série non prêt.", 'sys-out');
      return;
    }
    const encoder = new TextEncoder();
    const writer = this.port.writable.getWriter();
    try {
      await writer.write(encoder.encode(data + '\r\n'));
      this.appendLog('> ' + data, 'cmd-in');
    } catch(e) {
      console.error('Erreur d\'envoi:', e);
      this.appendLog("Erreur d'envoi: " + e.message, 'sys-out');
    } finally {
      writer.releaseLock();
    }
  }

  // --- ACTIONS DE CONFIGURATION ---
  readRadioConfig() {
    this.sendData('AT+FREQ?');
    setTimeout(() => this.sendData('AT+SF?'), 100);
    setTimeout(() => this.sendData('AT+BW?'), 200);
    setTimeout(() => this.sendData('AT+POWER?'), 300);
    setTimeout(() => this.sendData('AT+CRC?'), 400);
  }

  writeRadioConfig() {
    const freq = this.dom.inputFreq?.value;
    const sf = this.dom.selectSf?.value;
    const bw = this.dom.selectBw?.value;
    const power = this.dom.selectPower?.value;
    const crc = this.dom.selectCrc?.value;
    
    if (freq) this.sendData('AT+FREQ=' + freq);
    if (sf) setTimeout(() => this.sendData('AT+SF=' + sf), 100);
    if (bw) setTimeout(() => this.sendData('AT+BW=' + bw), 200);
    if (power) setTimeout(() => this.sendData('AT+POWER=' + power), 300);
    if (crc) setTimeout(() => this.sendData('AT+CRC=' + crc), 400);
  }

  applyRadioPreset(freqVal) {
    if (this.dom.inputFreq) this.dom.inputFreq.value = freqVal.toFixed(3);
    if (this.dom.selectSf) this.dom.selectSf.value = "8";
    if (this.dom.selectBw) this.dom.selectBw.value = "250";
    if (this.dom.selectCrc) this.dom.selectCrc.value = "1"; // CRC ON (CCITT)

    this.sendData(`AT+FREQ=${freqVal.toFixed(3)}`);
    setTimeout(() => this.sendData('AT+SF=8'), 100);
    setTimeout(() => this.sendData('AT+BW=250.0'), 200);
    setTimeout(() => this.sendData('AT+CRC=1'), 300);
  }

  readTrackerConfig() {
    this.sendData('AT+ID?');
    setTimeout(() => this.sendData('AT+TYPE?'), 100);
    setTimeout(() => this.sendData('AT+APID?'), 200);
    setTimeout(() => this.sendData('AT+INTERVAL?'), 300);
  }

  writeTrackerConfig() {
    const idVal = this.dom.inputTrackerId?.value;
    const typeVal = this.dom.selectTrackerType?.value;
    const apidVal = this.dom.inputApid?.value;
    const intervalVal = this.dom.inputInterval?.value;
    
    if (idVal !== '') this.sendData('AT+ID=' + idVal);
    if (typeVal !== '') setTimeout(() => this.sendData('AT+TYPE=' + typeVal), 100);
    if (apidVal !== '') setTimeout(() => this.sendData('AT+APID=' + apidVal), 200);
    if (intervalVal !== '') setTimeout(() => this.sendData('AT+INTERVAL=' + intervalVal), 300);
  }

  clearTelemetryData() {
    if (this.dom.telemetryTbody) {
      this.dom.telemetryTbody.innerHTML = '<tr id="row-empty"><td id="lbl-empty-telemetry" colspan="9" class="text-center text-secondary">No frames received yet. Connect the serial port and power on your trackers.</td></tr>';
    }
    this.frameIndex = 0;
    
    if (this.dom.statAlt) this.dom.statAlt.textContent = '--';
    if (this.dom.statSpd) this.dom.statSpd.textContent = '--';
    if (this.dom.statSat) this.dom.statSat.textContent = '--';
    if (this.dom.statTemp) this.dom.statTemp.textContent = '--';
    if (this.dom.statBat) this.dom.statBat.textContent = '--';
    if (this.dom.statFix) this.dom.statFix.textContent = '--';
    
    if (window.waspMapInstance) {
      window.waspMapInstance.clearTrajectory();
    }
  }

  // --- MONITEUR FLASHAGE ---
  async flashFirmware() {
    const boardVal = this.dom.boardSelect ? this.dom.boardSelect.value : 'manifest_v1_1.json';
    const bandVal = this.dom.flashBandSelect ? this.dom.flashBandSelect.value : '868';
    
    const dir = boardVal === 'manifest_v1_2.json' ? 'tbeam_v1_2' : 'tbeam_v1_1';
    const bootloaderUrl = `binaries/${dir}/bootloader.bin`;
    const partitionsUrl = `binaries/${dir}/partitions.bin`;
    const firmwareUrl = `binaries/${dir}/firmware_${bandVal}.bin`;
    
    const isConnected = this.port && this.port.readable;
    if (isConnected) {
      alert(this.getTranslation('alert_monitor_active_disconnect'));
      return;
    }
    
    if (this.dom.btnFlash) this.dom.btnFlash.disabled = true;
    if (this.dom.flashProgressContainer) this.dom.flashProgressContainer.classList.remove('hidden');
    if (this.dom.lblFlashStatus) this.dom.lblFlashStatus.textContent = this.getTranslation('flash_status_connecting');
    if (this.dom.lblFlashPercent) this.dom.lblFlashPercent.textContent = "0%";
    if (this.dom.flashProgressBar) this.dom.flashProgressBar.style.width = "0%";
    
    let esploader = null;
    let transport = null;
    
    const customTerminal = {
      clean: () => {
        if (this.dom.terminalLogs) this.dom.terminalLogs.innerHTML = '';
      },
      writeLine: (data) => this.appendLog(data, 'sys-out'),
      write: (data) => this.appendLog(data, 'sys-out')
    };

    try {
      this.appendLog(this.getTranslation('log_flash_port_select'), "sys-out");
      const flashPort = await navigator.serial.requestPort();
      
      transport = new Transport(flashPort, true);
      
      esploader = new ESPLoader({
        transport: transport,
        terminal: customTerminal,
        baudrate: 115200
      });
      
      if (this.dom.lblFlashStatus) this.dom.lblFlashStatus.textContent = this.getTranslation('flash_status_syncing');
      await esploader.main();
      
      if (this.dom.lblFlashStatus) this.dom.lblFlashStatus.textContent = this.getTranslation('flash_status_chip', { chip: esploader.chipName });
      
      this.appendLog(this.getTranslation('log_download_bin', { url: `${dir} binaries (${bandVal} MHz)` }), "sys-out");
      
      const [bootloaderData, partitionsData, firmwareData] = await Promise.all([
        this.fetchBinary(bootloaderUrl),
        this.fetchBinary(partitionsUrl),
        this.fetchBinary(firmwareUrl)
      ]);
      
      if (this.dom.lblFlashStatus) this.dom.lblFlashStatus.textContent = this.getTranslation('flash_status_writing');
      this.appendLog(this.getTranslation('log_write_flash_start'), "sys-out");
      
      const fileArray = [
        { data: bootloaderData, address: 0x1000 },
        { data: partitionsData, address: 0x8000 },
        { data: firmwareData, address: 0x10000 }
      ];
      
      await esploader.writeFlash({
        fileArray: fileArray,
        flashSize: 'keep',
        flashMode: 'keep',
        flashFreq: 'keep',
        eraseAll: false,
        compress: true,
        reportProgress: (fileIndex, written, total) => {
          const percent = Math.round((written / total) * 100);
          if (this.dom.lblFlashPercent) this.dom.lblFlashPercent.textContent = `${percent}%`;
          if (this.dom.flashProgressBar) this.dom.flashProgressBar.style.width = `${percent}%`;
        }
      });
      
      if (this.dom.lblFlashStatus) this.dom.lblFlashStatus.textContent = this.getTranslation('flash_status_success');
      this.appendLog(this.getTranslation('log_update_complete_reboot'), "sys-out");
      
      await transport.setDTR(false);
      await new Promise(resolve => setTimeout(resolve, 100));
      await transport.setDTR(true);
      
    } catch (err) {
      if (this.dom.lblFlashStatus) this.dom.lblFlashStatus.textContent = this.getTranslation('flash_status_failed');
      this.appendLog(this.getTranslation('log_flash_error', { message: err.message }), 'sys-out');
      console.error(err);
    } finally {
      if (this.dom.btnFlash) this.dom.btnFlash.disabled = false;
      if (transport) {
        try {
          await transport.disconnect();
        } catch (err) {}
      }
    }
  }

  async fetchBinary(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(this.getTranslation('log_download_bin_failed', { status: response.statusText }));
    }
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  // --- TRADUCTIONS INTERNES ---
  getTranslation(key, replacements = {}) {
    const lang = localStorage.getItem('wasp_lang') || 'fr';
    let text = translations[lang]?.[key] || translations['fr']?.[key] || key;
    for (const [placeholder, value] of Object.entries(replacements)) {
      text = text.replace(`{${placeholder}}`, value);
    }
    return text;
  }

  getFriendlyPortName(portInfo) {
    const vid = portInfo.usbVendorId;
    const pid = portInfo.usbProductId;
    const lang = localStorage.getItem('wasp_lang') || 'fr';
    
    if (vid === undefined || pid === undefined) {
      return lang === 'en' ? "Unknown Serial Device" : "Appareil Série Inconnu";
    }
    
    const hexVid = `0x${vid.toString(16).toUpperCase().padStart(4, '0')}`;
    const hexPid = `0x${pid.toString(16).toUpperCase().padStart(4, '0')}`;
    
    const chipsets = {
      "0x10C4": {
        name: "Silicon Labs CP210x (USB-to-UART Bridge)",
        pids: { "0xEA60": "CP2102/CP2109" }
      },
      "0x1A86": {
        name: "WCH CH340/CH341 (USB-to-Serial)",
        pids: { "0x7523": "CH340" }
      },
      "0x0403": {
        name: "FTDI USB Serial",
        pids: { "0x6001": "FT232R" }
      },
      "0x067B": {
        name: "Prolific PL2303",
        pids: { "0x2303": "PL2303 TA" }
      },
      "0x2341": {
        name: "Arduino",
        pids: {
          "0x0043": "Uno R3",
          "0x0001": "Uno",
          "0x0042": "Mega 2560 R3"
        }
      },
      "0x303A": {
        name: "Espressif USB-JTAG-Serial",
        pids: {
          "0x1001": "ESP32-S3/C3 USB"
        }
      }
    };
    
    const chipset = chipsets[hexVid];
    if (chipset) {
      const specificModel = chipset.pids[hexPid] || "";
      return `${chipset.name}${specificModel ? ` (${specificModel})` : ''} [VID: ${hexVid}, PID: ${hexPid}]`;
    }
    
    return `USB Device [VID: ${hexVid}, PID: ${hexPid}]`;
  }

  // --- AIDE-MEMOIRE AT ---
  renderAtHelperList() {
    const container = document.getElementById('at-helper-list');
    if (!container) return;
    container.innerHTML = '';
    
    const AT_COMMANDS_HELP = [
      { cmd: "AT", descKey: "at_desc_at" },
      { cmd: "AT+HELP", descKey: "at_desc_help" },
      { cmd: "AT+INFO", descKey: "at_desc_info" },
      { cmd: "AT+CFG", descKey: "at_desc_cfg" },
      { cmd: "AT+ID?", descKey: "at_desc_id_get" },
      { cmd: "AT+TYPE?", descKey: "at_desc_type_get" },
      { cmd: "AT+INTERVAL?", descKey: "at_desc_interval_get" },
      { cmd: "AT+FREQ?", descKey: "at_desc_freq_get" },
      { cmd: "AT+SF?", descKey: "at_desc_sf_get" },
      { cmd: "AT+BW?", descKey: "at_desc_bw_get" },
      { cmd: "AT+POWER?", descKey: "at_desc_power_get" },
      { cmd: "AT+CRC?", descKey: "at_desc_crc_get" },
      { cmd: "AT+DEBUG=1", descKey: "at_desc_debug_on" },
      { cmd: "AT+DEBUG=0", descKey: "at_desc_debug_off" },
      { cmd: "AT+BINUSB=1", descKey: "at_desc_binusb_on" },
      { cmd: "AT+BINUSB=0", descKey: "at_desc_binusb_off" },
      { cmd: "AT+SAVE", descKey: "at_desc_save" },
      { cmd: "AT+RESET", descKey: "at_desc_reset" }
    ];
    
    AT_COMMANDS_HELP.forEach(item => {
      const el = document.createElement('div');
      el.className = 'at-helper-item';
      el.innerHTML = `
        <span class="at-helper-cmd">${item.cmd}</span>
        <span class="at-helper-desc">${this.getTranslation(item.descKey)}</span>
      `;
      el.addEventListener('click', () => {
        if (this.dom.terminalInput) {
          this.dom.terminalInput.value = item.cmd;
          this.dom.terminalInput.focus();
        }
      });
      container.appendChild(el);
    });
  }
}

// Lancement au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
  window.waspSerialInstance = new WaspSerial();
});
