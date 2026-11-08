#!/usr/bin/env python3
"""Scontorna le foto dei due trainer per la pagina /percorso/ e le salva come WebP con trasparenza.

Uso:  KUKO_U2NET=/percorso/del/u2net_human_seg.onnx python3 scripts/percorso-ritagli.py

Serve onnxruntime, opencv-contrib (per il guided filter), numpy e Pillow, piu' il modello
u2net_human_seg.onnx (open source, 176 MB: non e' nel repository). Legge da public/img/ e scrive in
public/percorso/img/ritaglio-<nome>.webp. Per cambiare foto basta modificare SORGENTI qui sotto e rilanciare.
"""
import os
import sys

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps
from scipy import ndimage as ndi

RADICE = os.path.normpath(os.path.join(os.path.dirname(__file__), '..'))
IMG = os.path.join(RADICE, 'public', 'img')
USCITA = os.path.join(RADICE, 'public', 'percorso', 'img')
MODELLO = os.environ.get('KUKO_U2NET') or (sys.argv[1] if len(sys.argv) > 1 else '')
ALTEZZA_MAX = 1100  # px: il ritaglio sta in basso a destra, mai piu' alto di mezzo schermo

# nome -> (file in public/img, ricostruire gli oggetti rossi in mano? la pallina di Chiara non viene riconosciuta come persona)
SORGENTI = {
    # 'valerio' non c'e' piu': il suo ritaglio (ritaglio-valerio.webp) e' l'action figure inviata dal cliente, gia' scontornata a mano
    # dalla confezione e committata cosi' com'e'; rilanciare lo script non la deve sovrascrivere con la vecchia foto.
    'chiara': ('trainer-chiara.jpg', True),
}


def maschera(sess, im):
    w, h = im.size
    a = np.asarray(im.resize((320, 320), Image.LANCZOS), dtype=np.float32) / 255.0
    a = ((a - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]).transpose(2, 0, 1)[None].astype(np.float32)
    o = sess.run(None, {sess.get_inputs()[0].name: a})[0][0, 0]
    o = (o - o.min()) / (o.max() - o.min() + 1e-8)
    return cv2.resize(o, (w, h), interpolation=cv2.INTER_CUBIC)


def rifinisci(rgb, m):
    """Aggancia la maschera ai bordi veri con un guided filter, poi la stringe un po'."""
    m8 = (np.clip(m, 0, 1) * 255).astype(np.uint8)
    r = cv2.ximgproc.guidedFilter(rgb, m8, radius=max(8, rgb.shape[1] // 90), eps=1200).astype(np.float32) / 255.0
    return np.clip((r - 0.35) / 0.40, 0, 1)


def rosso(rgb):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    return (((h < 8) | (h > 170)) & (s > 120) & (v > 60)).astype(np.uint8)


def ritaglia(sess, nome, file, con_rosso):
    im = ImageOps.exif_transpose(Image.open(os.path.join(IMG, file))).convert('RGB')
    rgb = np.asarray(im)
    r = rifinisci(rgb, maschera(sess, im))
    if con_rosso:  # pallina rossa in mano: la aggiungo, poi riempio i buchi chiusi dentro la figura
        palla = cv2.dilate(rosso(rgb), np.ones((9, 9), np.uint8))
        r = np.maximum(r, cv2.GaussianBlur(palla.astype(np.float32), (0, 0), 1.2))
        pieno = ndi.binary_fill_holes(cv2.morphologyEx((r > 0.5).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8)))
        r = np.maximum(r, pieno.astype(np.float32) * (cv2.GaussianBlur(pieno.astype(np.float32), (0, 0), 1.5)))
    b = (r > 0.5).astype(np.uint8)  # tengo solo il pezzo piu' grande (niente schizzi di sfondo)
    n, lab, st, _ = cv2.connectedComponentsWithStats(b)
    if n > 2:
        r = r * (cv2.dilate((lab == 1 + np.argmax(st[1:, 4])).astype(np.uint8), np.ones((15, 15), np.uint8)) > 0)
    r = cv2.GaussianBlur(cv2.erode(r, np.ones((3, 3), np.uint8)), (0, 0), 0.8)  # via l'alone dello sfondo sul bordo
    rgba = np.dstack([rgb, (np.clip(r, 0, 1) * 255).astype(np.uint8)])
    ys, xs = np.where(rgba[..., 3] > 8)
    rgba = rgba[max(0, ys.min() - 4): ys.max() + 1, max(0, xs.min() - 4): xs.max() + 5]  # il taglio in basso resta quello della foto
    out = Image.fromarray(rgba)
    if out.height > ALTEZZA_MAX:
        out = out.resize((round(out.width * ALTEZZA_MAX / out.height), ALTEZZA_MAX), Image.LANCZOS)
    dest = os.path.join(USCITA, f'ritaglio-{nome}.webp')
    out.save(dest, quality=90, method=6)
    print(nome, out.size, os.path.getsize(dest) // 1024, 'KB')


if __name__ == '__main__':
    if not MODELLO or not os.path.exists(MODELLO):
        sys.exit('Indica il modello: KUKO_U2NET=/percorso/u2net_human_seg.onnx python3 scripts/percorso-ritagli.py')
    sess = ort.InferenceSession(MODELLO, providers=['CPUExecutionProvider'])
    os.makedirs(USCITA, exist_ok=True)
    for nome, (file, rosso_) in SORGENTI.items():
        ritaglia(sess, nome, file, rosso_)
