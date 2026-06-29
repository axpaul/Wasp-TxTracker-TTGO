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
    while (1) {
        bool encoded = false;
        while (Serial1.available() > 0) {
            if (gps.encode(Serial1.read())) {
                encoded = true;
            }
        }
        
        if (encoded) {
            if (xSemaphoreTake(gpsMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
                sharedGPSData.latitude = gps.location.lat();
                sharedGPSData.longitude = gps.location.lng();
                sharedGPSData.altitude = gps.altitude.meters();
                sharedGPSData.speed = gps.speed.kmph();
                sharedGPSData.course = gps.course.deg();
                sharedGPSData.satellites = gps.satellites.value();
                sharedGPSData.fix = gps.location.isValid();
                
                if (gps.time.isValid()) {
                    sharedGPSData.hour = gps.time.hour();
                    sharedGPSData.minute = gps.time.minute();
                    sharedGPSData.second = gps.time.second();
                    
                    // Synchronisation de l'heure RTC locale si les données GPS sont valides
                    if (gps.time.isUpdated() && gps.location.isValid()) {
                        rtc.setTime(gps.time.second(), gps.time.minute(), gps.time.hour(), 
                                    gps.date.day(), gps.date.month(), gps.date.year());
                    }
                }
                xSemaphoreGive(gpsMutex);
            }
        }
        
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}
