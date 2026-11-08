#!/usr/bin/env python3
"""Ricava i ritagli con trasparenza del nutrizionista, dell'osteopata e della fisioterapista (sezione "Benessere a 360°" di /percorso/).

Le figure sono le stesse persone 3D della pagina, disegnate dal motore in modalita' ritratto. Si generano due immagini per persona,
una su sfondo nero e una su sfondo bianco, e dalla differenza si ricava la trasparenza vera (anche sui bordi e sui capelli):
    alpha = 1 - (bianco - nero)      colore = nero / alpha

Uso (con la pagina servita in locale, es. python3 -m http.server 8123 --directory public):
    node  <dove-vuoi>/ritratti.cjs ...   oppure, a mano, per ogni nome:
    /percorso/?live&cine=0&ritratti=<nutrizionista|osteopata|fisioterapista>&sfondo=<000|fff>
salvando gli screenshot del canvas come <cartella>/<nome>_000.png e <cartella>/<nome>_fff.png, poi:
    python3 scripts/percorso-professionisti.py <cartella>

Scrive public/percorso/img/pro-<nome>.webp. Tutte e tre sono ridotte dello stesso fattore, cosi' le proporzioni tra le persone restano
quelle della scena, e tagliate al bordo dei piedi.
"""
import os
import sys

import numpy as np
from PIL import Image

RADICE = os.path.normpath(os.path.join(os.path.dirname(__file__), '..'))
USCITA = os.path.join(RADICE, 'public', 'percorso', 'img')
NOMI = ['nutrizionista', 'osteopata', 'fisioterapista']
SCALA = 0.5  # 2080 px di altezza della schermata -> ~1000


def ritaglia(cartella, nome):
    nero = np.asarray(Image.open(os.path.join(cartella, f'{nome}_000.png')).convert('RGB'), dtype=np.float32) / 255.0
    bianco = np.asarray(Image.open(os.path.join(cartella, f'{nome}_fff.png')).convert('RGB'), dtype=np.float32) / 255.0
    alpha = np.clip(1.0 - (bianco - nero).mean(axis=2), 0.0, 1.0)
    alpha[alpha < 0.02] = 0.0
    colore = np.where(alpha[..., None] > 0.004, nero / np.maximum(alpha[..., None], 0.004), 0.0)
    rgba = np.dstack([np.clip(colore, 0, 1), alpha])
    ys, xs = np.where(alpha > 0.03)
    pad = 6
    rgba = rgba[max(0, ys.min() - pad): ys.max() + pad, max(0, xs.min() - pad): xs.max() + pad]
    out = Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA')
    out = out.resize((round(out.width * SCALA), round(out.height * SCALA)), Image.LANCZOS)
    dest = os.path.join(USCITA, f'pro-{nome}.webp')
    out.save(dest, quality=88, method=6)
    print(nome, out.size, os.path.getsize(dest) // 1024, 'KB')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    os.makedirs(USCITA, exist_ok=True)
    for n in (sys.argv[2].split(',') if len(sys.argv) > 2 else NOMI):
        ritaglia(sys.argv[1], n)
