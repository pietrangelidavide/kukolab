#!/usr/bin/env python3
"""Genera il marchio animato della prima schermata (public/index.html, blocco <svg class="wm">).

Parte dal logo vero (public/img/logo-kuko.png: la K con la freccia arancio e LAB), ne ricava i contorni come poligoni
(OpenCV) e disegna a mano le tre lettere che mancano, U K O, con lo stesso carattere di LAB (corsivo largo, inclinato
di circa 14 gradi, aste da 54 e barre da 43 unità). Scrive l'SVG su stdout: incollarlo nel <h1> della home.

Uso:  python3 scripts/wordmark.py > .tmp/wordmark.svg      (serve opencv, numpy e pillow)
Le misure sono in unità del logo (1344 x 486). I vuoti si misurano sul disegno, riga per riga (GAP_LETTER tra K, U, K, O; GAP_WORD tra KUKO e LAB), non sui riquadri delle lettere.
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
GAP_LETTER = 18            # vuoto minimo tra la K del marchio, U, K e O (e tra le lettere di LAB, che e' di 17-24)
GAP_WORD = 64              # vuoto minimo tra KUKO e LAB: lo spazio tra le due parole


ROWS = 460


def mask_of(groups, width=3600):
    """Maschera 1 dove c'e' disegno (il primo poligono di ogni forma e' il contorno, gli altri sono i buchi)."""
    m = np.zeros((ROWS, width), np.uint8)
    for polys in groups:
        for i, p in enumerate(polys):
            cv2.fillPoly(m, [np.round(np.array(p)).astype(np.int32)], 1 if i == 0 else 0)
    return m


def right_edge(m):
    r = np.full(ROWS, -1e9)
    for y in range(ROWS):
        xs = np.flatnonzero(m[y])
        if xs.size:
            r[y] = xs.max() + 1
    return r


def left_edge(m):
    l = np.full(ROWS, 1e9)
    for y in range(ROWS):
        xs = np.flatnonzero(m[y])
        if xs.size:
            l[y] = xs.min()
    return l


def place(prev_right, left, gap):
    """Di quanto spostare a destra una forma (bordo sinistro `left`) perche' dalla precedente (bordo destro `prev_right`) la distanza minima, riga per riga, sia `gap`."""
    ok = (prev_right > -1e8) & (left < 1e8)
    return gap - np.min(left[ok] - prev_right[ok])


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
    kgroup = [o['poly'] for o in kmark + chev]
    lab_polys = [o['poly'] for o in lab]
    widths = {'U': 172, 'K': 175, 'O': 190}
    letters = [('U', letter_U), ('K', letter_K), ('O', letter_O)]
    right = right_edge(mask_of(kgroup))                        # bordo destro di tutto cio' che sta a sinistra, riga per riga
    uko = []
    for name, fn in letters:
        polys = [shear(p, 0) for p in fn(widths[name])]
        dx = place(right, left_edge(mask_of([polys])), GAP_LETTER)
        polys = [[(x + dx, y) for x, y in p] for p in polys]
        uko.append((name, polys))
        right = np.maximum(right, right_edge(mask_of([polys])))
    labm = mask_of(lab_polys)
    shift = place(right, left_edge(labm), GAP_WORD)             # di quanto va spostato LAB
    lab_right = max(p[:, 0].max() for o in lab for p in o['poly'])
    total = lab_right + shift
    start = shift / 2                                          # il logo intero, centrato, prima di aprirsi
    print(f'<!-- generato da scripts/wordmark.py: larghezza {total:.0f}, LAB si sposta di {shift:.0f} -->', file=sys.stderr)
    out = []
    out.append(f'<svg class="wm" viewBox="0 0 {total:.0f} 460" style="--d:{start:.0f}" aria-hidden="true" focusable="false">')
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
