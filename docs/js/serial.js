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
  appendLog("ERREUR CRITIQUE: L'API Web Serial n'est pas disponible.");
  appendLog("Assurez-vous d'utiliser Chrome/Edge et d'ouvrir ce site via HTTPS ou un serveur local (localhost), et non 'file:///'.");
}

function updateDynamicUI() {
  const lang = localStorage.getItem('wasp_lang') || 'fr';
  const isConnected = port && port.readable;
  
  if (isConnected) {
    connBadge.textContent = lang === 'en' ? 'Serial Connected' : 'Série Connectée';
    const portInfo = port.getInfo();
    let portDesc = lang === 'en' ? 'Connected' : 'Connecté';
    if (portInfo.usbVendorId !== undefined) {
      portDesc = lang === 'en'
        ? `USB Device (VID: 0x${portInfo.usbVendorId.toString(16).toUpperCase()}, PID: 0x${portInfo.usbProductId.toString(16).toUpperCase()})`
        : `Périphérique USB (VID: 0x${portInfo.usbVendorId.toString(16).toUpperCase()}, PID: 0x${portInfo.usbProductId.toString(16).toUpperCase()})`;
    }
    const lblPortName = document.getElementById('lbl-port-name');
    if (lblPortName) lblPortName.textContent = portDesc;
  } else {
    connBadge.textContent = lang === 'en' ? 'Serial Disconnected' : 'Série Déconnectée';
    const lblPortName = document.getElementById('lbl-port-name');
    if (lblPortName) lblPortName.textContent = lang === 'en' ? 'No device connected' : 'Aucun appareil connecté';
  }
}

window.addEventListener('lang-changed', updateDynamicUI);

btnConnect.addEventListener('click', async () => {
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });

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
    appendLog("--- Connexion Série Établie ---");
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
  
  appendLog("--- Déconnecté ---");
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
    appendLog("Erreur de lecture: " + error.message);
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
  
  // Add to NectarMC table
  addNectarFrameToTable({
    ts: new Date(tsEpoch * 1000).toISOString().replace('T', ' ').substring(0, 19),
    tracker: trackerSSID,
    apid: apid,
    size: payloadSize,
    rssi: rssi,
    snr: (snr / 4).toFixed(2),
    crc: crcOK ? '<span style="color: var(--color-success)">OK</span>' : '<span style="color: var(--color-danger)">KO</span>',
    payload: payloadHex
  });
  
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
    
    // Status byte at offset 28 in payload has GPS fix (bit 7) and Sats (bits 0-4)
    let statusByte = dv.getUint8(4 + 28);
    let sats = statusByte & 0x1F;
    let gpsFix = (statusByte >> 7) & 0x01;
    
    // Update Stats widgets
    if (statAlt) statAlt.textContent = alt.toFixed(1);
    if (statSpd) statSpd.textContent = spd.toFixed(1);
    if (statSat) statSat.textContent = sats;
    if (statTemp) statTemp.textContent = (temp / 100).toFixed(1);
    if (statBat) statBat.textContent = (vbat / 1000).toFixed(2);
    
    if (statFix) {
      const lang = localStorage.getItem('wasp_lang') || 'fr';
      if (gpsFix) {
        statFix.textContent = lang === 'en' ? 'Valid' : 'Valide';
        statFix.style.color = '#10b981'; // Green color for valid fix
      } else {
        statFix.textContent = lang === 'en' ? 'No Fix' : 'Aucun Fix';
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
        time: timeStr
      });
    }
  }
}

function addNectarFrameToTable(f) {
  if (lblEmptyTelemetry) lblEmptyTelemetry.style.display = 'none';
  frameIndex++;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${frameIndex}</td>
    <td style="font-family: var(--font-mono);">${f.ts}</td>
    <td style="color: var(--color-cyan); font-weight: 600;">${f.tracker}</td>
    <td>${f.apid}</td>
    <td>${f.size}</td>
    <td>${f.rssi} dBm</td>
    <td>${f.snr} dB</td>
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
      document.getElementById('input-power').value = parseInt(line.split(':')[1].trim());
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

function appendLog(msg) {
  const div = document.createElement('div');
  div.textContent = msg;
  terminalLogs.appendChild(div);
  terminalLogs.scrollTop = terminalLogs.scrollHeight;
  
  // Garde-fou anti-overflow : Limiter le nombre de div dans la console à 100 lignes
  if (terminalLogs.children.length > 100) {
    terminalLogs.removeChild(terminalLogs.firstChild);
  }
}

async function sendData(data) {
  if (!port || !port.writable) {
    appendLog("Erreur: Port série non prêt.");
    return;
  }
  const encoder = new TextEncoder();
  const writer = port.writable.getWriter();
  try {
    await writer.write(encoder.encode(data + '\r\n'));
    appendLog('> ' + data);
  } catch(e) {
    console.error('Erreur d\'envoi:', e);
    appendLog("Erreur d'envoi: " + e.message);
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
  const power = document.getElementById('input-power').value;
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
