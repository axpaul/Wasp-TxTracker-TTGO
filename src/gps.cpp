/**
 * @file gps.cpp
 * @brief Gestion asynchrone du module GPS (NMEA parsing et thread-safety).
 * @author Paul Miailhe
 * @date 29/06/2026
 */

#include "header.h"

// --- Définitions des Objets et Variables Globaux du GPS ---
TinyGPSPlus gps;
SemaphoreHandle_t gpsMutex = NULL;
WaspGPSData sharedGPSData = {0};

/**
 * @brief Tâche FreeRTOS dédiée à la lecture et au décodage asynchrone du module GPS.
 *        S'exécute sur le Cœur 0 (PRO_CPU).
 */
void gpsTask(void *pvParameters) {
    static uint32_t lastRtcSync = 0; // Stocke le timestamp millisecondes de la dernière synchro RTC
    
    while (1) {
        bool encoded = false;
        while (Serial1.available() > 0) {
            if (gps.encode(Serial1.read())) {
                encoded = true;
            }
        }
        
        if (encoded) {
            // 1. Extraire toutes les données en local d'abord (en dehors de la zone critique du Mutex)
            double lat = gps.location.lat();
            double lon = gps.location.lng();
            double alt = gps.altitude.meters();
            double spd = gps.speed.kmph();
            double course = gps.course.deg();
            uint32_t sats = gps.satellites.value();
            bool fix = gps.location.isValid();
            
            bool timeValid = gps.time.isValid();
            uint8_t hour = gps.time.hour();
            uint8_t minute = gps.time.minute();
            uint8_t second = gps.time.second();
            
            // 2. Gérer la synchronisation de l'horloge RTC interne (une fois par heure max ou au premier fix)
            if (timeValid && gps.time.isUpdated() && fix) {
                uint32_t now = millis();
                if (lastRtcSync == 0 || (now - lastRtcSync > 3600000UL)) {
                    rtc.setTime(second, minute, hour, 
                                gps.date.day(), gps.date.month(), gps.date.year());
                    lastRtcSync = now;
                    Serial.printf("[GPS] RTC Synchronized with GPS time: %02d:%02d:%02d\n", hour, minute, second);
                }
            }
            
            // 3. Verrouiller le Mutex uniquement pour la copie mémoire directe (très rapide)
            if (xSemaphoreTake(gpsMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
                sharedGPSData.latitude = lat;
                sharedGPSData.longitude = lon;
                sharedGPSData.altitude = alt;
                sharedGPSData.speed = spd;
                sharedGPSData.course = course;
                sharedGPSData.satellites = sats;
                sharedGPSData.fix = fix;
                
                if (timeValid) {
                    sharedGPSData.hour = hour;
                    sharedGPSData.minute = minute;
                    sharedGPSData.second = second;
                }
                xSemaphoreGive(gpsMutex);
            }
        }
        
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}
