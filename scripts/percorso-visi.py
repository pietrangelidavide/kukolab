#!/usr/bin/env python3
"""Volti per i personaggi 3D del percorso (public/percorso/).

- Tutti i volti sono disegnati con lo stesso linguaggio (stilizzati ma curati): niente foto sui personaggi 3D.
  Valerio, Chiara e il nutrizionista Calabrò mantengono i loro tratti (colore di pelle e occhi, sopracciglia, labbra,
  naso, barba, sorriso) ma sono resi come gli altri personaggi: una sola mano, un solo stile.

Uso: python3 scripts/percorso-visi.py   (serve opencv-python, pillow, numpy)
Esce in public/percorso/img/viso-*.webp e public/percorso/img/visi.json (colore della pelle di ognuno).
Coordinate della testa 3D: x da -0,30 a 0,30; y da 0,40 (fronte) a -0,40 (mento).
"""
import json, math, os, random
import numpy as np, cv2
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'public', 'img')
OUT = os.path.join(ROOT, 'public', 'percorso', 'img')
os.makedirs(OUT, exist_ok=True)
W, H = 576, 768
META = {}

# ------------------------------------------------------------ volti disegnati
SS = 2; CW, CH = W * SS, H * SS
FS = 1.22
def px(x, y): return ((x * FS + 0.30) / 0.6 * CW, (0.40 - (y - 0.02) * FS) / 0.8 * CH)
def col(c, a=1.0): return tuple(int(round(v * 255)) for v in c) + (int(round(a * 255)),)
def layer(): return Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
def over(a, b): return Image.alpha_composite(a, b)
def blur(l, r):
    r = r * FS
    if r <= 0: return l
    a = np.asarray(l).astype(np.float32) / 255; al = a[..., 3:4]; pm = np.concatenate([a[..., :3] * al, al], axis=2)
    pm = cv2.GaussianBlur(pm, (0, 0), r * CW / 0.6)
    al = pm[..., 3:4]; rgb = np.where(al > 1e-4, pm[..., :3] / np.maximum(al, 1e-4), 0)
    return Image.fromarray(np.clip(np.concatenate([rgb, al], axis=2) * 255 + 0.5, 0, 255).astype(np.uint8), 'RGBA')
def curve(p0, p1, p2, n=24):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in [i / n for i in range(n + 1)]]
def poly(d, pts, fill): d.polygon([px(*p) for p in pts], fill=fill)
def stroke(d, pts, w, fill):
    P = [px(*p) for p in pts]; d.line(P, fill=fill, width=max(1, int(w * FS * CW / 0.6)), joint='curve')
    r = max(0.5, w * FS * CW / 0.6 / 2)
    for q in (P[0], P[-1]): d.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], fill=fill)
def disc(d, c, r, fill):
    x, y = px(*c); rr = r * FS * CW / 0.6; d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=fill)

def illus(name, skin, iris, brow, lip, freckles=0, smile=0.022, brow_w=0.0016, stubble=0.0, eye_open=1.0, seed=7,
          brow_t=1.0, brow_y=0.0, brow_a=0.0, brow_in=0.0, lipf=1.0, nose=1.0, jaw=0.0, cheek=1.0, lash=1.0, eye_s=1.0, teeth=0.0, cheek_stubble=0.0, stub_col=(0.16, 0.12, 0.11), lip_w=0.082, bridge=0.0, stub_s=1.0):
    """Parametri fisionomici (tutti opzionali, con 1.0 / 0.0 il volto resta quello base):
    brow_t spessore sopracciglia, brow_y altezza, brow_a arco, brow_in angolo interno (+ alza il lato interno);
    lipf pienezza delle labbra, lip_w larghezza della bocca, smile curva del sorriso, teeth sorriso con i denti (0..1);
    nose forza di ombre del naso, bridge ombra sul dorso del naso; jaw mascella marcata (ombra ai lati del mento);
    cheek zigomi/guance (colore e luce); lash ciglia; eye_s dimensione degli occhi;
    stubble barba (puntini) e cheek_stubble barba che sale sulle guance."""
    img = Image.new('RGBA', (CW, CH), col(skin))
    sh = layer(); d = ImageDraw.Draw(sh)
    warm = (min(1, skin[0] + 0.06), skin[1] * 0.78, skin[2] * 0.78)
    for sd in (-1, 1):
        disc(d, (sd * 0.165, -0.085), 0.07, col(warm, min(1.0, 0.30 * cheek)))
        disc(d, (sd * 0.055, -0.055), 0.016 * nose, col(tuple(c * 0.8 for c in skin), min(1.0, 0.35 * nose)))
        if jaw:   # mascella: ombra leggera all'angolo e sotto lo zigomo
            disc(d, (sd * 0.215, -0.215), 0.075, col(tuple(c * 0.62 for c in skin), 0.30 * jaw))
            disc(d, (sd * 0.14, -0.33), 0.07, col(tuple(c * 0.66 for c in skin), 0.24 * jaw))
            disc(d, (sd * 0.215, -0.02), 0.06, col(tuple(c * 0.7 for c in skin), 0.16 * jaw))
    if jaw: disc(d, (0, -0.385), 0.09, col(tuple(c * 0.68 for c in skin), 0.22 * jaw))
    img = over(img, blur(sh, 0.045))
    hl = layer(); d = ImageDraw.Draw(hl)
    disc(d, (0, 0.20), 0.09, col((1, 0.97, 0.93), 0.12)); disc(d, (0.004, -0.046), 0.011, col((1, 0.96, 0.92), 0.28))
    for sd in (-1, 1): disc(d, (sd * 0.175, -0.015), 0.05, col((1, 0.97, 0.93), min(1.0, 0.08 * cheek)))   # luce sullo zigomo
    img = over(img, blur(hl, 0.05))
    rnd = random.Random(seed)
    if freckles:
        fr = layer(); d = ImageDraw.Draw(fr)
        for _ in range(freckles):
            sd = rnd.choice((-1, 1)); t = rnd.random()
            if t < 0.4: x, y = rnd.gauss(0, 0.028), rnd.gauss(-0.01, 0.045)
            else: x, y = sd * abs(rnd.gauss(0.13, 0.05)), rnd.gauss(-0.07, 0.04)
            if abs(x) > 0.24 or abs(y) > 0.2 or y < -0.15: continue
            if abs(y - 0.05) < 0.03 and 0.05 < abs(x) < 0.16: continue
            disc(d, (x, y), rnd.uniform(0.0016, 0.0032), col(tuple(c * 0.72 for c in skin), rnd.uniform(0.25, 0.5)))
        img = over(img, blur(fr, 0.0008))
    if stubble:
        st = layer(); d = ImageDraw.Draw(st)
        for _ in range(int(2600 * stubble * (1.0 if stub_s >= 1 else 1.0 / stub_s ** 1.6))):
            x = rnd.uniform(-0.25, 0.25); y = rnd.uniform(-0.40, -0.03)
            edge = 0.24 - 0.30 * max(0, (-0.03 - y)) ** 1.6   # più stretta verso il mento
            if abs(x) > max(0.07, 0.27 + y * 0.28): continue
            if y > -0.14 and abs(x) < 0.17: continue          # baffi: solo sopra la bocca
            if -0.20 < y < -0.12 and abs(x) < 0.1: continue      # non sulla bocca
            disc(d, (x, y), rnd.uniform(0.0012, 0.0024) * stub_s, col(stub_col, rnd.uniform(0.2, 0.5)))
        img = over(img, blur(st, 0.0007))
    if cheek_stubble:   # la barba sale sulle guance e sopra il labbro (sfuma verso lo zigomo)
        st = layer(); d = ImageDraw.Draw(st)
        for _ in range(int(2600 * cheek_stubble * (1.0 if stub_s >= 1 else 1.0 / stub_s ** 1.6))):
            x = rnd.uniform(-0.24, 0.24); y = rnd.uniform(-0.28, -0.02)
            if abs(x) > 0.27 + y * 0.30: continue
            if abs(x) < 0.05 and y > -0.115: continue            # sotto il naso c'e' il baffo, non il filtro
            if -0.20 < y < -0.165 and abs(x) < 0.1: continue     # non sulla bocca
            if y > -0.11 and abs(x) < 0.11: continue             # non sul naso
            fade = min(1.0, (-0.02 - y) / 0.10) * (0.35 + 0.65 * min(1.0, abs(x) / 0.12 + (-0.12 - y) * 2.2))
            if rnd.random() > fade: continue
            disc(d, (x, y), rnd.uniform(0.0011, 0.0022) * stub_s, col(stub_col, rnd.uniform(0.16, 0.42)))
        img = over(img, blur(st, 0.0007))
    no = layer(); d = ImageDraw.Draw(no)
    stroke(d, curve((-0.024 * nose ** 0.5, -0.083), (0.002, -0.097), (0.026 * nose ** 0.5, -0.083)), 0.007, col(tuple(c * 0.78 for c in skin), min(1.0, 0.45 * nose)))
    stroke(d, curve((-0.030, 0.02), (-0.036, -0.03), (-0.03, -0.065)), 0.006, col(tuple(c * 0.85 for c in skin), min(1.0, 0.2 * nose)))
    if bridge:   # dorso del naso: ombra sul lato in ombra e luce sul lato opposto
        stroke(d, curve((-0.034, 0.045), (-0.040, -0.01), (-0.034, -0.07)), 0.008, col(tuple(c * 0.74 for c in skin), min(1.0, 0.28 * bridge)))
        stroke(d, curve((0.012, 0.03), (0.016, -0.02), (0.012, -0.07)), 0.006, col((1, 0.97, 0.92), min(1.0, 0.16 * bridge)))
    img = over(img, blur(no, 0.004))
    def eye(sd):
        cx, cy = sd * 0.108, 0.05
        E = lambda u, v: (cx + sd * u * eye_s, cy + v * eye_open * eye_s)
        top = curve(E(-0.052, -0.002), E(0.004, 0.062), E(0.058, 0.004)); bot = curve(E(0.058, 0.004), E(0.004, -0.04), E(-0.052, -0.002))
        sc = layer(); d = ImageDraw.Draw(sc); poly(d, top + bot, col((0.97, 0.95, 0.93)))
        mk = layer(); dm = ImageDraw.Draw(mk); poly(dm, top + bot, (255, 255, 255, 255))
        ir = layer(); d = ImageDraw.Draw(ir); c = E(0.004, 0.004)
        disc(d, c, 0.0285, col(tuple(v * 0.55 for v in iris))); disc(d, c, 0.0235, col(iris)); disc(d, c, 0.0135, col(tuple(v * 0.8 for v in iris)))
        disc(d, c, 0.0105, col((0.08, 0.08, 0.09))); disc(d, E(0.013, 0.014), 0.0062, col((1, 1, 1)))
        ir.putalpha(Image.fromarray(np.minimum(np.asarray(ir)[..., 3], np.asarray(mk)[..., 3])))
        out = over(sc, blur(ir, 0.0004))
        ls = layer(); d = ImageDraw.Draw(ls); poly(d, curve(E(-0.052, -0.002), E(0.004, 0.062), E(0.058, 0.004)) + curve(E(0.058, 0.004), E(0.004, 0.036), E(-0.052, -0.002)), col((0.35, 0.25, 0.22), 0.32))
        ls.putalpha(Image.fromarray(np.minimum(np.asarray(ls)[..., 3], np.asarray(mk)[..., 3]))); out = over(out, blur(ls, 0.003))
        ln = layer(); d = ImageDraw.Draw(ln)
        stroke(d, curve(E(-0.044, 0.016), E(0.004, 0.078), E(0.064, 0.022)), 0.0028, col(tuple(c * 0.8 for c in skin), 0.8))
        dark = (0.2, 0.15, 0.12)
        stroke(d, curve(E(-0.052, -0.002), E(0.004, 0.062), E(0.058, 0.004)), 0.0062 * lash, col(dark))
        stroke(d, curve(E(0.012, 0.050), E(0.040, 0.054), E(0.060, 0.012)), 0.0074 * lash, col(dark))
        stroke(d, bot[4:-2], 0.0022, col((0.5, 0.36, 0.32), 0.7))
        return out, ln
    for sd in (-1, 1):
        e, ln = eye(sd); img = over(img, e); img = over(img, blur(ln, 0.0003))
    bw = layer(); d = ImageDraw.Draw(bw)
    for sd in (-1, 1):
        th = brow_t - 1.0; by = brow_y
        up = curve((sd * 0.040, 0.126 + by + brow_in + th * 0.007), (sd * 0.105, 0.164 + by + brow_a + th * 0.016), (sd * 0.172, 0.118 + by + th * 0.006))
        lo = curve((sd * 0.172, 0.118 + by - th * 0.004), (sd * 0.105, 0.141 + by + brow_a - th * 0.008), (sd * 0.040, 0.110 + by + brow_in - th * 0.007))
        poly(d, up + lo, col(brow, 0.92))
    img = over(img, blur(bw, brow_w))
    mo = layer(); d = ImageDraw.Draw(mo)
    lw, y0 = lip_w, -0.188
    cl, cr = (-lw, y0 + smile), (lw, y0 + smile)
    line = curve(cl, (0, y0 - 0.012 - 0.012 * teeth), cr, 30)
    top = curve((-lw + 0.006, y0 + smile + 0.005 * lipf), (0, y0 + smile + 0.010 * lipf + 0.002 * (lipf - 1)), (lw - 0.006, y0 + smile + 0.005 * lipf), 30)
    low = curve(cr, (0, y0 - 0.066 * lipf - 0.010 * teeth), cl, 30)
    poly(d, line + low[1:-1], col(lip[1]))
    if teeth:   # sorriso aperto: bocca scura con i denti superiori; il labbro inferiore resta sottile
        op = curve(cr, (0, y0 - 0.022 - 0.060 * teeth), cl, 30)
        poly(d, line + op[1:-1], col((0.42, 0.16, 0.16)))
        tl = curve((lw - 0.012, y0 + smile - 0.006), (0, y0 - 0.034 - 0.020 * teeth), (-lw + 0.012, y0 + smile - 0.006), 30)
        poly(d, line[2:-2] + tl[1:-1], col((0.96, 0.94, 0.90)))
        stroke(d, curve((0, y0 - 0.010 - 0.012 * teeth), (0, y0 - 0.022 - 0.012 * teeth), (0, y0 - 0.028 - 0.012 * teeth)), 0.0014, col((0.78, 0.74, 0.70), 0.7))
    poly(d, top + line[::-1][1:-1], col(lip[0]))
    stroke(d, line, 0.0040, col(tuple(c * 0.6 for c in lip[0]), 0.95))
    hh = layer(); dh = ImageDraw.Draw(hh); disc(dh, (0.0, y0 - 0.030), 0.011, col((1, 0.93, 0.93), 0.3))
    img = over(img, blur(mo, 0.0007)); img = over(img, blur(hh, 0.006))
    img.convert('RGB').resize((W, H), Image.LANCZOS).save(os.path.join(OUT, f'viso-{name}.webp'), quality=90, method=6)
    META[name] = {'skin': list(skin)}
    print(name, 'ok')

if __name__ == '__main__':
    import sys
    # senza argomenti rigenera tutto; con dei nomi (es. python3 scripts/percorso-visi.py calabro fisio) rigenera solo quelli e tiene gli altri in visi.json
    solo = set(sys.argv[1:])
    jp = os.path.join(OUT, 'visi.json')
    if solo and os.path.exists(jp): META.update(json.load(open(jp)))
    def run(name, fn, *a, **k):
        if not solo or name in solo: fn(name, *a, **k)
    # Valerio: pelle olivastra, occhi marroni scuri un po' pesanti, sopracciglia folte e dritte, naso marcato, labbra sottili, barba corta che sale sulle guance, mascella forte
    run('valerio', illus, (0.8835, 0.6019, 0.4832), (0.20, 0.12, 0.08), (0.13, 0.09, 0.07), ((0.55, 0.30, 0.27), (0.62, 0.36, 0.32)), smile=0.012, stubble=0.95, cheek_stubble=0.7, stub_s=0.62,
        stub_col=(0.10, 0.08, 0.07), brow_t=1.7, brow_y=-0.006, brow_a=-0.010, brow_in=0.004, eye_open=0.86, lash=1.1, nose=1.45, bridge=1.0, jaw=1.0, lipf=0.8, lip_w=0.08, cheek=0.8, seed=71)
    # Chiara: pelle ambrata, occhi nocciola, sopracciglia folte e arcuate, naso piccolo, labbra piene rosate, sorriso dolce, viso ovale
    run('chiara', illus, (0.91, 0.68, 0.545), (0.34, 0.21, 0.12), (0.20, 0.12, 0.08), ((0.74, 0.40, 0.38), (0.82, 0.48, 0.45)), smile=0.030, brow_t=1.45, brow_y=0.004, brow_a=0.010, brow_in=-0.002, eye_open=1.0, lash=1.45, eye_s=1.04, nose=0.8, bridge=0.5, lipf=1.4, lip_w=0.078, cheek=1.1, seed=72)
    # cliente (la persona che attraversa il percorso): carnagione chiara, occhi nocciola
    run('cliente', illus, (0.93, 0.76, 0.66), (0.42, 0.30, 0.18), (0.20, 0.14, 0.11), ((0.78, 0.42, 0.42), (0.84, 0.50, 0.48)), freckles=40, seed=3)
    # gruppo
    run('g1', illus, (0.62, 0.43, 0.32), (0.22, 0.14, 0.10), (0.10, 0.07, 0.06), ((0.62, 0.32, 0.30), (0.70, 0.40, 0.36)), seed=11)
    run('g2', illus, (0.96, 0.80, 0.70), (0.30, 0.46, 0.56), (0.45, 0.33, 0.22), ((0.80, 0.46, 0.46), (0.88, 0.54, 0.52)), freckles=70, seed=5)
    run('g3', illus, (0.45, 0.30, 0.22), (0.14, 0.09, 0.07), (0.07, 0.05, 0.05), ((0.52, 0.26, 0.26), (0.60, 0.34, 0.32)), stubble=0.5, seed=21)
    run('g4', illus, (0.88, 0.68, 0.56), (0.28, 0.20, 0.13), (0.16, 0.11, 0.09), ((0.74, 0.40, 0.40), (0.82, 0.48, 0.46)), stubble=0.7, seed=31)
    run('g5', illus, (0.78, 0.58, 0.45), (0.18, 0.12, 0.09), (0.12, 0.08, 0.07), ((0.70, 0.36, 0.36), (0.78, 0.44, 0.42)), seed=41)
    # professionisti della sezione "Benessere a 360" (public/percorso/): Calabrò (pelle olivastra chiara, occhi scuri, sopracciglia folte, barba leggera, grande sorriso con i denti); osteopata e fisioterapista inventati
    run('calabro', illus, (0.80, 0.62, 0.53), (0.18, 0.11, 0.07), (0.15, 0.10, 0.08), ((0.62, 0.34, 0.31), (0.70, 0.42, 0.38)), smile=0.040, teeth=1.0, stubble=0.6, cheek_stubble=0.3, stub_s=0.62,
        stub_col=(0.12, 0.09, 0.08), brow_t=1.55, brow_y=-0.002, brow_a=0.002, brow_in=0.006, eye_open=0.92, lash=1.2, nose=1.1, bridge=0.7, jaw=0.8, lipf=0.9, lip_w=0.09, cheek=1.1, seed=73)
    run('osteo', illus, (0.86, 0.66, 0.54), (0.20, 0.30, 0.22), (0.13, 0.10, 0.09), ((0.70, 0.38, 0.36), (0.78, 0.46, 0.43)), stubble=0.55, smile=0.026, seed=51)
    run('fisio', illus, (0.94, 0.75, 0.64), (0.30, 0.42, 0.52), (0.30, 0.20, 0.13), ((0.80, 0.44, 0.44), (0.88, 0.52, 0.50)), freckles=36, smile=0.028, seed=61)
    json.dump(META, open(jp, 'w'))
