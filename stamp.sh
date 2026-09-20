#!/bin/bash
# Scrie amprenta versiunii în pagină și într-un fișier minuscul pe care telefonul
# îl poate verifica des. GitHub Pages trimite cache-control: max-age=600, deci
# fără asta telefonul poate rămâne 10 minute pe versiunea veche fără să știi.
set -e
cd "$(dirname "$0")"
STAMP="$(date -u +%H:%M:%S) $(git rev-parse --short HEAD 2>/dev/null || echo new)"
printf '%s' "$STAMP" > version.txt
python3 - "$STAMP" <<'PY'
import re, sys
stamp = sys.argv[1]
p = 'index.html'; s = open(p).read()
s = re.sub(r"const BUILD = '[^']*';", "const BUILD = '%s';" % stamp, s)
open(p, 'w').write(s)
print('stamp:', stamp)
PY
