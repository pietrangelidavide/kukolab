#!/usr/bin/env python3
"""Genera il marchio animato della prima schermata (public/index.html, blocco <svg class="wm">).

Parte dal logo vero (public/img/logo-kuko.png: la K con la freccia arancio e LAB), ne ricava i contorni come poligoni
(OpenCV) e disegna a mano le tre lettere che mancano, U K O, con lo stesso carattere di LAB (corsivo largo, inclinato
di circa 14 gradi, aste da 54 e barre da 43 unità). Scrive l'SVG su stdout: incollarlo nel <h1> della home.

Uso:  python3 scripts/wordmark.py > .tmp/wordmark.svg      (serve opencv, numpy e pillow)
Le misure sono in unità del logo (1344 x 486): K a sinistra, UKO nel mezzo, LAB a destra spostato di OFFSET_LAB.
"""
import math
import sys
import cv2
import numpy as np
from PIL import Image

LOGO = 'public/img/logo-kuko.png'
X0, Y0 = 13, 12            # angolo in alto a sinistra del logo (togliamo il margine trasparente)
SLANT = 0.25               # inclinazione delle lettere di LAB (dx per dy)
H = 207                    # altezza delle lettere di LAB
TOP = 137 - Y0             # dove cominciano, in alto, le lettere di LAB
SV, TB = 54, 43            # spessore delle aste verticali e delle barre orizzontali
GAP_LETTER, GAP_WORD = 20, 32


def trace():
    im = np.array(Image.open(LOGO).convert('RGBA')).astype(np.float32)
    a = im[..., 3] / 255
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    white = a * ((r + g + b) / 3 / 255)
    orange = a * np.clip((r - b) / 200, 0, 1) * (r > 150)
    om = (cv2.GaussianBlur(orange, (0, 0), 0.8) > 0.5).astype(np.uint8)
    wm = ((cv2.GaussianBlur(white, (0, 0), 0.8) > 0.5).astype(np.uint8)) & (1 - om)
    out = {'white': [], 'orange': []}
    for name, m, eps in (('white', wm, 1.3), ('orange', om, 1.3)):
        cs, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        owners = {}
        for i, c in enumerate(cs):
            if cv2.contourArea(c) < 300:
                continue
            ap = cv2.approxPolyDP(c, eps, True)[:, 0, :].astype(float)
            ap[:, 0] -= X0
            ap[:, 1] -= Y0
            parent = hier[0][i][3]
            if parent == -1:
                owners[i] = {'poly': [ap], 'x': cv2.boundingRect(c)[0]}
            else:
                owners.setdefault(parent, {'poly': [], 'x': 0})['poly'].append(ap)
        out[name] = sorted(owners.values(), key=lambda o: o['x'])
    return out


def d_of(polys):
    return ' '.join('M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in p) + 'Z' for p in polys)


def arc(cx, cy, r, a0, a1, n=7):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]


def shear(pts, x0):
    return [(x0 + x + (H - y) * SLANT, TOP + y) for x, y in pts]


def letter_U(w):
    R, ri = 66, 22
    p = [(0, 0), (SV, 0), (SV, H - TB - ri)] + arc(SV + ri, H - TB - ri, ri, 180, 90) + arc(w - SV - ri, H - TB - ri, ri, 90, 0) \
        + [(w - SV, 0), (w, 0), (w, H - R)] + arc(w - R, H - R, R, 0, 90) + arc(R, H - R, R, 90, 180)
    return [p]


def letter_O(w):
    R, ri = 78, 30
    outer = arc(R, R, R, 180, 270) + arc(w - R, R, R, 270, 360) + arc(w - R, H - R, R, 0, 90) + arc(R, H - R, R, 90, 180)
    inner = arc(SV + ri, TB + ri, ri, 180, 270) + arc(w - SV - ri, TB + ri, ri, 270, 360) + arc(w - SV - ri, H - TB - ri, ri, 0, 90) + arc(SV + ri, H - TB - ri, ri, 90, 180)
    return [outer, inner[::-1]]


def letter_K(w):
    ta, tb = 64, 68
    up_y, lo_y = 0.40 * H, 0.60 * H
    nx = w - (w - ta - SV) * 0.5 / 0.40
    return [[(0, 0), (SV, 0), (SV, up_y), (w - ta, 0), (w, 0), (nx, 0.5 * H), (w, H), (w - tb, H), (SV, lo_y), (SV, H), (0, H)]]


def main():
    t = trace()
    kmark = [o for o in t['white'] if o['x'] < 500]
    lab = [o for o in t['white'] if o['x'] >= 500]
    chev = t['orange']
    k_right = max(p[:, 0].max() for o in chev for p in o['poly'])          # bordo destro della freccia
    lab_left = min(p[:, 0].min() for o in lab for p in o['poly'])
    lab_right = max(p[:, 0].max() for o in lab for p in o['poly'])
    widths = {'U': 172, 'K': 175, 'O': 190}
    letters = [('U', letter_U), ('K', letter_K), ('O', letter_O)]
    x = k_right + GAP_WORD
    uko = []
    for name, fn in letters:
        w = widths[name]
        polys = [shear(p, x) for p in fn(w)]
        uko.append((name, polys))
        x += w + H * SLANT + GAP_LETTER
    uko_right = x - GAP_LETTER
    lab_new_left = uko_right + GAP_WORD
    shift = lab_new_left - lab_left                                           # di quanto va spostato LAB
    total = lab_new_left + (lab_right - lab_left)
    start = (total - (lab_right)) / 2                                         # il logo intero, centrato, prima di aprirsi
    print(f'<!-- generato da scripts/wordmark.py: larghezza {total:.0f}, LAB si sposta di {shift:.0f}, partenza {start:.0f} -->', file=sys.stderr)
    out = []
    out.append(f'<svg class="wm" viewBox="0 0 {total:.0f} 460" style="--w:{total:.0f};--d:{shift / 2:.0f};--s:{start:.0f}" aria-hidden="true" focusable="false">')
    out.append('  <g class="wm-k">')
    for o in kmark:
        out.append(f'    <path class="w" d="{d_of(o["poly"])}"/>')
    for o in chev:
        out.append(f'    <path class="o" d="{d_of(o["poly"])}"/>')
    out.append('  </g>')
    out.append('  <g class="wm-uko">')
    for i, (name, polys) in enumerate(uko):
        out.append(f'    <g class="u" style="--i:{i}"><path class="w" d="{d_of([np.array(p) for p in polys])}"/></g>')
    out.append('  </g>')
    out.append(f'  <g class="wm-lab" transform="translate({shift:.0f} 0)"><g class="lab">')
    for o in lab:
        out.append(f'    <path class="w" d="{d_of(o["poly"])}"/>')
    out.append('  </g></g>')
    out.append('</svg>')
    print('\n'.join(out))


if __name__ == '__main__':
    main()
