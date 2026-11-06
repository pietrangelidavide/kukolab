#!/usr/bin/env python3
"""Rifà le foto dei tre corsi (public/img/corso-pt.jpg, corso-functional.jpg, corso-pilates.jpg) dagli originali:
ritaglio 4:5, ritocco di rumore, luci e nitidezza (enhance.py) e una leggera correzione di colore (un filo più caldo, più contrasto, colori pieni).
Uso:  python3 scripts/corsi-foto.py pt FOTO_PT.jpg  |  functional FOTO.jpg  |  pilates FOTO.png
I ritagli sono tarati sulle foto consegnate dal cliente (schermate da video); con altre foto vanno ritoccati i valori in CROPS."""
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from enhance import enhance, save  # noqa: E402

PUB = Path(__file__).resolve().parent.parent / 'public' / 'img'
# nome: (file, riga di partenza del ritaglio 4:5 nella foto originale, forza del ritocco, livelli, caldo, contrasto, saturazione, luce, [riquadro da ripulire x0,y0,x1,y1])
CROPS = {
    'pilates':    ('corso-pilates.jpg',    380, 0.8, 0.35, 0.01, 0.12, 0.06, 0.00, None),
    'functional': ('corso-functional.jpg', 680, 1.0, 0.50, 0.03, 0.18, 0.12, 0.06, (1150, 2330, 1320, 2412)),  # via l'icona a schermo intero
    'pt':         ('corso-pt.jpg',         650, 1.0, 0.50, 0.03, 0.18, 0.12, 0.06, None),
}


def grade(im, warm, contrast, sat, lift):
    a = np.asarray(im).astype(np.float32) / 255
    a[:, :, 0] *= 1 + warm
    a[:, :, 2] *= 1 - warm
    a = np.clip(a, 0, 1)
    if contrast:
        a = np.clip(a + contrast * (a - 0.5) * (1 - np.abs(2 * a - 1)) * 2, 0, 1)
    if lift:
        a = a ** (1 - lift)
    out = np.asarray((a * 255 + .5).astype(np.uint8))
    if sat:
        hsv = cv2.cvtColor(out, cv2.COLOR_RGB2HSV).astype(np.float32)
        hsv[:, :, 1] = np.clip(hsv[:, :, 1] * (1 + sat), 0, 255)
        out = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)
    return Image.fromarray(out)


def main(name, src):
    out, y0, strength, levels, warm, contrast, sat, lift, patch = CROPS[name]
    im = Image.open(src).convert('RGB')
    if patch:
        a = cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR)
        m = np.zeros(a.shape[:2], np.uint8)
        x0, py0, x1, py1 = patch
        m[py0:py1, x0:x1] = 255
        im = Image.fromarray(cv2.cvtColor(cv2.inpaint(a, m, 6, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB))
    h = round(im.width * 5 / 4)
    im = im.crop((0, y0, im.width, min(im.height, y0 + h)))
    res = grade(enhance(im, width=900, strength=strength, levels=levels), warm, contrast, sat, lift)
    save(res, PUB / out, 84)
    print(f'{out}: {res.width}x{res.height}')


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in CROPS:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
