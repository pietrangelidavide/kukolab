#!/usr/bin/env python3
"""Ritocco delle foto del sito: toglie il rumore e i quadratini della compressione, riequilibra luci e colori,
ingrandisce con cura quando serve e rinfresca la nitidezza. Non inventa dettagli: dove la foto è piccola o sfocata
il guadagno è limitato (per un salto vero servono gli originali ad alta risoluzione).

Come libreria:  from enhance import enhance;  im = enhance(Image.open(...), width=760)
Da terminale:   python3 scripts/enhance.py IN OUT [--width 760] [--crop sx,alto,dx,basso] [--soft 1.0]
"""
import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter, ImageOps


def enhance(im, width=None, strength=1.0, levels=0.55):
    """im: PIL.Image. width: larghezza finale (se manca resta quella di partenza). strength: 0..1.5 per tutto il ritocco.
    levels: quanto stirare le luci verso l'intera gamma (0 = niente)."""
    im = ImageOps.exif_transpose(im).convert('RGB')
    a = cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR)

    # 1. rumore e blocchi di compressione: poco, il resto lo fa il ridimensionamento
    h = 3.2 * strength
    a = cv2.fastNlMeansDenoisingColored(a, None, h, h, 5, 15)

    # 2. dimensione: giù con INTER_AREA (toglie altro rumore), su con Lanczos
    if width and width != a.shape[1]:
        scale = width / a.shape[1]
        interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_LANCZOS4
        a = cv2.resize(a, (width, round(a.shape[0] * scale)), interpolation=interp)

    # 3. luci e ombre: stira i livelli (solo in parte) e apre le ombre con un CLAHE leggero, sulla sola luminosità
    lab = cv2.cvtColor(a, cv2.COLOR_BGR2LAB)
    L = lab[:, :, 0].astype(np.float32)
    lo, hi = np.percentile(L, (0.6, 99.6))
    if hi - lo > 40:
        stretched = np.clip((L - lo) * 255.0 / (hi - lo), 0, 255)
        L = L + (stretched - L) * levels * strength
    clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8))
    Lc = clahe.apply(np.clip(L, 0, 255).astype(np.uint8)).astype(np.float32)
    lab[:, :, 0] = np.clip(L + (Lc - L) * 0.45 * strength, 0, 255).astype(np.uint8)
    a = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

    # 4. colori un po' più pieni
    hsv = cv2.cvtColor(a, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * (1 + 0.10 * strength), 0, 255)
    a = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

    out = Image.fromarray(cv2.cvtColor(a, cv2.COLOR_BGR2RGB))

    # 5. nitidezza: una passata larga (struttura) e una stretta (bordi)
    out = out.filter(ImageFilter.UnsharpMask(radius=2.2, percent=int(45 * strength), threshold=3))
    out = out.filter(ImageFilter.UnsharpMask(radius=0.8, percent=int(75 * strength), threshold=2))
    return out


def save(im, path, quality=82):
    im.save(path, 'JPEG', quality=quality, optimize=True, progressive=True, subsampling=0 if quality >= 90 else 2)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--width', type=int)
    ap.add_argument('--crop', help='sinistra,alto,destra,basso (pixel della foto di partenza)')
    ap.add_argument('--soft', type=float, default=1.0, help='forza del ritocco (default 1.0)')
    ap.add_argument('--quality', type=int, default=82)
    args = ap.parse_args()
    im = ImageOps.exif_transpose(Image.open(args.src)).convert('RGB')
    if args.crop:
        im = im.crop(tuple(int(v) for v in args.crop.split(',')))
    out = enhance(im, width=args.width, strength=args.soft)
    save(out, args.dst, args.quality)
    print(f'{args.dst}: {out.width}x{out.height}, {Path(args.dst).stat().st_size // 1024} KB')
