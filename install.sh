#!/bin/bash
# Nouvel UUID
UUID="boby-monitor-indicator@GaspardBBY.github.com"
EXTENSION_PATH="$HOME/.local/share/gnome-shell/extensions/$UUID"

mkdir -p "$EXTENSION_PATH/schemas"

cp ./src/*.js "$EXTENSION_PATH/"
cp ./src/metadata.json "$EXTENSION_PATH/"
cp ./src/schemas/*.xml "$EXTENSION_PATH/schemas/"

# Compilation avec le nouveau nom
glib-compile-schemas "$EXTENSION_PATH/schemas/"

echo "Installé sous : $UUID"
echo "Relancez votre session pour activer Boby System Monitor !"
