let port;
let reader;
let writer;
let keepReading = true;

const btnConnect = document.getElementById('btn-connect');
const btnDisconnect = document.getElementById('btn-disconnect');
const connBadge = document.getElementById('conn-badge');
const terminalLogs = document.getElementById('terminal-logs');
const terminalInput = document.getElementById('terminal-input');
const btnSend = document.getElementById('btn-send');
const terminalForm = document.getElementById('terminal-form');
const btnAtCmds = document.querySelectorAll('.btn-at');

// Telemetry Elements
const teleAlt = document.getElementById('tele-alt');
const teleSpd = document.getElementById('tele-spd');
const teleTemp = document.getElementById('tele-temp');
const teleSat = document.getElementById('tele-sat');
const teleBat = document.getElementById('tele-bat');

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

    keepReading = true;
    readLoop();
  } catch (err) {
    console.error('Erreur de connexion série', err);
    alert('Erreur lors de la connexion au port série. ' + err.message);
  }
});

btnDisconnect.addEventListener('click', async () => {
  keepReading = false;
  if (reader) {
    await reader.cancel();
  }
  if (port) {
    await port.close();
  }
  
  connBadge.textContent = 'Série Déconnectée';
  connBadge.classList.remove('connected');
  connBadge.classList.add('disconnected');
  btnConnect.disabled = false;
  btnDisconnect.disabled = true;
  terminalInput.disabled = true;
  btnSend.disabled = true;
});

async function readLoop() {
  const textDecoder = new TextDecoderStream();
  const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
  reader = textDecoder.readable.getReader();

  let partialLine = '';

  try {
    while (keepReading) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        partialLine += value;
        let lines = partialLine.split('\n');
        partialLine = lines.pop(); // Keep incomplete line

        for (let line of lines) {
          line = line.replace('\r', '').trim();
          if(line.length > 0) {
            appendLog(line);
            parseTelemetry(line);
          }
        }
      }
    }
  } catch (error) {
    console.error('Erreur de lecture:', error);
  } finally {
    reader.releaseLock();
  }
}

function appendLog(msg) {
  const div = document.createElement('div');
  div.textContent = msg;
  terminalLogs.appendChild(div);
  terminalLogs.scrollTop = terminalLogs.scrollHeight;
}

// Envoi de données
async function sendData(data) {
  if (!port || !port.writable) return;
  const textEncoder = new TextEncoderStream();
  const writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
  writer = textEncoder.writable.getWriter();
  await writer.write(data + '\r\n');
  writer.releaseLock();
  appendLog('> ' + data);
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

// Parsing telemetry
function parseTelemetry(line) {
  // Example: [TX] UTC:1782586735 | POS:43.60014, 1.47430 | ALT:201.5m | SPD:0.1km/h | COG:0.0° | T:38.10°C | SAT:11 | BAT:0mV | STATUS:0x01
  if(line.startsWith('[TX]')) {
    try {
      const parts = line.split('|').map(p => p.trim());
      parts.forEach(part => {
        if(part.startsWith('ALT:')) teleAlt.textContent = part.split(':')[1].replace('m','');
        if(part.startsWith('SPD:')) teleSpd.textContent = part.split(':')[1].replace('km/h','');
        if(part.startsWith('T:')) teleTemp.textContent = part.split(':')[1].replace('°C','');
        if(part.startsWith('SAT:')) teleSat.textContent = part.split(':')[1];
        if(part.startsWith('BAT:')) teleBat.textContent = part.split(':')[1].replace('mV','');
        
        if(part.startsWith('POS:')) {
          const coords = part.split(':')[1].split(',');
          if(coords.length === 2 && window.updateMap) {
            window.updateMap(coords[0].trim(), coords[1].trim());
          }
        }
      });
    } catch(e) {
      console.error('Parse err:', e);
    }
  }
}
