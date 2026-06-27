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

// Check for Web Serial API support
if (!("serial" in navigator)) {
  connBadge.textContent = "Web Serial Non Supporté";
  connBadge.style.background = "var(--color-danger)";
  connBadge.title = "L'API Web Serial nécessite Chrome/Edge et un accès via HTTPS ou localhost.";
  btnConnect.disabled = true;
  appendLog("ERREUR CRITIQUE: L'API Web Serial n'est pas disponible.");
  appendLog("Assurez-vous d'utiliser Chrome/Edge et d'ouvrir ce site via HTTPS ou un serveur local (localhost), et non 'file:///'.");
}

btnConnect.addEventListener('click', async () => {
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });

    connBadge.textContent = 'Série Connectée';
    connBadge.classList.remove('disconnected');
    connBadge.classList.add('connected');
    btnConnect.disabled = true;
    btnDisconnect.disabled = false;
    terminalInput.disabled = false;
    btnSend.disabled = false;

    document.querySelectorAll('.config-panel input, .config-panel select, .config-panel button').forEach(el => {
      if(el.id !== 'board-select' && !el.closest('esp-web-install-button')) el.disabled = false;
    });

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
  
  connBadge.textContent = 'Série Déconnectée';
  connBadge.classList.remove('connected');
  connBadge.classList.add('disconnected');
  btnConnect.disabled = false;
  btnDisconnect.disabled = true;
  terminalInput.disabled = true;
  btnSend.disabled = true;
  
  document.querySelectorAll('.config-panel input, .config-panel select, .config-panel button').forEach(el => {
      if(el.id !== 'board-select' && !el.closest('esp-web-install-button')) el.disabled = true;
  });
  
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

function processBuffer(buf) {
  let offset = 0;
  while (offset < buf.length) {
    // Check NectarMC Binary Frame Magic Byte (0xEB)
    if (buf[offset] === 0xEB) {
      if (buf.length >= offset + 4) {
        let payloadSize = buf[offset + 3];
        // v1.4.0 format: MAGIC(1) + ID(2) + SIZE(1) + PAYLOAD(N) + RSSI(1) + SNR(1) + TS(4) + CRC(2) + \n(1) = N + 13
        let frameLength = payloadSize + 13;
        
        if (buf.length >= offset + frameLength) {
          if (buf[offset + frameLength - 1] === 0x0A) {
            let frame = buf.slice(offset, offset + frameLength);
            parseNectarFrame(frame, payloadSize);
            offset += frameLength;
            continue;
          }
        } else {
          // Need more data for full frame
          break;
        }
      } else {
        // Need more data for size
        break;
      }
    }
    
    // Text Line parsing
    let newlineIdx = buf.indexOf(10, offset); // 10 is '\n'
    if (newlineIdx !== -1) {
      let lineBuf = buf.slice(offset, newlineIdx);
      let lineStr = new TextDecoder().decode(lineBuf).trim();
      if (lineStr.length > 0) {
        appendLog(lineStr);
        if(lineStr.startsWith('[TX]')) {
          parseTelemetryText(lineStr); // Fallback text parsing just in case
        }
      }
      offset = newlineIdx + 1;
    } else {
      break; // Need more data for next \n
    }
  }
  return buf.slice(offset);
}

function parseNectarFrame(frame, payloadSize) {
  let dv = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  
  // Extract Nectar Metadata
  let id_mission = dv.getUint16(1, true);
  let rssi = dv.getInt8(4 + payloadSize);
  let snr = dv.getInt8(5 + payloadSize);
  let tsEpoch = dv.getUint32(6 + payloadSize, true);
  
  // Is it Wasp-TX payload?
  if (payloadSize === 33) {
    let lat = dv.getFloat32(4 + 7, true);
    let lon = dv.getFloat32(4 + 11, true);
    let alt = dv.getFloat32(4 + 15, true);
    let spd = dv.getFloat32(4 + 19, true);
    let vbat = dv.getUint16(4 + 27, true);
    let temp = dv.getInt16(4 + 29, true);
    let sats = dv.getUint8(4 + 32);
    
    // Add to HTML table
    updateTelemetryTable({
      ts: tsEpoch,
      pos: lat.toFixed(5) + ', ' + lon.toFixed(5),
      alt: alt.toFixed(1) + 'm',
      spd: spd.toFixed(1) + 'km/h',
      sat: sats,
      temp: (temp / 100).toFixed(2) + '°C',
      bat: vbat + 'mV'
    });
    
    appendLog(`[BIN] NectarMC Frame | RSSI: ${rssi}dBm | SNR: ${(snr/4).toFixed(2)}dB | Size: 33b`);
  } else {
    appendLog(`[BIN] Trame Nectar reçue (Taille: ${payloadSize} octets) - Non-Wasp`);
  }
}

function updateTelemetryTable(d) {
  if(lblEmptyTelemetry) lblEmptyTelemetry.style.display = 'none';
  frameIndex++;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${frameIndex}</td>
    <td style="font-family: var(--font-mono);">${d.ts}</td>
    <td style="font-family: var(--font-mono); color: var(--color-cyan);">${d.pos}</td>
    <td>${d.alt}</td>
    <td>${d.spd}</td>
    <td>${d.sat}</td>
    <td>${d.temp}</td>
    <td style="color: var(--color-success);">${d.bat}</td>
  `;
  telemetryTbody.prepend(tr);
  
  if (telemetryTbody.children.length > 50) {
    telemetryTbody.removeChild(telemetryTbody.lastChild);
  }
  
  if(d.pos && window.updateMap) {
    const coords = d.pos.split(',');
    if(coords.length === 2) {
      window.updateMap(coords[0].trim(), coords[1].trim());
    }
  }
}

function parseTelemetryText(line) {
  try {
    const parts = line.split('|').map(p => p.trim());
    let d = { ts: '', pos: '', alt: '', spd: '', sat: '', temp: '', bat: '' };
    
    parts.forEach(part => {
      if(part.startsWith('UTC:')) d.ts = part.split(':')[1];
      if(part.startsWith('POS:')) d.pos = part.split('POS:')[1];
      if(part.startsWith('ALT:')) d.alt = part.split(':')[1];
      if(part.startsWith('SPD:')) d.spd = part.split(':')[1];
      if(part.startsWith('T:')) d.temp = part.split(':')[1];
      if(part.startsWith('SAT:')) d.sat = part.split(':')[1];
      if(part.startsWith('BAT:')) d.bat = part.split(':')[1];
    });
    updateTelemetryTable(d);
  } catch(e) {}
}

function appendLog(msg) {
  const div = document.createElement('div');
  div.textContent = msg;
  terminalLogs.appendChild(div);
  terminalLogs.scrollTop = terminalLogs.scrollHeight;
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

document.getElementById('btn-clear-terminal')?.addEventListener('click', () => {
  terminalLogs.innerHTML = '';
});

document.getElementById('btn-clear-telemetry')?.addEventListener('click', () => {
  telemetryTbody.innerHTML = '<tr id="row-empty"><td id="lbl-empty-telemetry" colspan="8" class="text-center text-secondary">No frames received yet. Connect the serial port and power on your trackers.</td></tr>';
  frameIndex = 0;
});

document.getElementById('btn-read-cfg')?.addEventListener('click', () => { sendData('AT+CFG'); });
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

