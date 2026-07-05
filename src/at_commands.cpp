/**
 * @file at_commands.cpp
 * @brief Gestion de l'analyse, du décodage et de l'application des commandes AT pour Wasp-TX.
 * @author Paul Miailhe
 * @date 27/06/2026
 */

#include "header.h"
#include "at_commands.h"

// Déclaration de la fonction de mise à jour du timer (définie dans main.cpp)
extern void updateTimerInterval(uint16_t seconds);

/**
 * @brief Écoute et accumule les commandes série sur l'USB (Serial) et le Bluetooth SPP.
 */
void checkSerialCommands() {
    static char serialBuf[64];
    static size_t serialIdx = 0;
    
    // Lecture des commandes sur le port USB
    while (Serial.available() > 0) {
        char c = Serial.read();
        if (c == '\n' || c == '\r') {
            if (serialIdx > 0) {
                serialBuf[serialIdx] = '\0';
                handleConfigCommand(serialBuf, Serial);
                serialIdx = 0;
            }
        } else if (serialIdx < sizeof(serialBuf) - 1) {
            serialBuf[serialIdx++] = c;
        } else {
            serialIdx = 0;
            Serial.println("ERROR: Command too long (max 63 chars)");
            while (Serial.available() > 0 && Serial.peek() != '\n' && Serial.peek() != '\r') { Serial.read(); }
        }
    }

#if ENABLE_BLUETOOTH
    static char btBuf[64];
    static size_t btIdx = 0;
    
    // Lecture des commandes sur le port Bluetooth SPP
    while (SerialBT.available() > 0) {
        char c = SerialBT.read();
        if (c == '\n' || c == '\r') {
            if (btIdx > 0) {
                btBuf[btIdx] = '\0';
                handleConfigCommand(btBuf, SerialBT);
                btIdx = 0;
            }
        } else if (btIdx < sizeof(btBuf) - 1) {
            btBuf[btIdx++] = c;
        } else {
            btIdx = 0;
            SerialBT.println("ERROR: Command too long (max 63 chars)");
            while (SerialBT.available() > 0 && SerialBT.peek() != '\n' && SerialBT.peek() != '\r') { SerialBT.read(); }
        }
    }
#endif
}

/**
 * @brief Analyse, décode et applique les commandes de configuration au format AT.
 * @param cmd Tampon de la ligne de commande reçue.
 * @param responseStream Flux de réponse (Serial ou SerialBT).
 */
void handleConfigCommand(const char* cmd, Stream& responseStream) {
    // Ignorer silencieusement si la commande ne commence pas par "AT"
    if (strncmp(cmd, "AT", 2) != 0) {
        return;
    }

    // AT
    if (strcmp(cmd, "AT") == 0) {
        responseStream.println("OK");
        return;
    }

    // AT+FREQ=<mhz> ou AT+FREQ?
    if (strncmp(cmd, "AT+FREQ=", 8) == 0) {
        float val = atof(cmd + 8);
        if (val >= FREQ_MIN && val <= FREQ_MAX) {
            activeConfig.frequency = val;
            int state = RADIOLIB_ERR_UNKNOWN;
            if (xSemaphoreTake(radioMutex, portMAX_DELAY) == pdTRUE) {
                state = radio.setFrequency(val);
                xSemaphoreGive(radioMutex);
            }
            if (state == RADIOLIB_ERR_NONE) {
                responseStream.println("OK");
            } else {
                responseStream.printf("ERROR: %d\n", state);
            }
        } else {
            responseStream.printf("ERROR: Out of limits [%.1f - %.1f] MHz\n", FREQ_MIN, FREQ_MAX);
        }
    } else if (strcmp(cmd, "AT+FREQ?") == 0) {
        responseStream.printf("+FREQ: %.3f\n", activeConfig.frequency);
        responseStream.println("OK");
    }

    // AT+SF=<6-12> ou AT+SF?
    else if (strncmp(cmd, "AT+SF=", 6) == 0) {
        int val = atoi(cmd + 6);
        if (val >= 6 && val <= 12) {
            activeConfig.spreadingFactor = val;
            int state = RADIOLIB_ERR_UNKNOWN;
            if (xSemaphoreTake(radioMutex, portMAX_DELAY) == pdTRUE) {
                state = radio.setSpreadingFactor(val);
                xSemaphoreGive(radioMutex);
            }
            if (state == RADIOLIB_ERR_NONE) {
                responseStream.println("OK");
            } else {
                responseStream.printf("ERROR: %d\n", state);
            }
        } else {
            responseStream.println("ERROR: SF must be between 6 and 12");
        }
    } else if (strcmp(cmd, "AT+SF?") == 0) {
        responseStream.printf("+SF: %d\n", activeConfig.spreadingFactor);
        responseStream.println("OK");
    }

    // AT+BW=<khz> ou AT+BW?
    else if (strncmp(cmd, "AT+BW=", 6) == 0) {
        float val = atof(cmd + 6);
        if (val > 0.0f) {
            activeConfig.bandwidth = val;
            int state = RADIOLIB_ERR_UNKNOWN;
            if (xSemaphoreTake(radioMutex, portMAX_DELAY) == pdTRUE) {
                state = radio.setBandwidth(val);
                xSemaphoreGive(radioMutex);
            }
            if (state == RADIOLIB_ERR_NONE) {
                responseStream.println("OK");
            } else {
                responseStream.printf("ERROR: %d\n", state);
            }
        } else {
            responseStream.println("ERROR: Bandwidth must be greater than 0");
        }
    } else if (strcmp(cmd, "AT+BW?") == 0) {
        responseStream.printf("+BW: %.1f\n", activeConfig.bandwidth);
        responseStream.println("OK");
    }

    // AT+POWER=<dbm> ou AT+POWER?
    else if (strncmp(cmd, "AT+POWER=", 9) == 0) {
        int val = atoi(cmd + 9);
        if (val >= 2 && val <= 20) {
            activeConfig.power = val;
            int state = RADIOLIB_ERR_UNKNOWN;
            if (xSemaphoreTake(radioMutex, portMAX_DELAY) == pdTRUE) {
                state = radio.setOutputPower(val);
                xSemaphoreGive(radioMutex);
            }
            if (state == RADIOLIB_ERR_NONE) {
                responseStream.println("OK");
            } else {
                responseStream.printf("ERROR: %d\n", state);
            }
        } else {
            responseStream.println("ERROR: Power must be between 2 and 20 dBm");
        }
    } else if (strcmp(cmd, "AT+POWER?") == 0) {
        responseStream.printf("+POWER: %d\n", activeConfig.power);
        responseStream.println("OK");
    }

    // AT+CRC=0 ou AT+CRC=1 ou AT+CRC?
    else if (strncmp(cmd, "AT+CRC=", 7) == 0) {
        int enable = -1;
        int mode = 0;
        int numArgs = sscanf(cmd + 7, "%d,%d", &enable, &mode);
        if (numArgs >= 1 && (enable == 0 || enable == 1)) {
            if (numArgs == 2 && mode != 0 && mode != 1) {
                responseStream.println("ERROR: CRC mode must be 0 (CCITT) or 1 (IBM)");
            } else {
                activeConfig.crcEnable = (enable == 1);
                if (numArgs == 2) {
                    activeConfig.crcMode = (mode == 1);
                }
                int state = RADIOLIB_ERR_UNKNOWN;
                if (xSemaphoreTake(radioMutex, portMAX_DELAY) == pdTRUE) {
                    state = radio.setCRC(activeConfig.crcEnable, activeConfig.crcMode);
                    xSemaphoreGive(radioMutex);
                }
                if (state == RADIOLIB_ERR_NONE) {
                    responseStream.println("OK");
                } else {
                    responseStream.printf("ERROR: %d\n", state);
                }
            }
        } else {
            responseStream.println("ERROR: CRC must be 0 (Disabled) or 1 (Enabled): AT+CRC=<0|1>[,0|1]");
        }
    } else if (strcmp(cmd, "AT+CRC?") == 0) {
        responseStream.printf("+CRC: %d,%d\n", activeConfig.crcEnable ? 1 : 0, activeConfig.crcMode ? 1 : 0);
        responseStream.println("OK");
    }

    // AT+ID=<id> ou AT+ID? (Identifiant unique du tracker, 0-255)
    else if (strncmp(cmd, "AT+ID=", 6) == 0) {
        int val = atoi(cmd + 6);
        if (val >= 0 && val <= 255) {
            activeConfig.trackerId = (uint8_t)val;
            responseStream.println("OK");
        } else {
            responseStream.println("ERROR: ID must be between 0 and 255");
        }
    } else if (strcmp(cmd, "AT+ID?") == 0) {
        responseStream.printf("+ID: %d\n", activeConfig.trackerId);
        responseStream.println("OK");
    }

    // AT+TYPE=<type> ou AT+TYPE? (Type de tracker: 0=FX, 1=MF, 2=BALLOON, 3=OTHER)
    else if (strncmp(cmd, "AT+TYPE=", 8) == 0) {
        int val = atoi(cmd + 8);
        if (val >= 0 && val <= 3) {
            activeConfig.trackerType = (uint8_t)val;
            responseStream.println("OK");
        } else {
            responseStream.println("ERROR: Type must be 0 (FX), 1 (MF), 2 (BALLOON) or 3 (OTHER)");
        }
    } else if (strcmp(cmd, "AT+TYPE?") == 0) {
        responseStream.printf("+TYPE: %d\n", activeConfig.trackerType);
        responseStream.println("OK");
    }

    // AT+APID=<apid> ou AT+APID? (Application ID, 0-255)
    else if (strncmp(cmd, "AT+APID=", 8) == 0) {
        int val = atoi(cmd + 8);
        if (val >= 0 && val <= 255) {
            activeConfig.apid = (uint8_t)val;
            responseStream.println("OK");
        } else {
            responseStream.println("ERROR: APID must be between 0 and 255");
        }
    } else if (strcmp(cmd, "AT+APID?") == 0) {
        responseStream.printf("+APID: %d\n", activeConfig.apid);
        responseStream.println("OK");
    }

    // AT+INTERVAL=<seconds> ou AT+INTERVAL? (Intervalle d'envoi en secondes)
    else if (strncmp(cmd, "AT+INTERVAL=", 12) == 0) {
        int val = atoi(cmd + 12);
        if (val >= 1 && val <= 3600) {
            activeConfig.txInterval = (uint16_t)val;
            updateTimerInterval(activeConfig.txInterval);
            saveLoRaConfig(); // Enregistrer automatiquement dans la mémoire de configuration NVS
            responseStream.println("OK");
        } else {
            responseStream.println("ERROR: Interval must be between 1 and 3600 seconds");
        }
    } else if (strcmp(cmd, "AT+INTERVAL?") == 0) {
        responseStream.printf("+INTERVAL: %d\n", activeConfig.txInterval);
        responseStream.println("OK");
    }

    // AT+DEBUG=0 ou AT+DEBUG=1 ou AT+DEBUG? (Logs de débogage lisibles sur USB)
    else if (strncmp(cmd, "AT+DEBUG=", 9) == 0) {
        int val = atoi(cmd + 9);
        if (val == 0 || val == 1) {
            activeConfig.enableDebugLogs = (uint8_t)val;
            saveLoRaConfig();
            responseStream.println("OK");
        } else {
            responseStream.println("ERROR: Debug mode must be 0 (Disabled) or 1 (Enabled)");
        }
    } else if (strcmp(cmd, "AT+DEBUG?") == 0) {
        responseStream.printf("+DEBUG: %d\n", activeConfig.enableDebugLogs);
        responseStream.println("OK");
    }

    // AT+BINUSB=0 ou AT+BINUSB=1 ou AT+BINUSB? (Émission trame binaire brute sur USB)
    else if (strncmp(cmd, "AT+BINUSB=", 10) == 0) {
        int val = atoi(cmd + 10);
        if (val == 0 || val == 1) {
            activeConfig.enableUsbBinary = (uint8_t)val;
            saveLoRaConfig();
            responseStream.println("OK");
        } else {
            responseStream.println("ERROR: Binary USB mode must be 0 (Disabled) or 1 (Enabled)");
        }
    } else if (strcmp(cmd, "AT+BINUSB?") == 0) {
        responseStream.printf("+BINUSB: %d\n", activeConfig.enableUsbBinary);
        responseStream.println("OK");
    }

    // AT+TIME=<epoch> ou AT+TIME?
    else if (strncmp(cmd, "AT+TIME=", 8) == 0) {
        uint32_t epoch = strtoul(cmd + 8, NULL, 10);
        rtc.setTime(epoch);
        responseStream.println("OK");
    } else if (strcmp(cmd, "AT+TIME?") == 0) {
        responseStream.printf("+TIME: %lu\n", rtc.getEpoch());
        responseStream.println("OK");
    }

    // AT+CFG ou AT+STATUS
    else if (strcmp(cmd, "AT+CFG") == 0 || strcmp(cmd, "AT+STATUS") == 0) {
        responseStream.println("--- Wasp-TX Tracker Configuration ---");
        responseStream.printf("Firmware Version   : %s\n", FW_VERSION);
        responseStream.printf("Tracker ID (ID)    : %d\n", activeConfig.trackerId);
        responseStream.printf("Tracker Type (TYPE): %d (%s)\n", activeConfig.trackerType, 
                              (activeConfig.trackerType == 0) ? "FX" :
                              (activeConfig.trackerType == 1) ? "MF" :
                              (activeConfig.trackerType == 2) ? "BALLOON" : "OTHER");
        responseStream.printf("Application (APID) : %d\n", activeConfig.apid);
        responseStream.printf("Send Interval (INT): %d seconds\n", activeConfig.txInterval);
        responseStream.printf("Allowed Range      : [%.1f - %.1f] MHz\n", FREQ_MIN, FREQ_MAX);
        responseStream.printf("Frequency (Active) : %.3f MHz\n", activeConfig.frequency);
        responseStream.printf("Spreading Factor   : %d\n", activeConfig.spreadingFactor);
        responseStream.printf("Bandwidth          : %.1f kHz\n", activeConfig.bandwidth);
        responseStream.printf("Tx Power           : %d dBm\n", activeConfig.power);
        if (activeConfig.crcEnable) {
            responseStream.printf("Hardware CRC       : ON (%s)\n", activeConfig.crcMode ? "IBM" : "CCITT");
        } else {
            responseStream.println("Hardware CRC       : OFF");
        }
        responseStream.printf("USB Binary Out     : %s\n", activeConfig.enableUsbBinary ? "ON" : "OFF");
        responseStream.printf("USB Debug Logs     : %s\n", activeConfig.enableDebugLogs ? "ON" : "OFF");
#if ENABLE_BLUETOOTH
        responseStream.printf("Bluetooth Client   : %s\n", SerialBT.connected() ? "Connected" : "Disconnected");
#endif
        responseStream.println("-------------------------------------");
        responseStream.println("OK");
    }

    // AT+SAVE
    else if (strcmp(cmd, "AT+SAVE") == 0) {
        saveLoRaConfig();
        responseStream.println("OK");
    }

    // AT+RESET
    else if (strcmp(cmd, "AT+RESET") == 0) {
        resetLoRaConfig();
        updateTimerInterval(activeConfig.txInterval);
        responseStream.println("OK");
        delay(1000);
        ESP.restart();
    }

    // AT+HELP ou AT?
    else if (strcmp(cmd, "AT+HELP") == 0 || strcmp(cmd, "AT?") == 0) {
        responseStream.println("--- Available Wasp-TX AT Commands ---");
        responseStream.println("AT               : Test link");
        responseStream.println("AT+HELP or AT?   : Print this help menu");
        responseStream.println("AT+INFO or AT+VER: Print tracker identification");
        responseStream.println("AT+ID=<0-255>    : Set Tracker ID (SSID Num)");
        responseStream.println("AT+ID?           : Get Tracker ID");
        responseStream.println("AT+TYPE=<0-3>    : Set Tracker Type (0=FX, 1=MF, 2=BALLOON, 3=OTHER)");
        responseStream.println("AT+TYPE?         : Get Tracker Type");
        responseStream.println("AT+APID=<0-255>  : Set Application Process ID");
        responseStream.println("AT+APID?         : Get Application Process ID");
        responseStream.println("AT+INTERVAL=<s>  : Set transmit interval in seconds (1-3600)");
        responseStream.println("AT+INTERVAL?     : Get transmit interval");
        responseStream.println("AT+FREQ=<mhz>    : Set active frequency (e.g., 869.525)");
        responseStream.println("AT+FREQ?         : Get active frequency");
        responseStream.println("AT+SF=<6-12>     : Set active Spreading Factor");
        responseStream.println("AT+SF?           : Get active Spreading Factor");
        responseStream.println("AT+BW=<khz>      : Set active Bandwidth");
        responseStream.println("AT+BW?           : Get active Bandwidth");
        responseStream.println("AT+POWER=<dbm>   : Set LoRa Tx power (2-20 dBm)");
        responseStream.println("AT+POWER?        : Get LoRa Tx power");
        responseStream.println("AT+CRC=<0|1>     : Set Hardware CRC (0=OFF, 1=ON)");
        responseStream.println("AT+CRC?          : Get Hardware CRC status");
        responseStream.println("AT+TIME=<epoch>  : Set RTC time (Unix Epoch)");
        responseStream.println("AT+TIME?         : Get RTC time (Unix Epoch)");
        responseStream.println("AT+DEBUG=<0|1>   : Set USB Debug logs (0=OFF, 1=ON)");
        responseStream.println("AT+DEBUG?        : Get USB Debug logs status");
        responseStream.println("AT+BINUSB=<0|1>  : Set USB Binary Output (0=OFF, 1=ON)");
        responseStream.println("AT+BINUSB?       : Get USB Binary Output status");
        responseStream.println("AT+CFG           : Get detailed configuration");
        responseStream.println("AT+SAVE          : Save current config to NVS");
        responseStream.println("AT+RESET         : Reset config to factory & reboot");
        responseStream.println("-------------------------------------");
        responseStream.println("OK");
    }

    // AT+INFO ou AT+VER
    else if (strcmp(cmd, "AT+INFO") == 0 || strcmp(cmd, "AT+VER") == 0) {
        responseStream.printf("+INFO: WASP-TX TRACKER,FW=%s\n", FW_VERSION);
        responseStream.println("OK");
    }

    // Cas d'erreur : commande non reconnue
    else {
        responseStream.printf("ERROR: Unknown AT command '%s'\n", cmd);
    }
}
