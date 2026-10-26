#!/bin/sh
# Собирает 3D-карточку (src/card3d.js + card.js + нужные части Three.js) в один сжатый файл.
# Запускать из корня сайта после правок в src/: sh tools/build-card.sh
npx -y esbuild@0.24.0 src/card3d.js --bundle --format=esm --minify --target=es2020 \
  --alias:three=./vendor/three.module.js --legal-comments=eof --outfile=src/card3d.min.js
