/**
 * @file at_commands.h
 * @brief Déclarations des fonctions de traitement des commandes AT pour Wasp-TX.
 * @author Paul Miailhe
 * @date 05/07/2026
 */
#ifndef AT_COMMANDS_H
#define AT_COMMANDS_H

#include <Arduino.h>

/**
 * @brief Écoute et accumule les commandes série sur l'USB (Serial) et le Bluetooth SPP.
 */
void checkSerialCommands();

/**
 * @brief Analyse, décode et applique les commandes de configuration au format AT.
 * @param cmd Tampon de la ligne de commande reçue.
 * @param responseStream Flux de réponse (Serial ou SerialBT).
 */
void handleConfigCommand(const char* cmd, Stream& responseStream);

#endif // AT_COMMANDS_H
