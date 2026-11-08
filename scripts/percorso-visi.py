#!/usr/bin/env python3
"""Volti per i personaggi 3D del percorso (public/percorso/).

- Valerio e Chiara: il volto viene dalle loro foto del sito (public/img/trainer-valerio.jpg, trainer-chiara.jpg),
  portato in piano (occhi allineati), scalato sulla testa 3D e sfumato sul colore della pelle.
  Se arrivano foto migliori (frontali, luce morbida) basta sostituirle e rilanciare lo script.
- Cliente e gruppo: volti disegnati, uno per ogni persona (pelle, occhi, sopracciglia diversi).

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

# ---------------------------------------------------------------- dalle foto
def from_photo(name, src, pupils, mouth_y, skin_box, flip=False):
    """pupils = ((x,y) occhio sinistro in foto, (x,y) occhio destro); mouth_y = riga della bocca in foto."""
    im = cv2.cvtColor(cv2.imread(os.path.join(IMG, src)), cv2.COLOR_BGR2RGB).astype(np.float32) / 255
    (lx, ly), (rx, ry) = pupils
    ex, ey = (lx + rx) / 2, (ly + ry) / 2
    ang = math.atan2(ry - ly, rx - lx)
    ipd = math.hypot(rx - lx, ry - ly)
    sx = 0.264 / ipd                       # unità di testa per pixel, in orizzontale
    sy = 0.291 / (mouth_y - ey)            # in verticale: occhi→bocca nella testa 3D
    # foto → testa: traslo sul centro degli occhi, tolgo l'inclinazione, scalo; poi testa → pixel dell'immagine finale
    c, s = math.cos(-ang), math.sin(-ang)
    k = W / 0.6
    A = np.array([
        [k * sx * c, -k * sx * s, 0],
        [k * sy * s * 0.0 + (H / 0.8) * sy * s, (H / 0.8) * sy * c, 0],
    ], np.float32)
    # x_d = (hx+0.30)*k ; y_d = (0.40-hy)*H/0.8 con hx = sx*(c*dx - s*dy), hy = 0.037 - sy*(s*dx + c*dy)
    A[0] = [k * sx * c, -k * sx * s, 0]
    A[1] = [(H / 0.8) * sy * s, (H / 0.8) * sy * c, 0]
    dx0 = -(A[0, 0] * ex + A[0, 1] * ey) + 0.30 * k
    dy0 = -(A[1, 0] * ex + A[1, 1] * ey) + (0.40 - 0.037) * H / 0.8
    A[0, 2], A[1, 2] = dx0, dy0
    # riflessi: comprimo le luci sopra 0,86 (fronte e zigomi lucidi)
    Y = im @ np.array([0.299, 0.587, 0.114], np.float32)
    lim = 0.86
    Yn = np.where(Y > lim, lim + (Y - lim) * 0.4, Y)
    im2 = im * (Yn / np.maximum(Y, 1e-4))[..., None]
    out = cv2.warpAffine(im2, A, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    # colore della pelle: mediana di guance e fronte (coordinate della testa), un po' meno satura
    def at(hx, hy, r=10):
        u, v = int((hx + 0.30) * W / 0.6), int((0.40 - hy) * H / 0.8)
        return out[v - r:v + r, u - r:u + r].reshape(-1, 3)
    pts = np.concatenate([at(-0.19, -0.06), at(0.19, -0.06), at(0.0, 0.22), at(-0.12, 0.17), at(0.12, 0.17)])
    skin = np.median(pts, axis=0)
    g = float(skin @ np.array([0.299, 0.587, 0.114])); skin = np.clip(g + (skin - g) * 0.78, 0, 1)
    out = cv2.bilateralFilter(out, 5, 0.05, 4)
    # maschera ovale: il bordo si fonde sul colore della pelle della testa
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - W / 2) / (W * 0.50)) ** 2 + ((yy - H * 0.52) / (H * 0.50)) ** 2)
    m = np.clip((1.0 - d) / 0.2, 0, 1); m = m * m * (3 - 2 * m)
    top = np.clip((yy - H * 0.06) / (H * 0.10), 0, 1); m = m * (top * top * (3 - 2 * top))   # la fronte alta (capelli) sfuma: ci pensa la calotta
    m = cv2.GaussianBlur(m, (0, 0), 5)[..., None]
    res = out * m + np.array(skin, np.float32) * (1 - m)
    Image.fromarray(np.clip(res * 255 + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(OUT, f'viso-{name}.webp'), quality=90, method=6)
    META[name] = {'skin': [round(float(v), 4) for v in skin]}
    print(name, 'pelle', META[name]['skin'], 'angolo', round(math.degrees(ang), 1))

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

def illus(name, skin, iris, brow, lip, freckles=0, smile=0.022, brow_w=0.0016, stubble=0.0, eye_open=1.0, seed=7):
    img = Image.new('RGBA', (CW, CH), col(skin))
    sh = layer(); d = ImageDraw.Draw(sh)
    warm = (min(1, skin[0] + 0.06), skin[1] * 0.78, skin[2] * 0.78)
    for sd in (-1, 1):
        disc(d, (sd * 0.165, -0.085), 0.07, col(warm, 0.30))
        disc(d, (sd * 0.055, -0.055), 0.016, col(tuple(c * 0.8 for c in skin), 0.35))
    img = over(img, blur(sh, 0.045))
    hl = layer(); d = ImageDraw.Draw(hl)
    disc(d, (0, 0.20), 0.09, col((1, 0.97, 0.93), 0.12)); disc(d, (0.004, -0.046), 0.011, col((1, 0.96, 0.92), 0.28))
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
        for _ in range(int(2600 * stubble)):
            x = rnd.uniform(-0.25, 0.25); y = rnd.uniform(-0.40, -0.03)
            edge = 0.24 - 0.30 * max(0, (-0.03 - y)) ** 1.6   # più stretta verso il mento
            if abs(x) > max(0.07, 0.27 + y * 0.28): continue
            if y > -0.14 and abs(x) < 0.17: continue          # baffi: solo sopra la bocca
            if -0.20 < y < -0.12 and abs(x) < 0.1: continue      # non sulla bocca
            disc(d, (x, y), rnd.uniform(0.0012, 0.0024), col((0.16, 0.12, 0.11), rnd.uniform(0.2, 0.5)))
        img = over(img, blur(st, 0.0007))
    no = layer(); d = ImageDraw.Draw(no)
    stroke(d, curve((-0.024, -0.083), (0.002, -0.097), (0.026, -0.083)), 0.007, col(tuple(c * 0.78 for c in skin), 0.45))
    stroke(d, curve((-0.030, 0.02), (-0.036, -0.03), (-0.03, -0.065)), 0.006, col(tuple(c * 0.85 for c in skin), 0.2))
    img = over(img, blur(no, 0.004))
    def eye(sd):
        cx, cy = sd * 0.108, 0.05
        E = lambda u, v: (cx + sd * u, cy + v * eye_open)
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
        stroke(d, curve(E(-0.052, -0.002), E(0.004, 0.062), E(0.058, 0.004)), 0.0062, col(dark))
        stroke(d, curve(E(0.012, 0.050), E(0.040, 0.054), E(0.060, 0.012)), 0.0074, col(dark))
        stroke(d, bot[4:-2], 0.0022, col((0.5, 0.36, 0.32), 0.7))
        return out, ln
    for sd in (-1, 1):
        e, ln = eye(sd); img = over(img, e); img = over(img, blur(ln, 0.0003))
    bw = layer(); d = ImageDraw.Draw(bw)
    for sd in (-1, 1):
        up = curve((sd * 0.040, 0.126), (sd * 0.105, 0.164), (sd * 0.172, 0.118)); lo = curve((sd * 0.172, 0.118), (sd * 0.105, 0.141), (sd * 0.040, 0.110))
        poly(d, up + lo, col(brow, 0.92))
    img = over(img, blur(bw, brow_w))
    mo = layer(); d = ImageDraw.Draw(mo)
    lw, y0 = 0.082, -0.188
    cl, cr = (-lw, y0 + smile), (lw, y0 + smile)
    line = curve(cl, (0, y0 - 0.012), cr, 30)
    top = curve((-lw + 0.006, y0 + smile + 0.005), (0, y0 + smile + 0.01), (lw - 0.006, y0 + smile + 0.005), 30)
    poly(d, top + line[::-1][1:-1], col(lip[0]))
    low = curve(cr, (0, y0 - 0.066), cl, 30)
    poly(d, line + low[1:-1], col(lip[1]))
    stroke(d, line, 0.0040, col(tuple(c * 0.6 for c in lip[0]), 0.95))
    hh = layer(); dh = ImageDraw.Draw(hh); disc(dh, (0.0, y0 - 0.030), 0.011, col((1, 0.93, 0.93), 0.3))
    img = over(img, blur(mo, 0.0007)); img = over(img, blur(hh, 0.006))
    img.convert('RGB').resize((W, H), Image.LANCZOS).save(os.path.join(OUT, f'viso-{name}.webp'), quality=90, method=6)
    META[name] = {'skin': list(skin)}
    print(name, 'ok')

if __name__ == '__main__':
    # Valerio: occhi (518,392) e (588,384) nella foto, bocca a y=473; Chiara: (240,217), (312,222), bocca y=292
    from_photo('valerio', 'trainer-valerio.jpg', ((518, 392), (588, 384)), 473, None)
    from_photo('chiara', 'trainer-chiara.jpg', ((240, 217), (312, 222)), 292, None)
    # cliente (la persona che attraversa il percorso): carnagione chiara, occhi nocciola
    illus('cliente', (0.93, 0.76, 0.66), (0.42, 0.30, 0.18), (0.20, 0.14, 0.11), ((0.78, 0.42, 0.42), (0.84, 0.50, 0.48)), freckles=40, seed=3)
    # gruppo
    illus('g1', (0.62, 0.43, 0.32), (0.22, 0.14, 0.10), (0.10, 0.07, 0.06), ((0.62, 0.32, 0.30), (0.70, 0.40, 0.36)), seed=11)
    illus('g2', (0.96, 0.80, 0.70), (0.30, 0.46, 0.56), (0.45, 0.33, 0.22), ((0.80, 0.46, 0.46), (0.88, 0.54, 0.52)), freckles=70, seed=5)
    illus('g3', (0.45, 0.30, 0.22), (0.14, 0.09, 0.07), (0.07, 0.05, 0.05), ((0.52, 0.26, 0.26), (0.60, 0.34, 0.32)), stubble=0.5, seed=21)
    illus('g4', (0.88, 0.68, 0.56), (0.28, 0.20, 0.13), (0.16, 0.11, 0.09), ((0.74, 0.40, 0.40), (0.82, 0.48, 0.46)), stubble=0.7, seed=31)
    illus('g5', (0.78, 0.58, 0.45), (0.18, 0.12, 0.09), (0.12, 0.08, 0.07), ((0.70, 0.36, 0.36), (0.78, 0.44, 0.42)), seed=41)
    json.dump(META, open(os.path.join(OUT, 'visi.json'), 'w'))
