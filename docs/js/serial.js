import { ESPLoader, Transport } from 'https://cdn.jsdelivr.net/npm/esptool-js@0.6.0/+esm';
import { translations } from './translate.js';

let port;
let reader;
let keepReading = true;
let frameIndex = 0;

const btnConnect = document.getElementById('btn-connect');
const btnDisconnect = document.getElementById('btn-disconnect');
const connBadge = document.getElementById('conn-badge');
const terminalLogs = document.getElementById('terminal-logs');
const terminalInput = document.getElementById('terminal-input');
const btnSend = document.getElementById('btn-send');
const terminalForm = document.getElementById('terminal-form');
const btnAtCmds = document.querySelectorAll('.btn-at');

const telemetryTbody = document.getElementById('telemetry-tbody');
const lblEmptyTelemetry = document.getElementById('row-empty');

// Decoded Telemetry elements
const statAlt = document.getElementById('stat-alt');
const statSpd = document.getElementById('stat-spd');
const statSat = document.getElementById('stat-sat');
const statTemp = document.getElementById('stat-temp');
const statBat = document.getElementById('stat-bat');
const statFix = document.getElementById('stat-fix');

// Check for Web Serial API support
if (!("serial" in navigator)) {
  connBadge.textContent = "Web Serial Non Supporté";
  connBadge.style.background = "var(--color-danger)";
  connBadge.title = "L'API Web Serial nécessite Chrome/Edge et un accès via HTTPS ou localhost.";
  btnConnect.disabled = true;
  appendLog("ERREUR CRITIQUE: L'API Web Serial n'est pas disponible.", 'sys-out');
  appendLog("Assurez-vous d'utiliser Chrome/Edge et d'ouvrir ce site via HTTPS ou un serveur local (localhost), et non 'file:///'.", 'sys-out');
}

function updateDynamicUI() {
  const lang = localStorage.getItem('wasp_lang') || 'fr';
  const isConnected = port && port.readable;
  
  if (isConnected) {
    connBadge.textContent = getTranslation('conn_connected');
    const portInfo = port.getInfo();
    const portDesc = getFriendlyPortName(portInfo);
    const lblPortName = document.getElementById('lbl-port-name');
    if (lblPortName) lblPortName.textContent = getTranslation('conn_port_prefix') + portDesc;
  } else {
    connBadge.textContent = getTranslation('conn_disconnected');
    const lblPortName = document.getElementById('lbl-port-name');
    if (lblPortName) lblPortName.textContent = getTranslation('conn_no_device');
  }
}

window.addEventListener('lang-changed', updateDynamicUI);

btnConnect.addEventListener('click', async () => {
  try {
    port = await navigator.serial.requestPort();
    const baudSelect = document.getElementById('baudrate');
    const selectedBaud = baudSelect ? parseInt(baudSelect.value) : 115200;
    await port.open({ baudRate: selectedBaud });

    connBadge.classList.remove('disconnected');
    connBadge.classList.add('connected');
    btnConnect.disabled = true;
    btnDisconnect.disabled = false;
    terminalInput.disabled = false;
    btnSend.disabled = false;

    // Enable config panel controls
    document.querySelectorAll('.config-panel input, .config-panel select, .config-panel button').forEach(el => {
      if(el.id !== 'board-select' && !el.closest('esp-web-install-button')) el.disabled = false;
    });

    updateDynamicUI();

    keepReading = true;
    appendLog("--- Connexion Série Établie ---", 'sys-out');
    readLoop();
  } catch (err) {
    console.error('Erreur de connexion série', err);
    alert('Erreur lors de la connexion au port série : ' + err.message);
  }
});

btnDisconnect.addEventListener('click', async () => {
  keepReading = false;
  if (reader) {
    await reader.cancel().catch(e => console.error("Reader cancel error:", e));
  }
  if (port) {
    await port.close().catch(e => console.error("Port close error:", e));
  }
  
  connBadge.classList.remove('connected');
  connBadge.classList.add('disconnected');
  btnConnect.disabled = false;
  btnDisconnect.disabled = true;
  terminalInput.disabled = true;
  btnSend.disabled = true;
  
  // Disable config panel controls
  document.querySelectorAll('.config-panel input, .config-panel select, .config-panel button').forEach(el => {
    if(el.id !== 'board-select' && !el.closest('esp-web-install-button')) el.disabled = true;
  });
  
  updateDynamicUI();
  
  appendLog("--- Déconnecté ---", 'sys-out');
});

async function readLoop() {
  reader = port.readable.getReader();
  let buffer = new Uint8Array(0);

  try {
    while (keepReading) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        let newBuffer = new Uint8Array(buffer.length + value.length);
        newBuffer.set(buffer);
        newBuffer.set(value, buffer.length);
        buffer = newBuffer;
        
        buffer = processBuffer(buffer);
      }
    }
  } catch (error) {
    console.error('Erreur de lecture:', error);
    appendLog("Erreur de lecture: " + error.message, 'sys-out');
  } finally {
    reader.releaseLock();
  }
}

function calculateCRC16(data, len) {
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

function processBuffer(buf) {
  // Garde-fou anti-overflow : Si le tampon accumule trop de bruit ou de données corrompues (sans retour à la ligne ou Magic)
  if (buf.length > 4096) {
    buf = buf.slice(buf.length - 1024); // On ne garde que la fin pour tenter de se resynchroniser
  }
  let offset = 0;
  while (offset < buf.length) {
    // Check NectarMC Binary Frame Magic Byte (0xEB)
    if (buf[offset] === 0xEB) {
      if (buf.length >= offset + 4) {
        let payloadSize = buf[offset + 3];
        
        // Define length variants (v1.4.0 has 4-byte TS, v1.3.1 does not)
        let frameLength140 = payloadSize + 13; // MAGIC(1) + ID(2) + SIZE(1) + PAYLOAD(N) + RSSI(1) + SNR(1) + TS(4) + CRC(2) + \n(1) = N + 13
        let frameLength131 = payloadSize + 9;  // MAGIC(1) + ID(2) + SIZE(1) + PAYLOAD(N) + RSSI(1) + SNR(1) + CRC(2) + \n(1) = N + 9
        
        let detectedLength = 0;
        let hasTimestamp = false;
        
        if (buf.length >= offset + frameLength140 && buf[offset + frameLength140 - 1] === 0x0A) {
          detectedLength = frameLength140;
          hasTimestamp = true;
        } else if (buf.length >= offset + frameLength131 && buf[offset + frameLength131 - 1] === 0x0A) {
          detectedLength = frameLength131;
          hasTimestamp = false;
        }
        
        if (detectedLength > 0) {
          let frame = buf.slice(offset, offset + detectedLength);
          parseNectarFrame(frame, payloadSize, hasTimestamp);
          offset += detectedLength;
          continue;
        } else {
          let maxLen = Math.max(frameLength140, frameLength131);
          if (buf.length < offset + maxLen) {
            break; // Wait for more bytes
          }
        }
      } else {
        break; // Wait for size byte
      }
    }
    
    // Fallback: Text Line parsing
    let newlineIdx = buf.indexOf(10, offset); // 10 is '\n'
    if (newlineIdx !== -1) {
      let lineBuf = buf.slice(offset, newlineIdx);
      let lineStr = new TextDecoder().decode(lineBuf).trim();
      if (lineStr.length > 0) {
        appendLog(lineStr);
        parseIncomingTextLine(lineStr);
      }
      offset = newlineIdx + 1;
    } else {
      break; // Wait for next newline
    }
  }
  return buf.slice(offset);
}

function parseNectarFrame(frame, payloadSize, hasTimestamp) {
  let dv = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  
  // Extract Nectar Metadata
  let id_mission = dv.getUint16(1, true);
  let ssid_type = (id_mission >> 14) & 0x03;
  let ssid_num = (id_mission >> 6) & 0xFF;
  let apid = id_mission & 0x3F;
  
  let rssi = dv.getInt8(4 + payloadSize);
  let snr = dv.getInt8(5 + payloadSize);
  
  let tsEpoch;
  if (hasTimestamp) {
    tsEpoch = dv.getUint32(6 + payloadSize, true);
  } else {
    tsEpoch = Math.floor(Date.now() / 1000);
  }
  
  // Verify CRC16-CCITT
  let receivedCRC = dv.getUint16(frame.length - 3, true);
  let computedCRC = calculateCRC16(frame, frame.length - 3);
  let crcOK = (receivedCRC === computedCRC);
  
  // Payload hex representation
  let payloadBytes = frame.slice(4, 4 + payloadSize);
  let payloadHex = Array.prototype.map.call(payloadBytes, x => ('0' + x.toString(16)).toUpperCase()).join(' ');
  
  // Map ID types to strings
  const MISSION_TYPES = ["FX", "MF", "BALLOON", "OTHER"];
  let trackerSSID = `${MISSION_TYPES[ssid_type]}-${ssid_num}`;
  
  let latVal = 'N/A';
  let lonVal = 'N/A';
  let altVal = 'N/A';
  let batVal = 'N/A';
  
  // Decrypt WASP payload if applicable (29 bytes after removing the 3 header bytes) and CRC is OK
  if (payloadSize === 29 && crcOK) {
    let utc = dv.getUint32(4 + 0, true);   // Offset 0 in payload
    let lat = dv.getFloat32(4 + 4, true);  // Offset 4 in payload
    let lon = dv.getFloat32(4 + 8, true);  // Offset 8 in payload
    let alt = dv.getFloat32(4 + 12, true); // Offset 12 in payload
    let spd = dv.getFloat32(4 + 16, true); // Offset 16 in payload
    let cog = dv.getFloat32(4 + 20, true); // Offset 20 in payload
    let vbat = dv.getUint16(4 + 24, true); // Offset 24 in payload
    let temp = dv.getInt16(4 + 26, true); // Offset 26 in payload
    
    // Status byte at offset 28 in payload has GPS fix (bit 7), Mode (bit 5) and Sats (bits 0-4)
    let statusByte = dv.getUint8(4 + 28);
    let sats = statusByte & 0x1F;
    let gpsFix = (statusByte >> 7) & 0x01;
    let mode = (statusByte >> 5) & 0x01; // 0 = Vol (Normal), 1 = Eco
    
    // Formatter coordonnées, altitude et batterie
    latVal = lat.toFixed(6);
    lonVal = lon.toFixed(6);
    altVal = `${alt.toFixed(1)} m`;
    batVal = `${(vbat / 1000).toFixed(2)} V`;
    
    // Update Stats widgets
    if (statAlt) statAlt.textContent = alt.toFixed(1);
    if (statSpd) statSpd.textContent = spd.toFixed(1);
    if (statSat) statSat.textContent = sats;
    if (statTemp) statTemp.textContent = (temp / 100).toFixed(1);
    if (statBat) statBat.textContent = (vbat / 1000).toFixed(2);
    
    if (statFix) {
      const lang = localStorage.getItem('wasp_lang') || 'fr';
      let modeText = mode === 1 ? (lang === 'en' ? 'Eco' : 'Éco') : (lang === 'en' ? 'Flight' : 'Vol');
      if (gpsFix) {
        statFix.textContent = `${lang === 'en' ? 'Valid' : 'Valide'} (${modeText})`;
        statFix.style.color = '#10b981'; // Green color for valid fix
      } else {
        statFix.textContent = `${lang === 'en' ? 'No Fix' : 'Aucun Fix'} (${modeText})`;
        statFix.style.color = '#ef4444'; // Red color for no fix
      }
    }
    
    // Format UTC time (fallback to system TS if UTC not set)
    const activeUtc = utc || tsEpoch;
    const timeStr = new Date(activeUtc * 1000).toISOString().substring(11, 19);
    
    // Update Map position with trajectory and detailed popup content
    if (window.updateMap) {
      window.updateMap(lat, lon, {
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
  
  // Add to NectarMC table at the end (with Latitude, Longitude, Altitude and Battery values)
  addNectarFrameToTable({
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

function addNectarFrameToTable(f) {
  if (lblEmptyTelemetry) lblEmptyTelemetry.style.display = 'none';
  frameIndex++;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${frameIndex}</td>
    <td style="font-family: var(--font-mono);">${f.ts}</td>
    <td style="color: var(--color-cyan); font-weight: 600;">${f.tracker}</td>
    <td style="font-family: var(--font-mono);">${f.lat}</td>
    <td style="font-family: var(--font-mono);">${f.lon}</td>
    <td>${f.alt}</td>
    <td>${f.bat}</td>
    <td>${f.crc}</td>
    <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-secondary); text-align: left; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${f.payload}">${f.payload}</td>
  `;
  telemetryTbody.prepend(tr);
  
  if (telemetryTbody.children.length > 50) {
    telemetryTbody.removeChild(telemetryTbody.lastChild);
  }
}

function parseIncomingTextLine(line) {
  if (line.startsWith('[TX]')) {
    parseTelemetryText(line);
    return;
  }
  
  // Try to parse AT query feedback responses to dynamically synchronize the UI fields!
  // Ex: "+FREQ: 868.000", "+SF: 9", "+BW: 125.00", "+POWER: 14", "+CRC: 1,0", "+ID: 1", "+TYPE: 2", "+INTERVAL: 1", "+APID: 10"
  try {
    if (line.startsWith('+FREQ:')) {
      document.getElementById('input-freq').value = parseFloat(line.split(':')[1].trim());
    } else if (line.startsWith('+SF:')) {
      document.getElementById('select-sf').value = parseInt(line.split(':')[1].trim());
    } else if (line.startsWith('+BW:')) {
      let bwVal = parseFloat(line.split(':')[1].trim());
      document.getElementById('select-bw').value = bwVal;
    } else if (line.startsWith('+POWER:')) {
      document.getElementById('select-power').value = parseInt(line.split(':')[1].trim());
    } else if (line.startsWith('+CRC:')) {
      let crcParts = line.split(':')[1].trim().split(',');
      document.getElementById('select-crc').value = crcParts[0].trim();
    } else if (line.startsWith('+ID:')) {
      document.getElementById('input-tracker-id').value = parseInt(line.split(':')[1].trim());
    } else if (line.startsWith('+TYPE:')) {
      document.getElementById('select-tracker-type').value = parseInt(line.split(':')[1].trim());
    } else if (line.startsWith('+INTERVAL:')) {
      document.getElementById('input-interval').value = parseInt(line.split(':')[1].trim());
    } else if (line.startsWith('+APID:')) {
      document.getElementById('input-apid').value = parseInt(line.split(':')[1].trim());
    }
  } catch(e) {
    console.error("Failed to parse AT response feedback:", e);
  }
}

function parseTelemetryText(line) {
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
    
    // Update Stats widgets
    if (statAlt && d.alt) statAlt.textContent = parseFloat(d.alt).toFixed(1);
    if (statSpd && d.spd) statSpd.textContent = parseFloat(d.spd).toFixed(1);
    if (statSat && d.sat) statSat.textContent = d.sat;
    if (statTemp && d.temp) statTemp.textContent = parseFloat(d.temp).toFixed(1);
    if (statBat && d.bat) statBat.textContent = (parseFloat(d.bat) / 1000).toFixed(2);
    
    // Update Map
    if(d.pos && window.updateMap) {
      const coords = d.pos.split(',');
      if(coords.length === 2) {
        window.updateMap(parseFloat(coords[0]), parseFloat(coords[1]));
      }
    }
  } catch(e) {
    console.error("Text parsing fallback failed:", e);
  }
}

function appendLog(msg, className = '') {
  const div = document.createElement('div');
  div.textContent = msg;
  if (className) {
    div.className = className;
  }
  terminalLogs.appendChild(div);
  terminalLogs.scrollTop = terminalLogs.scrollHeight;
  
  // Garde-fou anti-overflow : Limiter le nombre de div dans la console à 100 lignes
  if (terminalLogs.children.length > 100) {
    terminalLogs.removeChild(terminalLogs.firstChild);
  }
}

async function sendData(data) {
  if (!port || !port.writable) {
    appendLog("Erreur: Port série non prêt.", 'sys-out');
    return;
  }
  const encoder = new TextEncoder();
  const writer = port.writable.getWriter();
  try {
    await writer.write(encoder.encode(data + '\r\n'));
    appendLog('> ' + data, 'cmd-in');
  } catch(e) {
    console.error('Erreur d\'envoi:', e);
    appendLog("Erreur d'envoi: " + e.message, 'sys-out');
  } finally {
    writer.releaseLock();
  }
}

terminalForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const val = terminalInput.value;
  if (val) {
    sendData(val);
    terminalInput.value = '';
  }
});

btnAtCmds.forEach(btn => {
  btn.addEventListener('click', () => {
    const cmd = btn.getAttribute('data-cmd');
    sendData(cmd);
  });
});

document.getElementById('btn-read-terminal')?.addEventListener('click', () => {
  terminalLogs.innerHTML = '';
});

document.getElementById('btn-clear-telemetry')?.addEventListener('click', () => {
  telemetryTbody.innerHTML = '<tr id="row-empty"><td id="lbl-empty-telemetry" colspan="9" class="text-center text-secondary">No frames received yet. Connect the serial port and power on your trackers.</td></tr>';
  frameIndex = 0;
  
  if (statAlt) statAlt.textContent = '--';
  if (statSpd) statSpd.textContent = '--';
  if (statSat) statSat.textContent = '--';
  if (statTemp) statTemp.textContent = '--';
  if (statBat) statBat.textContent = '--';
  if (statFix) statFix.textContent = '--';
});

// Radio settings controls
document.getElementById('btn-read-cfg')?.addEventListener('click', () => {
  sendData('AT+FREQ?');
  setTimeout(() => sendData('AT+SF?'), 100);
  setTimeout(() => sendData('AT+BW?'), 200);
  setTimeout(() => sendData('AT+POWER?'), 300);
  setTimeout(() => sendData('AT+CRC?'), 400);
});
document.getElementById('btn-write-cfg')?.addEventListener('click', () => {
  const freq = document.getElementById('input-freq').value;
  const sf = document.getElementById('select-sf').value;
  const bw = document.getElementById('select-bw').value;
  const power = document.getElementById('select-power').value;
  const crc = document.getElementById('select-crc').value;
  if(freq) sendData('AT+FREQ=' + freq);
  if(sf) sendData('AT+SF=' + sf);
  if(bw) sendData('AT+BW=' + bw);
  if(power) sendData('AT+POWER=' + power);
  if(crc) sendData('AT+CRC=' + crc);
});
document.getElementById('btn-save-cfg')?.addEventListener('click', () => { sendData('AT+SAVE'); });
document.getElementById('btn-reset-cfg')?.addEventListener('click', () => { sendData('AT+RESET'); });

// Tracker settings controls
document.getElementById('btn-read-tracker')?.addEventListener('click', () => {
  sendData('AT+ID?');
  setTimeout(() => sendData('AT+TYPE?'), 100);
  setTimeout(() => sendData('AT+APID?'), 200);
  setTimeout(() => sendData('AT+INTERVAL?'), 300);
});
document.getElementById('btn-write-tracker')?.addEventListener('click', () => {
  const idVal = document.getElementById('input-tracker-id').value;
  const typeVal = document.getElementById('select-tracker-type').value;
  const apidVal = document.getElementById('input-apid').value;
  const intervalVal = document.getElementById('input-interval').value;
  
  if(idVal !== '') sendData('AT+ID=' + idVal);
  if(typeVal !== '') setTimeout(() => sendData('AT+TYPE=' + typeVal), 100);
  if(apidVal !== '') setTimeout(() => sendData('AT+APID=' + apidVal), 200);
  if(intervalVal !== '') setTimeout(() => sendData('AT+INTERVAL=' + intervalVal), 300);
});

// ============================================================================
// Flasheur de Firmware Web (ESPTool) & Fonctions Helpers
// ============================================================================
const btnFlash = document.getElementById('btn-flash');
const flashProgressContainer = document.getElementById('flash-progress-container');
const flashProgressBar = document.getElementById('flash-progress-bar');
const lblFlashStatus = document.getElementById('lbl-flash-status');
const lblFlashPercent = document.getElementById('lbl-flash-percent');

if (btnFlash) {
  btnFlash.addEventListener('click', flashFirmware);
}

function getTranslation(key, replacements = {}) {
  const lang = localStorage.getItem('wasp_lang') || 'fr';
  let text = translations[lang]?.[key] || translations['fr']?.[key] || key;
  for (const [placeholder, value] of Object.entries(replacements)) {
    text = text.replace(`{${placeholder}}`, value);
  }
  return text;
}

function getFriendlyPortName(portInfo) {
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

async function flashFirmware() {
  const boardSelect = document.getElementById('board-select');
  const boardVal = boardSelect ? boardSelect.value : 'manifest_v1_1.json';
  
  const dir = boardVal === 'manifest_v1_2.json' ? 'tbeam_v1_2' : 'tbeam_v1_1';
  const bootloaderUrl = `binaries/${dir}/bootloader.bin`;
  const partitionsUrl = `binaries/${dir}/partitions.bin`;
  const firmwareUrl = `binaries/${dir}/firmware.bin`;
  
  const isConnected = port && port.readable;
  if (isConnected) {
    alert(getTranslation('alert_monitor_active_disconnect'));
    return;
  }
  
  if (btnFlash) btnFlash.disabled = true;
  if (flashProgressContainer) flashProgressContainer.classList.remove('hidden');
  if (lblFlashStatus) lblFlashStatus.textContent = getTranslation('flash_status_connecting');
  if (lblFlashPercent) lblFlashPercent.textContent = "0%";
  if (flashProgressBar) flashProgressBar.style.width = "0%";
  
  let esploader = null;
  let transport = null;
  
  const customTerminal = {
    clean() {
      if (terminalLogs) terminalLogs.innerHTML = '';
    },
    writeLine(data) {
      appendLog(data, 'sys-out');
    },
    write(data) {
      appendLog(data, 'sys-out');
    }
  };

  try {
    appendLog(getTranslation('log_flash_port_select'), "sys-out");
    const flashPort = await navigator.serial.requestPort();
    
    transport = new Transport(flashPort, true);
    
    esploader = new ESPLoader({
      transport: transport,
      terminal: customTerminal,
      baudrate: 115200
    });
    
    if (lblFlashStatus) lblFlashStatus.textContent = getTranslation('flash_status_syncing');
    await esploader.main();
    
    if (lblFlashStatus) lblFlashStatus.textContent = getTranslation('flash_status_chip', { chip: esploader.chipName });
    
    appendLog(getTranslation('log_download_bin', { url: `${dir} binaries` }), "sys-out");
    
    const [bootloaderData, partitionsData, firmwareData] = await Promise.all([
      fetchBinary(bootloaderUrl),
      fetchBinary(partitionsUrl),
      fetchBinary(firmwareUrl)
    ]);
    
    if (lblFlashStatus) lblFlashStatus.textContent = getTranslation('flash_status_writing');
    appendLog(getTranslation('log_write_flash_start'), "sys-out");
    
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
        if (lblFlashPercent) lblFlashPercent.textContent = `${percent}%`;
        if (flashProgressBar) flashProgressBar.style.width = `${percent}%`;
      }
    });
    
    if (lblFlashStatus) lblFlashStatus.textContent = getTranslation('flash_status_success');
    appendLog(getTranslation('log_update_complete_reboot'), "sys-out");
    
    await transport.setDTR(false);
    await new Promise(resolve => setTimeout(resolve, 100));
    await transport.setDTR(true);
    
  } catch (err) {
    if (lblFlashStatus) lblFlashStatus.textContent = getTranslation('flash_status_failed');
    appendLog(getTranslation('log_flash_error', { message: err.message }), 'sys-out');
    console.error(err);
  } finally {
    if (btnFlash) btnFlash.disabled = false;
    if (transport) {
      try {
        await transport.disconnect();
      } catch (err) {}
    }
  }
}

async function fetchBinary(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(getTranslation('log_download_bin_failed', { status: response.statusText }));
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
